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
  // — EQ 3 bandes (knobs, ±12 dB) et kills (mute d'une bande) —
  ...(['A', 'B'] as const).flatMap((d) => [
    { id: `eqHi${d}`, label: `EQ High ${d}`, continuous: true },
    { id: `eqMid${d}`, label: `EQ Mid ${d}`, continuous: true },
    { id: `eqLow${d}`, label: `EQ Low ${d}`, continuous: true },
    { id: `killHi${d}`, label: `Kill High ${d}`, continuous: false },
    { id: `killMid${d}`, label: `Kill Mid ${d}`, continuous: false },
    { id: `killLow${d}`, label: `Kill Low ${d}`, continuous: false },
  ]),
  // — boucles : IN / OUT / reloop ∞ / ÷2 / ×2 —
  ...(['A', 'B'] as const).flatMap((d) => [
    { id: `loopIn${d}`, label: `Loop IN ${d}`, continuous: false },
    { id: `loopOut${d}`, label: `Loop OUT ${d}`, continuous: false },
    { id: `loopToggle${d}`, label: `Loop ∞ ${d}`, continuous: false },
    { id: `loopHalf${d}`, label: `Loop ÷2 ${d}`, continuous: false },
    { id: `loopDouble${d}`, label: `Loop ×2 ${d}`, continuous: false },
  ]),
];

