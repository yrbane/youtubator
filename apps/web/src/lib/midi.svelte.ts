/* eslint-disable @typescript-eslint/no-explicit-any */

import { matchAction, parseMidiMessage, type MidiBinding, type MidiEvent } from './midi-core.js';

export { MIDI_ACTIONS } from './midi-core.js';

const MAP_KEY = 'youtubator.midiMap';


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

  /** Charge un preset de contrôleur : remplace tout le mapping (Learn ajuste ensuite). */
  applyPreset(map: Record<string, MidiBinding>): void {
    this.map = { ...map };
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
