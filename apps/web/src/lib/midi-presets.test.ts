import { describe, expect, it } from 'vitest';
import { MIDI_PRESETS } from './midi-presets/index.js';
import { MIDI_ACTIONS } from './midi-core.js';

/** Garde-fou pour tous les presets, présents et futurs (1 fichier par contrôleur). */
describe('presets MIDI — validité de chaque contrôleur', () => {
  const actionIds = new Set(MIDI_ACTIONS.map((a) => a.id));

  it('au moins un preset (X1), ids uniques', () => {
    expect(MIDI_PRESETS.length).toBeGreaterThanOrEqual(1);
    expect(new Set(MIDI_PRESETS.map((p) => p.id)).size).toBe(MIDI_PRESETS.length);
  });

  for (const preset of MIDI_PRESETS) {
    it(`« ${preset.name} » : actions connues et bindings MIDI valides`, () => {
      expect(Object.keys(preset.map).length).toBeGreaterThan(0);
      for (const [action, binding] of Object.entries(preset.map)) {
        expect(actionIds.has(action), `action inconnue : ${action}`).toBe(true);
        expect(['cc', 'noteon']).toContain(binding.kind);
        expect(binding.channel).toBeGreaterThanOrEqual(0);
        expect(binding.channel).toBeLessThanOrEqual(15);
        expect(binding.number).toBeGreaterThanOrEqual(0);
        expect(binding.number).toBeLessThanOrEqual(127);
      }
      // pas deux actions sur la même touche du contrôleur
      const keys = Object.values(preset.map).map((b) => `${b.kind}:${b.channel}:${b.number}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});
