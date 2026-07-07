import {
  clampBrowserHeight,
  clampFontScale,
  parsePrefs,
  serializePrefs,
  type UiPrefs,
} from './ui-prefs.js';

const STORAGE_KEY = 'youtubator.ui';

/** Préférences d'interface réactives, persistées à chaque changement. */
class UiStore {
  #prefs = $state<UiPrefs>(parsePrefs(localStorage.getItem(STORAGE_KEY)));

  // plein écran momentané du browser : transitoire, jamais persisté
  #browserMax = $state(false);

  get browserMax(): boolean {
    return this.#browserMax;
  }

  setBrowserMax(on: boolean): void {
    this.#browserMax = on;
  }

  toggleBrowserMax(): void {
    this.#browserMax = !this.#browserMax;
  }

  get browserVisible(): boolean {
    return this.#prefs.browserVisible;
  }

  get browserHeight(): number {
    return this.#prefs.browserHeight;
  }

  get fontScale(): number {
    return this.#prefs.fontScale;
  }

  get showVideo(): boolean {
    return this.#prefs.showVideo;
  }

  get showWaves(): boolean {
    return this.#prefs.showWaves;
  }

  toggleBrowser(): void {
    this.#set({ browserVisible: !this.#prefs.browserVisible });
  }

  setBrowserHeight(px: number): void {
    this.#set({ browserHeight: clampBrowserHeight(px) });
  }

  bumpFontScale(delta: number): void {
    this.#set({ fontScale: clampFontScale(Math.round((this.#prefs.fontScale + delta) * 10) / 10) });
  }

  toggleVideo(): void {
    this.#set({ showVideo: !this.#prefs.showVideo });
  }

  toggleWaves(): void {
    this.#set({ showWaves: !this.#prefs.showWaves });
  }

  #set(patch: Partial<UiPrefs>): void {
    this.#prefs = { ...this.#prefs, ...patch };
    localStorage.setItem(STORAGE_KEY, serializePrefs(this.#prefs));
  }
}

export const ui = new UiStore();
