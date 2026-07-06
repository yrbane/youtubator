import { describe, expect, it } from 'vitest';
import { delayTimeForBeats, parseBeatFraction } from './fx.js';

describe('parseBeatFraction', () => {
  it('convertit les fractions DJ en nombre de beats', () => {
    expect(parseBeatFraction('1/4')).toBe(0.25);
    expect(parseBeatFraction('1/2')).toBe(0.5);
    expect(parseBeatFraction('3/4')).toBe(0.75);
    expect(parseBeatFraction('1')).toBe(1);
  });

  it('retourne null pour une fraction invalide', () => {
    expect(parseBeatFraction('x')).toBeNull();
    expect(parseBeatFraction('1/0')).toBeNull();
  });
});

describe('computeAutoGain — normalisation du niveau perçu', () => {
  it('amplifie un morceau faible et atténue un morceau fort, vers la cible 0,25', async () => {
    const { computeAutoGain } = await import('./fx.js');
    expect(computeAutoGain(new Array(200).fill(0.125))).toBeCloseTo(2, 5);
    expect(computeAutoGain(new Array(200).fill(0.5))).toBeCloseTo(0.5, 5);
  });

  it('borne à ±6 dB et ignore les passages silencieux', async () => {
    const { computeAutoGain } = await import('./fx.js');
    expect(computeAutoGain(new Array(200).fill(0.03))).toBe(2); // clamp haut
    expect(computeAutoGain(new Array(200).fill(1))).toBe(0.5); // clamp bas
    // moitié silence, moitié 0,25 → la moyenne utile reste 0,25 → gain 1
    const mixed = [...new Array(100).fill(0.001), ...new Array(100).fill(0.25)];
    expect(computeAutoGain(mixed)).toBeCloseTo(1, 5);
  });

  it('gain neutre sans signal exploitable', async () => {
    const { computeAutoGain } = await import('./fx.js');
    expect(computeAutoGain([])).toBe(1);
    expect(computeAutoGain(new Array(50).fill(0.001))).toBe(1);
  });
});

describe('delayTimeForBeats — temps réel du delay', () => {
  it('un beat à 120 BPM à rate 1 = 0,5 s', () => {
    expect(delayTimeForBeats(120, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it('tient compte du rate effectif (le temps réel raccourcit quand on accélère)', () => {
    expect(delayTimeForBeats(120, 1.25, 1)).toBeCloseTo(0.4, 10);
    expect(delayTimeForBeats(140, 1, 0.75)).toBeCloseTo((0.75 * 60) / 140, 10);
  });
});
