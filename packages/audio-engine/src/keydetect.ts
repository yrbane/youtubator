/** Profils tonals de Krumhansl-Schmuckler (référence : tonique = do). */
export const KS_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
export const KS_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Roue Camelot (mix harmonique), indexée par pitch class. */
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

export interface KeyDetection {
  pitchClass: number;
  major: boolean;
  camelot: string;
  name: string;
  confidence: number;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom > 1e-12 ? num / denom : 0;
}

export function keyToCamelot(pitchClass: number, major: boolean): string {
  return (major ? CAMELOT_MAJOR : CAMELOT_MINOR)[((pitchClass % 12) + 12) % 12]!;
}

/**
 * Tonalité par corrélation du chromagramme avec les 24 profils K-S.
 * Null si le chroma est plat (pas de contenu tonal exploitable).
 */
export function detectKey(chroma: readonly number[]): KeyDetection | null {
  if (chroma.length !== 12) return null;
  let best: KeyDetection | null = null;
  let bestCorr = -Infinity;
  let secondCorr = -Infinity;
  for (const major of [true, false]) {
    const profile = major ? KS_MAJOR : KS_MINOR;
    for (let pc = 0; pc < 12; pc++) {
      const rotated = profile.map((_, i) => profile[(i - pc + 12) % 12]!);
      const c = correlation(chroma, rotated);
      if (c > bestCorr) {
        secondCorr = bestCorr;
        bestCorr = c;
        best = {
          pitchClass: pc,
          major,
          camelot: keyToCamelot(pc, major),
          name: `${NOTE_NAMES[pc]}${major ? '' : 'm'}`,
          confidence: 0,
        };
      } else if (c > secondCorr) {
        secondCorr = c;
      }
    }
  }
  if (!best || bestCorr < 0.3) return null; // chroma plat ou atonal
  best.confidence = Math.max(0, Math.min(1, bestCorr - secondCorr + 0.5));
  return best;
}

/**
 * Compatibilité harmonique (roue Camelot) : même code, relative (A↔B même
 * numéro), ou voisin ±1 sur la roue avec la même lettre.
 */
export function camelotCompatible(a: string, b: string): boolean {
  const parse = (code: string): { n: number; letter: string } | null => {
    const m = /^(\d{1,2})([AB])$/.exec(code);
    return m ? { n: Number(m[1]), letter: m[2]! } : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  if (pa.n === pb.n) return true; // même numéro (identique ou relative)
  if (pa.letter !== pb.letter) return false;
  const diff = Math.abs(pa.n - pb.n);
  return diff === 1 || diff === 11; // voisins, avec bouclage 12 → 1
}
