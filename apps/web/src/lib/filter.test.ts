import { describe, expect, it } from 'vitest';
import { filterRows, matchesFilter } from './filter.js';

const row = {
  title: 'Émotion Nocturne (Original Mix)',
  channel: 'Laurent Garnier',
  style: 'acid techno',
  bpm: 140.2,
  key: '8A',
};

describe('filtre libre façon Traktor', () => {
  it('filtre vide : tout passe', () => {
    expect(matchesFilter(row, '')).toBe(true);
    expect(matchesFilter(row, '   ')).toBe(true);
  });

  it('insensible à la casse et aux accents', () => {
    expect(matchesFilter(row, 'emotion')).toBe(true);
    expect(matchesFilter(row, 'ÉMOTION')).toBe(true);
    expect(matchesFilter(row, 'garnier')).toBe(true);
  });

  it('plusieurs mots = ET, sur tous les champs à la fois', () => {
    expect(matchesFilter(row, 'garnier acid')).toBe(true); // chaîne + style
    expect(matchesFilter(row, 'garnier trance')).toBe(false);
  });

  it('matche le style, le BPM arrondi et la tonalité', () => {
    expect(matchesFilter(row, 'acid')).toBe(true);
    expect(matchesFilter(row, '140')).toBe(true);
    expect(matchesFilter(row, '8a')).toBe(true);
    expect(matchesFilter(row, '141')).toBe(false);
  });

  it('champs absents tolérés', () => {
    expect(matchesFilter({ title: 'Sans rien' }, 'rien')).toBe(true);
    expect(matchesFilter({ title: 'Sans rien' }, 'acid')).toBe(false);
  });

  it('filterRows garde l’ordre et ne mute pas', () => {
    const items = [
      { id: 1, t: { title: 'Acid one' } },
      { id: 2, t: { title: 'Trance two' } },
      { id: 3, t: { title: 'Acid three' } },
    ];
    expect(filterRows(items, (i) => i.t, 'acid').map((i) => i.id)).toEqual([1, 3]);
    expect(items.length).toBe(3);
  });
});
