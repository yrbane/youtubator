import { describe, expect, it } from 'vitest';
import { fadeProgress, pickNextTrack, type AutomixCandidate } from './automix-core.js';

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

  describe('options — la personnalité de l’automix', () => {
    it('bpmTolerancePct resserre la fenêtre de tempo', () => {
      // 139 est à ~0,7 % de 140 ; 145 à ~3,6 % : à ±2 %, seul 139 passe la fenêtre
      const next = pickNextTrack(
        { videoId: 'ref', bpm: 140, key: null },
        [candidate({ videoId: 'a-3.6pct', bpm: 145 }), candidate({ videoId: 'a-0.7pct', bpm: 139 })],
        new Set(),
        () => 0.99, // même en piochant « au fond », un seul candidat au tempo
        { bpmTolerancePct: 2, pickFrom: 3 },
      );
      expect(next?.videoId).toBe('a-0.7pct');
    });

    it('keyMode off : la tonalité n’influence plus le classement', () => {
      const next = pickNextTrack(
        { videoId: 'ref', bpm: 139, key: '8A' },
        pool,
        new Set(),
        rand0,
        { keyMode: 'off', pickFrom: 1 },
      );
      expect(next?.videoId).toBe('proche-dissonant'); // 139 pile bat 141 au tempo pur
    });

    it('keyMode strict : uniquement des tonalités compatibles, sinon rien', () => {
      const strict = { keyMode: 'strict' as const, pickFrom: 1 };
      const ok = pickNextTrack({ videoId: 'ref', bpm: 140, key: '8A' }, pool, new Set(), rand0, strict);
      expect(ok?.videoId).toBe('proche-compatible');
      const none = pickNextTrack(
        { videoId: 'ref', bpm: 140, key: '8A' },
        [candidate({ videoId: 'dissonant', bpm: 140, key: '3B' })],
        new Set(),
        rand0,
        strict,
      );
      expect(none).toBeNull(); // pas de repli hasardeux en strict
    });

    it('minDurationS et maxDurationS bornent la durée (0 = sans limite)', () => {
      const poolDur = [
        candidate({ videoId: 'court', durationS: 150 }),
        candidate({ videoId: 'long', durationS: 900 }),
      ];
      expect(
        pickNextTrack(null, poolDur, new Set(), rand0, { minDurationS: 200, maxDurationS: 0 })?.videoId,
      ).toBe('long');
      expect(
        pickNextTrack(null, poolDur, new Set(), rand0, { minDurationS: 0, maxDurationS: 600 })?.videoId,
      ).toBe('court');
    });

    it('pickFrom 1 : toujours le meilleur, même avec un rand « au fond »', () => {
      const next = pickNextTrack(
        { videoId: 'ref', bpm: 140, key: '8A' },
        pool,
        new Set(),
        () => 0.99,
        { pickFrom: 1 },
      );
      expect(next?.videoId).toBe('proche-compatible');
    });
  });
});

describe('fadeProgress — les courbes de transition', () => {
  it('toutes les courbes vont de 0 à 1 en passant par le centre', () => {
    for (const curve of ['linear', 'smooth', 'sharp'] as const) {
      expect(fadeProgress(0, curve)).toBe(0);
      expect(fadeProgress(1, curve)).toBe(1);
      expect(fadeProgress(0.5, curve)).toBeCloseTo(0.5, 5);
    }
  });

  it('linear est l’identité, smooth démarre en douceur, sharp bascule au centre', () => {
    expect(fadeProgress(0.25, 'linear')).toBe(0.25);
    expect(fadeProgress(0.25, 'smooth')).toBeLessThan(0.25);
    expect(fadeProgress(0.25, 'sharp')).toBeLessThan(fadeProgress(0.25, 'smooth'));
    expect(fadeProgress(0.75, 'sharp')).toBeGreaterThan(fadeProgress(0.75, 'smooth'));
  });

  it('monotone croissante et bornée hors [0,1]', () => {
    for (const curve of ['linear', 'smooth', 'sharp'] as const) {
      let prev = 0;
      for (let p = -0.2; p <= 1.2; p += 0.05) {
        const q = fadeProgress(p, curve);
        expect(q).toBeGreaterThanOrEqual(prev);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
        prev = q;
      }
    }
  });
});
