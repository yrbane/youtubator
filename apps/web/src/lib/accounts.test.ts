import { describe, expect, it } from 'vitest';
import { mapChannelToProfile } from './accounts.js';
import { normalizeQuery } from './search-history.js';

describe('mapChannelToProfile', () => {
  const channels = {
    items: [
      {
        id: 'UC123',
        snippet: { title: 'DJ Seb', thumbnails: { default: { url: 'https://yt3.ggpht.com/a.jpg' } } },
        contentDetails: { relatedPlaylists: { likes: 'LL123' } },
      },
    ],
  };

  it('fusionne la chaîne YouTube et le userinfo en profil', () => {
    const profile = mapChannelToProfile(channels, {
      email: 'seb@gmail.com',
      name: 'Seb',
      picture: 'https://lh3.googleusercontent.com/p.jpg',
    });
    expect(profile).toEqual({
      accountId: 'seb@gmail.com',
      channelId: 'UC123',
      title: 'DJ Seb',
      email: 'seb@gmail.com',
      avatarUrl: 'https://yt3.ggpht.com/a.jpg',
      likedPlaylistId: 'LL123',
    });
  });

  it('retombe sur l’avatar Google puis sur le titre du userinfo si la chaîne est incomplète', () => {
    const bare = { items: [{ id: 'UC9', snippet: {}, contentDetails: {} }] };
    const profile = mapChannelToProfile(bare, { email: 'x@y.z', name: 'Xavier', picture: 'https://p/x.jpg' });
    expect(profile?.title).toBe('Xavier');
    expect(profile?.avatarUrl).toBe('https://p/x.jpg');
    expect(profile?.likedPlaylistId).toBeNull();
  });

  it('retourne null sans chaîne YouTube ni email', () => {
    expect(mapChannelToProfile({ items: [] }, {})).toBeNull();
  });
});

describe('normalizeQuery', () => {
  it('égalise espaces et casse pour la déduplication', () => {
    expect(normalizeQuery('  Daft   Punk ')).toBe('daft punk');
    expect(normalizeQuery('DAFT PUNK')).toBe('daft punk');
  });

  it('retourne une chaîne vide pour une requête blanche', () => {
    expect(normalizeQuery('   ')).toBe('');
  });
});
