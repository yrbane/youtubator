import { beforeEach, describe, expect, it } from 'vitest';
import { clearToken, getValidToken, storeToken } from './youtube-auth.js';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  sessionStorage.clear();
});

describe('cycle de vie du token OAuth', () => {
  it('retourne null sans token stocké', () => {
    expect(getValidToken(NOW)).toBeNull();
  });

  it('stocke un token et le restitue tant qu’il est valide', () => {
    storeToken('ya29.abc', 3600, NOW);
    expect(getValidToken(NOW)).toBe('ya29.abc');
    expect(getValidToken(NOW + 3000 * 1000)).toBe('ya29.abc');
  });

  it('considère le token expiré avec une marge de sécurité (60 s)', () => {
    storeToken('ya29.abc', 3600, NOW);
    expect(getValidToken(NOW + 3541 * 1000)).toBeNull(); // 3600 - 60 + 1
  });

  it('clearToken() oublie le token', () => {
    storeToken('ya29.abc', 3600, NOW);
    clearToken();
    expect(getValidToken(NOW)).toBeNull();
  });

  it('survit à un rechargement (persisté en sessionStorage)', () => {
    storeToken('ya29.abc', 3600, NOW);
    const raw = sessionStorage.getItem('youtubator.ytToken');
    expect(raw).toContain('ya29.abc');
  });
});
