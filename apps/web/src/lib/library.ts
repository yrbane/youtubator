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

/** Waveform capturée progressivement + points de cue, par vidéo. */
export interface WaveformRecord {
  videoId: string;
  durationS: number;
  /** Niveaux 0..1 par bucket de 250 ms (vide si seule la pose de cues a eu lieu). */
  buckets: number[];
  /** true si les buckets viennent de la capture réelle (extension). */
  real: boolean;
  cues: number[];
  /** Grille de beats détectée (null tant que l'analyse n'a pas abouti). */
  bpm?: number | null;
  anchorS?: number | null;
  /** Version de l'algorithme de grille (v2 = affinage anti-dérive). */
  gridV?: number;
  /** Dernière boucle posée (restaurée désactivée : ∞ pour relancer). */
  loopInS?: number | null;
  loopOutS?: number | null;
  /** Tonalité détectée (mix harmonique). */
  keyCamelot?: string | null;
  keyName?: string | null;
  /** Gain de normalisation du niveau perçu (auto-gain, 0,5..2). */
  autoGain?: number | null;
  updatedAt: number;
}

/** Cache local d'une liste YouTube (« J'aime » ou playlist) chargée page par page. */
export interface YtListCache {
  /** Clé composite : compte + playlist. */
  key: string;
  accountId: string;
  playlistId: string;
  tracks: Track[];
  /** Reprise de la pagination (plus anciens) ; null quand tout est chargé. */
  nextPageToken: string | null;
  updatedAt: number;
}

/** Cache local des résultats d'une recherche (une recherche = 100 unités de quota). */
export interface SearchCache {
  /** Requête normalisée (clé). */
  norm: string;
  query: string;
  tracks: Track[];
  nextPageToken: string | null;
  updatedAt: number;
}

/** Métadonnées DJ persistées par morceau (note, couleur, style, lectures cumulées). */
export interface TrackMetaRecord {
  videoId: string;
  /** 0 = sans note, 1..5 étoiles. */
  rating: number;
  /** Couleur de la palette ('' = sans couleur). */
  color: string;
  /** Style musical ('' = non renseigné). */
  style: string;
  /** Lectures cumulées (toutes sessions). */
  plays: number;
  lastPlayedAt: number | null;
}

class YoutubatorDb extends Dexie {
  history!: Table<HistoryEntry, number>;
  favorites!: Table<Favorite, string>;
  playlists!: Table<Playlist, string>;
  searches!: Table<SearchEntry, number>;
  accounts!: Table<StoredAccount, string>;
  waveforms!: Table<WaveformRecord, string>;
  ytLists!: Table<YtListCache, string>;
  searchCache!: Table<SearchCache, string>;
  trackMeta!: Table<TrackMetaRecord, string>;

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
    this.version(3).stores({
      history: '++id, loadedAt, sessionId, byId',
      favorites: 'videoId, order, byId',
      playlists: 'id, name',
      searches: '++id, norm, at',
      accounts: 'accountId, lastUsedAt',
      waveforms: 'videoId',
    });
    this.version(4).stores({
      history: '++id, loadedAt, sessionId, byId',
      favorites: 'videoId, order, byId',
      playlists: 'id, name',
      searches: '++id, norm, at',
      accounts: 'accountId, lastUsedAt',
      waveforms: 'videoId',
      ytLists: 'key, accountId',
    });
    this.version(5).stores({
      history: '++id, loadedAt, sessionId, byId',
      favorites: 'videoId, order, byId',
      playlists: 'id, name',
      searches: '++id, norm, at',
      accounts: 'accountId, lastUsedAt',
      waveforms: 'videoId',
      ytLists: 'key, accountId',
      searchCache: 'norm, updatedAt',
    });
    this.version(6).stores({
      history: '++id, loadedAt, sessionId, byId',
      favorites: 'videoId, order, byId',
      playlists: 'id, name',
      searches: '++id, norm, at',
      accounts: 'accountId, lastUsedAt',
      waveforms: 'videoId',
      ytLists: 'key, accountId',
      searchCache: 'norm, updatedAt',
      trackMeta: 'videoId, style, rating',
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

export async function countHistory(): Promise<number> {
  return db.history.count();
}

export async function deleteHistoryEntry(id: number): Promise<void> {
  await db.history.delete(id);
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

// --- Waveforms (cache : jamais recalculées pour un morceau déjà joué) ---

export async function loadWaveform(videoId: string): Promise<WaveformRecord | undefined> {
  return db.waveforms.get(videoId);
}

export async function saveWaveform(record: WaveformRecord): Promise<void> {
  // copies planes obligatoires : les $state Svelte sont des Proxies non clonables
  await db.waveforms.put({
    videoId: record.videoId,
    durationS: record.durationS,
    buckets: record.buckets.map((v) => Math.round(v * 100) / 100),
    real: record.real,
    cues: [...record.cues],
    bpm: record.bpm ?? null,
    anchorS: record.anchorS ?? null,
    // toute grille écrite par l'algorithme courant est v2 (affinage anti-dérive)
    gridV: record.gridV ?? (record.bpm ? 2 : undefined),
    loopInS: record.loopInS ?? null,
    loopOutS: record.loopOutS ?? null,
    keyCamelot: record.keyCamelot ?? null,
    keyName: record.keyName ?? null,
    autoGain: record.autoGain ?? null,
    updatedAt: Date.now(),
  });
}

// --- Cache des résultats de recherche — pagination reprise, quota API épargné ---

export async function loadSearchCache(norm: string): Promise<SearchCache | undefined> {
  return db.searchCache.get(norm);
}

export async function saveSearchCache(
  query: string,
  tracks: Track[],
  nextPageToken: string | null,
): Promise<void> {
  // copies planes obligatoires : les $state Svelte sont des Proxies non clonables
  await db.searchCache.put({
    norm: normalizeQuery(query),
    query: query.trim(),
    tracks: tracks.map(toPlainTrack),
    nextPageToken,
    updatedAt: Date.now(),
  });
  // le cache suit l'historique des recherches : on garde les N plus récentes
  const count = await db.searchCache.count();
  if (count > SEARCH_HISTORY_MAX) {
    const oldest = await db.searchCache.orderBy('updatedAt').limit(count - SEARCH_HISTORY_MAX).toArray();
    await db.searchCache.bulkDelete(oldest.map((c) => c.norm));
  }
}

export async function deleteSearchCache(norm: string): Promise<void> {
  await db.searchCache.delete(norm);
}

// --- Cache des listes YouTube (« J'aime », playlists) — pagination reprise d'une session à l'autre ---

export async function loadYtList(accountId: string, playlistId: string): Promise<YtListCache | undefined> {
  return db.ytLists.get(`${accountId}::${playlistId}`);
}

export async function saveYtList(
  accountId: string,
  playlistId: string,
  tracks: Track[],
  nextPageToken: string | null,
): Promise<void> {
  // copies planes obligatoires : les $state Svelte sont des Proxies non clonables
  await db.ytLists.put({
    key: `${accountId}::${playlistId}`,
    accountId,
    playlistId,
    tracks: tracks.map(toPlainTrack),
    nextPageToken,
    updatedAt: Date.now(),
  });
}

export async function deleteYtLists(accountId: string): Promise<void> {
  await db.ytLists.where('accountId').equals(accountId).delete();
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
