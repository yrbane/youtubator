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

describe('delayTimeForBeats — temps réel du delay', () => {
  it('un beat à 120 BPM à rate 1 = 0,5 s', () => {
    expect(delayTimeForBeats(120, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it('tient compte du rate effectif (le temps réel raccourcit quand on accélère)', () => {
    expect(delayTimeForBeats(120, 1.25, 1)).toBeCloseTo(0.4, 10);
    expect(delayTimeForBeats(140, 1, 0.75)).toBeCloseTo((0.75 * 60) / 140, 10);
  });
});
