import type { MidiBinding } from '../midi-core.js';
import { niKontrolX1 } from './ni-kontrol-x1.js';

/**
 * Presets de contrôleurs MIDI connus — un fichier par contrôleur.
 *
 * Pour ajouter un contrôleur : créer `midi-presets/<marque-modele>.ts` qui
 * exporte un `MidiPreset`, puis l'ajouter à MIDI_PRESETS ci-dessous.
 * Les tests (midi-presets.test.ts) vérifient automatiquement que chaque
 * preset ne référence que des actions existantes et des bindings valides.
 */
export interface MidiPreset {
  id: string;
  /** Nom affiché dans le sélecteur des réglages. */
  name: string;
  /** Contexte : mode MIDI requis, canal, particularités. */
  notes: string;
  map: Record<string, MidiBinding>;
}

export const MIDI_PRESETS: MidiPreset[] = [niKontrolX1];
