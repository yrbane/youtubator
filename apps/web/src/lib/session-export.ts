/** Export de tracklist (session de mix ou liste affichée) : pur et testable. */

export interface TracklistEntry {
  title: string;
  channel: string;
  loadedAt: number;
  deckId: string;
  videoId: string;
}

function offset(ms: number): string {
  const totalS = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format publiable : « 01. [+00:00] Artiste – Titre ». */
export function tracklistTxt(entries: readonly TracklistEntry[]): string {
  const start = entries[0]?.loadedAt ?? 0;
  return entries
    .map((e, i) => {
      const who = e.channel ? `${e.channel} – ` : '';
      return `${String(i + 1).padStart(2, '0')}. [${offset(e.loadedAt - start)}] ${who}${e.title}`;
    })
    .join('\n');
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** CSV (séparateur ;) pour tableur : position, horodatage ISO, deck, chaîne, titre, videoId. */
export function tracklistCsv(entries: readonly TracklistEntry[]): string {
  const rows = entries.map((e, i) =>
    [
      String(i + 1),
      new Date(e.loadedAt).toISOString(),
      e.deckId,
      csvField(e.channel),
      csvField(e.title),
      e.videoId,
    ].join(';'),
  );
  return ['position;horodatage;deck;chaine;titre;videoId', ...rows].join('\n');
}
