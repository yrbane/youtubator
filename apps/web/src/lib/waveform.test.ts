import { describe, expect, it } from 'vitest';
import {
  BUCKET_S,
  bucketCount,
  bucketIndex,
  mergeSample,
  nearestCue,
  pseudoWaveform,
  toggleCue,
} from './waveform.js';

describe('découpage en buckets', () => {
  it('bucket de 250 ms', () => {
    expect(BUCKET_S).toBe(0.25);
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(1.1)).toBe(4);
  });

  it('bucketCount couvre toute la durée', () => {
    expect(bucketCount(10)).toBe(40);
    expect(bucketCount(10.1)).toBe(41);
    expect(bucketCount(0)).toBe(0);
  });
});

describe('mergeSample — capture progressive', () => {
  it('garde le maximum par bucket et signale le changement', () => {
    const buckets = new Array(8).fill(0);
    expect(mergeSample(buckets, 0.6, 0.5)).toBe(true);
    expect(buckets[2]).toBe(0.5);
    expect(mergeSample(buckets, 0.7, 0.3)).toBe(false); // plus faible → inchangé
    expect(buckets[2]).toBe(0.5);
    expect(mergeSample(buckets, 0.7, 0.8)).toBe(true);
    expect(buckets[2]).toBe(0.8);
  });

  it('clampe le niveau dans 0..1 et ignore les temps hors plage', () => {
    const buckets = new Array(4).fill(0);
    mergeSample(buckets, 0.1, 1.7);
    expect(buckets[0]).toBe(1);
    expect(mergeSample(buckets, 99, 0.5)).toBe(false);
    expect(mergeSample(buckets, -1, 0.5)).toBe(false);
  });
});

describe('pseudoWaveform — repli déterministe', () => {
  it('produit la même forme pour la même vidéo', () => {
    const a = pseudoWaveform('dQw4w9WgXcQ', 30);
    const b = pseudoWaveform('dQw4w9WgXcQ', 30);
    expect(a).toEqual(b);
    expect(a.length).toBe(bucketCount(30));
  });

  it('diffère selon la vidéo et reste dans 0..1', () => {
    const a = pseudoWaveform('dQw4w9WgXcQ', 30);
    const c = pseudoWaveform('9bZkp7q19f0', 30);
    expect(a).not.toEqual(c);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('points de cue', () => {
  it('toggleCue ajoute trié puis retire si un cue est proche', () => {
    let cues = toggleCue([], 30, 0.5);
    cues = toggleCue(cues, 10, 0.5);
    expect(cues).toEqual([10, 30]);
    cues = toggleCue(cues, 30.3, 0.5); // proche de 30 → supprime
    expect(cues).toEqual([10]);
  });

  it('limite à 8 cues', () => {
    let cues: number[] = [];
    for (let i = 0; i < 12; i++) cues = toggleCue(cues, i * 10, 0.5);
    expect(cues.length).toBe(8);
  });

  it('nearestCue retrouve le cue le plus proche dans le seuil', () => {
    expect(nearestCue([10, 30], 29.8, 0.5)).toBe(30);
    expect(nearestCue([10, 30], 20, 0.5)).toBeNull();
    expect(nearestCue([], 5, 0.5)).toBeNull();
  });
});
