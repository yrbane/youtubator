import { describe, expect, it } from 'vitest';
import { resolveClientId } from './app-config.js';

describe('Client ID OAuth — instance vs utilisateur', () => {
  it('l’ID collé par l’utilisateur prime sur celui de l’instance', () => {
    expect(resolveClientId('mon-id.apps.googleusercontent.com', 'defaut.apps')).toBe(
      'mon-id.apps.googleusercontent.com',
    );
  });

  it('sans ID utilisateur, on retombe sur celui de l’instance', () => {
    expect(resolveClientId(null, 'defaut.apps')).toBe('defaut.apps');
    expect(resolveClientId('  ', 'defaut.apps')).toBe('defaut.apps');
  });

  it('sans ID du tout : null (l’onboarding s’affiche)', () => {
    expect(resolveClientId(null, '')).toBeNull();
    expect(resolveClientId('', '  ')).toBeNull();
  });
});
