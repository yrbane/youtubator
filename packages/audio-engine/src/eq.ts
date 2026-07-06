export type EqBand = 'low' | 'mid' | 'high';

interface EqBandSpec {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
}

/** Bandes d'égalisation conformes à la spec (README § 6.2). */
export const EQ_BANDS: Record<EqBand, EqBandSpec> = {
  low: { type: 'lowshelf', frequency: 320 },
  mid: { type: 'peaking', frequency: 1000, q: 0.7 },
  high: { type: 'highshelf', frequency: 3200 },
};

/** Gain appliqué quand une bande est killée. */
export const KILL_GAIN_DB = -40;

const EQ_GAIN_LIMIT_DB = 12;

/** Borne le gain d'une bande dans ±12 dB. */
export function clampEqGain(gainDb: number): number {
  return Math.min(EQ_GAIN_LIMIT_DB, Math.max(-EQ_GAIN_LIMIT_DB, gainDb));
}

/** Gain effectif d'une bande : le kill l'emporte sur le knob. */
export function effectiveEqGain(gainDb: number, killed: boolean): number {
  return killed ? KILL_GAIN_DB : clampEqGain(gainDb);
}
