import { isoDurationToSeconds } from './iso-duration.js';
import type { Track } from './tracks.js';

const API = 'https://www.googleapis.com/youtube/v3';

export interface YtPlaylist {
  id: string;
  title: string;
  itemCount: number;
}

interface RawPlaylistItem {
  snippet?: {
    title?: string;
    videoOwnerChannelTitle?: string;
    resourceId?: { videoId?: string };
    thumbnails?: Record<string, { url?: string }>;
  };
}

/** Convertit un playlistItem de l'API en Track ; null si vidéo privée/supprimée. */
export function mapPlaylistItemToTrack(item: RawPlaylistItem): Track | null {
  const snippet = item.snippet;
  const videoId = snippet?.resourceId?.videoId;
  if (!snippet || !videoId) return null;
  const title = snippet.title ?? '';
  if (title === 'Private video' || title === 'Deleted video') return null;
  const thumbnailUrl =
    snippet.thumbnails?.['medium']?.url ??
    snippet.thumbnails?.['default']?.url ??
    `https://i.ytimg.com/vi/${videoId}/default.jpg`;
  return {
    videoId,
    title,
    channel: snippet.videoOwnerChannelTitle ?? '',
    durationS: 0,
    thumbnailUrl,
  };
}

async function apiGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Session YouTube expirée — reconnecte-toi.');
  if (!res.ok) throw new Error(`API YouTube en échec (${res.status})`);
  return res.json();
}

/** ID de la playlist « J'aime » du compte connecté. */
export async function fetchLikedPlaylistId(token: string): Promise<string> {
  const json = await apiGet(token, 'channels?part=contentDetails&mine=true');
  const likes = json.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if (!likes) throw new Error('Playlist « J’aime » introuvable sur ce compte.');
  return likes;
}

export type VideoRating = 'like' | 'none';

/** Requête videos.rate (pure, testable). */
export function buildRateRequest(
  token: string,
  videoId: string,
  rating: VideoRating,
): { url: string; init: RequestInit } {
  return {
    url: `${API}/videos/rate?id=${encodeURIComponent(videoId)}&rating=${rating}`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  };
}

/**
 * Note une vidéo sur le compte connecté (miroir favori ↔ « J'aime »).
 * Nécessite le scope youtube.force-ssl : un vieux token readonly renverra 403.
 */
export async function rateVideo(token: string, videoId: string, rating: VideoRating): Promise<void> {
  const { url, init } = buildRateRequest(token, videoId, rating);
  const res = await fetch(url, init);
  if (res.status === 401 || res.status === 403) {
    throw new Error('Reconnecte le compte pour synchroniser les « J\'aime » (nouvelle autorisation requise).');
  }
  if (!res.ok) throw new Error(`Impossible de noter la vidéo (${res.status})`);
}

/** Identité du compte : chaîne YouTube + userinfo Google (email, avatar). */
export async function fetchAccountIdentity(token: string): Promise<{ channels: any; userinfo: any }> {
  const [channels, userinfoRes] = await Promise.all([
    apiGet(token, 'channels?part=snippet,contentDetails&mine=true'),
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
  const userinfo = userinfoRes.ok ? await userinfoRes.json() : {};
  return { channels, userinfo };
}

/** Playlists du compte connecté. */
export async function fetchMyPlaylists(token: string): Promise<YtPlaylist[]> {
  const json = await apiGet(token, 'playlists?part=snippet,contentDetails&mine=true&maxResults=50');
  return (json.items ?? []).map((p: any) => ({
    id: p.id,
    title: p.snippet?.title ?? '(sans titre)',
    itemCount: p.contentDetails?.itemCount ?? 0,
  }));
}

/** Pistes d'une playlist (durées incluses via videos.list). */
export async function fetchPlaylistTracks(token: string, playlistId: string): Promise<Track[]> {
  const json = await apiGet(
    token,
    `playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50`,
  );
  const tracks = ((json.items ?? []) as RawPlaylistItem[])
    .map(mapPlaylistItemToTrack)
    .filter((t): t is Track => t !== null);

  if (tracks.length > 0) {
    const ids = tracks.map((t) => t.videoId).join(',');
    try {
      const videos = await apiGet(token, `videos?part=contentDetails&id=${ids}`);
      const durations = new Map<string, number>(
        (videos.items ?? []).map((v: any) => [v.id, isoDurationToSeconds(v.contentDetails?.duration ?? '')]),
      );
      for (const t of tracks) t.durationS = durations.get(t.videoId) ?? 0;
    } catch {
      // durées non bloquantes
    }
  }
  return tracks;
}
