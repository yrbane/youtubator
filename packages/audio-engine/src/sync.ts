export interface SyncDeck {
  id: string;
  isPlaying: boolean;
  synced: boolean;
  rate: number;
  /** BPM natif du morceau si la grille de beats est connue. */
  bpm?: number | null;
}

export interface RateUpdate {
  id: string;
  rate: number;
}

/**
 * Élection du deck maître : le maître actuel est conservé tant qu'il joue,
 * sinon le premier deck en lecture prend le relais.
 */
export function electMaster(decks: readonly SyncDeck[], currentMasterId: string | null): string | null {
  const current = decks.find((d) => d.id === currentMasterId);
  if (current?.isPlaying) return current.id;
  return decks.find((d) => d.isPlaying)?.id ?? null;
}

/**
 * Mises à jour de rate à appliquer aux esclaves synchronisés.
 * Beatmatch : si les BPM des deux decks sont connus, le rate esclave égalise
 * les BPM effectifs (master.rate × master.bpm / slave.bpm) ; sinon copie de rate.
 * Le maître n'est jamais mis à jour.
 */
export function applySync(decks: readonly SyncDeck[], masterId: string | null): RateUpdate[] {
  const master = decks.find((d) => d.id === masterId);
  if (!master) return [];
  return decks
    .filter((d) => d.id !== master.id && d.synced)
    .map((d) => ({
      id: d.id,
      rate: master.bpm && d.bpm ? (master.rate * master.bpm) / d.bpm : master.rate,
    }))
    .filter((u) => {
      const deck = decks.find((d) => d.id === u.id)!;
      return Math.abs(deck.rate - u.rate) > 1e-9;
    });
}
