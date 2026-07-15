import { suggestNext } from './suggest.js';
import type { Track } from './tracks.js';

/** Candidat automix : un Track enrichi de son analyse (si connue). */
export interface AutomixCandidate extends Track {
  bpm: number | null;
  key: string | null;
}

/**
 * Poids de la tonalité dans le choix : `off` = tempo seul, `prefer` = les
 * compatibles d'abord mais jamais bloquant, `strict` = compatibles uniquement
 * (sinon rien — pas de repli hasardeux).
 */
export type AutomixKeyMode = 'off' | 'prefer' | 'strict';

/** Courbe du fondu au crossfader. */
export type FadeCurve = 'linear' | 'smooth' | 'sharp';

/** Réglages du choix de morceau (tous surchargeables un à un). */
export interface AutomixPickOptions {
  /** Fenêtre de tempo en % (octaves comprises). */
  bpmTolerancePct: number;
  keyMode: AutomixKeyMode;
  /** Durée minimale en s — écarte les jingles (0 = pas de plancher, durée inconnue tolérée). */
  minDurationS: number;
  /** Durée maximale en s — écarte les DJ sets d'une heure (0 = pas de plafond). */
  maxDurationS: number;
  /** Pointe de hasard : pioche parmi les N meilleurs candidats. */
  pickFrom: number;
}

export const AUTOMIX_PICK_DEFAULTS: AutomixPickOptions = {
  bpmTolerancePct: 6,
  keyMode: 'prefer',
  minDurationS: 90,
  maxDurationS: 0,
  pickFrom: 3,
};

/**
 * Choisit le prochain morceau du set : tempo dans la fenêtre (octaves
 * comprises), tonalités traitées selon `keyMode`, pointe de hasard parmi les
 * `pickFrom` meilleurs pour ne pas toujours rejouer le même enchaînement.
 * Sans référence ou sans candidat au tempo : pioche au hasard (sauf en
 * strict). `rand` est injecté (déterminisme des tests).
 */
export function pickNextTrack(
  reference: { videoId: string; bpm: number | null; key: string | null } | null,
  candidates: readonly AutomixCandidate[],
  excludeIds: ReadonlySet<string>,
  rand: () => number,
  options: Partial<AutomixPickOptions> = {},
): AutomixCandidate | null {
  const opts = { ...AUTOMIX_PICK_DEFAULTS, ...options };
  const eligible = candidates.filter(
    (c) =>
      !excludeIds.has(c.videoId) &&
      (c.durationS === 0 || c.durationS >= opts.minDurationS) &&
      (opts.maxDurationS === 0 || c.durationS === 0 || c.durationS <= opts.maxDurationS),
  );
  if (eligible.length === 0) return null;

  if (reference?.bpm) {
    const ranked = suggestNext(
      {
        videoId: reference.videoId,
        bpm: reference.bpm,
        key: opts.keyMode === 'off' ? null : reference.key,
      },
      eligible,
      opts.bpmTolerancePct,
    );
    const kept =
      opts.keyMode === 'strict' && reference.key ? ranked.filter((r) => r.keyMatch) : ranked;
    const matches = kept
      .map((r) => eligible.find((c) => c.videoId === r.videoId)!)
      .filter(Boolean);
    if (matches.length > 0) {
      const top = matches.slice(0, Math.max(1, opts.pickFrom));
      return top[Math.floor(rand() * top.length)] ?? top[0]!;
    }
    if (opts.keyMode === 'strict') return null; // strict assumé : rien de compatible = rien
  }
  return eligible[Math.floor(rand() * eligible.length)] ?? eligible[0]!;
}

/**
 * Avancement du fondu selon la courbe choisie : `linear` = identité,
 * `smooth` = smoothstep (départ et arrivée feutrés), `sharp` = plate aux
 * extrémités puis bascule rapide au centre (quintique).
 */
export function fadeProgress(p: number, curve: FadeCurve): number {
  const t = Math.min(1, Math.max(0, p));
  if (curve === 'linear') return t;
  if (curve === 'smooth') return t * t * (3 - 2 * t);
  return t < 0.5 ? 16 * t ** 5 : 1 - 16 * (1 - t) ** 5;
}
