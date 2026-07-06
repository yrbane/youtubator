import { db, type Favorite, type Playlist, type WaveformRecord } from './library.js';

export interface CrateExport {
  schema: 1;
  exportedAt: number;
  waveforms: WaveformRecord[];
  favorites: Favorite[];
  playlists: Playlist[];
}

/** Valide un crate importé (structure minimale) ; null si invalide. */
export function validateCrate(data: unknown): CrateExport | null {
  if (typeof data !== 'object' || data === null) return null;
  const crate = data as Record<string, unknown>;
  if (crate['schema'] !== 1) return null;
  for (const key of ['waveforms', 'favorites', 'playlists']) {
    if (!Array.isArray(crate[key])) return null;
  }
  const waveforms = crate['waveforms'] as unknown[];
  if (waveforms.some((w) => typeof (w as { videoId?: unknown }).videoId !== 'string')) return null;
  return data as CrateExport;
}

/** Exporte tout le crate : dossiers par vidéo, favoris, playlists. */
export async function exportCrate(): Promise<CrateExport> {
  const [waveforms, favorites, playlists] = await Promise.all([
    db.waveforms.toArray(),
    db.favorites.toArray(),
    db.playlists.toArray(),
  ]);
  return { schema: 1, exportedAt: Date.now(), waveforms, favorites, playlists };
}

/**
 * Importe un crate (fusion par clé : le plus récent gagne pour les
 * waveforms, put simple pour favoris/playlists).
 */
export async function importCrate(data: unknown): Promise<{ waveforms: number; favorites: number; playlists: number } | null> {
  const crate = validateCrate(data);
  if (!crate) return null;
  let waveformCount = 0;
  for (const record of crate.waveforms) {
    const existing = await db.waveforms.get(record.videoId);
    if (!existing || (record.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      await db.waveforms.put(record);
      waveformCount++;
    }
  }
  await db.favorites.bulkPut(crate.favorites);
  await db.playlists.bulkPut(crate.playlists);
  return { waveforms: waveformCount, favorites: crate.favorites.length, playlists: crate.playlists.length };
}
