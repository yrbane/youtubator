import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearToken,
  getActiveAccountId,
  getValidToken,
  setActiveAccountId,
  storeToken,
} from './youtube-auth.js';

const NOW = 1_800_000_000_000;

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('tokens par compte', () => {
  it('retourne null sans token stocké pour ce compte', () => {
    expect(getValidToken('seb@gmail.com', NOW)).toBeNull();
  });

  it('stocke et restitue un token par compte, sans fuite entre comptes', () => {
    storeToken('seb@gmail.com', 'ya29.seb', 3600, NOW);
    storeToken('lea@gmail.com', 'ya29.lea', 3600, NOW);
    expect(getValidToken('seb@gmail.com', NOW)).toBe('ya29.seb');
    expect(getValidToken('lea@gmail.com', NOW)).toBe('ya29.lea');
    expect(getValidToken('inconnu@gmail.com', NOW)).toBeNull();
  });

  it('considère le token expiré avec une marge de sécurité (60 s)', () => {
    storeToken('seb@gmail.com', 'ya29.seb', 3600, NOW);
    expect(getValidToken('seb@gmail.com', NOW + 3541 * 1000)).toBeNull();
  });

  it('clearToken() n’oublie que le compte visé', () => {
    storeToken('seb@gmail.com', 'ya29.seb', 3600, NOW);
    storeToken('lea@gmail.com', 'ya29.lea', 3600, NOW);
    clearToken('seb@gmail.com');
    expect(getValidToken('seb@gmail.com', NOW)).toBeNull();
    expect(getValidToken('lea@gmail.com', NOW)).toBe('ya29.lea');
  });
});

describe('compte actif', () => {
  it('null par défaut, persisté en localStorage ensuite', () => {
    expect(getActiveAccountId()).toBeNull();
    setActiveAccountId('seb@gmail.com');
    expect(getActiveAccountId()).toBe('seb@gmail.com');
    expect(window.localStorage.getItem('youtubator.activeAccountId')).toBe('seb@gmail.com');
    setActiveAccountId(null);
    expect(getActiveAccountId()).toBeNull();
  });
});
