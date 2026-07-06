const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extrait un ID vidéo YouTube d'une saisie libre (ID nu, watch, youtu.be,
 * shorts, embed). Retourne null si la saisie est une recherche textuelle.
 */
export function parseYoutubeInput(input: string): string | null {
  const trimmed = input.trim();
  if (VIDEO_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;
    const match = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})/);
    if (match?.[1]) return match[1];
  }
  return null;
}
