import {
  alignPhaseDelta,
  applyClockSync,
  applySync,
  electMaster,
  periodS,
  pllBend,
  DEFAULT_TEMPO_RANGE,
} from '@youtubator/audio-engine';
import { crossfadeGains, type CrossfadeCurve } from 'potard';
import { Deck } from './deck.svelte.js';

const DECK_IDS = ['A', 'B', 'C', 'D'];
export const MAX_DECKS = 4;
export const MIN_DECKS = 2;

/** Store global : decks, crossfader, élection du maître, propagation de la sync. */
export class Mixer {
  decks = $state<Deck[]>([]);
  crossfader = $state(0);
  curve = $state<CrossfadeCurve>('constant-power');
  masterId = $state<string | null>(null);
  tempoRange = $state(DEFAULT_TEMPO_RANGE);

  /** Horloge maître façon Traktor : quand elle est armée, son BPM fait loi. */
  clockEnabled = $state(false);
  clockBpm = $state(140);

  constructor() {
    // verrouillage de phase continu (beatmatch) : PLL serrée, pas de seeks
    setInterval(() => this.#alignSlavePhases(), 250);
  }

  /** Arme/désarme l'horloge ; à l'armement, elle adopte le BPM effectif du maître courant. */
  toggleClock(): void {
    if (!this.clockEnabled) {
      const master = this.decks.find((d) => d.id === this.masterId);
      if (master?.grid) this.clockBpm = Math.round(master.grid.bpm * master.effectiveRate * 10) / 10;
    }
    this.clockEnabled = !this.clockEnabled;
    this.refresh();
  }

  setClockBpm(bpm: number): void {
    this.clockBpm = Math.min(220, Math.max(40, Math.round(bpm * 10) / 10));
    if (this.clockEnabled) this.refresh();
  }

  addDeck(): Deck | null {
    if (this.decks.length >= MAX_DECKS) return null;
    const index = this.decks.length;
    const deck = new Deck(DECK_IDS[index]!, index);
    this.decks.push(deck);
    return deck;
  }

  removeDeck(id: string): void {
    if (this.decks.length <= MIN_DECKS) return;
    const deck = this.decks.find((d) => d.id === id);
    if (!deck) return;
    if (deck.isPlaying && !confirm(`Le deck ${id} est en lecture. Le retirer ?`)) return;
    deck.destroy();
    this.decks = this.decks.filter((d) => d.id !== id);
    this.refresh();
  }

  /** Côté crossfader d'un deck : A à gauche, B à droite, C/D en THRU. */
  sideOf(deck: Deck): 'a' | 'b' | 'thru' {
    const index = this.decks.indexOf(deck);
    return index === 0 ? 'a' : index === 1 ? 'b' : 'thru';
  }

  /** À appeler après tout changement de lecture/tempo/sync : maître + esclaves + volumes. */
  refresh(): void {
    const snapshot = this.decks.map((d) => ({
      id: d.id,
      isPlaying: d.isPlaying,
      synced: d.synced,
      rate: d.rate,
      bpm: d.grid?.bpm ?? null,
    }));
    this.masterId = electMaster(snapshot, this.masterId);
    // horloge armée : tous les syncés (maître de phase compris) suivent son BPM ;
    // sinon, beatmatch classique des esclaves sur le deck maître
    const updates = this.clockEnabled
      ? applyClockSync(snapshot, this.clockBpm)
      : applySync(snapshot, this.masterId);
    for (const update of updates) {
      const deck = this.decks.find((d) => d.id === update.id);
      void deck?.setRate(update.rate, this.tempoRange);
    }
    this.#alignSlavePhases();
    this.applyVolumes();
  }

  /**
   * Beatmatch : verrouille la phase des esclaves sur le maître.
   * Écart léger → micro-bend de rate (inaudible, sans seek — la latence du
   * seek YouTube réinjecterait de l'erreur). Gros écart ou mode dégradé
   * (rate à paliers) → seek ponctuel.
   */
  #alignSlavePhases(): void {
    const master = this.decks.find((d) => d.id === this.masterId);
    if (!master?.grid || !master.isPlaying) return;
    for (const slave of this.decks) {
      if (slave === master || !slave.synced || !slave.grid || !slave.isPlaying || slave.sampleLoop) continue;
      const delta = alignPhaseDelta(master.grid, master.displayTimeS(), slave.grid, slave.displayTimeS());
      if (slave.hasExtension) {
        if (Math.abs(delta) > 0.35 * periodS(slave.grid)) {
          slave.seekToS(slave.displayTimeS() + delta); // rattrapage grossier, rare
        } else {
          // PLL serrée : zone morte ±2 ms, convergence ~1 s, jamais de seek
          void slave.applyPhaseBend(pllBend(delta));
        }
      } else if (Math.abs(delta) > 0.04) {
        slave.seekToS(slave.displayTimeS() + delta);
      }
    }
  }

  applyVolumes(): void {
    const gains = crossfadeGains(this.crossfader, this.curve);
    for (const deck of this.decks) {
      const side = this.sideOf(deck);
      deck.applyVolume(side === 'a' ? gains.a : side === 'b' ? gains.b : 1);
    }
  }

  #nudgeBase = new Map<string, number>();

  /** Nudge momentané (F-SYNC-03) : ±2 % tant que pressé, retour au rate de base ensuite. */
  nudge(deck: Deck, direction: 1 | -1, active: boolean): void {
    if (active) {
      if (!this.#nudgeBase.has(deck.id)) this.#nudgeBase.set(deck.id, deck.rate);
      void deck.setRate(deck.rate + 0.02 * direction, this.tempoRange + 0.02);
    } else {
      const base = this.#nudgeBase.get(deck.id);
      this.#nudgeBase.delete(deck.id);
      if (base !== undefined) void deck.setRate(base, this.tempoRange);
    }
  }
}
