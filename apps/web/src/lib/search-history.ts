/** Nombre maximal de recherches mémorisées. */
export const SEARCH_HISTORY_MAX = 20;

/** Forme canonique d'une requête pour la déduplication. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Durée de vie du cache des résultats : une recherche coûte 100 unités de quota API. */
export const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

export function isSearchCacheFresh(updatedAt: number, now: number): boolean {
  return now - updatedAt <= SEARCH_CACHE_TTL_MS;
}
