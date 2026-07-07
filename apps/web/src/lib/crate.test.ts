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

  it('schema 2 : métadonnées DJ, couleurs de styles, smartlists et historique — vides si absents (schema 1)', () => {
    const v1 = validateCrate({ schema: 1, waveforms: [], favorites: [], playlists: [] });
    expect(v1?.trackMeta).toEqual([]);
    expect(v1?.styleColors).toEqual([]);
    expect(v1?.smartlists).toEqual([]);
    expect(v1?.history).toEqual([]);
    const v2 = validateCrate({
      schema: 2,
      waveforms: [],
      favorites: [],
      playlists: [],
      trackMeta: [{ videoId: 'x', rating: 4, color: '', style: 'techno', plays: 2, lastPlayedAt: null }],
      styleColors: [{ style: 'techno', color: '#ff4d4d' }],
      smartlists: [],
      history: [],
    });
    expect(v2?.trackMeta.length).toBe(1);
    expect(v2?.styleColors.length).toBe(1);
  });
});
