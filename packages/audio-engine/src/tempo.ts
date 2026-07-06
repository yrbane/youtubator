/** Plage de tempo par défaut : ±16 % (qualité du time-stretch de Chrome). */
export const DEFAULT_TEMPO_RANGE = 0.16;

/** Borne un rate de lecture dans la plage ±range autour de ×1.00. */
export function clampRate(rate: number, range: number = DEFAULT_TEMPO_RANGE): number {
  const min = 1 - range;
  const max = 1 + range;
  return Math.min(max, Math.max(min, rate));
}

/** Décalage de hauteur (en demi-tons) induit par un rate en mode Vinyle. */
export function rateToSemitones(rate: number): number {
  return 12 * Math.log2(rate);
}

/** Formatage d'affichage : ×1.06 */
export function formatRate(rate: number): string {
  return `×${rate.toFixed(2)}`;
}
