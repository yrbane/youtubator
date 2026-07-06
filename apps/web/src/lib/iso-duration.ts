const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/** Convertit une durée ISO 8601 (PT1H2M3S) de l'API YouTube en secondes. */
export function isoDurationToSeconds(iso: string): number {
  const m = ISO_DURATION.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
