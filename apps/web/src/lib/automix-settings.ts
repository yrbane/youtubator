import type { AutomixKeyMode, FadeCurve } from './automix-core.js';

/** Où le deck entrant démarre : premier cue (on saute l'intro) ou début. */
export type AutomixStartMode = 'cue' | 'start';

/** Tous les réglages de l'automix (persistés, pur : bornes + sérialisation). */
export interface AutomixSettings {
  /** Fenêtre de tempo en % (octaves comprises). */
  bpmTolerancePct: number;
  /** Poids de la tonalité : off / préférée / stricte. */
  keyMode: AutomixKeyMode;
  /** Durée minimale d'un candidat en s (anti-jingle, 0 = pas de plancher). */
  minDurationS: number;
  /** Durée maximale en s (0 = pas de plafond). */
  maxDurationS: number;
  /** Pointe de hasard : pioche parmi les N meilleurs. */
  pickFrom: number;
  /** Anti-répétition : on ne rejoue aucun des N derniers morceaux. */
  noRepeat: number;
  /** Sources de la bibliothèque candidate. */
  sourceLocal: boolean;
  sourceFavorites: boolean;
  sourceHistory: boolean;
  /** Le morceau suivant est préparé quand il reste moins que ça (s). */
  prepareAtS: number;
  /** Durée de la transition au crossfader (s). */
  fadeS: number;
  fadeCurve: FadeCurve;
  /** Échange de basses : le low du deck entrant est coupé jusqu'au milieu du fondu. */
  bassSwap: boolean;
  startMode: AutomixStartMode;
}

export const AUTOMIX_SETTINGS_DEFAULTS: AutomixSettings = {
  bpmTolerancePct: 6,
  keyMode: 'prefer',
  minDurationS: 90,
  maxDurationS: 0,
  pickFrom: 3,
  noRepeat: 12,
  sourceLocal: true,
  sourceFavorites: true,
  sourceHistory: true,
  prepareAtS: 50,
  fadeS: 12,
  fadeCurve: 'smooth',
  bassSwap: true,
  startMode: 'cue',
};

export const AUTOMIX_STORAGE_KEY = 'youtubator.automix.v1';

export function serializeAutomixSettings(settings: AutomixSettings): string {
  return JSON.stringify(settings);
}

export function parseAutomixSettings(raw: string | null): AutomixSettings {
  if (!raw) return { ...AUTOMIX_SETTINGS_DEFAULTS };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof AutomixSettings, unknown>>;
    return sanitizeAutomixSettings(data);
  } catch {
    return { ...AUTOMIX_SETTINGS_DEFAULTS };
  }
}

/** Applique bornes et défauts champ à champ (données corrompues, anciennes versions). */
export function sanitizeAutomixSettings(
  data: Partial<Record<keyof AutomixSettings, unknown>>,
): AutomixSettings {
  const d = AUTOMIX_SETTINGS_DEFAULTS;
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  const num = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  return {
    bpmTolerancePct: num(data.bpmTolerancePct, d.bpmTolerancePct, 1, 25),
    keyMode: oneOf(data.keyMode, ['off', 'prefer', 'strict'], d.keyMode),
    minDurationS: num(data.minDurationS, d.minDurationS, 0, 600),
    maxDurationS: num(data.maxDurationS, d.maxDurationS, 0, 7200),
    pickFrom: Math.round(num(data.pickFrom, d.pickFrom, 1, 10)),
    noRepeat: Math.round(num(data.noRepeat, d.noRepeat, 0, 100)),
    sourceLocal: bool(data.sourceLocal, d.sourceLocal),
    sourceFavorites: bool(data.sourceFavorites, d.sourceFavorites),
    sourceHistory: bool(data.sourceHistory, d.sourceHistory),
    prepareAtS: num(data.prepareAtS, d.prepareAtS, 15, 180),
    fadeS: num(data.fadeS, d.fadeS, 2, 60),
    fadeCurve: oneOf(data.fadeCurve, ['linear', 'smooth', 'sharp'], d.fadeCurve),
    bassSwap: bool(data.bassSwap, d.bassSwap),
    startMode: oneOf(data.startMode, ['cue', 'start'], d.startMode),
  };
}
