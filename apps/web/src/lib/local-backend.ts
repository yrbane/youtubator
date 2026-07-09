import {
  EQ_BANDS,
  filterFromValue,
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
    sampleLoops: true, // le fichier entier est décodé : boucle depuis l'AudioBuffer
  };

  #audio = new Audio();
  #eq: Record<EqBand, BiquadFilterNode> | null = null;
  #filter: BiquadFilterNode | null = null;
  #gain: GainNode | null = null;
  #analyser: AnalyserNode | null = null;
  #objectUrl: string | null = null;
  #stateCbs = new Set<(s: PlayerState) => void>();
  #timeCbs = new Set<(t: TimeInfo) => void>();
  #meterCbs = new Set<(level: number) => void>();
  #meterTimer: ReturnType<typeof setInterval> | null = null;
  /** Buffer décodé (analyse + boucles sample-accurate). */
  #buffer: AudioBuffer | null = null;
  #videoId: string | null = null;
  // --- boucle sample-accurate : source dédiée, l'élément audio est en pause ---
  #loopSource: AudioBufferSourceNode | null = null;
  #loopPosS = 0;
  #loopBounds: { inS: number; outS: number } | null = null;
  #loopLastTick = 0;
  #loopTimer: ReturnType<typeof setInterval> | null = null;
  #rate = 1;

  constructor() {
    this.#audio.preload = 'auto';
    (this.#audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
    const emitState = (s: PlayerState) => {
      if (this.#loopSource) return; // en boucle : l'élément est en pause mais le deck « joue »
      this.#stateCbs.forEach((cb) => cb(s));
    };
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
    if (this.#loopSource) return; // la boucle émet son propre temps
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
    // filtre bipolaire : neutre = peaking gain 0 (réponse plate)
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.gain.value = 0;
    filter.frequency.value = 1000;
    head.connect(filter);
    const gain = ctx.createGain();
    filter.connect(gain);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    gain.connect(ctx.destination);
    this.#eq = eq;
    this.#filter = filter;
    this.#gain = gain;
    this.#analyser = analyser;
    // VU-mètre : RMS du domaine temporel, 10 Hz
    const bytes = new Uint8Array(analyser.fftSize);
    this.#meterTimer = setInterval(() => {
      if (this.#meterCbs.size === 0) return;
      analyser.getByteTimeDomainData(bytes);
      let sum = 0;
      for (let i = 0; i < bytes.length; i++) {
        const v = (bytes[i]! - 128) / 128;
        sum += v * v;
      }
      const level = Math.min(1, Math.sqrt(sum / bytes.length) * 2.5);
      this.#meterCbs.forEach((cb) => cb(level));
    }, 100);
  }

  /** Niveau de sortie (VU-mètre), 0..1. */
  onMeter(cb: (level: number) => void): Unsubscribe {
    this.#meterCbs.add(cb);
    return () => this.#meterCbs.delete(cb);
  }

  /** Filtre bipolaire LP/HP (−1..1, centre = neutre). */
  setFilter(value: number): void {
    if (!this.#filter) return;
    const setting = filterFromValue(value);
    if (!setting) {
      this.#filter.type = 'peaking';
      this.#filter.gain.value = 0;
      this.#filter.frequency.value = 1000;
    } else {
      this.#filter.type = setting.type;
      this.#filter.frequency.value = setting.frequency;
    }
  }

  /** `videoId` = id local (`file:…`) ; le fichier vient de la bibliothèque locale. */
  async load(videoId: string): Promise<void> {
    const file = await getLocalFile(videoId);
    if (!file) throw new Error('Fichier local introuvable (dossier retiré ou permission refusée).');
    this.exitLoop(false);
    this.#buffer = null;
    this.#videoId = videoId;
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
    this.#rate = rate;
    this.#audio.playbackRate = rate;
    if (this.#loopSource) this.#loopSource.playbackRate.value = rate;
    return rate;
  }

  /** Le buffer décodé du morceau courant (mémoïsé — analyse et boucles). */
  async #decodedBuffer(): Promise<AudioBuffer | null> {
    if (this.#buffer) return this.#buffer;
    if (!this.#videoId) return null;
    const file = await getLocalFile(this.#videoId);
    if (!file) return null;
    this.#buffer = await audioCtx().decodeAudioData(await file.arrayBuffer());
    return this.#buffer;
  }

  /**
   * Boucle sample-accurate : la région [IN, OUT] est rejouée depuis
   * l'AudioBuffer décodé, à travers l'EQ/filtre/gain ; l'élément audio est
   * en pause, le temps affiché cycle dans la région.
   */
  engageLoop(inS: number, outS: number): void {
    void this.#engageLoop(inS, outS);
  }

  async #engageLoop(inS: number, outS: number): Promise<void> {
    const buffer = await this.#decodedBuffer();
    if (!buffer || !this.#eq || outS <= inS) return;
    this.exitLoop();
    const ctx = audioCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = inS;
    source.loopEnd = outS;
    source.playbackRate.value = this.#rate;
    source.connect(this.#eq.low); // à travers toute la chaîne EQ → filtre → gain
    const from = Math.min(Math.max(this.#audio.currentTime, inS), outS - 0.001);
    source.start(0, from);
    this.#audio.pause(); // suppression d'état gérée par #loopSource
    this.#loopSource = source;
    this.#loopBounds = { inS, outS };
    this.#loopPosS = from;
    this.#loopLastTick = performance.now();
    // temps synthétique : cycle dans la région, au rate courant
    this.#loopTimer = setInterval(() => {
      const now = performance.now();
      const dt = ((now - this.#loopLastTick) / 1000) * this.#rate;
      this.#loopLastTick = now;
      const { inS: a, outS: b } = this.#loopBounds!;
      this.#loopPosS = a + ((this.#loopPosS - a + dt) % (b - a));
      const t = { currentTimeS: this.#loopPosS, durationS: this.#audio.duration || 0 };
      this.#timeCbs.forEach((cb) => cb(t));
    }, 50);
  }

  /** Sort de la boucle : la lecture reprend à la phase courante de la région. */
  exitLoop(resume = true): void {
    if (!this.#loopSource) return;
    try {
      this.#loopSource.stop();
    } catch {
      // déjà arrêtée
    }
    this.#loopSource.disconnect();
    this.#loopSource = null;
    if (this.#loopTimer) clearInterval(this.#loopTimer);
    this.#loopTimer = null;
    this.#audio.currentTime = this.#loopPosS;
    if (resume) void this.#audio.play();
  }

  get looping(): boolean {
    return this.#loopSource !== null;
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

  /** Décode le fichier entier (waveform + enveloppe BPM instantanées) — buffer mémoïsé. */
  async decodeForAnalysis(videoId: string): Promise<{ pcm: Float32Array; sampleRate: number; durationS: number } | null> {
    if (videoId !== this.#videoId) this.#videoId = videoId;
    const buffer = await this.#decodedBuffer();
    if (!buffer) return null;
    // mono : moyenne des canaux
    const pcm = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) pcm[i]! += data[i]! / buffer.numberOfChannels;
    }
    return { pcm, sampleRate: buffer.sampleRate, durationS: buffer.duration };
  }

  destroy(): void {
    this.exitLoop(false);
    this.#audio.pause();
    this.#audio.src = '';
    if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
    if (this.#meterTimer) clearInterval(this.#meterTimer);
    this.#stateCbs.clear();
    this.#timeCbs.clear();
    this.#meterCbs.clear();
    this.#buffer = null;
    // le MediaElementSource reste attaché à l'élément : on coupe juste la sortie
    this.#gain?.disconnect();
  }
}
