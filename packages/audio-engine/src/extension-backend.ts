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
  #loopStateListeners = new Set<(s: { engaged: boolean; resumeAtS: number | null }) => void>();
  #envelopeWaiters: Array<(e: { rate: number; data: number[]; endTimeS: number }) => void> = [];
  #chromaWaiters: Array<(c: { bins: number[]; samples: number }) => void> = [];
  #unsubChannel: Unsubscribe;
  #helloTimer: ReturnType<typeof setInterval> | null = null;

  constructor(inner: DeckAudioBackend, channel: MessageChannelLike) {
    this.#inner = inner;
    this.#channel = channel;
    this.#unsubChannel = channel.onMessage((data) => this.#handleMessage(data));
    channel.send(createMessage('HELLO', {}));
    // le content script peut charger après nous : on relance jusqu'à réponse
    this.#helloTimer = setInterval(() => this.#channel.send(createMessage('HELLO', {})), 1000);
  }

  #stopHelloRetry(): void {
    if (this.#helloTimer !== null) {
      clearInterval(this.#helloTimer);
      this.#helloTimer = null;
    }
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
        this.#stopHelloRetry();
        break;
      case 'METER':
        for (const l of this.#meterListeners) l(msg.level);
        break;
      case 'ENVELOPE': {
        const waiter = this.#envelopeWaiters.shift();
        waiter?.({ rate: msg.rate, data: msg.data, endTimeS: msg.endTimeS });
        break;
      }
      case 'CHROMA': {
        const chromaWaiter = this.#chromaWaiters.shift();
        chromaWaiter?.({ bins: msg.bins, samples: msg.samples });
        break;
      }
      case 'LOOP_STATE':
        for (const l of this.#loopStateListeners) l({ engaged: msg.engaged, resumeAtS: msg.resumeAtS });
        break;
    }
  }

  /** Enveloppe d'énergie du ring buffer (pour la détection de BPM). */
  async getEnvelope(): Promise<{ rate: number; data: number[]; endTimeS: number } | null> {
    if (!this.#connected) return null;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const i = this.#envelopeWaiters.indexOf(waiter);
        if (i >= 0) this.#envelopeWaiters.splice(i, 1);
        resolve(null);
      }, 3000);
      const waiter = (e: { rate: number; data: number[]; endTimeS: number }): void => {
        clearTimeout(timeout);
        resolve(e);
      };
      this.#envelopeWaiters.push(waiter);
      this.#channel.send(createMessage('GET_ENVELOPE', {}));
    });
  }

  /** Chromagramme accumulé côté frame (détection de tonalité). */
  async getChroma(): Promise<{ bins: number[]; samples: number } | null> {
    if (!this.#connected) return null;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const i = this.#chromaWaiters.indexOf(waiter);
        if (i >= 0) this.#chromaWaiters.splice(i, 1);
        resolve(null);
      }, 3000);
      const waiter = (c: { bins: number[]; samples: number }): void => {
        clearTimeout(timeout);
        resolve(c);
      };
      this.#chromaWaiters.push(waiter);
      this.#channel.send(createMessage('GET_CHROMA', {}));
    });
  }

  /** Boucle sample-accurate jouée depuis le buffer local de la frame. */
  engageLoop(inS: number, outS: number): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('LOOP_ENGAGE', { inS, outS }));
    return true;
  }

  exitLoop(): void {
    if (!this.#connected) return;
    this.#channel.send(createMessage('LOOP_EXIT', {}));
  }

  onLoopState(cb: (s: { engaged: boolean; resumeAtS: number | null }) => void): Unsubscribe {
    this.#loopStateListeners.add(cb);
    return () => this.#loopStateListeners.delete(cb);
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
    this.#stopHelloRetry();
    this.#unsubChannel();
    this.#meterListeners.clear();
    this.#inner.destroy();
  }
}
