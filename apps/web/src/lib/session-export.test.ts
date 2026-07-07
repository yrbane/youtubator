import { describe, expect, it } from 'vitest';
import { tracklistCsv, tracklistTxt } from './session-export.js';

const entries = [
  { title: 'Astral Dreams', channel: 'Laurent Garnier', loadedAt: 1_800_000_000_000, deckId: 'A', videoId: 'v1' },
  { title: 'Tym; "Owt"', channel: 'Crystal Distortion', loadedAt: 1_800_000_300_000, deckId: 'B', videoId: 'v2' },
];

describe('export de tracklist', () => {
  it('txt : numéroté, minutage relatif au premier morceau', () => {
    const txt = tracklistTxt(entries);
    expect(txt.split('\n')).toEqual([
      '01. [+00:00] Laurent Garnier – Astral Dreams',
      '02. [+05:00] Crystal Distortion – Tym; "Owt"',
    ]);
  });

  it('txt : chaîne absente tolérée', () => {
    expect(tracklistTxt([{ ...entries[0]!, channel: '' }])).toBe('01. [+00:00] Astral Dreams');
  });

  it('csv : en-tête + guillemets échappés', () => {
    const lines = tracklistCsv(entries).split('\n');
    expect(lines[0]).toBe('position;horodatage;deck;chaine;titre;videoId');
    expect(lines[2]).toContain('"Tym; ""Owt"""');
    expect(lines[1]).toContain(';A;');
  });
});
