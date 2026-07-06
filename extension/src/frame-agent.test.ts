import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, KILL_GAIN_DB } from '@youtubator/audio-engine';
import { FrameAgent } from './frame-agent.js';
import type { EqGraph, VideoLike } from './frame-agent.js';

function makeVideo(): VideoLike {
  return { playbackRate: 1, preservesPitch: true, muted: false };
}

function makeGraph(): EqGraph & { bands: Record<string, number>; gain: number } {
  const g = {
    bands: {} as Record<string, number>,
    gain: 1,
    setBandGain(band: string, db: number) {
      g.bands[band] = db;
    },
    setGain(v: number) {
      g.gain = v;
    },
    getLevel: () => 0.42,
  };
  return g;
}

function makeAgent() {
  const video = makeVideo();
  const graph = makeGraph();
  const posted: unknown[] = [];
  const agent = new FrameAgent({
    video,
    createGraph: vi.fn(() => graph),
    postToParent: (m) => posted.push(m),
  });
  return { agent, video, graph, posted };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FrameAgent — handshake', () => {
  it('répond à HELLO par HELLO_ACK avec les capabilities complètes', () => {
    const { agent, posted } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    expect(posted).toEqual([
      createMessage('HELLO_ACK', {
        capabilities: { eq: true, continuousRate: true, tempoModes: true },
      }),
    ]);
  });

  it('construit le graphe audio et mute la vidéo au premier HELLO seulement', () => {
    const { agent, video } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    expect(video.muted).toBe(true);
    const before = agent.graphCreated;
    agent.handleMessage(createMessage('HELLO', {}));
    expect(agent.graphCreated).toBe(before); // pas de second graphe
  });

  it('ignore le bruit (messages non-protocole)', () => {
    const { agent, posted } = makeAgent();
    agent.handleMessage({ event: 'infoDelivery' });
    agent.handleMessage('string');
    expect(posted).toEqual([]);
  });
});

describe('FrameAgent — contrôles', () => {
  it('applique SET_RATE sur video.playbackRate', () => {
    const { agent, video } = makeAgent();
    agent.handleMessage(createMessage('SET_RATE', { rate: 1.063 }));
    expect(video.playbackRate).toBe(1.063);
  });

  it('bascule preservesPitch selon le mode tempo', () => {
    const { agent, video } = makeAgent();
    agent.handleMessage(createMessage('SET_TEMPO_MODE', { mode: 'vinyl' }));
    expect(video.preservesPitch).toBe(false);
    agent.handleMessage(createMessage('SET_TEMPO_MODE', { mode: 'master-tempo' }));
    expect(video.preservesPitch).toBe(true);
  });

  it('applique SET_EQ sur le graphe en clampant à ±12 dB (hors kill)', () => {
    const { agent, graph } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    agent.handleMessage(createMessage('SET_EQ', { band: 'mid', gainDb: 20 }));
    expect(graph.bands['mid']).toBe(12);
  });

  it('laisse passer le gain de kill (-40 dB) sans le clamper', () => {
    const { agent, graph } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    agent.handleMessage(createMessage('SET_EQ', { band: 'low', gainDb: KILL_GAIN_DB }));
    expect(graph.bands['low']).toBe(KILL_GAIN_DB);
  });

  it('applique SET_GAIN sur le graphe', () => {
    const { agent, graph } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    agent.handleMessage(createMessage('SET_GAIN', { gain: 0.5 }));
    expect(graph.gain).toBe(0.5);
  });

  it('ignore SET_EQ/SET_GAIN avant le handshake (pas de graphe)', () => {
    const { agent, graph } = makeAgent();
    agent.handleMessage(createMessage('SET_EQ', { band: 'low', gainDb: -6 }));
    expect(graph.bands).toEqual({});
  });
});

describe('FrameAgent — VU-mètre', () => {
  it('publie le niveau du graphe via METER à chaque tick', () => {
    const { agent, posted } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    posted.length = 0;
    agent.meterTick();
    expect(posted).toEqual([createMessage('METER', { level: 0.42 })]);
  });

  it('ne publie rien avant le handshake', () => {
    const { agent, posted } = makeAgent();
    agent.meterTick();
    expect(posted).toEqual([]);
  });
});
