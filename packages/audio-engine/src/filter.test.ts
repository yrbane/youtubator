import { describe, expect, it } from 'vitest';
import { filterFromValue } from './filter.js';

describe('filterFromValue — filtre bipolaire façon Xone', () => {
  it('centre = neutre (null)', () => {
    expect(filterFromValue(0)).toBeNull();
    expect(filterFromValue(0.02)).toBeNull(); // zone morte autour du centre
    expect(filterFromValue(-0.02)).toBeNull();
  });

  it('gauche = lowpass, de 20 kHz vers 200 Hz (exponentiel)', () => {
    const mid = filterFromValue(-0.5)!;
    expect(mid.type).toBe('lowpass');
    expect(mid.frequency).toBeCloseTo(2000, 0);
    const full = filterFromValue(-1)!;
    expect(full.frequency).toBeCloseTo(200, 0);
  });

  it('droite = highpass, de 20 Hz vers ~8 kHz (exponentiel)', () => {
    const mid = filterFromValue(0.5)!;
    expect(mid.type).toBe('highpass');
    expect(mid.frequency).toBeGreaterThan(300);
    expect(mid.frequency).toBeLessThan(500);
    const full = filterFromValue(1)!;
    expect(full.frequency).toBeGreaterThan(7000);
    expect(full.frequency).toBeLessThan(9000);
  });

  it('clampe hors bornes', () => {
    expect(filterFromValue(-3)!.frequency).toBeCloseTo(200, 0);
    expect(filterFromValue(3)!.type).toBe('highpass');
  });
});
