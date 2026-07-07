import { describe, expect, it } from 'vitest';
import { electMaster, applySync, applyClockSync, type SyncDeck } from './sync.js';

function deck(partial: Partial<SyncDeck> & { id: string }): SyncDeck {
  return { isPlaying: false, synced: false, rate: 1, ...partial };
}

describe('electMaster', () => {
  it('retourne null quand aucun deck ne joue', () => {
    expect(electMaster([deck({ id: 'A' }), deck({ id: 'B' })], null)).toBeNull();
  });

  it('élit le premier deck en lecture', () => {
    const decks = [deck({ id: 'A' }), deck({ id: 'B', isPlaying: true })];
    expect(electMaster(decks, null)).toBe('B');
  });

  it('conserve le maître actuel tant qu’il joue, même si un autre deck démarre', () => {
    const decks = [deck({ id: 'A', isPlaying: true }), deck({ id: 'B', isPlaying: true })];
    expect(electMaster(decks, 'B')).toBe('B');
  });

  it('réélit un nouveau maître quand le maître actuel s’arrête', () => {
    const decks = [deck({ id: 'A' }), deck({ id: 'B', isPlaying: true })];
    expect(electMaster(decks, 'A')).toBe('B');
  });
});

describe('applySync', () => {
  it('aligne le rate des esclaves synchronisés sur celui du maître', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1.08 }),
      deck({ id: 'B', synced: true, rate: 1 }),
    ];
    expect(applySync(decks, 'A')).toEqual([{ id: 'B', rate: 1.08 }]);
  });

  it('ne touche pas aux decks non synchronisés', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1.08 }),
      deck({ id: 'B', synced: false, rate: 1 }),
    ];
    expect(applySync(decks, 'A')).toEqual([]);
  });

  it('n’inclut jamais le maître dans les mises à jour, même s’il est coché SYNC', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, synced: true, rate: 1.08 }),
      deck({ id: 'B', synced: true, rate: 0.95 }),
    ];
    expect(applySync(decks, 'A')).toEqual([{ id: 'B', rate: 1.08 }]);
  });

  it('retourne une liste vide sans maître', () => {
    expect(applySync([deck({ id: 'A', synced: true })], null)).toEqual([]);
  });

  it('omet les esclaves déjà au bon rate (pas de mise à jour inutile)', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1.08 }),
      deck({ id: 'B', synced: true, rate: 1.08 }),
    ];
    expect(applySync(decks, 'A')).toEqual([]);
  });

  it('beatmatch : avec deux BPM connus, le rate esclave égalise les BPM effectifs', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1, bpm: 128 }),
      deck({ id: 'B', synced: true, rate: 1, bpm: 100 }),
    ];
    // BPM effectif maître = 128 → esclave doit tourner à 128/100 = 1.28
    expect(applySync(decks, 'A')).toEqual([{ id: 'B', rate: 1.28 }]);
  });

  it('beatmatch : tient compte du rate du maître', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 0.95, bpm: 128 }),
      deck({ id: 'B', synced: true, rate: 1, bpm: 120 }),
    ];
    const updates = applySync(decks, 'A');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.rate).toBeCloseTo((0.95 * 128) / 120, 10);
  });

  it('beatmatch : corrige une erreur d’octave (BPM esclave détecté à la moitié)', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1, bpm: 140 }),
      deck({ id: 'B', synced: true, rate: 1, bpm: 66 }), // vrai tempo ~132, détecté à l'octave basse
    ];
    const updates = applySync(decks, 'A');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.rate).toBeCloseTo(140 / 132, 10); // utilise 66×2, pas 66
  });

  it('sans BPM des deux côtés, retombe sur la copie de rate', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, rate: 1.08, bpm: 128 }),
      deck({ id: 'B', synced: true, rate: 1 }),
    ];
    expect(applySync(decks, 'A')).toEqual([{ id: 'B', rate: 1.08 }]);
  });
});

describe('applyClockSync — horloge maître façon Traktor', () => {
  it('tous les decks synchronisés (maître compris) suivent le BPM de l’horloge', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, synced: true, rate: 1, bpm: 128 }),
      deck({ id: 'B', isPlaying: true, synced: true, rate: 1, bpm: 100 }),
    ];
    expect(applyClockSync(decks, 140)).toEqual([
      { id: 'A', rate: 140 / 128 },
      { id: 'B', rate: 1.4 },
    ]);
  });

  it('appariement d’octave : un BPM détecté à la moitié suit l’horloge sans doubler', () => {
    const decks = [deck({ id: 'A', isPlaying: true, synced: true, rate: 0.9, bpm: 70 })];
    expect(applyClockSync(decks, 140)).toEqual([{ id: 'A', rate: 1 }]);
  });

  it('ignore les decks non synchronisés, sans BPM ou déjà au bon rate', () => {
    const decks = [
      deck({ id: 'A', isPlaying: true, synced: false, bpm: 128 }),
      deck({ id: 'B', isPlaying: true, synced: true, bpm: null }),
      deck({ id: 'C', isPlaying: true, synced: true, rate: 1.4, bpm: 100 }),
    ];
    expect(applyClockSync(decks, 140)).toEqual([]);
  });
});
