import { camelotCompatible } from '@youtubator/audio-engine';
import { bpmDistancePct } from './suggest.js';

/** Ce qu'il faut connaître d'un morceau pour juger sa mixabilité. */
export interface MatchTarget {
  bpm: number | null;
  key: string | null;
}

/**
 * Filtre MATCH façon Traktor : mixable après le deck maître si le tempo est
 * à ±tolPct % (octaves ½×/2× comprises) et la tonalité compatible Camelot.
 * Une tonalité inconnue ne disqualifie pas ; un BPM inconnu, si.
 */
export function matchesMaster(
  target: MatchTarget,
  master: { bpm: number; key: string | null },
  tolPct = 6,
): boolean {
  if (target.bpm === null) return false;
  if (bpmDistancePct(master.bpm, target.bpm) > tolPct) return false;
  if (master.key && target.key) return camelotCompatible(master.key, target.key);
  return true;
}
