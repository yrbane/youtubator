import { describe, expect, it } from 'vitest';
import { pickNextTrack, type AutomixCandidate } from './automix-core.js';

function candidate(partial: Partial<AutomixCandidate> & { videoId: string }): AutomixCandidate {
  return { title: partial.videoId, channel: '', durationS: 240, thumbnailUrl: '', bpm: null, key: null, ...partial };
}

const rand0 = () => 0; // déterministe : toujours le premier

describe('pickNextTrack — le cerveau de l’automix', () => {
  const pool = [
    candidate({ videoId: 'loin', bpm: 100, key: '1A' }),
    candidate({ videoId: 'proche-compatible', bpm: 141, key: '9A' }),
    candidate({ videoId: 'proche-dissonant', bpm: 139, key: '3B' }),
    candidate({ videoId: 'sans-analyse' }),
  ];

  it('préfère un tempo proche ET une tonalité compatible', () => {
    const next = pickNextTrack({ videoId: 'ref', bpm: 140, key: '8A' }, pool, new Set(), rand0);
    expect(next?.videoId).toBe('proche-compatible');
  });

  it('n’élit jamais un exclu (déjà joué, déjà sur un deck)', () => {
    const next = pickNextTrack(
      { videoId: 'ref', bpm: 140, key: '8A' },
      pool,
      new Set(['proche-compatible']),
      rand0,
    );
    expect(next?.videoId).toBe('proche-dissonant'); // tempo proche, tant pis pour la tonalité
  });

  it('sans référence (premier morceau) : pioche au hasard, déterministe via rand', () => {
    const a = pickNextTrack(null, pool, new Set(), () => 0);
    const b = pickNextTrack(null, pool, new Set(), () => 0.99);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.videoId).not.toBe(b?.videoId);
  });

  it('aucun candidat au tempo : repli sur le hasard plutôt que rien', () => {
    const next = pickNextTrack(
      { videoId: 'ref', bpm: 175, key: '8A' },
      [candidate({ videoId: 'seul', bpm: 100 })],
      new Set(),
      rand0,
    );
    expect(next?.videoId).toBe('seul');
  });

  it('écarte les morceaux trop courts (jingles) quand la durée est connue', () => {
    const next = pickNextTrack(
      null,
      [candidate({ videoId: 'jingle', durationS: 20 }), candidate({ videoId: 'ok', durationS: 300 })],
      new Set(),
      rand0,
    );
    expect(next?.videoId).toBe('ok');
  });

  it('null quand tout est exclu', () => {
    expect(pickNextTrack(null, pool, new Set(pool.map((c) => c.videoId)), rand0)).toBeNull();
  });
});
