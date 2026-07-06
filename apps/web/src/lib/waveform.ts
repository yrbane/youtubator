/** Taille d'un bucket de waveform : 250 ms. */
export const BUCKET_S = 0.25;
/** Nombre maximal de points de cue par morceau. */
export const MAX_CUES = 8;

export function bucketCount(durationS: number): number {
  return Math.max(0, Math.ceil(durationS / BUCKET_S));
}

export function bucketIndex(timeS: number): number {
  return Math.floor(timeS / BUCKET_S);
}

/**
 * Intègre un échantillon de niveau (capture progressive pendant la lecture).
 * On garde le maximum par bucket ; retourne true si le bucket a changé.
 */
export function mergeSample(buckets: number[], timeS: number, level: number): boolean {
  const i = bucketIndex(timeS);
  if (i < 0 || i >= buckets.length) return false;
  const clamped = Math.min(1, Math.max(0, level));
  if (clamped <= buckets[i]!) return false;
  buckets[i] = clamped;
  return true;
}

/**
 * Pseudo-waveform déterministe (mode dégradé sans extension) : même vidéo →
 * même dessin. Bruit lissé + fondu d'intro/outro, vaguement musical.
 */
export function pseudoWaveform(videoId: string, durationS: number): number[] {
  const count = bucketCount(durationS);
  // graine LCG dérivée de l'identifiant vidéo
  let seed = 2166136261;
  for (const c of videoId) seed = (seed ^ c.charCodeAt(0)) * 16777619 >>> 0;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const raw = Array.from({ length: count }, () => rand());
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    // lissage sur 5 buckets + respiration lente (phrases de 8 s)
    let sum = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const v = raw[i + k];
      if (v !== undefined) {
        sum += v;
        n++;
      }
    }
    const smooth = sum / n;
    const phrase = 0.75 + 0.25 * Math.sin((i * BUCKET_S * Math.PI) / 8 + seed % 7);
    const fadeIn = Math.min(1, (i * BUCKET_S) / 4);
    const fadeOut = Math.min(1, ((count - 1 - i) * BUCKET_S) / 6);
    out[i] = Math.min(1, Math.max(0.05, (0.35 + 0.55 * smooth) * phrase * fadeIn * fadeOut));
  }
  return out;
}

/** Ajoute un cue (trié, max 8) ou retire celui qui est à moins de `thresholdS`. */
export function toggleCue(cues: number[], timeS: number, thresholdS: number): number[] {
  const existing = nearestCue(cues, timeS, thresholdS);
  if (existing !== null) return cues.filter((c) => c !== existing);
  if (cues.length >= MAX_CUES) return cues;
  return [...cues, timeS].sort((a, b) => a - b);
}

export function nearestCue(cues: number[], timeS: number, thresholdS: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of cues) {
    const d = Math.abs(c - timeS);
    if (d <= thresholdS && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
