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
import { loadWaveform, saveWaveform } from './library.js';
import { emptyLoop, pressIn, pressOut, shouldJump, toggleActive, type LoopState } from './loop.js';
import { bucketCount, mergeSample, pseudoWaveform, toggleCue } from './waveform.js';
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
  /** Horodatage du dernier timeupdate (interpolation d'affichage). */
  timeUpdatedAt = $state(0);
  /** Waveform (0..1 par bucket de 250 ms) et points de cue du morceau. */
  waveBuckets = $state<number[]>([]);
  cues = $state<number[]>([]);
  waveIsReal = $state(false);
  loop = $state<LoopState>(emptyLoop());

  #core: DeckCore;
  #backend: DeckAudioBackend | null = null;
  #extension: ExtensionBackend | null = null;
  #container: HTMLElement | null = null;
  #xfGain = 1;
  #meterTimer: ReturnType<typeof setInterval> | null = null;
  #capsTimer: ReturnType<typeof setInterval> | null = null;
  #waveDirty = false;
  #waveSaveTimer: ReturnType<typeof setInterval> | null = null;
  #loopTimer: ReturnType<typeof setInterval> | null = null;

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
    await this.#flushWaveform(); // sauve la waveform du morceau précédent
    this.track = track;
    this.waveBuckets = [];
    this.cues = [];
    this.waveIsReal = false;
    this.loop = emptyLoop();
    this.#waveDirty = false;
    this.#core.load(track.videoId);
    void this.#restoreWaveform(track.videoId);

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
      this.timeUpdatedAt = performance.now();
      this.#ensureWaveBuckets();
    });
    this.#extension?.onMeter((level) => {
      this.meterLevel = level;
      // capture progressive : la waveform réelle se construit pendant la lecture
      if (this.isPlaying && this.durationS > 0) {
        if (!this.waveIsReal) {
          this.waveBuckets = new Array(bucketCount(this.durationS)).fill(0);
          this.waveIsReal = true;
        }
        if (mergeSample(this.waveBuckets, this.currentTimeS, level)) this.#waveDirty = true;
      }
    });
    this.#waveSaveTimer = setInterval(() => void this.#flushWaveform(), 8000);
    // garde de boucle : re-saute au point IN dès que la sortie est franchie
    this.#loopTimer = setInterval(() => {
      if (!this.isPlaying) return;
      const target = shouldJump(this.loop, this.displayTimeS());
      if (target !== null) this.seekToS(target);
    }, 80);
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
    this.seekToS(f * this.durationS);
  }

  seekToS(timeS: number): void {
    const t = Math.min(Math.max(0, timeS), this.durationS || timeS);
    this.#backend?.seekTo(t);
    this.currentTimeS = t;
    this.timeUpdatedAt = performance.now();
  }

  /** Pose ou retire un point de cue sur la waveform (persisté). */
  toggleCueAt(timeS: number): void {
    this.cues = toggleCue(this.cues, timeS, 0.5);
    this.#waveDirty = true;
    void this.#flushWaveform();
  }

  /** Saute au n-ième point de cue (hot cue). */
  jumpToCue(index: number): void {
    const cue = this.cues[index];
    if (cue !== undefined) this.seekToS(cue);
  }

  /** Position interpolée entre deux timeupdates (affichage et garde de boucle). */
  displayTimeS(): number {
    if (!this.isPlaying) return this.currentTimeS;
    return this.currentTimeS + ((performance.now() - this.timeUpdatedAt) / 1000) * this.effectiveRate;
  }

  loopIn(): void {
    this.loop = pressIn(this.loop, this.displayTimeS());
  }

  loopOut(): void {
    this.loop = pressOut(this.loop, this.displayTimeS());
  }

  /** Coupe / relance la boucle (reloop) en gardant les points. */
  toggleLoop(): void {
    this.loop = toggleActive(this.loop);
  }

  /** Waveform en cache → restaurée telle quelle ; sinon pseudo dès que la durée est connue. */
  async #restoreWaveform(videoId: string): Promise<void> {
    const record = await loadWaveform(videoId);
    if (this.track?.videoId !== videoId) return; // le deck a déjà changé de morceau
    if (record) {
      this.cues = record.cues;
      if (record.real && record.buckets.length > 0) {
        this.waveBuckets = record.buckets;
        this.waveIsReal = true;
        if (this.durationS === 0) this.durationS = record.durationS;
        return;
      }
    }
    this.#ensureWaveBuckets();
  }

  #ensureWaveBuckets(): void {
    if (this.waveBuckets.length > 0 || this.durationS <= 0 || !this.track) return;
    this.waveBuckets = pseudoWaveform(this.track.videoId, this.durationS);
  }

  async #flushWaveform(): Promise<void> {
    if (!this.#waveDirty || !this.track || this.durationS <= 0) return;
    this.#waveDirty = false;
    await saveWaveform({
      videoId: this.track.videoId,
      durationS: this.durationS,
      buckets: this.waveIsReal ? this.waveBuckets : [],
      real: this.waveIsReal,
      cues: this.cues,
      updatedAt: Date.now(),
    });
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
    if (this.#waveSaveTimer !== null) clearInterval(this.#waveSaveTimer);
    if (this.#loopTimer !== null) clearInterval(this.#loopTimer);
    void this.#flushWaveform();
    this.#backend?.destroy();
    this.#backend = null;
  }
}
