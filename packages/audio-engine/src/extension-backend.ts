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
  /** Requêtes en attente, par type de message de réponse (FIFO). */
  #waiters = new Map<string, Array<(payload: unknown) => void>>();
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
      case 'ENVELOPE':
        this.#waiters.get('ENVELOPE')?.shift()?.({
          rate: msg.rate,
          data: msg.data,
          endTimeS: msg.endTimeS,
          mode: msg.mode,
        });
        break;
      case 'CHROMA':
        this.#waiters.get('CHROMA')?.shift()?.({ bins: msg.bins, samples: msg.samples });
        break;
      case 'LOOP_STATE':
        for (const l of this.#loopStateListeners) l({ engaged: msg.engaged, resumeAtS: msg.resumeAtS });
        break;
    }
  }

  /**
   * Requête/réponse générique vers la frame : envoie `requestType`, résout
   * avec le payload du prochain `responseType` (FIFO), null après timeout.
   */
  #request<T>(requestType: 'GET_ENVELOPE' | 'GET_CHROMA', responseType: string): Promise<T | null> {
    if (!this.#connected) return Promise.resolve(null);
    return new Promise((resolve) => {
      const queue = this.#waiters.get(responseType) ?? [];
      this.#waiters.set(responseType, queue);
      const timeout = setTimeout(() => {
        const i = queue.indexOf(waiter);
        if (i >= 0) queue.splice(i, 1);
        resolve(null);
      }, 3000);
      const waiter = (payload: unknown): void => {
        clearTimeout(timeout);
        resolve(payload as T);
      };
      queue.push(waiter);
      this.#channel.send(createMessage(requestType, {}));
    });
  }

  /** Enveloppe d'énergie du ring buffer (pour la détection de BPM). */
  getEnvelope(): Promise<{ rate: number; data: number[]; endTimeS: number; mode?: string } | null> {
    return this.#request('GET_ENVELOPE', 'ENVELOPE');
  }

  /** Chromagramme accumulé côté frame (détection de tonalité). */
  getChroma(): Promise<{ bins: number[]; samples: number } | null> {
    return this.#request('GET_CHROMA', 'CHROMA');
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

  /** Filtre bipolaire LP/HP (-1..1, 0 = neutre). */
  setFilter(value: number): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('SET_FILTER', { value }));
    return true;
  }

  /** Gain du graphe (peut amplifier > 1, ex. auto-gain). */
  setGain(gain: number): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('SET_GAIN', { gain }));
    return true;
  }

  /** Delay synchronisé (temps réel en secondes). */
  setDelay(timeS: number, wet: number, feedback = 0.45): boolean {
    if (!this.#connected) return false;
    this.#channel.send(createMessage('SET_DELAY', { timeS, wet, feedback }));
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
