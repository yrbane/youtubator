import Dexie, { type Table } from 'dexie';
import type { Track } from './tracks.js';

export interface HistoryEntry {
  id?: number;
  track: Track;
  loadedAt: number;
  deckId: string;
  sessionId: string;
}

export interface Favorite {
  videoId: string;
  track: Track;
  addedAt: number;
  order: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

class YoutubatorDb extends Dexie {
  history!: Table<HistoryEntry, number>;
  favorites!: Table<Favorite, string>;
  playlists!: Table<Playlist, string>;

  constructor() {
    super('youtubator');
    this.version(1).stores({
      history: '++id, loadedAt, sessionId',
      favorites: 'videoId, order',
      playlists: 'id, name',
    });
  }
}

export const db = new YoutubatorDb();

/** Session de mix courante (regroupement de l'historique). */
export const sessionId = crypto.randomUUID();

export async function recordHistory(track: Track, deckId: string): Promise<void> {
  await db.history.add({ track, loadedAt: Date.now(), deckId, sessionId });
}

export async function listHistory(limit = 200): Promise<HistoryEntry[]> {
  return db.history.orderBy('loadedAt').reverse().limit(limit).toArray();
}

export async function clearHistory(): Promise<void> {
  await db.history.clear();
}

export async function isFavorite(videoId: string): Promise<boolean> {
  return (await db.favorites.get(videoId)) !== undefined;
}

export async function toggleFavorite(track: Track): Promise<boolean> {
  const existing = await db.favorites.get(track.videoId);
  if (existing) {
    await db.favorites.delete(track.videoId);
    return false;
  }
  const count = await db.favorites.count();
  await db.favorites.add({ videoId: track.videoId, track, addedAt: Date.now(), order: count });
  return true;
}

export async function listFavorites(): Promise<Favorite[]> {
  return db.favorites.orderBy('order').toArray();
}

export async function savePlaylist(name: string, tracks: Track[]): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = { id: crypto.randomUUID(), name, tracks, createdAt: now, updatedAt: now };
  await db.playlists.add(playlist);
  return playlist;
}

export async function listPlaylists(): Promise<Playlist[]> {
  return db.playlists.orderBy('name').toArray();
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.playlists.delete(id);
}
