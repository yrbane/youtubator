import { describe, expect, it } from 'vitest';
import { lastContiguousStart } from './contiguous.js';

describe('lastContiguousStart — dernier segment de capture sans rupture', () => {
  it('retourne 0 quand la capture est continue', () => {
    const times = Array.from({ length: 100 }, (_, i) => 10 + i * 0.023);
    expect(lastContiguousStart(times)).toBe(0);
  });

  it('coupe après un seek en avant ou en arrière', () => {
    const before = Array.from({ length: 50 }, (_, i) => 10 + i * 0.023);
    const after = Array.from({ length: 50 }, (_, i) => 95 + i * 0.023); // seek à 95 s
    expect(lastContiguousStart([...before, ...after])).toBe(50);
    const back = Array.from({ length: 50 }, (_, i) => 3 + i * 0.023); // seek arrière
    expect(lastContiguousStart([...before, ...back])).toBe(50);
  });

  it('tolère la gigue d’horodatage mais pas les pauses', () => {
    const jitter = Array.from({ length: 100 }, (_, i) => 10 + i * 0.023 + (i % 2) * 0.004);
    expect(lastContiguousStart(jitter)).toBe(0);
    const withPause = [...Array.from({ length: 40 }, (_, i) => 10 + i * 0.023), ...Array.from({ length: 60 }, (_, i) => 11.5 + i * 0.023)];
    expect(lastContiguousStart(withPause)).toBe(40);
  });

  it('gère les cas dégénérés', () => {
    expect(lastContiguousStart([])).toBe(0);
    expect(lastContiguousStart([5])).toBe(0);
  });
});
