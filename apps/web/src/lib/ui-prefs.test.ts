import { describe, expect, it } from 'vitest';
import { clampBrowserHeight, clampFontScale, parsePrefs, serializePrefs, UI_DEFAULTS } from './ui-prefs.js';

describe('préférences UI — bornes', () => {
  it('la police reste lisible : 0,8 à 1,4', () => {
    expect(clampFontScale(1)).toBe(1);
    expect(clampFontScale(0.2)).toBe(0.8);
    expect(clampFontScale(3)).toBe(1.4);
  });

  it('le browser garde une hauteur exploitable : 140 à 700 px', () => {
    expect(clampBrowserHeight(300)).toBe(300);
    expect(clampBrowserHeight(10)).toBe(140);
    expect(clampBrowserHeight(5000)).toBe(700);
  });
});

describe('préférences UI — persistance', () => {
  it('aller-retour fidèle', () => {
    const prefs = { ...UI_DEFAULTS, browserVisible: false, fontScale: 1.2, browserHeight: 420 };
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
  });

  it('valeurs par défaut sur données absentes ou corrompues, clamp sur valeurs folles', () => {
    expect(parsePrefs(null)).toEqual(UI_DEFAULTS);
    expect(parsePrefs('{pas du json')).toEqual(UI_DEFAULTS);
    const wild = parsePrefs(JSON.stringify({ fontScale: 99, browserHeight: -5, showVideo: 0 }));
    expect(wild.fontScale).toBe(1.4);
    expect(wild.browserHeight).toBe(140);
    expect(wild.showVideo).toBe(UI_DEFAULTS.showVideo); // types invalides → défaut
  });
});
