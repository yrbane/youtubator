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
});
