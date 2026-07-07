/** Filtre libre des listes du browser, façon Traktor : pur et testable. */

export interface FilterableRow {
  title: string;
  channel?: string;
  style?: string | null;
  bpm?: number | null;
  key?: string | null;
}

/** Minuscules sans diacritiques : « Émotion » se trouve avec « emotion ». */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Tous les mots du filtre doivent apparaître, dans n'importe quel champ. */
export function matchesFilter(row: FilterableRow, query: string): boolean {
  const tokens = fold(query).split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return true;
  const haystack = fold(
    [
      row.title,
      row.channel ?? '',
      row.style ?? '',
      row.bpm ? String(Math.round(row.bpm)) : '',
      row.key ?? '',
    ].join(' '),
  );
  return tokens.every((token) => haystack.includes(token));
}

export function filterRows<T>(items: T[], toRow: (item: T) => FilterableRow, query: string): T[] {
  if (query.trim() === '') return items;
  return items.filter((item) => matchesFilter(toRow(item), query));
}
