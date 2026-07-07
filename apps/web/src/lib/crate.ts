import {
  db,
  type Favorite,
  type HistoryEntry,
  type Playlist,
  type Smartlist,
  type StyleColorRecord,
  type TrackMetaRecord,
  type WaveformRecord,
} from './library.js';

/**
 * Format d'échange du crate (sauvegarde / autre machine).
 * schema 1 : waveforms, favoris, playlists.
 * schema 2 : + métadonnées DJ, couleurs de styles, smartlists, historique.
 */
export interface CrateExport {
  schema: 1 | 2;
  exportedAt: number;
  waveforms: WaveformRecord[];
  favorites: Favorite[];
  playlists: Playlist[];
  trackMeta: TrackMetaRecord[];
  styleColors: StyleColorRecord[];
  smartlists: Smartlist[];
  history: HistoryEntry[];
}

/** Valide un crate importé (schema 1 ou 2, tables récentes vides si absentes) ; null si invalide. */
export function validateCrate(data: unknown): CrateExport | null {
  if (typeof data !== 'object' || data === null) return null;
  const crate = data as Record<string, unknown>;
  if (crate['schema'] !== 1 && crate['schema'] !== 2) return null;
  for (const key of ['waveforms', 'favorites', 'playlists']) {
    if (!Array.isArray(crate[key])) return null;
  }
  const waveforms = crate['waveforms'] as unknown[];
  if (waveforms.some((w) => typeof (w as { videoId?: unknown }).videoId !== 'string')) return null;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...(data as CrateExport),
    trackMeta: arr(crate['trackMeta']),
    styleColors: arr(crate['styleColors']),
    smartlists: arr(crate['smartlists']),
    history: arr(crate['history']),
  };
}

/** Exporte toute la bibliothèque : dossiers par vidéo, favoris, crates, méta DJ, styles, smartlists, historique. */
export async function exportCrate(): Promise<CrateExport> {
  const [waveforms, favorites, playlists, trackMeta, styleColors, smartlists, history] =
    await Promise.all([
      db.waveforms.toArray(),
      db.favorites.toArray(),
      db.playlists.toArray(),
      db.trackMeta.toArray(),
      db.styleColors.toArray(),
      db.smartlists.toArray(),
      db.history.toArray(),
    ]);
  return {
    schema: 2,
    exportedAt: Date.now(),
    waveforms,
    favorites,
    playlists,
    trackMeta,
    styleColors,
    smartlists,
    history,
  };
}

export interface CrateImportCounts {
  waveforms: number;
  favorites: number;
  playlists: number;
  trackMeta: number;
  styleColors: number;
  smartlists: number;
  history: number;
}

/**
 * Importe un crate (fusion par clé : le plus récent gagne pour les
 * waveforms, put simple ailleurs, l'historique s'ajoute sans écraser).
 */
export async function importCrate(data: unknown): Promise<CrateImportCounts | null> {
  const crate = validateCrate(data);
  if (!crate) return null;
  // fusion en deux requêtes bulk (pas de N allers-retours IndexedDB)
  const existing = await db.waveforms.bulkGet(crate.waveforms.map((w) => w.videoId));
  const fresher = crate.waveforms.filter(
    (record, i) => !existing[i] || (record.updatedAt ?? 0) > (existing[i]!.updatedAt ?? 0),
  );
  await db.waveforms.bulkPut(fresher);
  await db.favorites.bulkPut(crate.favorites);
  await db.playlists.bulkPut(crate.playlists);
  await db.trackMeta.bulkPut(crate.trackMeta);
  await db.styleColors.bulkPut(crate.styleColors);
  await db.smartlists.bulkPut(crate.smartlists);
  // ids auto-incrémentés : on ajoute, sans doublonner une session déjà importée
  const knownSessions = new Set((await db.history.toArray()).map((h) => `${h.sessionId}:${h.loadedAt}`));
  const newHistory = crate.history
    .filter((h) => !knownSessions.has(`${h.sessionId}:${h.loadedAt}`))
    .map(({ id: _id, ...entry }) => entry);
  await db.history.bulkAdd(newHistory as HistoryEntry[]).catch(() => {});
  return {
    waveforms: fresher.length,
    favorites: crate.favorites.length,
    playlists: crate.playlists.length,
    trackMeta: crate.trackMeta.length,
    styleColors: crate.styleColors.length,
    smartlists: crate.smartlists.length,
    history: newHistory.length,
  };
}
