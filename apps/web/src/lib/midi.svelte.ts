/* eslint-disable @typescript-eslint/no-explicit-any */

import { matchAction, parseMidiMessage, type MidiBinding, type MidiEvent } from './midi-core.js';

const MAP_KEY = 'youtubator.midiMap';

/** Actions mappables — libellés pour l'écran de réglages. */
export const MIDI_ACTIONS: Array<{ id: string; label: string; continuous: boolean }> = [
  { id: 'crossfader', label: 'Crossfader', continuous: true },
  { id: 'volumeA', label: 'Volume A', continuous: true },
  { id: 'volumeB', label: 'Volume B', continuous: true },
  { id: 'tempoA', label: 'Tempo A', continuous: true },
  { id: 'tempoB', label: 'Tempo B', continuous: true },
  { id: 'filterA', label: 'Filtre A', continuous: true },
  { id: 'filterB', label: 'Filtre B', continuous: true },
  { id: 'playA', label: 'Play/Pause A', continuous: false },
  { id: 'playB', label: 'Play/Pause B', continuous: false },
  { id: 'cueA', label: 'Cue A', continuous: false },
  { id: 'cueB', label: 'Cue B', continuous: false },
  { id: 'syncA', label: 'Sync A', continuous: false },
  { id: 'syncB', label: 'Sync B', continuous: false },
  ...[1, 2, 3, 4].map((n) => ({ id: `hotcueA${n}`, label: `Hot cue A${n}`, continuous: false })),
  ...[1, 2, 3, 4].map((n) => ({ id: `hotcueB${n}`, label: `Hot cue B${n}`, continuous: false })),
];

/** Contrôleur MIDI : accès Web MIDI, mode learn, dispatch des actions. */
export class MidiController {
  enabled = $state(false);
  deviceNames = $state<string[]>([]);
  learning = $state<string | null>(null);
  map = $state<Record<string, MidiBinding>>(this.#loadMap());
  error = $state<string | null>(null);

  #onAction: ((action: string, value: number) => void) | null = null;

  onAction(cb: (action: string, value: number) => void): void {
    this.#onAction = cb;
  }

  async enable(): Promise<void> {
    this.error = null;
    if (!('requestMIDIAccess' in navigator)) {
      this.error = 'Web MIDI non disponible dans ce navigateur.';
      return;
    }
    try {
      const access = await (navigator as any).requestMIDIAccess();
      const wire = (): void => {
        const names: string[] = [];
        for (const input of access.inputs.values()) {
          names.push(input.name ?? 'MIDI');
          input.onmidimessage = (e: { data: Uint8Array }) => this.#handle(e.data);
        }
        this.deviceNames = names;
      };
      access.onstatechange = wire;
      wire();
      this.enabled = true;
    } catch {
      this.error = 'Accès MIDI refusé.';
    }
  }

  learn(actionId: string): void {
    this.learning = this.learning === actionId ? null : actionId;
  }

  clear(actionId: string): void {
    const { [actionId]: _removed, ...rest } = this.map;
    this.map = rest;
    this.#saveMap();
  }

  #handle(data: Uint8Array): void {
    const event = parseMidiMessage(data);
    if (!event) return;
    if (this.learning && event.kind !== 'noteoff') {
      this.map = { ...this.map, [this.learning]: { kind: event.kind, channel: event.channel, number: event.number } };
      this.learning = null;
      this.#saveMap();
      return;
    }
    const action = matchAction(this.map, event);
    if (action) this.#onAction?.(action, event.value);
  }

  #loadMap(): Record<string, MidiBinding> {
    try {
      return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  #saveMap(): void {
    localStorage.setItem(MAP_KEY, JSON.stringify(this.map));
  }
}

export const midi = new MidiController();
