/** Zone morte autour du centre du knob de filtre. */
const DEAD_ZONE = 0.04;

export interface FilterSetting {
  type: 'lowpass' | 'highpass';
  frequency: number;
}

/**
 * Filtre bipolaire façon Xone : un seul knob −1..1.
 * Gauche → lowpass 20 kHz → 200 Hz, droite → highpass 20 Hz → ~8 kHz,
 * centre (± zone morte) → neutre (null).
 */
export function filterFromValue(value: number): FilterSetting | null {
  const v = Math.min(1, Math.max(-1, value));
  if (Math.abs(v) <= DEAD_ZONE) return null;
  if (v < 0) {
    // 20000 → 200 Hz sur deux décades
    return { type: 'lowpass', frequency: 20000 * Math.pow(10, 2 * v) };
  }
  // 20 → ~8000 Hz sur 2,6 décades
  return { type: 'highpass', frequency: 20 * Math.pow(10, 2.6 * v) };
}
