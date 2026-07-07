import { describe, expect, it } from 'vitest';
import {
  clampRating,
  nextColor,
  normalizeStyle,
  sortRows,
  TRACK_COLORS,
  type SortableRow,
} from './track-meta.js';

describe('note 1-5 étoiles', () => {
  it('bornée entre 0 (sans note) et 5, entière', () => {
    expect(clampRating(3)).toBe(3);
    expect(clampRating(-2)).toBe(0);
    expect(clampRating(9)).toBe(5);
    expect(clampRating(3.7)).toBe(4);
  });
});

describe('couleurs de morceau', () => {
  it('le clic fait défiler la palette puis revient à « sans couleur »', () => {
    let color = '';
    const seen: string[] = [];
    for (let i = 0; i < TRACK_COLORS.length; i++) {
      color = nextColor(color);
      seen.push(color);
    }
    expect(seen[seen.length - 1]).toBe(''); // boucle complète → retour à vide
    expect(new Set(seen).size).toBe(TRACK_COLORS.length); // toutes les couleurs vues
  });

  it('couleur inconnue → première couleur de la palette', () => {
    expect(nextColor('#123456')).toBe(TRACK_COLORS[1]);
  });
});

describe('style', () => {
  it('canonisé : minuscules, espaces resserrés', () => {
    expect(normalizeStyle('  Acid   TECHNO ')).toBe('acid techno');
  });
});

describe('tri des colonnes', () => {
  const rows: Array<{ id: string; row: SortableRow }> = [
    { id: 'a', row: { title: 'Émotion', channel: 'Z', durationS: 120, bpm: 140, rating: 2, plays: 5, style: 'techno', color: TRACK_COLORS[2] } },
    { id: 'b', row: { title: 'acid', channel: 'A', durationS: 300, bpm: null, rating: 5, plays: 0, style: null, color: '' } },
    { id: 'c', row: { title: 'Berg', channel: 'M', durationS: 60, bpm: 128, rating: 0, plays: 12, style: 'trance', color: TRACK_COLORS[1] } },
  ];
  const ids = (key: keyof SortableRow, dir: 1 | -1) =>
    sortRows(rows, (r) => r.row, key, dir).map((r) => r.id);

  it('titre : alphabétique insensible à la casse et aux accents', () => {
    expect(ids('title', 1)).toEqual(['b', 'c', 'a']);
    expect(ids('title', -1)).toEqual(['a', 'c', 'b']);
  });

  it('numérique : durée, lectures', () => {
    expect(ids('durationS', 1)).toEqual(['c', 'a', 'b']);
    expect(ids('plays', -1)).toEqual(['c', 'a', 'b']);
  });

  it('valeurs absentes toujours en fin, quel que soit le sens', () => {
    expect(ids('bpm', 1)).toEqual(['c', 'a', 'b']);
    expect(ids('bpm', -1)).toEqual(['a', 'c', 'b']);
    expect(ids('style', 1)).toEqual(['a', 'c', 'b']);
  });

  it('couleur : ordre de la palette, sans couleur en fin', () => {
    expect(ids('color', 1)).toEqual(['c', 'a', 'b']);
  });

  it('ne mute pas la liste d’origine', () => {
    const before = rows.map((r) => r.id).join('');
    ids('title', 1);
    expect(rows.map((r) => r.id).join('')).toBe(before);
  });
});
