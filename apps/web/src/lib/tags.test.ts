import { describe, expect, it } from 'vitest';
import { parseTags } from './tags.js';

/** Construit un ID3v2.3 minimal avec des frames texte (encodage 0 = latin1, 3 = utf8). */
function id3(frames: Array<[string, string, number?]>): ArrayBuffer {
  const chunks: number[] = [];
  for (const [id, value, enc = 3] of frames) {
    const text = enc === 0 ? [...value].map((c) => c.charCodeAt(0)) : [...new TextEncoder().encode(value)];
    const size = text.length + 1;
    chunks.push(...[...id].map((c) => c.charCodeAt(0)));
    chunks.push((size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff);
    chunks.push(0, 0); // flags
    chunks.push(enc, ...text);
  }
  const body = new Uint8Array(chunks);
  const total = body.length;
  const out = new Uint8Array(10 + total);
  out.set([0x49, 0x44, 0x33, 3, 0, 0]); // "ID3" v2.3, flags 0
  // taille sync-safe (7 bits par octet)
  out[6] = (total >> 21) & 0x7f;
  out[7] = (total >> 14) & 0x7f;
  out[8] = (total >> 7) & 0x7f;
  out[9] = total & 0x7f;
  out.set(body, 10);
  return out.buffer;
}

/** Construit un FLAC minimal : marqueur + bloc VORBIS_COMMENT. */
function flac(comments: string[]): ArrayBuffer {
  const enc = new TextEncoder();
  const vendor = enc.encode('test');
  const parts: number[] = [
    vendor.length, 0, 0, 0, ...vendor,
    comments.length, 0, 0, 0,
  ];
  for (const c of comments) {
    const b = enc.encode(c);
    parts.push(b.length & 0xff, (b.length >> 8) & 0xff, (b.length >> 16) & 0xff, (b.length >> 24) & 0xff, ...b);
  }
  const block = new Uint8Array(parts);
  const out = new Uint8Array(4 + 4 + block.length);
  out.set([0x66, 0x4c, 0x61, 0x43]); // "fLaC"
  out[4] = 0x80 | 4; // dernier bloc + type 4 (VORBIS_COMMENT)
  out[5] = (block.length >> 16) & 0xff;
  out[6] = (block.length >> 8) & 0xff;
  out[7] = block.length & 0xff;
  out.set(block, 8);
  return out.buffer;
}

describe('tags ID3v2 (mp3)', () => {
  it('lit titre, artiste, album et genre (utf8)', () => {
    const buf = id3([
      ['TIT2', 'Astral Dreams'],
      ['TPE1', 'Laurent Garnier'],
      ['TALB', 'Shot in the Dark'],
      ['TCON', 'Techno'],
    ]);
    expect(parseTags(buf)).toEqual({
      title: 'Astral Dreams',
      artist: 'Laurent Garnier',
      album: 'Shot in the Dark',
      genre: 'Techno',
    });
  });

  it('latin1 accepté, genres numériques ID3v1 « (18) » traduits', () => {
    const buf = id3([
      ['TPE1', 'M\xe9lodie', 0],
      ['TCON', '(18)', 0],
    ]);
    const tags = parseTags(buf);
    expect(tags?.artist).toBe('Mélodie');
    expect(tags?.genre).toBe('Techno');
  });

  it('null si pas de tag', () => {
    expect(parseTags(new Uint8Array([0, 1, 2, 3]).buffer)).toBeNull();
  });
});

describe('tags Vorbis (flac)', () => {
  it('lit TITLE/ARTIST/ALBUM/GENRE, insensible à la casse des clés', () => {
    const buf = flac(['TITLE=Crispy Bacon', 'artist=Laurent Garnier', 'Album=30', 'GENRE=Techno']);
    expect(parseTags(buf)).toEqual({
      title: 'Crispy Bacon',
      artist: 'Laurent Garnier',
      album: '30',
      genre: 'Techno',
    });
  });
});
