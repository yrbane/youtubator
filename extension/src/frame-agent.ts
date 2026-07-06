import {
  clampEqGain,
  createMessage,
  KILL_GAIN_DB,
  parseMessage,
} from '@youtubator/audio-engine';
import type { EqBand } from '@youtubator/audio-engine';

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
}

interface FrameAgentDeps {
  video: VideoLike;
  createGraph(video: VideoLike): EqGraph;
  postToParent(msg: unknown): void;
}

/**
 * Agent exécuté dans la frame YouTube par le content script :
 * répond au protocole de la page Youtubator et pilote vidéo + graphe EQ.
 */
export class FrameAgent {
  #deps: FrameAgentDeps;
  #graph: EqGraph | null = null;

  constructor(deps: FrameAgentDeps) {
    this.#deps = deps;
  }

  get graphCreated(): boolean {
    return this.#graph !== null;
  }

  handleMessage(data: unknown): void {
    const msg = parseMessage(data);
    if (!msg) return;
    switch (msg.type) {
      case 'HELLO':
        if (!this.#graph) {
          this.#graph = this.#deps.createGraph(this.#deps.video);
          this.#deps.video.muted = true;
        }
        this.#deps.postToParent(
          createMessage('HELLO_ACK', {
            capabilities: { eq: true, continuousRate: true, tempoModes: true },
          }),
        );
        break;
      case 'SET_RATE':
        this.#deps.video.playbackRate = msg.rate;
        break;
      case 'SET_TEMPO_MODE':
        this.#deps.video.preservesPitch = msg.mode === 'master-tempo';
        break;
      case 'SET_EQ':
        // le kill passe tel quel, le knob est clampé à ±12 dB
        this.#graph?.setBandGain(
          msg.band,
          msg.gainDb === KILL_GAIN_DB ? KILL_GAIN_DB : clampEqGain(msg.gainDb),
        );
        break;
      case 'SET_GAIN':
        this.#graph?.setGain(msg.gain);
        break;
    }
  }

  /** Publie le niveau courant vers la page (appelé sur un intervalle). */
  meterTick(): void {
    if (!this.#graph) return;
    this.#deps.postToParent(createMessage('METER', { level: this.#graph.getLevel() }));
  }
}
