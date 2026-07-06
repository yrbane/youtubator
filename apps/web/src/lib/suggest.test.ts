import { describe, expect, it } from 'vitest';
import { bpmDistancePct, suggestNext } from './suggest.js';

describe('bpmDistancePct — écart de tempo avec appariement d\'octave', () => {
  it('écart direct', () => {
    expect(bpmDistancePct(140, 140)).toBeCloseTo(0, 10);
    expect(bpmDistancePct(140, 133)).toBeCloseTo(5, 10);
  });

  it('reconnaît le double/moitié comme proche', () => {
    expect(bpmDistancePct(140, 70)).toBeCloseTo(0, 10);
    expect(bpmDistancePct(140, 272)).toBeCloseTo(2.857, 2); // 272/2 = 136
  });
});

describe('suggestNext', () => {
  const candidates = [
    { videoId: 'a', title: 'A', bpm: 138, key: '8A' }, // proche + compatible
    { videoId: 'b', title: 'B', bpm: 139, key: '3B' }, // proche mais tonalité éloignée
    { videoId: 'c', title: 'C', bpm: 170, key: '8A' }, // tempo trop loin
    { videoId: 'd', title: 'D', bpm: 141, key: null }, // tonalité inconnue
    { videoId: 'ref', title: 'REF', bpm: 140, key: '8A' }, // le morceau lui-même
  ];

  it('filtre à ±6 %, exclut la référence, privilégie les tonalités compatibles', () => {
    const result = suggestNext({ videoId: 'ref', bpm: 140, key: '8A' }, candidates);
    expect(result.map((r) => r.videoId)).toEqual(['a', 'd', 'b']);
  });

  it('sans tonalité de référence, trie par écart de tempo', () => {
    const result = suggestNext({ videoId: 'ref', bpm: 140, key: null }, candidates);
    expect(result[0]!.videoId).toBe('b'); // 139 : plus proche que 138 et 141
  });
});
