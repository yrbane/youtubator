import { describe, expect, it } from 'vitest';
import { matchAction, parseMidiMessage, type MidiBinding } from './midi-core.js';

describe('parseMidiMessage', () => {
  it('décode un Control Change avec valeur normalisée', () => {
    expect(parseMidiMessage(new Uint8Array([0xb0, 7, 127]))).toEqual({
      kind: 'cc',
      channel: 0,
      number: 7,
      value: 1,
    });
    expect(parseMidiMessage(new Uint8Array([0xb2, 20, 64]))!.channel).toBe(2);
  });

  it('décode note on / note off (note on vélocité 0 = off)', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 36, 100]))).toEqual({
      kind: 'noteon',
      channel: 1,
      number: 36,
      value: 100 / 127,
    });
    expect(parseMidiMessage(new Uint8Array([0x81, 36, 0]))!.kind).toBe('noteoff');
    expect(parseMidiMessage(new Uint8Array([0x91, 36, 0]))!.kind).toBe('noteoff');
  });

  it('ignore les messages système et incomplets', () => {
    expect(parseMidiMessage(new Uint8Array([0xf8]))).toBeNull();
    expect(parseMidiMessage(new Uint8Array([0xb0, 7]))).toBeNull();
  });
});

describe('matchAction', () => {
  const map: Record<string, MidiBinding> = {
    crossfader: { kind: 'cc', channel: 0, number: 7 },
    playA: { kind: 'noteon', channel: 0, number: 36 },
  };

  it('retrouve l’action liée à un message', () => {
    expect(matchAction(map, { kind: 'cc', channel: 0, number: 7, value: 0.5 })).toBe('crossfader');
    expect(matchAction(map, { kind: 'noteon', channel: 0, number: 36, value: 1 })).toBe('playA');
  });

  it('null si canal, numéro ou type ne correspondent pas', () => {
    expect(matchAction(map, { kind: 'cc', channel: 1, number: 7, value: 0.5 })).toBeNull();
    expect(matchAction(map, { kind: 'cc', channel: 0, number: 8, value: 0.5 })).toBeNull();
    expect(matchAction(map, { kind: 'noteoff', channel: 0, number: 36, value: 0 })).toBeNull();
  });
});
