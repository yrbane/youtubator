export interface MidiBinding {
  kind: 'cc' | 'noteon';
  channel: number;
  number: number;
}

export interface MidiEvent {
  kind: 'cc' | 'noteon' | 'noteoff';
  channel: number;
  number: number;
  /** 0..1 (vélocité ou valeur de CC normalisée). */
  value: number;
}

/** Décode un message MIDI brut ; null si non géré (système, incomplet). */
export function parseMidiMessage(data: Uint8Array): MidiEvent | null {
  if (data.length < 3) return null;
  const status = data[0]!;
  const kindNibble = status & 0xf0;
  const channel = status & 0x0f;
  const number = data[1]!;
  const raw = data[2]!;
  if (kindNibble === 0xb0) return { kind: 'cc', channel, number, value: raw / 127 };
  if (kindNibble === 0x90) {
    return raw === 0
      ? { kind: 'noteoff', channel, number, value: 0 }
      : { kind: 'noteon', channel, number, value: raw / 127 };
  }
  if (kindNibble === 0x80) return { kind: 'noteoff', channel, number, value: 0 };
  return null;
}

/** Action liée à un événement (les noteoff ne déclenchent jamais). */
export function matchAction(map: Record<string, MidiBinding>, event: MidiEvent): string | null {
  if (event.kind === 'noteoff') return null;
  for (const [action, binding] of Object.entries(map)) {
    if (binding.kind === event.kind && binding.channel === event.channel && binding.number === event.number) {
      return action;
    }
  }
  return null;
}
