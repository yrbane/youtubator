import type { EqBand } from './eq.js';
import type { DeckCapabilities, TempoMode } from './protocol.js';

export type Unsubscribe = () => void;

export type PlayerState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued';

export interface TimeInfo {
  currentTimeS: number;
  durationS: number;
}

/**
 * Contrat unique des platines audio (README § 5).
 * Deux implémentations : ExtensionBackend (nominal) et IframeApiBackend (dégradé).
 * L'UI ne consulte que `capabilities`, jamais le type concret.
 */
export interface DeckAudioBackend {
  load(videoId: string): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  /** Volume linéaire 0..1. */
  setVolume(v: number): void;
  /** Retourne le rate effectivement appliqué (snappé en mode dégradé). */
  setPlaybackRate(rate: number): Promise<number>;
  getAvailableRates(): number[];
  /** false si la capacité n'est pas disponible. */
  setEq(band: EqBand, gainDb: number): boolean;
  setTempoMode(mode: TempoMode): boolean;
  readonly capabilities: DeckCapabilities;
  onStateChange(cb: (s: PlayerState) => void): Unsubscribe;
  onTimeUpdate(cb: (t: TimeInfo) => void): Unsubscribe;
  destroy(): void;
}
