/**
 * Index de début du dernier segment de capture continu : un saut de temps
 * vidéo (seek, pause) entre deux blocs invalide la correspondance
 * enveloppe ↔ temps pour tout ce qui précède. Tolérance : 5× le pas médian
 * (absorbe la gigue d'horodatage, coupe sur les vraies ruptures).
 */
export function lastContiguousStart(blockTimes: readonly number[]): number {
  const n = blockTimes.length;
  if (n < 3) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) deltas.push(blockTimes[i]! - blockTimes[i - 1]!);
  const median = [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)]!;
  const tolerance = Math.max(0.05, Math.abs(median) * 5);
  for (let i = n - 1; i >= 1; i--) {
    const delta = blockTimes[i]! - blockTimes[i - 1]!;
    if (delta < -tolerance / 5 || Math.abs(delta - median) > tolerance) return i;
  }
  return 0;
}
