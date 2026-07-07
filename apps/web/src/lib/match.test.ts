import { describe, expect, it } from 'vitest';
import { matchesMaster } from './match.js';

const master = { bpm: 140, key: '8A' };

describe('MATCH façon Traktor — mixable avec le deck maître', () => {
  it('accepte un tempo à ±6 %, octaves ½× et 2× comprises', () => {
    expect(matchesMaster({ bpm: 140, key: null }, master)).toBe(true);
    expect(matchesMaster({ bpm: 146, key: null }, master)).toBe(true);
    expect(matchesMaster({ bpm: 70, key: null }, master)).toBe(true); // octave ½×
    expect(matchesMaster({ bpm: 128, key: null }, master)).toBe(false);
  });

  it('exige une tonalité compatible Camelot quand les deux sont connues', () => {
    expect(matchesMaster({ bpm: 140, key: '8A' }, master)).toBe(true); // identique
    expect(matchesMaster({ bpm: 140, key: '9A' }, master)).toBe(true); // voisine
    expect(matchesMaster({ bpm: 140, key: '8B' }, master)).toBe(true); // relative
    expect(matchesMaster({ bpm: 140, key: '3A' }, master)).toBe(false);
  });

  it('tonalité inconnue d’un côté : on ne rejette pas', () => {
    expect(matchesMaster({ bpm: 140, key: null }, master)).toBe(true);
    expect(matchesMaster({ bpm: 140, key: '3A' }, { bpm: 140, key: null })).toBe(true);
  });

  it('BPM inconnu : jamais mixable à l’aveugle', () => {
    expect(matchesMaster({ bpm: null, key: '8A' }, master)).toBe(false);
  });
});
