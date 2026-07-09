import {
  EQ_BANDS,
  type DeckAudioBackend,
  type DeckCapabilities,
  type EqBand,
  type PlayerState,
  type TempoMode,
  type TimeInfo,
  type Unsubscribe,
} from '@youtubator/audio-engine';
import { getLocalFile } from './local-library.js';

/** AudioContext partagé de la page (un seul pour tous les decks locaux). */
let sharedCtx: AudioContext | null = null;

function audioCtx(): AudioContext {
  sharedCtx ??= new AudioContext({ latencyHint: 'playback' });
  return sharedCtx;
}

/**
 * Backend « fichiers locaux » : un <audio> sur un blob du fichier, avec le
 * même graphe que l'extension (MediaElementSource → EQ 3 bandes → gain →
 * destination) mais en page — pas d'iframe, pas d'extension requise.
 * Rate continu + preservesPitch natifs : Master Tempo et Vinyle complets.
 */
export class LocalFileBackend implements DeckAudioBackend {
  readonly capabilities: DeckCapabilities = {
    eq: true,
    continuousRate: true,
    tempoModes: true,
    sampleLoops: false,
  };

  #audio = new Audio();
  #eq: Record<EqBand, BiquadFilterNode> | null = null;
  #gain: GainNode | null = null;
  #objectUrl: string | null = null;
  #stateCbs = new Set<(s: PlayerState) => void>();
  #timeCbs = new Set<(t: TimeInfo) => void>();

  constructor() {
    this.#audio.preload = 'auto';
    (this.#audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
    const emitState = (s: PlayerState) => this.#stateCbs.forEach((cb) => cb(s));
    this.#audio.addEventListener('loadedmetadata', () => {
      this.#emitTime();
      emitState('cued');
    });
    this.#audio.addEventListener('play', () => emitState('playing'));
    this.#audio.addEventListener('pause', () => emitState('paused'));
    this.#audio.addEventListener('ended', () => emitState('ended'));
    this.#audio.addEventListener('timeupdate', () => this.#emitTime());
  }

  #emitTime(): void {
    const t = { currentTimeS: this.#audio.currentTime, durationS: this.#audio.duration || 0 };
    this.#timeCbs.forEach((cb) => cb(t));
  }

  /** Construit le graphe au premier load (après geste utilisateur → contexte autorisé). */
  #buildGraph(): void {
    if (this.#gain) return;
    const ctx = audioCtx();
    const source = ctx.createMediaElementSource(this.#audio);
    const eq = {} as Record<EqBand, BiquadFilterNode>;
    let head: AudioNode = source;
    for (const band of ['low', 'mid', 'high'] as EqBand[]) {
      const spec = EQ_BANDS[band];
      const node = ctx.createBiquadFilter();
      node.type = spec.type;
      node.frequency.value = spec.frequency;
      if (spec.q !== undefined) node.Q.value = spec.q;
      head.connect(node);
      head = node;
      eq[band] = node;
    }
    const gain = ctx.createGain();
    head.connect(gain);
    gain.connect(ctx.destination);
    this.#eq = eq;
    this.#gain = gain;
  }

  /** `videoId` = id local (`file:…`) ; le fichier vient de la bibliothèque locale. */
  async load(videoId: string): Promise<void> {
    const file = await getLocalFile(videoId);
    if (!file) throw new Error('Fichier local introuvable (dossier retiré ou permission refusée).');
    this.#buildGraph();
    void audioCtx().resume();
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
    this.#objectUrl = URL.createObjectURL(file);
    this.#audio.src = this.#objectUrl;
    await new Promise<void>((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve();
      };
      const ko = () => {
        cleanup();
        reject(new Error('Format audio non décodable par le navigateur.'));
      };
      const cleanup = () => {
        this.#audio.removeEventListener('loadedmetadata', ok);
        this.#audio.removeEventListener('error', ko);
      };
      this.#audio.addEventListener('loadedmetadata', ok);
      this.#audio.addEventListener('error', ko);
    });
  }

  play(): void {
    void audioCtx().resume();
    void this.#audio.play();
  }

  pause(): void {
    this.#audio.pause();
  }

  seekTo(seconds: number): void {
    this.#audio.currentTime = seconds;
    this.#emitTime();
  }

  setVolume(v: number): void {
    if (this.#gain) this.#gain.gain.value = v;
    else this.#audio.volume = v;
  }

  async setPlaybackRate(rate: number): Promise<number> {
    this.#audio.playbackRate = rate;
    return rate;
  }

  getAvailableRates(): number[] {
    return []; // rate continu : pas de paliers
  }

  setEq(band: EqBand, gainDb: number): boolean {
    if (!this.#eq) return false;
    this.#eq[band].gain.value = gainDb;
    return true;
  }

  setTempoMode(mode: TempoMode): boolean {
    (this.#audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch =
      mode === 'master-tempo';
    return true;
  }

  onStateChange(cb: (s: PlayerState) => void): Unsubscribe {
    this.#stateCbs.add(cb);
    return () => this.#stateCbs.delete(cb);
  }

  onTimeUpdate(cb: (t: TimeInfo) => void): Unsubscribe {
    this.#timeCbs.add(cb);
    return () => this.#timeCbs.delete(cb);
  }

  /** Décode le fichier entier (waveform + enveloppe BPM instantanées). */
  async decodeForAnalysis(videoId: string): Promise<{ pcm: Float32Array; sampleRate: number; durationS: number } | null> {
    const file = await getLocalFile(videoId);
    if (!file) return null;
    const buffer = await audioCtx().decodeAudioData(await file.arrayBuffer());
    // mono : moyenne des canaux
    const pcm = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) pcm[i]! += data[i]! / buffer.numberOfChannels;
    }
    return { pcm, sampleRate: buffer.sampleRate, durationS: buffer.duration };
  }

  destroy(): void {
    this.#audio.pause();
    this.#audio.src = '';
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
    this.#stateCbs.clear();
    this.#timeCbs.clear();
    // le MediaElementSource reste attaché à l'élément : on coupe juste la sortie
    this.#gain?.disconnect();
  }
}
