import { describe, expect, it } from 'vitest';
import { clampRate, rateToSemitones, formatRate, DEFAULT_TEMPO_RANGE } from './tempo.js';

describe('clampRate', () => {
  it('laisse passer un rate dans la plage par défaut (±16 %)', () => {
    expect(clampRate(1.1)).toBe(1.1);
  });

  it('borne un rate au-dessus de la plage', () => {
    expect(clampRate(1.5)).toBe(1.16);
  });

  it('borne un rate en dessous de la plage', () => {
    expect(clampRate(0.5)).toBe(0.84);
  });

  it('accepte une plage étendue explicite (±50 %)', () => {
    expect(clampRate(1.5, 0.5)).toBe(1.5);
    expect(clampRate(1.6, 0.5)).toBe(1.5);
  });

  it('expose la plage par défaut à 16 %', () => {
    expect(DEFAULT_TEMPO_RANGE).toBe(0.16);
  });
});

describe('rateToSemitones', () => {
  it('vaut 0 demi-ton à vitesse nominale', () => {
    expect(rateToSemitones(1)).toBe(0);
  });

  it('vaut +12 demi-tons à vitesse double', () => {
    expect(rateToSemitones(2)).toBeCloseTo(12, 5);
  });

  it('vaut environ -1 demi-ton à ×0.9439', () => {
    expect(rateToSemitones(0.9439)).toBeCloseTo(-1, 2);
  });
});

describe('formatRate', () => {
  it('formate la vitesse nominale en ×1.00', () => {
    expect(formatRate(1)).toBe('×1.00');
  });

  it('formate un rate quelconque avec deux décimales', () => {
    expect(formatRate(1.0625)).toBe('×1.06');
  });
});
