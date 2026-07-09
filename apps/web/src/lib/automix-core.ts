import { suggestNext } from './suggest.js';
import type { Track } from './tracks.js';

/** Candidat automix : un Track enrichi de son analyse (si connue). */
export interface AutomixCandidate extends Track {
  bpm: number | null;
  key: string | null;
}

/** En dessous, c'est un jingle, pas un morceau (durée 0 = inconnue, tolérée). */
const MIN_DURATION_S = 90;

/**
 * Choisit le prochain morceau du set : tempo à ±6 % (octaves comprises) et
 * tonalités compatibles d'abord (via suggestNext), avec une pointe de hasard
 * parmi les 3 meilleurs pour ne pas toujours rejouer le même enchaînement.
 * Sans référence ou sans candidat au tempo : pioche au hasard. `rand` est
 * injecté (déterminisme des tests).
 */
export function pickNextTrack(
  reference: { videoId: string; bpm: number | null; key: string | null } | null,
  candidates: readonly AutomixCandidate[],
  excludeIds: ReadonlySet<string>,
  rand: () => number,
): AutomixCandidate | null {
  const eligible = candidates.filter(
    (c) => !excludeIds.has(c.videoId) && (c.durationS === 0 || c.durationS >= MIN_DURATION_S),
  );
  if (eligible.length === 0) return null;

  if (reference?.bpm) {
    const ranked = suggestNext(
      { videoId: reference.videoId, bpm: reference.bpm, key: reference.key },
      eligible,
    );
    const matches = ranked
      .map((r) => eligible.find((c) => c.videoId === r.videoId)!)
      .filter(Boolean);
    if (matches.length > 0) {
      const top = matches.slice(0, 3);
      return top[Math.floor(rand() * top.length)] ?? top[0]!;
    }
  }
  return eligible[Math.floor(rand() * eligible.length)] ?? eligible[0]!;
}
