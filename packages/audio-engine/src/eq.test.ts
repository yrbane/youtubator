import { describe, expect, it } from 'vitest';
import { EQ_BANDS, KILL_GAIN_DB, clampEqGain, effectiveEqGain } from './eq.js';

describe('EQ_BANDS', () => {
  it('définit les 3 bandes conformes à la spec (low-shelf 320, peaking 1k, high-shelf 3.2k)', () => {
    expect(EQ_BANDS.low).toEqual({ type: 'lowshelf', frequency: 320 });
    expect(EQ_BANDS.mid).toEqual({ type: 'peaking', frequency: 1000, q: 0.7 });
    expect(EQ_BANDS.high).toEqual({ type: 'highshelf', frequency: 3200 });
  });
});

describe('clampEqGain', () => {
  it('laisse passer un gain dans ±12 dB', () => {
    expect(clampEqGain(6)).toBe(6);
    expect(clampEqGain(-12)).toBe(-12);
  });

  it('borne un gain hors plage', () => {
    expect(clampEqGain(20)).toBe(12);
    expect(clampEqGain(-30)).toBe(-12);
  });
});

describe('effectiveEqGain', () => {
  it('retourne le gain clampé quand la bande n’est pas killée', () => {
    expect(effectiveEqGain(4, false)).toBe(4);
  });

  it('retourne le gain de kill (-40 dB) quand la bande est killée, quel que soit le knob', () => {
    expect(effectiveEqGain(8, true)).toBe(KILL_GAIN_DB);
    expect(KILL_GAIN_DB).toBe(-40);
  });
});
