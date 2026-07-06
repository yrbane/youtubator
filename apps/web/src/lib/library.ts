import Dexie, { type Table } from 'dexie';
import { toPlainTrack, type Track } from './tracks.js';
import { normalizeQuery, SEARCH_HISTORY_MAX } from './search-history.js';
import type { AccountProfile } from './accounts.js';

/** Qui a fait l'action (multi-utilisateurs) : compte YouTube actif ou invité local. */
export interface Attribution {
  byId: string | null;
  by: string;
}

export const GUEST_ATTRIBUTION: Attribution = { byId: null, by: '' };

export interface HistoryEntry {
  id?: number;
  track: Track;
  loadedAt: number;
  deckId: string;
  sessionId: string;
  by: string;
  byId: string | null;
}

export interface Favorite {
  videoId: string;
  track: Track;
  addedAt: number;
  order: number;
  by: string;
  byId: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export interface SearchEntry {
  id?: number;
  query: string;
  norm: string;
  at: number;
  by: string;
  byId: string | null;
}

export interface StoredAccount extends AccountProfile {
  lastUsedAt: number;
}

class YoutubatorDb extends Dexie {
  history!: Table<HistoryEntry, number>;
  favorites!: Table<Favorite, string>;
  playlists!: Table<Playlist, string>;
  searches!: Table<SearchEntry, number>;
  accounts!: Table<StoredAccount, string>;

  constructor() {
    super('youtubator');
    this.version(1).stores({
      history: '++id, loadedAt, sessionId',
      favorites: 'videoId, order',
      playlists: 'id, name',
    });
    this.version(2)
      .stores({
        history: '++id, loadedAt, sessionId, byId',
        favorites: 'videoId, order, byId',
        playlists: 'id, name',
        searches: '++id, norm, at',
        accounts: 'accountId, lastUsedAt',
      })
      .upgrade(async (tx) => {
        // données v1 : attribution inconnue → invité
        await tx.table('history').toCollection().modify((e) => {
          e.by ??= '';
          e.byId ??= null;
        });
        await tx.table('favorites').toCollection().modify((e) => {
          e.by ??= '';
          e.byId ??= null;
        });
      });
  }
}

export const db = new YoutubatorDb();

/** Session de mix courante (regroupement de l'historique). */
export const sessionId = crypto.randomUUID();

// --- Historique ---

export async function recordHistory(
  track: Track,
  deckId: string,
  attribution: Attribution = GUEST_ATTRIBUTION,
): Promise<void> {
  await db.history.add({
    track: toPlainTrack(track),
    loadedAt: Date.now(),
    deckId,
    sessionId,
    by: attribution.by,
    byId: attribution.byId,
  });
}

export async function listHistory(limit = 200): Promise<HistoryEntry[]> {
  return db.history.orderBy('loadedAt').reverse().limit(limit).toArray();
}

export async function clearHistory(): Promise<void> {
  await db.history.clear();
}

// --- Favoris ---

export async function isFavorite(videoId: string): Promise<boolean> {
  return (await db.favorites.get(videoId)) !== undefined;
}

export async function toggleFavorite(
  track: Track,
  attribution: Attribution = GUEST_ATTRIBUTION,
): Promise<boolean> {
  const existing = await db.favorites.get(track.videoId);
  if (existing) {
    await db.favorites.delete(track.videoId);
    return false;
  }
  const count = await db.favorites.count();
  await db.favorites.add({
    videoId: track.videoId,
    track: toPlainTrack(track),
    addedAt: Date.now(),
    order: count,
    by: attribution.by,
    byId: attribution.byId,
  });
  return true;
}

export async function listFavorites(): Promise<Favorite[]> {
  return db.favorites.orderBy('order').toArray();
}

// --- Playlists locales ---

export async function savePlaylist(name: string, tracks: Track[]): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name,
    tracks: tracks.map(toPlainTrack),
    createdAt: now,
    updatedAt: now,
  };
  await db.playlists.add(playlist);
  return playlist;
}

export async function listPlaylists(): Promise<Playlist[]> {
  return db.playlists.orderBy('name').toArray();
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.playlists.delete(id);
}

// --- Historique des recherches ---

export async function recordSearch(
  query: string,
  attribution: Attribution = GUEST_ATTRIBUTION,
): Promise<void> {
  const norm = normalizeQuery(query);
  if (norm === '') return;
  await db.searches.where('norm').equals(norm).delete(); // dédoublonne, remonte en tête
  await db.searches.add({ query: query.trim(), norm, at: Date.now(), by: attribution.by, byId: attribution.byId });
  const count = await db.searches.count();
  if (count > SEARCH_HISTORY_MAX) {
    const oldest = await db.searches.orderBy('at').limit(count - SEARCH_HISTORY_MAX).toArray();
    await db.searches.bulkDelete(oldest.map((s) => s.id!));
  }
}

export async function listSearches(limit = 10): Promise<SearchEntry[]> {
  return db.searches.orderBy('at').reverse().limit(limit).toArray();
}

export async function deleteSearch(id: number): Promise<void> {
  await db.searches.delete(id);
}

// --- Comptes YouTube mémorisés ---

export async function saveAccount(profile: AccountProfile): Promise<void> {
  await db.accounts.put({ ...profile, lastUsedAt: Date.now() });
}

export async function listAccounts(): Promise<StoredAccount[]> {
  return db.accounts.orderBy('lastUsedAt').reverse().toArray();
}

export async function deleteAccount(accountId: string): Promise<void> {
  await db.accounts.delete(accountId);
}
