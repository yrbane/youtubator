export type DeckState = 'empty' | 'loading' | 'cued' | 'playing' | 'paused' | 'error';

type Listener = (state: DeckState) => void;
type Unsubscribe = () => void;

/**
 * Machine à états d'une platine. Ne connaît ni YouTube ni le DOM :
 * l'application relie ses transitions au DeckAudioBackend.
 */
export class DeckCore {
  readonly id: string;
  #state: DeckState = 'empty';
  #videoId: string | null = null;
  #cuePointS = 0;
  #errorMessage: string | null = null;
  #listeners = new Set<Listener>();

  constructor(id: string) {
    this.id = id;
  }

  get state(): DeckState {
    return this.#state;
  }

  get videoId(): string | null {
    return this.#videoId;
  }

  get cuePointS(): number {
    return this.#cuePointS;
  }

  get errorMessage(): string | null {
    return this.#errorMessage;
  }

  load(videoId: string): void {
    this.#videoId = videoId;
    this.#cuePointS = 0;
    this.#errorMessage = null;
    this.#transition('loading');
  }

  /** Le backend signale que le morceau est prêt. */
  ready(): void {
    if (this.#state !== 'loading') return;
    this.#transition('cued');
  }

  play(): boolean {
    if (this.#state !== 'cued' && this.#state !== 'paused') return false;
    this.#transition('playing');
    return true;
  }

  /** Met en pause et mémorise le point de cue au temps courant. */
  pause(currentTimeS: number): void {
    if (this.#state !== 'playing') return;
    this.#cuePointS = currentTimeS;
    this.#transition('paused');
  }

  /** Retourne au point de cue ; renvoie la position de seek à appliquer. */
  cue(): number {
    if (this.#state === 'playing' || this.#state === 'paused') {
      this.#transition('cued');
    }
    return this.#cuePointS;
  }

  fail(message: string): void {
    this.#errorMessage = message;
    this.#transition('error');
  }

  subscribe(listener: Listener): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #transition(next: DeckState): void {
    this.#state = next;
    for (const l of this.#listeners) l(next);
  }
}
