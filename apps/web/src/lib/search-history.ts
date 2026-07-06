/** Nombre maximal de recherches mémorisées. */
export const SEARCH_HISTORY_MAX = 20;

/** Forme canonique d'une requête pour la déduplication. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}
