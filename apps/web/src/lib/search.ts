import { isoDurationToSeconds } from './iso-duration.js';
import { parseYoutubeInput } from './youtube-url.js';
import { getValidToken } from './youtube-auth.js';
import { trackFromId, type Track } from './tracks.js';

const API = 'https://www.googleapis.com/youtube/v3';

/** Authentification : token OAuth (compte connecté) prioritaire sur la clé API. */
function authQueryAndHeaders(apiKey: string | null): { qs: string; init: RequestInit } {
  const token = getValidToken();
  if (token) return { qs: '', init: { headers: { Authorization: `Bearer ${token}` } } };
  return { qs: `&key=${apiKey}`, init: {} };
}

/**
 * Recherche : URL/ID YouTube collé → piste directe (métadonnées via oEmbed) ;
 * texte libre → YouTube Data API v3 (compte connecté ou clé API).
 */
export async function searchYoutube(query: string, apiKey: string | null): Promise<Track[]> {
  const videoId = parseYoutubeInput(query);
  if (videoId) return [await fetchTrackMeta(videoId)];

  if (!apiKey && !getValidToken()) {
    throw new Error(
      'Colle une URL/ID YouTube, connecte ton compte (onglet ▶ YOUTUBE), ou ajoute une clé API dans ⚙ Réglages.',
    );
  }

  const { qs, init } = authQueryAndHeaders(apiKey);
  const searchUrl = `${API}/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}${qs}`;
  const searchRes = await fetch(searchUrl, init);
  if (!searchRes.ok) throw new Error(`Recherche YouTube en échec (${searchRes.status})`);
  const searchJson = (await searchRes.json()) as {
    items: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { default: { url: string } } } }>;
  };
  const ids = searchJson.items.map((i) => i.id.videoId);

  // durées via videos.list
  const durations = new Map<string, number>();
  if (ids.length > 0) {
    const videosRes = await fetch(`${API}/videos?part=contentDetails&id=${ids.join(',')}${qs}`, init);
    if (videosRes.ok) {
      const videosJson = (await videosRes.json()) as {
        items: Array<{ id: string; contentDetails: { duration: string } }>;
      };
      for (const v of videosJson.items) durations.set(v.id, isoDurationToSeconds(v.contentDetails.duration));
    }
  }

  return searchJson.items.map((i) => ({
    videoId: i.id.videoId,
    title: decodeHtml(i.snippet.title),
    channel: i.snippet.channelTitle,
    durationS: durations.get(i.id.videoId) ?? 0,
    thumbnailUrl: i.snippet.thumbnails.default.url,
  }));
}

/** Métadonnées d'une vidéo isolée via oEmbed (pas de clé requise). */
async function fetchTrackMeta(videoId: string): Promise<Track> {
  const base = trackFromId(videoId);
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
    );
    if (!res.ok) return base;
    const json = (await res.json()) as { title?: string; author_name?: string };
    return { ...base, title: json.title ?? base.title, channel: json.author_name ?? '' };
  } catch {
    return base;
  }
}

function decodeHtml(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}

export function getApiKey(): string | null {
  return localStorage.getItem('youtubator.apiKey');
}

export function setApiKey(key: string): void {
  if (key.trim() === '') localStorage.removeItem('youtubator.apiKey');
  else localStorage.setItem('youtubator.apiKey', key.trim());
}
