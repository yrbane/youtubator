import {
  clampEqGain,
  createMessage,
  KILL_GAIN_DB,
  parseMessage,
} from '@youtubator/audio-engine';
import type { EqBand, TempoMode } from '@youtubator/audio-engine';

/** Surface du <video> YouTube utilisée par l'agent. */
export interface VideoLike {
  playbackRate: number;
  preservesPitch: boolean;
  muted: boolean;
}

/** Graphe EQ abstrait — l'implémentation Web Audio vit dans audio-graph.ts. */
export interface EqGraph {
  setBandGain(band: EqBand, gainDb: number): void;
  setGain(v: number): void;
  getLevel(): number;
  /** Tente de relancer l'AudioContext (autoplay policy). */
  resume(): void;
  isRunning(): boolean;
}

interface FrameAgentDeps {
  createGraph(video: VideoLike): EqGraph;
  postToParent(msg: unknown): void;
}

/**
 * Agent exécuté dans la frame YouTube par le content script.
 * L'embed ne crée son <video> qu'au premier play : l'agent répond donc au
 * protocole immédiatement, mémorise l'état demandé, et applique tout
 * (graphe compris) quand la vidéo apparaît.
 */
export class FrameAgent {
  #deps: FrameAgentDeps;
  #video: VideoLike | null = null;
  #graph: EqGraph | null = null;
  #helloReceived = false;

  // état demandé par la page, appliqué dès que possible
  #pendingRate: number | null = null;
  #pendingMode: TempoMode | null = null;
  #pendingEq = new Map<EqBand, number>();
  #pendingGain: number | null = null;

  constructor(deps: FrameAgentDeps) {
    this.#deps = deps;
  }

  get graphCreated(): boolean {
    return this.#graph !== null;
  }

  /** Appelé par le content script quand le <video> apparaît dans la frame. */
  attachVideo(video: VideoLike): void {
    this.#video = video;
    this.#applyPending();
  }

  handleMessage(data: unknown): void {
    const msg = parseMessage(data);
    if (!msg) return;
    this.#graph?.resume();
    switch (msg.type) {
      case 'HELLO':
        this.#helloReceived = true;
        this.#deps.postToParent(
          createMessage('HELLO_ACK', {
            capabilities: { eq: true, continuousRate: true, tempoModes: true },
          }),
        );
        this.#applyPending();
        break;
      case 'SET_RATE':
        this.#pendingRate = msg.rate;
        if (this.#video) this.#video.playbackRate = msg.rate;
        break;
      case 'SET_TEMPO_MODE':
        this.#pendingMode = msg.mode;
        if (this.#video) this.#video.preservesPitch = msg.mode === 'master-tempo';
        break;
      case 'SET_EQ': {
        // le kill passe tel quel, le knob est clampé à ±12 dB
        const gain = msg.gainDb === KILL_GAIN_DB ? KILL_GAIN_DB : clampEqGain(msg.gainDb);
        this.#pendingEq.set(msg.band, gain);
        this.#graph?.setBandGain(msg.band, gain);
        break;
      }
      case 'SET_GAIN':
        this.#pendingGain = msg.gain;
        this.#graph?.setGain(msg.gain);
        break;
    }
  }

  /** Publie le niveau courant vers la page (appelé sur un intervalle). */
  meterTick(): void {
    if (!this.#graph) return;
    this.#graph.resume();
    this.#deps.postToParent(createMessage('METER', { level: this.#graph.getLevel() }));
  }

  /** Construit le graphe (si Youtubator présent + vidéo là) et rejoue l'état demandé. */
  #applyPending(): void {
    const video = this.#video;
    if (!video || !this.#helloReceived) return;
    if (!this.#graph) {
      // MediaElementSource reroute la sortie de l'élément à travers le graphe :
      // la vidéo ne doit JAMAIS être mutée (muted couperait le signal capté).
      this.#graph = this.#deps.createGraph(video);
      this.#graph.resume();
    }
    if (this.#pendingRate !== null) video.playbackRate = this.#pendingRate;
    if (this.#pendingMode !== null) video.preservesPitch = this.#pendingMode === 'master-tempo';
    for (const [band, gain] of this.#pendingEq) this.#graph.setBandGain(band, gain);
    if (this.#pendingGain !== null) this.#graph.setGain(this.#pendingGain);
  }
}
