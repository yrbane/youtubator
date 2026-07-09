import { describe, expect, it } from 'vitest';
import {
  computeBuckets,
  computeChroma,
  computeEnvelope,
  isAudioFile,
  localTrackId,
  parseTrackFilename,
  toTrack,
} from './local-files.js';

describe('fichiers audio — filtre du scan', () => {
  it('accepte les formats audio courants, insensible à la casse', () => {
    for (const f of ['a.mp3', 'b.FLAC', 'c.wav', 'd.ogg', 'e.m4a', 'f.aac', 'g.opus', 'h.aiff']) {
      expect(isAudioFile(f), f).toBe(true);
    }
  });

  it('écarte le reste (images, .asd Ableton, fichiers cachés)', () => {
    for (const f of ['cover.jpg', 'track.mp3.asd', 'notes.txt', '.DS_Store', 'video.mp4']) {
      expect(isAudioFile(f), f).toBe(false);
    }
  });
});

describe('parseTrackFilename — « Artiste - Titre » façon Traktor', () => {
  it('sépare artiste et titre sur le premier « - » entouré d’espaces', () => {
    expect(parseTrackFilename('Laurent Garnier - Astral Dreams.flac')).toEqual({
      artist: 'Laurent Garnier',
      title: 'Astral Dreams',
    });
  });

  it('garde les tirets internes du titre', () => {
    expect(parseTrackFilename('X - Amour - Toujours.mp3')).toEqual({
      artist: 'X',
      title: 'Amour - Toujours',
    });
  });

  it('sans séparateur : tout en titre, artiste vide ; numéros de piste nettoyés', () => {
    expect(parseTrackFilename('untitled.wav')).toEqual({ artist: '', title: 'untitled' });
    expect(parseTrackFilename('03. Artiste - Morceau.mp3')).toEqual({ artist: 'Artiste', title: 'Morceau' });
    expect(parseTrackFilename('07 - Solo.mp3')).toEqual({ artist: '', title: 'Solo' });
  });
});

describe('localTrackId — stable et préfixé', () => {
  it('déterministe, préfixe file:, sensible au chemin', () => {
    const a = localTrackId('dossier1', 'sub/track.mp3');
    expect(a).toMatch(/^file:[a-z0-9]+$/);
    expect(localTrackId('dossier1', 'sub/track.mp3')).toBe(a);
    expect(localTrackId('dossier2', 'sub/track.mp3')).not.toBe(a);
  });
});

describe('toTrack — un morceau local devient un Track ordinaire', () => {
  it('mappe id/titre/artiste, miniature vide', () => {
    const t = toTrack({ id: 'file:abc', artist: 'A', title: 'T', durationS: 62 });
    expect(t).toEqual({ videoId: 'file:abc', title: 'T', channel: 'A', durationS: 62, thumbnailUrl: '' });
  });
});

describe('décodage → buckets de waveform et enveloppe d’analyse', () => {
  // 2 s à 1000 Hz : silence, puis burst à 1 s (un « beat »)
  const rate = 1000;
  const pcm = new Float32Array(2 * rate);
  for (let i = rate; i < rate + 100; i++) pcm[i] = 1;

  it('buckets de 250 ms : max local, burst visible au bon endroit', () => {
    const buckets = computeBuckets(pcm, rate, 2);
    expect(buckets.length).toBe(8); // 2 s / 250 ms
    expect(buckets[4]).toBeGreaterThan(0.9); // burst à 1,0-1,25 s
    expect(buckets[0]).toBe(0);
  });

  it('chromagramme : une sinusoïde en La (110 Hz) domine le bin A', () => {
    const sr = 8000;
    const sine = new Float32Array(sr * 3);
    for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((2 * Math.PI * 110 * i) / sr);
    const chroma = computeChroma(sine, sr);
    const A = 9; // C=0 … A=9
    const max = Math.max(...chroma);
    expect(chroma[A]).toBe(max);
    expect(chroma[A]! / (chroma[(A + 6) % 12]! + 1e-9)).toBeGreaterThan(3); // nettement dominant
  });

  it('enveloppe RMS par blocs : rate cohérent, énergie au burst', () => {
    const { data, envelopeRate } = computeEnvelope(pcm, rate, 100);
    expect(envelopeRate).toBe(10); // 1000 / 100
    expect(data.length).toBe(20);
    expect(data[10]).toBeGreaterThan(data[0]);
  });
});
