import type { MidiPreset } from './index.js';

/**
 * Native Instruments Traktor Kontrol S2 — en **mode MIDI** (Controller
 * Editor, ou SHIFT+navigateur à l'allumage selon la génération).
 *
 * Gabarit basé sur un template MIDI d'usine (tout sur le canal 1) :
 * mixer complet (crossfader, volumes, EQ 3 bandes), tempo faders,
 * transport, hot cues 1-4 et section loop par deck. Les knobs FX font
 * office de filtres. Si ton template diffère, le mode **Learn** des
 * réglages écrase n'importe quelle touche individuellement.
 */
export const niKontrolS2: MidiPreset = {
  id: 'ni-kontrol-s2',
  name: 'NI Traktor Kontrol S2 (mode MIDI)',
  notes: 'Canal 1, template d’usine. Mixer complet + EQ + loops. Ajuste au besoin via Learn.',
  map: {
    // — mixer (CC) —
    crossfader: { kind: 'cc', channel: 0, number: 10 },
    volumeA: { kind: 'cc', channel: 0, number: 1 },
    volumeB: { kind: 'cc', channel: 0, number: 2 },
    tempoA: { kind: 'cc', channel: 0, number: 3 },
    tempoB: { kind: 'cc', channel: 0, number: 4 },
    // — EQ 3 bandes (CC) —
    eqHiA: { kind: 'cc', channel: 0, number: 20 },
    eqMidA: { kind: 'cc', channel: 0, number: 21 },
    eqLowA: { kind: 'cc', channel: 0, number: 22 },
    eqHiB: { kind: 'cc', channel: 0, number: 24 },
    eqMidB: { kind: 'cc', channel: 0, number: 25 },
    eqLowB: { kind: 'cc', channel: 0, number: 26 },
    // — knobs FX → filtres bipolaires —
    filterA: { kind: 'cc', channel: 0, number: 23 },
    filterB: { kind: 'cc', channel: 0, number: 27 },
    // — transport (notes) —
    playA: { kind: 'noteon', channel: 0, number: 50 },
    playB: { kind: 'noteon', channel: 0, number: 51 },
    cueA: { kind: 'noteon', channel: 0, number: 52 },
    cueB: { kind: 'noteon', channel: 0, number: 53 },
    syncA: { kind: 'noteon', channel: 0, number: 54 },
    syncB: { kind: 'noteon', channel: 0, number: 55 },
    // — hot cues 1-4 (notes) —
    hotcueA1: { kind: 'noteon', channel: 0, number: 60 },
    hotcueA2: { kind: 'noteon', channel: 0, number: 61 },
    hotcueA3: { kind: 'noteon', channel: 0, number: 62 },
    hotcueA4: { kind: 'noteon', channel: 0, number: 63 },
    hotcueB1: { kind: 'noteon', channel: 0, number: 64 },
    hotcueB2: { kind: 'noteon', channel: 0, number: 65 },
    hotcueB3: { kind: 'noteon', channel: 0, number: 66 },
    hotcueB4: { kind: 'noteon', channel: 0, number: 67 },
    // — section loop (notes) : encodeur pressé = ∞, tourné = ÷2/×2 —
    loopInA: { kind: 'noteon', channel: 0, number: 70 },
    loopOutA: { kind: 'noteon', channel: 0, number: 71 },
    loopToggleA: { kind: 'noteon', channel: 0, number: 72 },
    loopHalfA: { kind: 'noteon', channel: 0, number: 73 },
    loopDoubleA: { kind: 'noteon', channel: 0, number: 74 },
    loopInB: { kind: 'noteon', channel: 0, number: 76 },
    loopOutB: { kind: 'noteon', channel: 0, number: 77 },
    loopToggleB: { kind: 'noteon', channel: 0, number: 78 },
    loopHalfB: { kind: 'noteon', channel: 0, number: 79 },
    loopDoubleB: { kind: 'noteon', channel: 0, number: 80 },
    // pas de kills dédiés sur le S2 : à poser via Learn si besoin
  },
};
