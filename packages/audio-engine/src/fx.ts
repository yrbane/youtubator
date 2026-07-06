/** Fraction de beat des delays DJ ('1/4', '1/2', '3/4', '1') → nombre de beats. */
export function parseBeatFraction(label: string): number | null {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(label.trim());
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] !== undefined ? Number(m[2]) : 1;
  if (den === 0) return null;
  return num / den;
}

/**
 * Temps réel (secondes) d'un delay de N beats : la période musicale est en
 * temps média, le delay vit en temps réel → division par le rate effectif.
 */
export function delayTimeForBeats(bpm: number, effectiveRate: number, beats: number): number {
  return (beats * (60 / bpm)) / effectiveRate;
}
