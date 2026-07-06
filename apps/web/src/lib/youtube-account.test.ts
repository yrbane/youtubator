import { describe, expect, it } from 'vitest';
import { mapPlaylistItemToTrack } from './youtube-account.js';

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
