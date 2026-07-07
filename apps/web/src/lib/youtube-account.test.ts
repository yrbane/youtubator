import { describe, expect, it } from 'vitest';
import {
  buildPlaylistItemsPath,
  buildRateRequest,
  mapPlaylistItemToTrack,
  mergeTracks,
} from './youtube-account.js';
import type { Track } from './tracks.js';

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

function track(videoId: string): Track {
  return { videoId, title: videoId, channel: '', durationS: 0, thumbnailUrl: '' };
}

describe('pagination des listes YouTube', () => {
  it('première page sans pageToken, pages suivantes avec', () => {
    expect(buildPlaylistItemsPath('PL42')).toBe(
      'playlistItems?part=snippet&playlistId=PL42&maxResults=50',
    );
    expect(buildPlaylistItemsPath('PL42', 'CAoQAA')).toBe(
      'playlistItems?part=snippet&playlistId=PL42&maxResults=50&pageToken=CAoQAA',
    );
  });

  it('encode playlistId et pageToken', () => {
    expect(buildPlaylistItemsPath('a b', 'c&d')).toContain('playlistId=a%20b');
    expect(buildPlaylistItemsPath('a b', 'c&d')).toContain('pageToken=c%26d');
  });
});

describe('mergeTracks — fusion des pages sans doublons', () => {
  it('append : les plus anciens arrivent en fin de liste', () => {
    const merged = mergeTracks([track('aaa'), track('bbb')], [track('ccc')], 'append');
    expect(merged.map((t) => t.videoId)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('prepend : les nouveaux « J\'aime » remontent en tête', () => {
    const merged = mergeTracks([track('bbb'), track('ccc')], [track('aaa'), track('bbb')], 'prepend');
    expect(merged.map((t) => t.videoId)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('dédoublonne par videoId, l\'existant garde sa place en append', () => {
    const merged = mergeTracks([track('aaa'), track('bbb')], [track('bbb'), track('ccc')], 'append');
    expect(merged.map((t) => t.videoId)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('listes vides tolérées des deux côtés', () => {
    expect(mergeTracks([], [track('aaa')], 'append').length).toBe(1);
    expect(mergeTracks([track('aaa')], [], 'prepend').length).toBe(1);
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
