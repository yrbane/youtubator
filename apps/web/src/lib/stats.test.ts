import { describe, expect, it } from 'vitest';
import { computeStaleTracks, computeStyleStats, computeTopPlayed } from './stats.js';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const meta = [
  { videoId: 'a', rating: 5, color: '', style: 'techno', plays: 12, lastPlayedAt: NOW - 2 * DAY },
  { videoId: 'b', rating: 0, color: '', style: 'techno', plays: 3, lastPlayedAt: NOW - 45 * DAY },
  { videoId: 'c', rating: 3, color: '', style: 'house', plays: 7, lastPlayedAt: NOW - 40 * DAY },
  { videoId: 'd', rating: 4, color: '', style: '', plays: 0, lastPlayedAt: null },
];

describe('stats d’écoute', () => {
  it('top lectures : décroissant, jamais joués exclus', () => {
    expect(computeTopPlayed(meta).map((m) => m.videoId)).toEqual(['a', 'c', 'b']);
    expect(computeTopPlayed(meta, 2).length).toBe(2);
  });

  it('par style : morceaux et lectures cumulées, sans style exclu', () => {
    expect(computeStyleStats(meta)).toEqual([
      { style: 'techno', tracks: 2, plays: 15 },
      { style: 'house', tracks: 1, plays: 7 },
    ]);
  });

  it('endormis : joués autrefois mais plus depuis N jours, plus ancien d’abord', () => {
    expect(computeStaleTracks(meta, NOW, 30).map((m) => m.videoId)).toEqual(['b', 'c']);
    expect(computeStaleTracks(meta, NOW, 60)).toEqual([]);
  });
});
