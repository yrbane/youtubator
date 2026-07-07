import { describe, expect, it } from 'vitest';
import { isSearchCacheFresh, normalizeQuery, SEARCH_CACHE_TTL_MS } from './search-history.js';

describe('normalizeQuery', () => {
  it('canonise espaces et casse', () => {
    expect(normalizeQuery('  Laurent   GARNIER ')).toBe('laurent garnier');
  });
});

describe('cache des recherches — fraîcheur', () => {
  const NOW = 1_800_000_000_000;

  it('frais sous le TTL : servi sans toucher au quota API', () => {
    expect(isSearchCacheFresh(NOW - 1000, NOW)).toBe(true);
    expect(isSearchCacheFresh(NOW - SEARCH_CACHE_TTL_MS + 1, NOW)).toBe(true);
  });

  it('périmé au-delà du TTL : la première page est re-demandée', () => {
    expect(isSearchCacheFresh(NOW - SEARCH_CACHE_TTL_MS - 1, NOW)).toBe(false);
  });
});
