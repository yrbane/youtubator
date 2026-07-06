import type { EqBand } from './eq.js';
import type { DeckCapabilities, TempoMode } from './protocol.js';
import type { DeckAudioBackend, PlayerState, TimeInfo, Unsubscribe } from './types.js';

/** Surface minimale du YT.Player utilisée par le backend (adaptateur testable). */
export interface YtPlayerHandle {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void; // échelle YouTube 0..100
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

export interface PlayerFactory {
  create(opts: {
    videoId: string;
    onReady(): void;
    onStateChange(code: number): void;
  }): YtPlayerHandle;
}

/** Palier disponible le plus proche du rate demandé. */
export function nearestRate(requested: number, available: readonly number[]): number {
  return available.reduce((best, r) =>
    Math.abs(r - requested) < Math.abs(best - requested) ? r : best,
  );
}

const YT_STATE_BY_CODE: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

/** Backend dégradé : IFrame Player API officielle (pas d'EQ, rate à paliers). */
export class IframeApiBackend implements DeckAudioBackend {
  readonly capabilities: DeckCapabilities = {
    eq: false,
    continuousRate: false,
    tempoModes: false,
  };

  #factory: PlayerFactory;
  #player: YtPlayerHandle | null = null;
  #stateListeners = new Set<(s: PlayerState) => void>();
  #timeListeners = new Set<(t: TimeInfo) => void>();
  #timeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(factory: PlayerFactory) {
    this.#factory = factory;
  }

  async load(videoId: string): Promise<void> {
    if (this.#player) {
      this.#player.loadVideoById(videoId);
      return;
    }
    await new Promise<void>((resolve) => {
      this.#player = this.#factory.create({
        videoId,
        onReady: resolve,
        onStateChange: (code) => {
          const state = YT_STATE_BY_CODE[code];
          if (state) for (const l of this.#stateListeners) l(state);
        },
      });
    });
    this.#timeTimer = setInterval(() => {
      const p = this.#player;
      if (!p) return;
      const info: TimeInfo = { currentTimeS: p.getCurrentTime(), durationS: p.getDuration() };
      for (const l of this.#timeListeners) l(info);
    }, 250);
  }

  play(): void {
    this.#player?.playVideo();
  }

  pause(): void {
    this.#player?.pauseVideo();
  }

  seekTo(seconds: number): void {
    this.#player?.seekTo(seconds, true);
  }

  setVolume(v: number): void {
    this.#player?.setVolume(Math.round(v * 100));
  }

  async setPlaybackRate(rate: number): Promise<number> {
    if (!this.#player) return 1;
    const snapped = nearestRate(rate, this.getAvailableRates());
    this.#player.setPlaybackRate(snapped);
    return snapped;
  }

  getAvailableRates(): number[] {
    return this.#player?.getAvailablePlaybackRates() ?? [1];
  }

  setEq(_band: EqBand, _gainDb: number): boolean {
    return false;
  }

  setTempoMode(_mode: TempoMode): boolean {
    return false;
  }

  onStateChange(cb: (s: PlayerState) => void): Unsubscribe {
    this.#stateListeners.add(cb);
    return () => this.#stateListeners.delete(cb);
  }

  onTimeUpdate(cb: (t: TimeInfo) => void): Unsubscribe {
    this.#timeListeners.add(cb);
    return () => this.#timeListeners.delete(cb);
  }

  destroy(): void {
    if (this.#timeTimer !== null) {
      clearInterval(this.#timeTimer);
      this.#timeTimer = null;
    }
    this.#player?.destroy();
    this.#player = null;
    this.#stateListeners.clear();
    this.#timeListeners.clear();
  }
}
