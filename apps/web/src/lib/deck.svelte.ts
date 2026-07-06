import {
  DeckCore,
  ExtensionBackend,
  IframeApiBackend,
  beatLoopBounds,
  clampRate,
  computeAutoGain,
  delayTimeForBeats,
  effectiveEqGain,
  parseBeatFraction,
  type BeatGrid,
  type DeckAudioBackend,
  type DeckState,
  type EqBand,
  type TempoMode,
} from '@youtubator/audio-engine';
import { analyze } from './analysis.js';
import { iframeChannel } from './deck-channel.js';
import { createPlayerFactory } from './yt-iframe.js';
import { loadWaveform, saveWaveform } from './library.js';
import {
  emptyLoop,
  ghostPosition,
  pressIn,
  pressOut,
  shouldJump,
  toggleActive,
  type LoopState,
} from './loop.js';
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
  /** Loop roll : à la sortie de boucle, saute à la position fantôme. */
  rollMode = $state(false);
  #loopEngagedAtS = 0;
  #loopEngagedWall = 0;
  /** Grille de beats (BPM + ancre) détectée ou restaurée du cache. */
  grid = $state<BeatGrid | null>(null);
  /** Tonalité détectée (code Camelot + nom), null tant qu'inconnue. */
  musicalKey = $state<{ camelot: string; name: string } | null>(null);
  /** Boucle sample-accurate en cours côté extension. */
  sampleLoop = $state(false);
  #analyzingBpm = false;

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
    this.grid = null;
    this.musicalKey = null;
    this.sampleLoop = false;
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
    this.#extension?.onLoopState((s) => {
      this.sampleLoop = s.engaged;
      if (!s.engaged && s.resumeAtS !== null) {
        this.currentTimeS = s.resumeAtS;
        this.timeUpdatedAt = performance.now();
      }
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
    // garde de boucle (mode dégradé) : re-saute au IN dès que la sortie est franchie
    this.#loopTimer = setInterval(() => {
      if (!this.isPlaying || this.sampleLoop) return;
      const target = shouldJump(this.loop, this.displayTimeS());
      if (target !== null) this.seekToS(target);
    }, 80);
    // analyse de BPM automatique après ~12 s de lecture capturée
    setInterval(() => {
      if (this.hasExtension && this.isPlaying && !this.grid && !this.#analyzingBpm && this.currentTimeS > 12) {
        void this.analyzeBpm();
      }
    }, 4000);
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
        if (this.silentMode) this.#extension?.setGain(0);
        else if (this.autoGain !== 1) this.#extension?.setGain(this.autoGain); // auto-gain restauré du cache
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

  /** Diagnostic : enveloppe brute de l'extension (mode de capture inclus). */
  async debugEnvelope(): Promise<unknown> {
    return (await this.#extension?.getEnvelope()) ?? null;
  }

  /** Position interpolée entre deux timeupdates (affichage et garde de boucle). */
  displayTimeS(): number {
    if (!this.isPlaying) return this.currentTimeS;
    return this.currentTimeS + ((performance.now() - this.timeUpdatedAt) / 1000) * this.effectiveRate;
  }

  loopIn(): void {
    if (this.sampleLoop) this.#extension?.exitLoop();
    this.loop = pressIn(this.loop, this.displayTimeS());
  }

  loopOut(): void {
    this.loop = pressOut(this.loop, this.displayTimeS());
    if (this.loop.active) this.#markLoopEngaged();
    this.#engageSampleLoopIfPossible();
    this.#persistLoop();
  }

  /** Coupe / relance la boucle (reloop) en gardant les points. */
  toggleLoop(): void {
    this.loop = toggleActive(this.loop);
    if (this.loop.active) {
      this.#markLoopEngaged();
      this.#engageSampleLoopIfPossible();
    } else {
      const ghost = this.rollMode ? this.ghostTimeS() : null;
      if (this.sampleLoop) this.#extension?.exitLoop();
      if (ghost !== null) this.seekToS(ghost); // roll : reprise comme si jamais bouclé
    }
  }

  /** Position fantôme courante (avance pendant la boucle, pour le roll). */
  ghostTimeS(): number {
    return ghostPosition(
      this.#loopEngagedAtS,
      (performance.now() - this.#loopEngagedWall) / 1000,
      this.effectiveRate,
    );
  }

  #markLoopEngaged(): void {
    this.#loopEngagedAtS = this.displayTimeS();
    this.#loopEngagedWall = performance.now();
  }

  /**
   * Boucle d'un nombre exact de beats : sortie calée sur le beat courant,
   * entrée N périodes plus tôt (on boucle les N derniers beats — l'audio
   * futur n'est pas encore capturé). Sample-accurate avec l'extension.
   */
  beatLoop(beats: number): void {
    if (!this.grid) return;
    const bounds = beatLoopBounds(this.grid, this.displayTimeS(), beats);
    if (!bounds) return;
    this.loop = { inS: bounds.inS, outS: bounds.outS, active: true };
    this.#markLoopEngaged();
    this.#engageSampleLoopIfPossible();
    this.#persistLoop();
  }

  #persistLoop(): void {
    if (this.loop.outS === null) return;
    this.#waveDirty = true;
    void this.#flushWaveform();
  }

  #engageSampleLoopIfPossible(): void {
    const { inS, outS, active } = this.loop;
    if (!active || inS === null || outS === null) return;
    if (this.#backend?.capabilities.sampleLoops) {
      this.#extension?.engageLoop(inS, outS);
    }
  }

  /** Grille posée à la main : le tap sur le beat donne BPM + ancre. */
  setGridManually(bpm: number, anchorS: number = this.displayTimeS()): void {
    this.grid = { bpm, anchorS };
    this.#waveDirty = true;
    void this.#flushWaveform();
  }

  /** Déplace l'ancre de grille (Alt+clic sur la waveform), BPM conservé. */
  setAnchor(anchorS: number): void {
    if (!this.grid) return;
    this.setGridManually(this.grid.bpm, anchorS);
  }

  /** Correction manuelle d'octave du BPM détecté (×½ ou ×2), persistée. */
  scaleBpm(factor: 0.5 | 2): void {
    if (!this.grid) return;
    const bpm = this.grid.bpm * factor;
    if (bpm < 40 || bpm > 400) return;
    this.grid = { bpm, anchorS: this.grid.anchorS };
    this.#waveDirty = true;
    void this.#flushWaveform();
  }

  /** Détecte la grille de beats depuis l'enveloppe capturée par l'extension. */
  async analyzeBpm(): Promise<void> {
    if (!this.#extension || this.#analyzingBpm) return;
    this.#analyzingBpm = true;
    try {
      const envelope = await this.#extension.getEnvelope();
      if (!envelope || envelope.data.length === 0) return;
      const chroma = await this.#extension.getChroma();
      // BPM + tonalité calculés dans le worker d'analyse (hors main thread)
      const { bpm: detection, key } = await analyze(
        Float32Array.from(envelope.data),
        envelope.rate,
        chroma?.bins ?? null,
      );
      if (!detection || detection.confidence < 0.12) return;
      // l'enveloppe vit en temps de contexte audio : conversion en temps média
      const r = this.effectiveRate || 1;
      const ctxLenS = envelope.data.length / envelope.rate;
      const envStartVideoS = envelope.endTimeS - ctxLenS * r;
      this.grid = {
        bpm: detection.bpm / r,
        anchorS: envStartVideoS + detection.anchorS * r,
      };
      // auto-gain : même enveloppe que le BPM
      this.autoGain = computeAutoGain(envelope.data);
      if (!this.silentMode) this.#extension.setGain(this.autoGain);
      if (key) this.musicalKey = { camelot: key.camelot, name: key.name };
      this.#waveDirty = true;
      void this.#flushWaveform();
    } finally {
      this.#analyzingBpm = false;
    }
  }

  /** Waveform en cache → restaurée telle quelle ; sinon pseudo dès que la durée est connue. */
  async #restoreWaveform(videoId: string): Promise<void> {
    const record = await loadWaveform(videoId);
    if (this.track?.videoId !== videoId) return; // le deck a déjà changé de morceau
    if (record) {
      this.cues = record.cues;
      // les grilles v1 (avant l'affinage anti-dérive) sont imprécises : on
      // les ignore, l'analyse auto reconstruira une grille calée
      if (record.bpm && record.anchorS !== null && record.anchorS !== undefined && record.gridV === 2) {
        this.grid = { bpm: record.bpm, anchorS: record.anchorS };
      }
      if (record.autoGain) this.autoGain = record.autoGain;
      if (record.keyCamelot) {
        this.musicalKey = { camelot: record.keyCamelot, name: record.keyName ?? '' };
      }
      if (record.loopInS != null && record.loopOutS != null) {
        // boucle restaurée inactive : le bouton ∞ (reloop) la relance telle quelle
        this.loop = { inS: record.loopInS, outS: record.loopOutS, active: false };
      }
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
      bpm: this.grid?.bpm ?? null,
      anchorS: this.grid?.anchorS ?? null,
      loopInS: this.loop.inS,
      loopOutS: this.loop.outS,
      keyCamelot: this.musicalKey?.camelot ?? null,
      keyName: this.musicalKey?.name ?? null,
      autoGain: this.autoGain,
      updatedAt: Date.now(),
    });
  }

  /** Applique un rate (demandé par l'utilisateur ou par la sync). */
  async setRate(requested: number, range = 0.16): Promise<void> {
    this.rate = clampRate(requested, range);
    const applied = await this.#backend?.setPlaybackRate(this.rate);
    this.effectiveRate = applied ?? this.rate;
  }

  /**
   * Micro-ajustement de rate pour le verrouillage de phase (beatmatch) :
   * ne touche pas au rate du fader, seulement au rate appliqué.
   */
  async applyPhaseBend(bend: number): Promise<void> {
    const target = this.rate * (1 + bend);
    const applied = await this.#backend?.setPlaybackRate(target);
    this.effectiveRate = applied ?? target;
  }

  setTempoMode(mode: TempoMode): void {
    this.tempoMode = mode;
    this.#backend?.setTempoMode(mode);
  }

  filterValue = $state(0);
  delayWet = $state(0);
  delayBeats = $state('1/2');
  /** Gain de normalisation du niveau perçu (±6 dB), appliqué via le graphe. */
  autoGain = $state(1);
  /** Deck fantôme : sortie coupée au GainNode (la capture, en amont, continue). */
  silentMode = false;

  /** Filtre bipolaire LP/HP (extension requise). */
  setFilter(value: number): void {
    this.filterValue = value;
    this.#extension?.setFilter(value);
  }

  /** Delay synchronisé au BPM : fraction de beat + dosage wet. */
  applyDelay(): void {
    if (!this.grid) return;
    const beats = parseBeatFraction(this.delayBeats);
    if (beats === null) return;
    this.#extension?.setDelay(
      delayTimeForBeats(this.grid.bpm, this.effectiveRate || 1, beats),
      this.delayWet,
    );
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
