import { Deck } from './deck.svelte.js';
import { loadWaveform } from './library.js';
import type { Track } from './tracks.js';

const ANALYSIS_TIMEOUT_MS = 90_000;

/**
 * Analyse fantôme : un deck caché et silencieux (gain 0 au graphe, capture
 * intacte) lit les morceaux de la file à ×2 pour pré-remplir leur dossier
 * (waveform, BPM, tonalité, auto-gain) avant qu'on les charge pour de vrai.
 */
export class GhostAnalyzer {
  queue = $state<Track[]>([]);
  current = $state<Track | null>(null);
  /** Message d'état (extension absente, etc.). */
  status = $state<string | null>(null);

  #container: HTMLElement | null = null;
  #running = false;

  attach(container: HTMLElement): void {
    this.#container = container;
  }

  enqueue(track: Track): void {
    if (
      this.queue.some((t) => t.videoId === track.videoId) ||
      this.current?.videoId === track.videoId
    ) {
      return;
    }
    this.queue = [...this.queue, track];
    void this.#pump();
  }

  async #pump(): Promise<void> {
    if (this.#running || !this.#container) return;
    this.#running = true;
    try {
      while (this.queue.length > 0) {
        const track = this.queue[0]!;
        this.queue = this.queue.slice(1);
        const existing = await loadWaveform(track.videoId);
        if (existing?.bpm) continue; // déjà analysé : rien à faire
        this.current = track;
        await this.#analyzeOne(track);
        this.current = null;
      }
    } finally {
      this.#running = false;
      this.current = null;
    }
  }

  async #analyzeOne(track: Track): Promise<void> {
    const deck = new Deck('GHOST', 3);
    deck.silentMode = true;
    deck.attach(this.#container!);
    try {
      await deck.loadTrack(track);
      await deck.setRate(2, 1); // analyse à double vitesse
      deck.play();
      const startedAt = performance.now();
      while (performance.now() - startedAt < ANALYSIS_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, 1000));
        if (deck.state === 'error') break;
        if (deck.grid && deck.musicalKey) break; // dossier complet
        // sans extension au bout de 15 s : l'analyse muette est impossible
        if (performance.now() - startedAt > 15_000 && !deck.hasExtension) {
          this.status = 'Analyse fantôme indisponible sans extension.';
          this.queue = [];
          break;
        }
      }
    } finally {
      deck.destroy();
      if (this.#container) this.#container.innerHTML = '';
    }
  }
}

export const ghost = new GhostAnalyzer();
