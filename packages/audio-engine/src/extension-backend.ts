import type { EqBand } from './eq.js';
import { createMessage, parseMessage } from './protocol.js';
import type { DeckCapabilities, TempoMode } from './protocol.js';
import type { DeckAudioBackend, PlayerState, TimeInfo, Unsubscribe } from './types.js';

/** Canal de communication page ↔ frame YouTube (postMessage injectable). */
export interface MessageChannelLike {
  send(msg: unknown): void;
  onMessage(cb: (data: unknown) => void): Unsubscribe;
}

/**
 * Backend nominal : décore un backend de transport (IFrame API) et ajoute
 * EQ, modes tempo et rate continu via le content script de l'extension.
 * Tant que le handshake HELLO/HELLO_ACK n'a pas abouti, il se comporte
 * exactement comme le backend interne (mode dégradé transparent).
 */
export class ExtensionBackend implements DeckAudioBackend {
  #inner: DeckAudioBackend;
  #channel: MessageChannelLike;
  #connected = false;
  #capabilities: DeckCapabilities | null = null;
  #meterListeners = new Set<(level: number) => void>();
  #unsubChannel: Unsubscribe;

  constructor(inner: DeckAudioBackend, channel: MessageChannelLike) {
    this.#inner = inner;
    this.#channel = channel;
    this.#unsubChannel = channel.onMessage((data) => this.#handleMessage(data));
    channel.send(createMessage('HELLO', {}));
  }

  get capabilities(): DeckCapabilities {
    return this.#capabilities ?? this.#inner.capabilities;
  }

  #handleMessage(data: unknown): void {
    const msg = parseMessage(data);
    if (!msg) return;
    switch (msg.type) {
      case 'HELLO_ACK':
        this.#connected = true;
        this.#capabilities = msg.capabilities;
        break;
      case 'METER':
        for (const l of this.#meterListeners) l(msg.level);
        break;
    }
  }

  setEq(band: EqBand, gainDb: number): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('SET_EQ', { band, gainDb }));
    return true;
  }

  setTempoMode(mode: TempoMode): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('SET_TEMPO_MODE', { mode }));
    return true;
  }

  async setPlaybackRate(rate: number): Promise<number> {
    if (!this.#connected) return this.#inner.setPlaybackRate(rate);
    this.#channel.send(createMessage('SET_RATE', { rate }));
    return rate;
  }

  getAvailableRates(): number[] {
    return this.#connected ? [] : this.#inner.getAvailableRates();
  }

  /** Niveaux audio temps réel remontés par l'extension (VU-mètre). */
  onMeter(cb: (level: number) => void): Unsubscribe {
    this.#meterListeners.add(cb);
    return () => this.#meterListeners.delete(cb);
  }

  // --- Transport : délégation pure au backend interne ---

  load(videoId: string): Promise<void> {
    return this.#inner.load(videoId);
  }

  play(): void {
    this.#inner.play();
  }

  pause(): void {
    this.#inner.pause();
  }

  seekTo(seconds: number): void {
    this.#inner.seekTo(seconds);
  }

  setVolume(v: number): void {
    this.#inner.setVolume(v);
  }

  onStateChange(cb: (s: PlayerState) => void): Unsubscribe {
    return this.#inner.onStateChange(cb);
  }

  onTimeUpdate(cb: (t: TimeInfo) => void): Unsubscribe {
    return this.#inner.onTimeUpdate(cb);
  }

  destroy(): void {
    this.#unsubChannel();
    this.#meterListeners.clear();
    this.#inner.destroy();
  }
}
