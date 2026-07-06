import { describe, expect, it } from 'vitest';
import { buildRateRequest, mapPlaylistItemToTrack } from './youtube-account.js';

function item(overrides: Record<string, unknown> = {}) {
  return {
    snippet: {
      title: 'Daft Punk - Around the World',
      videoOwnerChannelTitle: 'Daft Punk',
      resourceId: { videoId: 'K0HSD_i2DvA' },
      thumbnails: { medium: { url: 'https://i.ytimg.com/vi/K0HSD_i2DvA/mqdefault.jpg' } },
      ...overrides,
    },
  };
}

describe('mapPlaylistItemToTrack', () => {
  it('convertit un playlistItem en Track', () => {
    expect(mapPlaylistItemToTrack(item())).toEqual({
      videoId: 'K0HSD_i2DvA',
      title: 'Daft Punk - Around the World',
      channel: 'Daft Punk',
      durationS: 0,
      thumbnailUrl: 'https://i.ytimg.com/vi/K0HSD_i2DvA/mqdefault.jpg',
    });
  });

  it('écarte les vidéos privées ou supprimées', () => {
    expect(mapPlaylistItemToTrack(item({ title: 'Private video' }))).toBeNull();
    expect(mapPlaylistItemToTrack(item({ title: 'Deleted video' }))).toBeNull();
  });

  it('retombe sur la miniature default puis sur i.ytimg si absente', () => {
    const withDefault = item({ thumbnails: { default: { url: 'https://i.ytimg.com/d.jpg' } } });
    expect(mapPlaylistItemToTrack(withDefault)?.thumbnailUrl).toBe('https://i.ytimg.com/d.jpg');
    const without = item({ thumbnails: {} });
    expect(mapPlaylistItemToTrack(without)?.thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/K0HSD_i2DvA/default.jpg',
    );
  });

  it('tolère un channel absent (chaîne vide)', () => {
    const noChannel = item({ videoOwnerChannelTitle: undefined });
    expect(mapPlaylistItemToTrack(noChannel)?.channel).toBe('');
  });

  it('retourne null sans videoId', () => {
    expect(mapPlaylistItemToTrack({ snippet: { title: 'x', resourceId: {} } })).toBeNull();
  });
});

describe('buildRateRequest — miroir des favoris vers les J\'aime YouTube', () => {
  it('construit un POST videos/rate avec like', () => {
    const { url, init } = buildRateRequest('ya29.tok', 'dQw4w9WgXcQ', 'like');
    expect(url).toBe('https://www.googleapis.com/youtube/v3/videos/rate?id=dQw4w9WgXcQ&rating=like');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ya29.tok');
  });

  it('rating none pour retirer le J\'aime', () => {
    const { url } = buildRateRequest('t', 'abc12345678', 'none');
    expect(url).toContain('rating=none');
  });

  it('encode l\'identifiant vidéo', () => {
    const { url } = buildRateRequest('t', 'a b', 'like');
    expect(url).toContain('id=a%20b');
  });
});
