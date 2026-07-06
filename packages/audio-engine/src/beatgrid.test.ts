import { describe, expect, it } from 'vitest';
import {
  alignPhaseDelta,
  beatLoopBounds,
  beatPhase,
  detectBpm,
  floorBeat,
  periodS,
  type BeatGrid,
} from './beatgrid.js';

const GRID: BeatGrid = { bpm: 120, anchorS: 0.2 }; // beat toutes les 0.5 s, ancré à 0.2

describe('géométrie de la grille', () => {
  it('periodS', () => {
    expect(periodS(GRID)).toBeCloseTo(0.5, 10);
  });

  it('beatPhase normalisée 0..1, y compris avant l’ancre', () => {
    expect(beatPhase(GRID, 0.2)).toBeCloseTo(0, 10);
    expect(beatPhase(GRID, 0.45)).toBeCloseTo(0.5, 10);
    expect(beatPhase(GRID, 0.1)).toBeCloseTo(0.8, 10); // 0.1 = ancre - 0.1 → phase 0.8
  });

  it('floorBeat retombe sur le beat précédent ou égal', () => {
    expect(floorBeat(GRID, 1.2)).toBeCloseTo(1.2, 10);
    expect(floorBeat(GRID, 1.44)).toBeCloseTo(1.2, 10);
    expect(floorBeat(GRID, 0.19)).toBeCloseTo(-0.3, 10);
  });
});

describe('phase de mesure (4/4)', () => {
  it('measurePhase est la position 0..1 dans la mesure de 4 beats', async () => {
    const { measurePhase } = await import('./beatgrid.js');
    expect(measurePhase(GRID, 0.2)).toBeCloseTo(0, 10);
    expect(measurePhase(GRID, 1.95)).toBeCloseTo(0.875, 10); // 3,5 beats après l'ancre
  });

  it('beatIndexInMeasure retourne le beat courant 0..3, y compris avant l’ancre', async () => {
    const { beatIndexInMeasure } = await import('./beatgrid.js');
    expect(beatIndexInMeasure(GRID, 0.2)).toBe(0);
    expect(beatIndexInMeasure(GRID, 0.7)).toBe(1);
    expect(beatIndexInMeasure(GRID, 1.95)).toBe(3);
    expect(beatIndexInMeasure(GRID, 0.1)).toBe(3); // 0,2 beat avant l'ancre → fin de la mesure précédente
  });
});

describe('beatLoopBounds — boucle des N derniers beats', () => {
  it('cale la sortie sur le beat courant et remonte de N périodes', () => {
    const bounds = beatLoopBounds(GRID, 10.3, 4);
    expect(bounds).not.toBeNull();
    expect(bounds!.outS).toBeCloseTo(10.2, 10);
    expect(bounds!.inS).toBeCloseTo(8.2, 10);
  });

  it('refuse si le passé est insuffisant', () => {
    expect(beatLoopBounds(GRID, 1.4, 32)).toBeNull();
  });
});

describe('alignPhaseDelta — recalage esclave sur maître', () => {
  it('nul quand les phases coïncident', () => {
    expect(alignPhaseDelta(GRID, 1.2, GRID, 5.2)).toBeCloseTo(0, 10);
  });

  it('retourne le plus court décalage (avance ou retard)', () => {
    // esclave en retard de 0.1 s de phase → avancer de 0.1
    expect(alignPhaseDelta(GRID, 1.2, GRID, 5.1)).toBeCloseTo(0.1, 10);
    // esclave en avance de 0.1 → reculer de 0.1 (pas +0.4)
    expect(alignPhaseDelta(GRID, 1.2, GRID, 5.3)).toBeCloseTo(-0.1, 10);
  });

  it('fonctionne entre des grilles de BPM différents (phases normalisées)', () => {
    const slave: BeatGrid = { bpm: 100, anchorS: 0 }; // période 0.6
    // maître en phase 0 ; esclave à t=3.15 → phase 0.25 → reculer d'un quart de période esclave
    expect(alignPhaseDelta(GRID, 0.2, slave, 3.15)).toBeCloseTo(-0.15, 10);
  });
});

describe('detectBpm — autocorrélation sur enveloppe', () => {
  function syntheticEnvelope(bpm: number, rate: number, durationS: number, offsetS: number): Float32Array {
    const n = Math.floor(durationS * rate);
    const env = new Float32Array(n);
    const period = 60 / bpm;
    // bruit de fond léger + clicks décroissants sur chaque beat
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    for (let i = 0; i < n; i++) env[i] = 0.05 * rand();
    for (let t = offsetS; t < durationS; t += period) {
      const i = Math.round(t * rate);
      for (let k = 0; k < 4 && i + k < n; k++) env[i + k]! += 0.8 * Math.exp(-k);
    }
    return env;
  }

  it('retrouve 120 BPM et la phase', () => {
    const rate = 50;
    const result = detectBpm(syntheticEnvelope(120, rate, 30, 0.2), rate);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBeGreaterThan(118);
    expect(result!.bpm).toBeLessThan(122);
    // l'ancre doit tomber sur un beat : phase de 0.2 s modulo période ≈ 0
    const phase = beatPhase({ bpm: result!.bpm, anchorS: result!.anchorS }, 0.2);
    expect(Math.min(phase, 1 - phase)).toBeLessThan(0.1);
  });

  it('retrouve un BPM non entier (98.5)', () => {
    const rate = 50;
    const result = detectBpm(syntheticEnvelope(98.5, rate, 30, 0), rate);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 98.5)).toBeLessThan(1.5);
  });

  it('résiste au piège 3:2 des grooves syncopés (préférence pour la subdivision)', () => {
    const rate = 50;
    const bpm = 132;
    const period = 60 / bpm;
    const n = Math.floor(30 * rate);
    const env = new Float32Array(n);
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
    for (let i = 0; i < n; i++) env[i] = 0.05 * rand();
    for (let t = 0; t < 30; t += period) {
      const i = Math.round(t * rate);
      for (let k = 0; k < 3 && i + k < n; k++) env[i + k]! += 0.7 * Math.exp(-k); // kicks
    }
    for (let t = period / 2; t < 30; t += period) {
      const i = Math.round(t * rate);
      if (i < n) env[i]! += 0.25; // croches (hi-hats)
    }
    for (let t = 0; t < 30; t += period * 1.5) {
      const i = Math.round(t * rate);
      if (i < n) env[i]! += 0.95; // accents syncopés massifs qui appâtent le 3:2 (88 BPM)
    }
    const result = detectBpm(env, rate);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.bpm - 132)).toBeLessThan(3);
  });

  it('retourne null sur une enveloppe plate ou trop courte', () => {
    expect(detectBpm(new Float32Array(2000).fill(0.3), 50)).toBeNull();
    expect(detectBpm(new Float32Array(100), 50)).toBeNull();
  });
});
