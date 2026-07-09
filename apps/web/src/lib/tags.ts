/** Lecture des métadonnées embarquées (ID3v2 pour MP3, Vorbis comments pour FLAC) — pur. */

export interface AudioTags {
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
}

/** Genres numériques ID3v1 les plus courants en électro (« (18) » → Techno). */
const ID3V1_GENRES: Record<number, string> = {
  7: 'Hip-Hop', 8: 'Jazz', 13: 'Pop', 17: 'Rock', 18: 'Techno', 19: 'Industrial',
  25: 'Euro-Techno', 26: 'Ambient', 27: 'Trip-Hop', 31: 'Trance', 32: 'Classical',
  35: 'House', 39: 'Noise', 52: 'Electronic', 54: 'Eurodance', 127: 'Drum & Bass',
};

function cleanGenre(raw: string): string {
  const numeric = /^\((\d+)\)$/.exec(raw.trim()) ?? /^(\d+)$/.exec(raw.trim());
  if (numeric) return ID3V1_GENRES[Number(numeric[1])] ?? raw.trim();
  return raw.trim();
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  // 0 = latin1, 1 = utf16 (BOM), 2 = utf16be, 3 = utf8
  const label = encoding === 0 ? 'latin1' : encoding === 3 ? 'utf-8' : encoding === 2 ? 'utf-16be' : 'utf-16';
  try {
    return new TextDecoder(label).decode(bytes).replace(/\0+$/g, '').replace(/^\0+/, '');
  } catch {
    return '';
  }
}

/** ID3v2.3/2.4 en tête de fichier : frames texte TIT2/TPE1/TALB/TCON. */
function parseId3(view: DataView): AudioTags | null {
  if (view.byteLength < 10) return null;
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) return null;
  const major = view.getUint8(3);
  const size =
    ((view.getUint8(6) & 0x7f) << 21) |
    ((view.getUint8(7) & 0x7f) << 14) |
    ((view.getUint8(8) & 0x7f) << 7) |
    (view.getUint8(9) & 0x7f);
  const end = Math.min(view.byteLength, 10 + size);
  const wanted: Record<string, keyof AudioTags> = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TCON: 'genre' };
  const tags: AudioTags = { title: null, artist: null, album: null, genre: null };
  let offset = 10;
  while (offset + 10 <= end) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3),
    );
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding atteint
    // v2.4 : tailles sync-safe ; v2.3 : entier 32 bits
    const raw = view.getUint32(offset + 4);
    const frameSize = major >= 4
      ? ((raw >> 24) & 0x7f) * 0x200000 + ((raw >> 16) & 0x7f) * 0x4000 + ((raw >> 8) & 0x7f) * 0x80 + (raw & 0x7f)
      : raw;
    const bodyStart = offset + 10;
    if (frameSize <= 0 || bodyStart + frameSize > end) break;
    const field = wanted[id];
    if (field && frameSize > 1) {
      const encoding = view.getUint8(bodyStart);
      const bytes = new Uint8Array(view.buffer, view.byteOffset + bodyStart + 1, frameSize - 1);
      const text = decodeText(bytes, encoding).trim();
      if (text) tags[field] = field === 'genre' ? cleanGenre(text) : text;
    }
    offset = bodyStart + frameSize;
  }
  return tags.title || tags.artist || tags.album || tags.genre ? tags : null;
}

/** FLAC : blocs de métadonnées en tête, VORBIS_COMMENT (type 4) → paires CLEF=valeur. */
function parseFlac(view: DataView): AudioTags | null {
  if (view.byteLength < 8) return null;
  if (view.getUint32(0) !== 0x664c6143) return null; // "fLaC"
  let offset = 4;
  while (offset + 4 <= view.byteLength) {
    const header = view.getUint8(offset);
    const type = header & 0x7f;
    const last = (header & 0x80) !== 0;
    const size = (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);
    const bodyStart = offset + 4;
    if (bodyStart + size > view.byteLength) break;
    if (type === 4) {
      const tags: AudioTags = { title: null, artist: null, album: null, genre: null };
      let p = bodyStart;
      const vendorLen = view.getUint32(p, true);
      p += 4 + vendorLen;
      const count = view.getUint32(p, true);
      p += 4;
      const decoder = new TextDecoder();
      for (let i = 0; i < count && p + 4 <= bodyStart + size; i++) {
        const len = view.getUint32(p, true);
        p += 4;
        const comment = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p, len));
        p += len;
        const eq = comment.indexOf('=');
        if (eq === -1) continue;
        const key = comment.slice(0, eq).toUpperCase();
        const value = comment.slice(eq + 1).trim();
        if (!value) continue;
        if (key === 'TITLE') tags.title = value;
        else if (key === 'ARTIST') tags.artist = value;
        else if (key === 'ALBUM') tags.album = value;
        else if (key === 'GENRE') tags.genre = cleanGenre(value);
      }
      return tags.title || tags.artist || tags.album || tags.genre ? tags : null;
    }
    if (last) break;
    offset = bodyStart + size;
  }
  return null;
}

/** Tags du début de fichier (256 Ko suffisent) : MP3/ID3v2 ou FLAC ; null sinon. */
export function parseTags(buffer: ArrayBuffer): AudioTags | null {
  const view = new DataView(buffer);
  return parseId3(view) ?? parseFlac(view);
}
