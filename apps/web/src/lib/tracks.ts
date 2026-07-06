/** Modèle de données (README § 10). */
export interface Track {
  videoId: string;
  title: string;
  channel: string;
  durationS: number;
  thumbnailUrl: string;
}

/** Copie plane d'une piste — indispensable avant IndexedDB (les $state Svelte sont des Proxies non clonables). */
export function toPlainTrack(t: Track): Track {
  return {
    videoId: t.videoId,
    title: t.title,
    channel: t.channel,
    durationS: t.durationS,
    thumbnailUrl: t.thumbnailUrl,
  };
}

export function trackFromId(videoId: string): Track {
  return {
    videoId,
    title: videoId,
    channel: '',
    durationS: 0,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
  };
}

export function formatDuration(s: number): string {
  if (!s || !Number.isFinite(s)) return '–:––';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
