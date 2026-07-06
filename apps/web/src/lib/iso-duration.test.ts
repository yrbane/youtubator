import { describe, expect, it } from 'vitest';
import { isoDurationToSeconds } from './iso-duration.js';

describe('isoDurationToSeconds', () => {
  it('convertit les durées ISO 8601 de l’API YouTube', () => {
    expect(isoDurationToSeconds('PT3M12S')).toBe(192);
    expect(isoDurationToSeconds('PT1H2M3S')).toBe(3723);
    expect(isoDurationToSeconds('PT45S')).toBe(45);
    expect(isoDurationToSeconds('PT2H')).toBe(7200);
  });

  it('retourne 0 pour une durée invalide', () => {
    expect(isoDurationToSeconds('')).toBe(0);
    expect(isoDurationToSeconds('n/a')).toBe(0);
  });
});
