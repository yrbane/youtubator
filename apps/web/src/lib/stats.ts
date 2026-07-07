import type { TrackMetaRecord } from './library.js';

/** Statistiques d'écoute dérivées des métadonnées DJ : pur et testable. */

export function computeTopPlayed(meta: readonly TrackMetaRecord[], limit = 10): TrackMetaRecord[] {
  return meta
    .filter((m) => m.plays > 0)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit);
}

export interface StyleStat {
  style: string;
  tracks: number;
  plays: number;
}

export function computeStyleStats(meta: readonly TrackMetaRecord[]): StyleStat[] {
  const byStyle = new Map<string, StyleStat>();
  for (const m of meta) {
    if (m.style === '') continue;
    const stat = byStyle.get(m.style) ?? { style: m.style, tracks: 0, plays: 0 };
    stat.tracks += 1;
    stat.plays += m.plays;
    byStyle.set(m.style, stat);
  }
  return [...byStyle.values()].sort((a, b) => b.plays - a.plays);
}

/** Joués autrefois mais plus depuis `days` jours — à ressortir. */
export function computeStaleTracks(
  meta: readonly TrackMetaRecord[],
  now: number,
  days = 30,
  limit = 10,
): TrackMetaRecord[] {
  const cutoff = now - days * 86_400_000;
  return meta
    .filter((m) => m.plays > 0 && m.lastPlayedAt !== null && m.lastPlayedAt < cutoff)
    .sort((a, b) => (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0))
    .slice(0, limit);
}
