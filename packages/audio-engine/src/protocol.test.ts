import { describe, expect, it } from 'vitest';
import { createMessage, parseMessage, PROTOCOL_NS, PROTOCOL_VERSION } from './protocol.js';

describe('createMessage', () => {
  it('estampille namespace et version', () => {
    const m = createMessage('SET_RATE', { rate: 1.05 });
    expect(m).toEqual({ ns: PROTOCOL_NS, v: PROTOCOL_VERSION, type: 'SET_RATE', rate: 1.05 });
  });
});

describe('parseMessage', () => {
  it('rejette les données qui ne sont pas des objets', () => {
    expect(parseMessage('hello')).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage(42)).toBeNull();
  });

  it('rejette un namespace étranger (messages YouTube internes, etc.)', () => {
    expect(parseMessage({ ns: 'yt', v: 1, type: 'SET_RATE', rate: 1 })).toBeNull();
  });

  it('rejette une version de protocole inconnue', () => {
    expect(parseMessage({ ns: PROTOCOL_NS, v: 99, type: 'SET_RATE', rate: 1 })).toBeNull();
  });

  it('rejette un type inconnu', () => {
    expect(parseMessage({ ns: PROTOCOL_NS, v: 1, type: 'EXPLODE' })).toBeNull();
  });

  it('accepte un message valide et le retourne typé', () => {
    const raw = createMessage('SET_EQ', { band: 'low', gainDb: -40 });
    const parsed = parseMessage(raw);
    expect(parsed).toEqual({ ns: PROTOCOL_NS, v: 1, type: 'SET_EQ', band: 'low', gainDb: -40 });
  });

  it('fait le tour complet pour chaque type du protocole', () => {
    const samples = [
      createMessage('HELLO', {}),
      createMessage('HELLO_ACK', { capabilities: { eq: true, continuousRate: true, tempoModes: true } }),
      createMessage('SET_RATE', { rate: 0.92 }),
      createMessage('SET_TEMPO_MODE', { mode: 'vinyl' }),
      createMessage('SET_EQ', { band: 'mid', gainDb: 3 }),
      createMessage('SET_GAIN', { gain: 0.5 }),
      createMessage('METER', { level: 0.7 }),
    ];
    for (const s of samples) {
      expect(parseMessage(s)).toEqual(s);
    }
  });
});
