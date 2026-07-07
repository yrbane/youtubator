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
      rate: master.bpm && d.bpm ? beatmatchRate(master.rate * master.bpm, d.bpm) : master.rate,
    }))
    .filter((u) => {
      const deck = decks.find((d) => d.id === u.id)!;
      return Math.abs(deck.rate - u.rate) > 1e-9;
    });
}

/**
 * Horloge maître façon Traktor : TOUS les decks synchronisés (maître de
 * phase compris) égalisent leur BPM effectif sur celui de l'horloge.
 * Sans BPM détecté, un deck ne peut pas suivre l'horloge.
 */
export function applyClockSync(decks: readonly SyncDeck[], clockBpm: number): RateUpdate[] {
  return decks
    .filter((d) => d.synced && d.bpm)
    .map((d) => ({ id: d.id, rate: beatmatchRate(clockBpm, d.bpm!) }))
    .filter((u) => {
      const deck = decks.find((d) => d.id === u.id)!;
      return Math.abs(deck.rate - u.rate) > 1e-9;
    });
}

/**
 * Rate esclave égalisant les BPM effectifs, avec appariement d'octave :
 * le BPM esclave détecté peut être à la moitié ou au double du vrai tempo,
 * on choisit le candidat (×½, ×1, ×2) donnant le rate le plus proche de 1.
 */
function beatmatchRate(masterEffectiveBpm: number, slaveBpm: number): number {
  let best = masterEffectiveBpm / slaveBpm;
  for (const factor of [0.5, 2]) {
    const rate = masterEffectiveBpm / (slaveBpm * factor);
    if (Math.abs(Math.log(rate)) < Math.abs(Math.log(best))) best = rate;
  }
  return best;
}
