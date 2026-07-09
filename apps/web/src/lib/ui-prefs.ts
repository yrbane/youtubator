/** Colonnes affichables dans les listes du browser (le titre est toujours là). */
export const COLUMN_DEFS = [
  { id: 'thumb', label: 'Vignette' },
  { id: 'style', label: 'Style' },
  { id: 'artist', label: 'Artiste' },
  { id: 'bpm', label: 'BPM' },
  { id: 'key', label: 'Tonalité' },
  { id: 'plays', label: 'Lectures' },
  { id: 'duration', label: 'Durée' },
  { id: 'rating', label: 'Note' },
] as const;

export type ColumnId = (typeof COLUMN_DEFS)[number]['id'];

/** Défaut demandé : style · titre · artiste (titre implicite, toujours affiché). */
export const DEFAULT_COLUMNS: ColumnId[] = ['style', 'artist'];

/** Préférences d'interface persistées (pur : bornes + sérialisation). */
export interface UiPrefs {
  browserVisible: boolean;
  browserHeight: number;
  fontScale: number;
  showVideo: boolean;
  showWaves: boolean;
  columns: ColumnId[];
}

export const UI_DEFAULTS: UiPrefs = {
  browserVisible: true,
  browserHeight: 300,
  fontScale: 1,
  showVideo: true,
  showWaves: true,
  columns: DEFAULT_COLUMNS,
};

/** Ne garde que des ids de colonnes connus (données corrompues, anciennes versions). */
export function sanitizeColumns(value: unknown): ColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_COLUMNS];
  const known = new Set<string>(COLUMN_DEFS.map((c) => c.id));
  return [...new Set(value.filter((v): v is ColumnId => typeof v === 'string' && known.has(v)))];
}

export function clampFontScale(v: number): number {
  return Math.min(1.4, Math.max(0.8, v));
}

export function clampBrowserHeight(v: number): number {
  return Math.min(700, Math.max(140, v));
}

/** Le plein écran momentané du browser prime sur la préférence ☰ et le mode performance. */
export function isBrowserHidden(state: {
  perfMode: boolean;
  visible: boolean;
  maximized: boolean;
}): boolean {
  if (state.maximized) return false;
  return state.perfMode || !state.visible;
}

export function serializePrefs(prefs: UiPrefs): string {
  return JSON.stringify(prefs);
}

export function parsePrefs(raw: string | null): UiPrefs {
  if (!raw) return { ...UI_DEFAULTS };
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof UiPrefs, unknown>>;
    const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
    const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    return {
      browserVisible: bool(data.browserVisible, UI_DEFAULTS.browserVisible),
      browserHeight: clampBrowserHeight(num(data.browserHeight, UI_DEFAULTS.browserHeight)),
      fontScale: clampFontScale(num(data.fontScale, UI_DEFAULTS.fontScale)),
      showVideo: bool(data.showVideo, UI_DEFAULTS.showVideo),
      showWaves: bool(data.showWaves, UI_DEFAULTS.showWaves),
      columns: 'columns' in data ? sanitizeColumns(data.columns) : [...UI_DEFAULTS.columns],
    };
  } catch {
    return { ...UI_DEFAULTS };
  }
}
