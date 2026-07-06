import { describe, expect, it } from 'vitest';
import { validateCrate } from './crate.js';

describe('validateCrate — format d\'échange du crate', () => {
  it('accepte un crate bien formé', () => {
    const crate = {
      schema: 1,
      exportedAt: 1800000000000,
      waveforms: [{ videoId: 'abc12345678', durationS: 200, buckets: [], real: false, cues: [10], updatedAt: 1 }],
      favorites: [],
      playlists: [],
    };
    expect(validateCrate(crate)).not.toBeNull();
  });

  it('rejette schéma inconnu, structures manquantes et entrées sans videoId', () => {
    expect(validateCrate(null)).toBeNull();
    expect(validateCrate({ schema: 99, waveforms: [], favorites: [], playlists: [] })).toBeNull();
    expect(validateCrate({ schema: 1, waveforms: 'x', favorites: [], playlists: [] })).toBeNull();
    expect(
      validateCrate({ schema: 1, waveforms: [{ durationS: 1 }], favorites: [], playlists: [] }),
    ).toBeNull();
  });
});
