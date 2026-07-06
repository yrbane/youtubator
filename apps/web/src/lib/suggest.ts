import { camelotCompatible } from '@youtubator/audio-engine';

export interface SuggestCandidate {
  videoId: string;
  title: string;
  bpm: number | null;
  key: string | null;
}

/** Écart de tempo en %, en autorisant l'appariement d'octave (×½/×2). */
export function bpmDistancePct(referenceBpm: number, bpm: number): number {
  let best = Infinity;
  for (const factor of [0.5, 1, 2]) {
    best = Math.min(best, Math.abs((bpm * factor) / referenceBpm - 1) * 100);
  }
  return best;
}

/**
 * Morceaux mixables après la référence : tempo à ±6 % (octave près),
 * tonalités compatibles d'abord, puis écart de tempo croissant.
 */
export function suggestNext(
  reference: { videoId: string; bpm: number; key: string | null },
  candidates: readonly SuggestCandidate[],
  maxBpmDiffPct = 6,
): Array<SuggestCandidate & { bpmDiffPct: number; keyMatch: boolean }> {
  return candidates
    .filter((c) => c.videoId !== reference.videoId && c.bpm !== null)
    .map((c) => ({
      ...c,
      bpmDiffPct: bpmDistancePct(reference.bpm, c.bpm!),
      keyMatch: Boolean(reference.key && c.key && camelotCompatible(reference.key, c.key)),
    }))
    .filter((c) => c.bpmDiffPct <= maxBpmDiffPct)
    .sort((a, b) => {
      if (reference.key && a.keyMatch !== b.keyMatch) return a.keyMatch ? -1 : 1;
      // tonalité inconnue : mieux qu'incompatible, moins bien que compatible
      const rank = (c: { keyMatch: boolean; key: string | null }): number =>
        c.keyMatch ? 0 : c.key === null ? 1 : 2;
      if (reference.key && rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.bpmDiffPct - b.bpmDiffPct;
    });
}
