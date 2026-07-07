import { db, type TrackMetaRecord } from './library.js';
import { clampRating, normalizeStyle } from './track-meta.js';

function blank(videoId: string): TrackMetaRecord {
  return { videoId, rating: 0, color: '', style: '', plays: 0, lastPlayedAt: null };
}

/**
 * Métadonnées DJ par morceau (note, couleur, style, lectures), réactives et
 * persistées dans Dexie. Le compteur « cette session » reste en mémoire.
 */
class TrackMetaStore {
  #all = $state<Record<string, TrackMetaRecord>>({});
  #sessionPlays = $state<Record<string, number>>({});

  async init(): Promise<void> {
    const rows = await db.trackMeta.toArray();
    this.#all = Object.fromEntries(rows.map((r) => [r.videoId, r]));
  }

  get(videoId: string): TrackMetaRecord | undefined {
    return this.#all[videoId];
  }

  sessionPlays(videoId: string): number {
    return this.#sessionPlays[videoId] ?? 0;
  }

  /** Styles déjà attribués (suggestions). */
  get styles(): string[] {
    return [...new Set(Object.values(this.#all).map((m) => m.style).filter((s) => s !== ''))].sort();
  }

  async recordPlay(videoId: string): Promise<void> {
    const current = this.#all[videoId] ?? blank(videoId);
    await this.#put({ ...current, plays: current.plays + 1, lastPlayedAt: Date.now() });
    this.#sessionPlays = { ...this.#sessionPlays, [videoId]: this.sessionPlays(videoId) + 1 };
  }

  async setRating(videoId: string, rating: number): Promise<void> {
    const current = this.#all[videoId] ?? blank(videoId);
    await this.#put({ ...current, rating: clampRating(rating) });
  }

  async setColor(videoId: string, color: string): Promise<void> {
    const current = this.#all[videoId] ?? blank(videoId);
    await this.#put({ ...current, color });
  }

  async setStyle(videoId: string, style: string): Promise<void> {
    const current = this.#all[videoId] ?? blank(videoId);
    await this.#put({ ...current, style: normalizeStyle(style) });
  }

  async #put(record: TrackMetaRecord): Promise<void> {
    this.#all = { ...this.#all, [record.videoId]: record };
    await db.trackMeta.put({ ...record }); // copie plane : jamais de Proxy $state vers Dexie
  }
}

export const meta = new TrackMetaStore();
