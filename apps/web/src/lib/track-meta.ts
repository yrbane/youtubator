/** Métadonnées DJ d'un morceau (note, couleur, style, lectures) : logique pure. */

/** Palette façon Traktor ; l'indice 0 est « sans couleur ». */
export const TRACK_COLORS = [
  '',
  '#ff4d4d',
  '#ff9f45',
  '#ffd24d',
  '#6bd968',
  '#4dc3ff',
  '#8f7bff',
  '#ff6bd9',
] as const;

export function clampRating(value: number): number {
  return Math.min(5, Math.max(0, Math.round(value)));
}

/** Couleur suivante de la palette (cycle, retour à « sans couleur » en bout). */
export function nextColor(current: string): string {
  const index = TRACK_COLORS.indexOf(current as (typeof TRACK_COLORS)[number]);
  // couleur hors palette : on repart du début
  return TRACK_COLORS[(Math.max(index, 0) + 1) % TRACK_COLORS.length];
}

export function normalizeStyle(style: string): string {
  return style.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Migration v6 → v7 : la couleur devient une propriété du style.
 * Chaque style hérite de la première couleur non vide posée sur un de ses morceaux.
 */
export function deriveStyleColors(rows: Array<{ style: string; color: string }>): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const { style, color } of rows) {
    if (style !== '' && color !== '' && !(style in colors)) colors[style] = color;
  }
  return colors;
}

/** Colonnes triables des listes du browser. */
export interface SortableRow {
  title: string;
  channel: string;
  durationS: number;
  bpm?: number | null;
  key?: string | null;
  rating?: number;
  plays?: number;
  style?: string | null;
  color?: string | null;
}

export type SortKey = keyof SortableRow;

export const SORT_KEYS: ReadonlyArray<[SortKey, string]> = [
  ['title', 'Titre'],
  ['channel', 'Artiste'],
  ['durationS', 'Durée'],
  ['bpm', 'BPM'],
  ['key', 'Tonalité'],
  ['rating', 'Note'],
  ['plays', 'Lect.'],
  ['style', 'Style'],
  ['color', 'Couleur'],
];

/** Valeur de tri ; null = absente (toujours reléguée en fin de liste). */
function sortValue(row: SortableRow, key: SortKey): string | number | null {
  const raw = row[key];
  if (key === 'color') {
    const index = TRACK_COLORS.indexOf((raw ?? '') as (typeof TRACK_COLORS)[number]);
    return index <= 0 ? null : index;
  }
  if (key === 'durationS' || key === 'bpm' || key === 'rating' || key === 'plays') {
    const n = typeof raw === 'number' ? raw : null;
    return n === null || (key !== 'plays' && n === 0) ? (key === 'plays' ? n : null) : n;
  }
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s === '' ? null : s.toLowerCase();
}

/** Trie sans muter ; les valeurs absentes restent en fin quel que soit le sens. */
export function sortRows<T>(
  items: T[],
  toRow: (item: T) => SortableRow,
  key: SortKey,
  dir: 1 | -1,
): T[] {
  const collator = new Intl.Collator('fr', { sensitivity: 'base' });
  return [...items].sort((a, b) => {
    const va = sortValue(toRow(a), key);
    const vb = sortValue(toRow(b), key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' ? collator.compare(va, String(vb)) : Number(va) - Number(vb);
    return cmp * dir;
  });
}
