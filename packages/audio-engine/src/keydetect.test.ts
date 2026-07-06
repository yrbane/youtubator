import { describe, expect, it } from 'vitest';
import {
  camelotCompatible,
  detectKey,
  keyToCamelot,
  KS_MAJOR,
  KS_MINOR,
} from './keydetect.js';

function rotate(profile: readonly number[], toPitchClass: number): number[] {
  // le profil est défini pour C : on le décale pour la tonique voulue
  return profile.map((_, i) => profile[(i - toPitchClass + 12) % 12]!);
}

describe('detectKey — Krumhansl-Schmuckler', () => {
  it('reconnaît sol majeur depuis un chroma idéal', () => {
    const key = detectKey(rotate(KS_MAJOR, 7));
    expect(key).not.toBeNull();
    expect(key!.pitchClass).toBe(7);
    expect(key!.major).toBe(true);
  });

  it('reconnaît la mineur depuis un chroma idéal', () => {
    const key = detectKey(rotate(KS_MINOR, 9));
    expect(key).not.toBeNull();
    expect(key!.pitchClass).toBe(9);
    expect(key!.major).toBe(false);
  });

  it('retourne null sur un chroma plat', () => {
    expect(detectKey(new Array(12).fill(1))).toBeNull();
    expect(detectKey(new Array(12).fill(0))).toBeNull();
  });
});

describe('keyToCamelot', () => {
  it('mappe les classiques', () => {
    expect(keyToCamelot(0, true)).toBe('8B'); // do majeur
    expect(keyToCamelot(9, false)).toBe('8A'); // la mineur (relative)
    expect(keyToCamelot(7, true)).toBe('9B'); // sol majeur
    expect(keyToCamelot(4, false)).toBe('9A'); // mi mineur
    expect(keyToCamelot(1, false)).toBe('12A'); // do# mineur
  });
});

describe('camelotCompatible — mix harmonique', () => {
  it('même code, voisins ±1 et relative majeure/mineure sont compatibles', () => {
    expect(camelotCompatible('8A', '8A')).toBe(true);
    expect(camelotCompatible('8A', '8B')).toBe(true); // relative
    expect(camelotCompatible('8A', '9A')).toBe(true);
    expect(camelotCompatible('8A', '7A')).toBe(true);
    expect(camelotCompatible('12A', '1A')).toBe(true); // bouclage 12 → 1
  });

  it('rejette les sauts non harmoniques', () => {
    expect(camelotCompatible('8A', '10A')).toBe(false);
    expect(camelotCompatible('8A', '9B')).toBe(false);
    expect(camelotCompatible('8A', '2B')).toBe(false);
  });
});
