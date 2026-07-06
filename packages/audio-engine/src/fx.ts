/** Fraction de beat des delays DJ ('1/4', '1/2', '3/4', '1') → nombre de beats. */
export function parseBeatFraction(label: string): number | null {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(label.trim());
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] !== undefined ? Number(m[2]) : 1;
  if (den === 0) return null;
  return num / den;
}

/** Niveau RMS cible de l'auto-gain. */
const AUTO_GAIN_TARGET = 0.25;
/** Seuil sous lequel un bucket est considéré silencieux (intro, break). */
const SILENCE_LEVEL = 0.02;

/**
 * Gain de normalisation du niveau perçu, borné à ±6 dB (0,5..2).
 * Moyenne des niveaux hors silences → gain = cible / niveau moyen.
 */
export function computeAutoGain(envelope: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (const v of envelope) {
    if (v > SILENCE_LEVEL) {
      sum += v;
      count++;
    }
  }
  if (count < 20) return 1; // pas assez de signal pour juger
  const mean = sum / count;
  return Math.min(2, Math.max(0.5, AUTO_GAIN_TARGET / mean));
}

/**
 * Temps réel (secondes) d'un delay de N beats : la période musicale est en
 * temps média, le delay vit en temps réel → division par le rate effectif.
 */
export function delayTimeForBeats(bpm: number, effectiveRate: number, beats: number): number {
  return (beats * (60 / bpm)) / effectiveRate;
}
