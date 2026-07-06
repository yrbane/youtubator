import { describe, expect, it, vi } from 'vitest';
import { ExtensionBackend } from './extension-backend.js';
import { createMessage, parseMessage } from './protocol.js';
import type { DeckAudioBackend } from './types.js';
import type { MessageChannelLike } from './extension-backend.js';

function makeInner(): DeckAudioBackend {
  return {
    load: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(async (r: number) => r),
    getAvailableRates: vi.fn(() => [0.5, 1, 1.5]),
    setEq: vi.fn(() => false),
    setTempoMode: vi.fn(() => false),
    capabilities: { eq: false, continuousRate: false, tempoModes: false },
    onStateChange: vi.fn(() => () => {}),
    onTimeUpdate: vi.fn(() => () => {}),
    destroy: vi.fn(),
  };
}

function makeChannel() {
  const sent: unknown[] = [];
  let handler: ((data: unknown) => void) | null = null;
  const channel: MessageChannelLike = {
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      handler = cb;
      return () => {
        handler = null;
      };
    },
  };
  return { channel, sent, receive: (m: unknown) => handler?.(m) };
}

function makeConnected() {
  const inner = makeInner();
  const { channel, sent, receive } = makeChannel();
  const backend = new ExtensionBackend(inner, channel);
  receive(createMessage('HELLO_ACK', { capabilities: { eq: true, continuousRate: true, tempoModes: true } }));
  return { backend, inner, sent, receive };
}

describe('ExtensionBackend — handshake', () => {
  it('renvoie HELLO périodiquement tant que l’extension n’a pas répondu, puis s’arrête', () => {
    vi.useFakeTimers();
    const { channel, sent, receive } = makeChannel();
    new ExtensionBackend(makeInner(), channel);
    vi.advanceTimersByTime(2500); // 2 relances à 1 s d'intervalle
    const hellos = sent.filter((m) => parseMessage(m)?.type === 'HELLO');
    expect(hellos.length).toBe(3);
    receive(createMessage('HELLO_ACK', { capabilities: { eq: true, continuousRate: true, tempoModes: true } }));
    vi.advanceTimersByTime(5000);
    expect(sent.filter((m) => parseMessage(m)?.type === 'HELLO').length).toBe(3);
    vi.useRealTimers();
  });

  it('envoie HELLO à la construction', () => {
    const { channel, sent } = makeChannel();
    new ExtensionBackend(makeInner(), channel);
    expect(parseMessage(sent[0])?.type).toBe('HELLO');
  });

  it('expose les capabilities du backend interne tant que l’extension n’a pas répondu', () => {
    const { channel } = makeChannel();
    const backend = new ExtensionBackend(makeInner(), channel);
    expect(backend.capabilities).toEqual({ eq: false, continuousRate: false, tempoModes: false });
  });

  it('adopte les capabilities annoncées par HELLO_ACK', () => {
    const { backend } = makeConnected();
    expect(backend.capabilities).toEqual({ eq: true, continuousRate: true, tempoModes: true });
  });

  it('ignore les messages étrangers au protocole (bruit YouTube)', () => {
    const inner = makeInner();
    const { channel, receive } = makeChannel();
    const backend = new ExtensionBackend(inner, channel);
    receive({ event: 'infoDelivery', info: {} });
    expect(backend.capabilities.eq).toBe(false);
  });
});

describe('ExtensionBackend — contrôles audio', () => {
  it('envoie SET_EQ quand connecté et confirme le support', () => {
    const { backend, sent } = makeConnected();
    expect(backend.setEq('low', -40)).toBe(true);
    expect(sent.at(-1)).toEqual(createMessage('SET_EQ', { band: 'low', gainDb: -40 }));
  });

  it('refuse SET_EQ tant que non connecté', () => {
    const { channel, sent } = makeChannel();
    const backend = new ExtensionBackend(makeInner(), channel);
    expect(backend.setEq('low', -6)).toBe(false);
    expect(sent).toHaveLength(1); // uniquement HELLO
  });

  it('envoie SET_TEMPO_MODE quand connecté', () => {
    const { backend, sent } = makeConnected();
    expect(backend.setTempoMode('vinyl')).toBe(true);
    expect(sent.at(-1)).toEqual(createMessage('SET_TEMPO_MODE', { mode: 'vinyl' }));
  });

  it('applique un rate continu via SET_RATE quand connecté', async () => {
    const { backend, inner, sent } = makeConnected();
    await expect(backend.setPlaybackRate(1.063)).resolves.toBe(1.063);
    expect(sent.at(-1)).toEqual(createMessage('SET_RATE', { rate: 1.063 }));
    expect(inner.setPlaybackRate).not.toHaveBeenCalled();
  });

  it('retombe sur le backend interne pour le rate quand non connecté', async () => {
    const inner = makeInner();
    const { channel } = makeChannel();
    const backend = new ExtensionBackend(inner, channel);
    await backend.setPlaybackRate(1.25);
    expect(inner.setPlaybackRate).toHaveBeenCalledWith(1.25);
  });

  it('relaie les niveaux METER aux abonnés', () => {
    const { backend, receive } = makeConnected();
    const levels: number[] = [];
    backend.onMeter((l) => levels.push(l));
    receive(createMessage('METER', { level: 0.42 }));
    expect(levels).toEqual([0.42]);
  });
});

describe('ExtensionBackend — enveloppe et boucles sample-accurate', () => {
  it('getEnvelope envoie GET_ENVELOPE et résout avec la réponse ENVELOPE', async () => {
    const { backend, sent, receive } = makeConnected();
    const promise = backend.getEnvelope();
    expect(parseMessage(sent.at(-1))?.type).toBe('GET_ENVELOPE');
    receive(createMessage('ENVELOPE', { rate: 43, data: [0.1, 0.9], endTimeS: 30 }));
    await expect(promise).resolves.toEqual({ rate: 43, data: [0.1, 0.9], endTimeS: 30 });
  });

  it('getEnvelope résout null hors connexion', async () => {
    const { channel } = makeChannel();
    const backend = new ExtensionBackend(makeInner(), channel);
    await expect(backend.getEnvelope()).resolves.toBeNull();
  });

  it('engageLoop/exitLoop envoient les messages quand connecté', () => {
    const { backend, sent } = makeConnected();
    expect(backend.engageLoop(8.2, 10.2)).toBe(true);
    expect(sent.at(-1)).toEqual(createMessage('LOOP_ENGAGE', { inS: 8.2, outS: 10.2 }));
    backend.exitLoop();
    expect(parseMessage(sent.at(-1))?.type).toBe('LOOP_EXIT');
  });

  it('relaie LOOP_STATE aux abonnés', () => {
    const { backend, receive } = makeConnected();
    const states: Array<{ engaged: boolean; resumeAtS: number | null }> = [];
    backend.onLoopState((s) => states.push(s));
    receive(createMessage('LOOP_STATE', { engaged: true, resumeAtS: null }));
    receive(createMessage('LOOP_STATE', { engaged: false, resumeAtS: 9.1 }));
    expect(states).toEqual([
      { engaged: true, resumeAtS: null },
      { engaged: false, resumeAtS: 9.1 },
    ]);
  });
});

describe('ExtensionBackend — délégation transport', () => {
  it('délègue load/play/pause/seek/volume au backend interne', async () => {
    const { backend, inner } = makeConnected();
    await backend.load('abc');
    backend.play();
    backend.pause();
    backend.seekTo(10);
    backend.setVolume(0.8);
    expect(inner.load).toHaveBeenCalledWith('abc');
    expect(inner.play).toHaveBeenCalled();
    expect(inner.pause).toHaveBeenCalled();
    expect(inner.seekTo).toHaveBeenCalledWith(10);
    expect(inner.setVolume).toHaveBeenCalledWith(0.8);
  });

  it('destroy() coupe l’écoute du canal et détruit le backend interne', () => {
    const { backend, inner, receive } = makeConnected();
    backend.destroy();
    receive(createMessage('METER', { level: 0.9 }));
    expect(inner.destroy).toHaveBeenCalled();
  });
});
