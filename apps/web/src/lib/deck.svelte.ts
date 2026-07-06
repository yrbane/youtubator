import {
  DeckCore,
  ExtensionBackend,
  IframeApiBackend,
  clampRate,
  effectiveEqGain,
  type DeckAudioBackend,
  type DeckState,
  type EqBand,
  type TempoMode,
} from '@youtubator/audio-engine';
import { iframeChannel } from './deck-channel.js';
import { createPlayerFactory } from './yt-iframe.js';
import type { Track } from './tracks.js';

const DECK_COLOR_VARS = ['--yt-deck-a', '--yt-deck-b', '--yt-deck-c', '--yt-deck-d'];

/** Store d'une platine : état réactif + câblage DeckCore ↔ backend. */
export class Deck {
  readonly id: string;
  readonly colorVar: string;

  state = $state<DeckState>('empty');
  track = $state<Track | null>(null);
  rate = $state(1);
  effectiveRate = $state(1);
  tempoMode = $state<TempoMode>('master-tempo');
  synced = $state(false);
  volume = $state(0.8);
  eqGains = $state<Record<EqBand, number>>({ low: 0, mid: 0, high: 0 });
  kills = $state<Record<EqBand, boolean>>({ low: false, mid: false, high: false });
  meterLevel = $state(0);
  currentTimeS = $state(0);
  durationS = $state(0);
  hasExtension = $state(false);

  #core: DeckCore;
  #backend: DeckAudioBackend | null = null;
  #extension: ExtensionBackend | null = null;
  #container: HTMLElement | null = null;
  #xfGain = 1;
  #meterTimer: ReturnType<typeof setInterval> | null = null;
  #capsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(id: string, index: number) {
    this.id = id;
    this.colorVar = DECK_COLOR_VARS[index % DECK_COLOR_VARS.length]!;
    this.#core = new DeckCore(id);
    this.#core.subscribe((s) => {
      this.state = s;
    });
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  get cuePointS(): number {
    return this.#core.cuePointS;
  }

  /** Point d'ancrage DOM du player (appelé au montage du composant). */
  attach(container: HTMLElement): void {
    this.#container = container;
  }

  async loadTrack(track: Track): Promise<void> {
    if (!this.#container) return;
    this.track = track;
    this.#core.load(track.videoId);

    if (!this.#backend) {
      const factory = createPlayerFactory(this.#container);
      const inner = new IframeApiBackend(factory);
      await inner.load(track.videoId);
      const iframe = factory.getIframe();
      this.#extension = iframe ? new ExtensionBackend(inner, iframeChannel(iframe)) : null;
      this.#backend = this.#extension ?? inner;
      this.#wireBackend(this.#backend);
      this.#core.ready();
    } else {
      await this.#backend.load(track.videoId);
    }
    this.applyVolume(this.#xfGain);
    void this.setRate(this.rate);
  }

  #wireBackend(backend: DeckAudioBackend): void {
    backend.onStateChange((s) => {
      switch (s) {
        case 'cued':
          this.#core.ready();
          break;
        case 'playing':
          this.#core.play();
          break;
        case 'paused':
          this.#core.pause(this.currentTimeS);
          break;
        case 'ended':
          this.#core.cue();
          break;
      }
    });
    backend.onTimeUpdate((t) => {
      this.currentTimeS = t.currentTimeS;
      this.durationS = t.durationS;
    });
    this.#extension?.onMeter((level) => {
      this.meterLevel = level;
    });
    // VU approximatif tant que l'extension n'est pas là (F-MIX-04 dégradé)
    this.#meterTimer = setInterval(() => {
      if (!this.hasExtension) {
        this.meterLevel = this.isPlaying ? this.volume * this.#xfGain * (0.55 + 0.35 * Math.random()) : 0;
      }
    }, 100);
    this.#capsTimer = setInterval(() => {
      this.hasExtension = backend.capabilities.eq;
      if (this.hasExtension && this.#capsTimer !== null) {
        clearInterval(this.#capsTimer);
        this.#capsTimer = null;
        this.#pushAllEq();
        this.#backend?.setTempoMode(this.tempoMode);
      }
    }, 500);
  }

  play(): void {
    if (this.#core.play()) this.#backend?.play();
  }

  pause(): void {
    this.#core.pause(this.currentTimeS);
    this.#backend?.pause();
  }

  togglePlay(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** Retour au point de cue (arrête la lecture). */
  cue(): void {
    const t = this.#core.cue();
    this.#backend?.pause();
    this.#backend?.seekTo(t);
    this.currentTimeS = t;
  }

  seekFraction(f: number): void {
    if (this.durationS <= 0) return;
    const t = f * this.durationS;
    this.#backend?.seekTo(t);
    this.currentTimeS = t;
  }

  /** Applique un rate (demandé par l'utilisateur ou par la sync). */
  async setRate(requested: number, range = 0.16): Promise<void> {
    this.rate = clampRate(requested, range);
    const applied = await this.#backend?.setPlaybackRate(this.rate);
    this.effectiveRate = applied ?? this.rate;
  }

  setTempoMode(mode: TempoMode): void {
    this.tempoMode = mode;
    this.#backend?.setTempoMode(mode);
  }

  setEqGain(band: EqBand, gainDb: number): void {
    this.eqGains[band] = gainDb;
    this.#pushEq(band);
  }

  toggleKill(band: EqBand): void {
    this.kills[band] = !this.kills[band];
    this.#pushEq(band);
  }

  #pushEq(band: EqBand): void {
    this.#backend?.setEq(band, effectiveEqGain(this.eqGains[band], this.kills[band]));
  }

  #pushAllEq(): void {
    for (const band of ['low', 'mid', 'high'] as const) this.#pushEq(band);
  }

  /** Volume final = fader canal × gain de crossfade. */
  applyVolume(xfGain: number): void {
    this.#xfGain = xfGain;
    this.#backend?.setVolume(this.volume * xfGain);
  }

  destroy(): void {
    if (this.#meterTimer !== null) clearInterval(this.#meterTimer);
    if (this.#capsTimer !== null) clearInterval(this.#capsTimer);
    this.#backend?.destroy();
    this.#backend = null;
  }
}
