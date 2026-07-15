import { describe, expect, it } from 'vitest';
import {
  AUTOMIX_SETTINGS_DEFAULTS,
  parseAutomixSettings,
  serializeAutomixSettings,
} from './automix-settings.js';

describe('automix-settings — réglages persistés de l’automix', () => {
  it('null ou JSON invalide : les défauts', () => {
    expect(parseAutomixSettings(null)).toEqual(AUTOMIX_SETTINGS_DEFAULTS);
    expect(parseAutomixSettings('{pas du json')).toEqual(AUTOMIX_SETTINGS_DEFAULTS);
  });

  it('aller-retour fidèle', () => {
    const custom = {
      ...AUTOMIX_SETTINGS_DEFAULTS,
      bpmTolerancePct: 4,
      keyMode: 'strict' as const,
      fadeS: 24,
      fadeCurve: 'sharp' as const,
      bassSwap: false,
      sourceHistory: false,
      startMode: 'start' as const,
    };
    expect(parseAutomixSettings(serializeAutomixSettings(custom))).toEqual(custom);
  });

  it('borne les nombres et rejette les enums inconnus', () => {
    const parsed = parseAutomixSettings(
      JSON.stringify({
        bpmTolerancePct: 900,
        pickFrom: 0,
        noRepeat: -5,
        prepareAtS: 2,
        fadeS: 999,
        minDurationS: -10,
        maxDurationS: 1e9,
        keyMode: 'jazz',
        fadeCurve: 'zigzag',
        startMode: 'ailleurs',
        bassSwap: 'oui',
      }),
    );
    expect(parsed.bpmTolerancePct).toBe(25);
    expect(parsed.pickFrom).toBe(1);
    expect(parsed.noRepeat).toBe(0);
    expect(parsed.prepareAtS).toBe(15);
    expect(parsed.fadeS).toBe(60);
    expect(parsed.minDurationS).toBe(0);
    expect(parsed.maxDurationS).toBe(7200);
    expect(parsed.keyMode).toBe(AUTOMIX_SETTINGS_DEFAULTS.keyMode);
    expect(parsed.fadeCurve).toBe(AUTOMIX_SETTINGS_DEFAULTS.fadeCurve);
    expect(parsed.startMode).toBe(AUTOMIX_SETTINGS_DEFAULTS.startMode);
    expect(parsed.bassSwap).toBe(AUTOMIX_SETTINGS_DEFAULTS.bassSwap);
  });

  it('les champs manquants retombent sur les défauts (anciennes versions)', () => {
    const parsed = parseAutomixSettings(JSON.stringify({ fadeS: 20 }));
    expect(parsed.fadeS).toBe(20);
    expect(parsed.keyMode).toBe(AUTOMIX_SETTINGS_DEFAULTS.keyMode);
    expect(parsed.sourceLocal).toBe(true);
  });
});
