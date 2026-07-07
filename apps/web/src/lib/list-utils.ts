/** Déplace un élément (copie, origine invalide = inchangé, cible clampée). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from < 0 || from >= copy.length) return copy;
  const target = Math.min(copy.length - 1, Math.max(0, to));
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item!);
  return copy;
}
