import type { MidiPreset } from './index.js';

/**
 * Native Instruments Traktor Kontrol X1 — en **mode MIDI** (maintenir SHIFT
 * + HOTCUE à l'allumage sur MK2, ou via le Controller Editor).
 *
 * Gabarit basé sur le template MIDI d'usine (tout sur le canal 1) :
 * la moitié gauche pilote le deck A, la droite le deck B. Le X1 n'ayant
 * ni faders ni crossfader, volumes et tempos sont posés sur les encodeurs
 * de la section FX. Si ton template diffère (Controller Editor), le mode
 * **Learn** des réglages écrase n'importe quelle touche individuellement.
 */
export const niKontrolX1: MidiPreset = {
  id: 'ni-kontrol-x1',
  name: 'NI Traktor Kontrol X1 (mode MIDI)',
  notes: 'Canal 1, template d’usine. Gauche = deck A, droite = deck B. Ajuste au besoin via Learn.',
  map: {
    // — transport (notes) —
    playA: { kind: 'noteon', channel: 0, number: 16 },
    cueA: { kind: 'noteon', channel: 0, number: 17 },
    syncA: { kind: 'noteon', channel: 0, number: 18 },
    playB: { kind: 'noteon', channel: 0, number: 24 },
    cueB: { kind: 'noteon', channel: 0, number: 25 },
    syncB: { kind: 'noteon', channel: 0, number: 26 },
    // — hot cues 1-4 (notes) —
    hotcueA1: { kind: 'noteon', channel: 0, number: 1 },
    hotcueA2: { kind: 'noteon', channel: 0, number: 2 },
    hotcueA3: { kind: 'noteon', channel: 0, number: 3 },
    hotcueA4: { kind: 'noteon', channel: 0, number: 4 },
    hotcueB1: { kind: 'noteon', channel: 0, number: 5 },
    hotcueB2: { kind: 'noteon', channel: 0, number: 6 },
    hotcueB3: { kind: 'noteon', channel: 0, number: 7 },
    hotcueB4: { kind: 'noteon', channel: 0, number: 8 },
    // — section FX (CC) : knobs → filtre/volume, encodeurs → tempo —
    filterA: { kind: 'cc', channel: 0, number: 2 },
    filterB: { kind: 'cc', channel: 0, number: 10 },
    volumeA: { kind: 'cc', channel: 0, number: 3 },
    volumeB: { kind: 'cc', channel: 0, number: 11 },
    tempoA: { kind: 'cc', channel: 0, number: 4 },
    tempoB: { kind: 'cc', channel: 0, number: 12 },
    // pas de crossfader sur le X1 : action volontairement non mappée
  },
};
