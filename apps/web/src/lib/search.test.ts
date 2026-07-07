import { describe, expect, it } from 'vitest';
import { buildSearchPath } from './search.js';

describe('buildSearchPath — recherche paginée', () => {
  it('première page sans pageToken', () => {
    expect(buildSearchPath('laurent garnier')).toBe(
      'search?part=snippet&type=video&maxResults=15&q=laurent%20garnier',
    );
  });

  it('pages suivantes avec pageToken encodé', () => {
    expect(buildSearchPath('acid', 'CA8QAA&x')).toBe(
      'search?part=snippet&type=video&maxResults=15&q=acid&pageToken=CA8QAA%26x',
    );
  });

  it('options par défaut : URL inchangée (le cache reste valable)', () => {
    expect(buildSearchPath('acid', null, { duration: 'any', order: 'relevance' })).toBe(
      buildSearchPath('acid'),
    );
  });

  it('durée (tracks/mixes) et tri par date ajoutés à la demande', () => {
    expect(buildSearchPath('acid', null, { duration: 'long' })).toContain('&videoDuration=long');
    expect(buildSearchPath('acid', null, { duration: 'medium', order: 'date' })).toContain(
      '&videoDuration=medium&order=date',
    );
  });
});
