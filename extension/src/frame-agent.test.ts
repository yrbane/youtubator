import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessage, KILL_GAIN_DB } from '@youtubator/audio-engine';
import { FrameAgent } from './frame-agent.js';
import type { EqGraph, VideoLike } from './frame-agent.js';

function makeVideo(): VideoLike {
  const v: VideoLike = {
    playbackRate: 1,
    preservesPitch: true,
    muted: false,
    paused: true,
    currentTime: 0,
    play() {
      v.paused = false;
      return Promise.resolve();
    },
    pause() {
      v.paused = true;
    },
  };
  return v;
}

function makeGraph(): EqGraph & {
  bands: Record<string, number>;
  gain: number;
  running: boolean;
  looping: boolean;
} {
  const g = {
    bands: {} as Record<string, number>,
    gain: 1,
    running: true,
    looping: false,
    setBandGain(band: string, db: number) {
      g.bands[band] = db;
    },
    setGain(v: number) {
      g.gain = v;
    },
    getLevel: () => 0.42,
    resume() {
      // no-op : le resume réel peut échouer tant qu'il n'y a pas de geste utilisateur
    },
    isRunning: () => g.running,
    getEnvelope: () => ({ rate: 43, data: [0.2, 0.8], endTimeS: 25 }),
    engageLoop(_inS: number, _outS: number) {
      g.looping = true;
      return true;
    },
    exitLoop() {
      if (!g.looping) return null;
      g.looping = false;
      return 9.1;
    },
  };
  return g;
}

function makeAgent(withVideo = true) {
  const video = makeVideo();
  const graph = makeGraph();
  const posted: unknown[] = [];
  const agent = new FrameAgent({
    createGraph: vi.fn(() => graph),
    postToParent: (m) => posted.push(m),
  });
  if (withVideo) agent.attachVideo(video);
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
        capabilities: { eq: true, continuousRate: true, tempoModes: true, sampleLoops: true },
      }),
    ]);
  });

  it('construit le graphe au premier HELLO seulement, sans jamais muter la vidéo (MediaElementSource reroute la sortie)', () => {
    const { agent, video } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    expect(agent.graphCreated).toBe(true);
    expect(video.muted).toBe(false);
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

  it('répond à HELLO même quand le <video> n’existe pas encore (embed jamais joué)', () => {
    const { agent, posted } = makeAgent(false);
    agent.handleMessage(createMessage('HELLO', {}));
    expect(posted).toEqual([
      createMessage('HELLO_ACK', {
        capabilities: { eq: true, continuousRate: true, tempoModes: true, sampleLoops: true },
      }),
    ]);
    expect(agent.graphCreated).toBe(false);
  });

  it('mémorise les commandes reçues avant la vidéo et les applique à son apparition', () => {
    const { agent, video, graph } = makeAgent(false);
    agent.handleMessage(createMessage('HELLO', {}));
    agent.handleMessage(createMessage('SET_RATE', { rate: 1.1 }));
    agent.handleMessage(createMessage('SET_TEMPO_MODE', { mode: 'vinyl' }));
    agent.handleMessage(createMessage('SET_EQ', { band: 'low', gainDb: -6 }));
    agent.attachVideo(video);
    expect(agent.graphCreated).toBe(true);
    expect(video.playbackRate).toBe(1.1);
    expect(video.preservesPitch).toBe(false);
    expect(graph.bands['low']).toBe(-6);
  });

  it('tente un resume() du graphe à chaque message et à chaque tick (autoplay policy)', () => {
    const { agent, graph } = makeAgent();
    const spy = vi.spyOn(graph, 'resume');
    agent.handleMessage(createMessage('HELLO', {}));
    agent.handleMessage(createMessage('SET_RATE', { rate: 1 }));
    agent.meterTick();
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
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

describe('FrameAgent — enveloppe et boucles sample-accurate', () => {
  function connected() {
    const made = makeAgent();
    made.agent.handleMessage(createMessage('HELLO', {}));
    made.posted.length = 0;
    return made;
  }

  it('annonce sampleLoops dans les capabilities', () => {
    const { agent, posted } = makeAgent();
    agent.handleMessage(createMessage('HELLO', {}));
    const ack = posted[0] as { capabilities?: { sampleLoops?: boolean } };
    expect(ack.capabilities?.sampleLoops).toBe(true);
  });

  it('répond à GET_ENVELOPE avec l’enveloppe du graphe', () => {
    const { agent, posted } = connected();
    agent.handleMessage(createMessage('GET_ENVELOPE', {}));
    expect(posted).toEqual([createMessage('ENVELOPE', { rate: 43, data: [0.2, 0.8], endTimeS: 25 })]);
  });

  it('LOOP_ENGAGE engage la boucle, met la vidéo en pause et publie LOOP_STATE', () => {
    const { agent, video, graph, posted } = connected();
    video.paused = false;
    agent.handleMessage(createMessage('LOOP_ENGAGE', { inS: 8.2, outS: 10.2 }));
    expect(graph.looping).toBe(true);
    expect(video.paused).toBe(true);
    expect(posted.at(-1)).toEqual(createMessage('LOOP_STATE', { engaged: true, resumeAtS: null }));
  });

  it('LOOP_EXIT arrête la boucle, replace la vidéo et relance la lecture', () => {
    const { agent, video, graph, posted } = connected();
    agent.handleMessage(createMessage('LOOP_ENGAGE', { inS: 8.2, outS: 10.2 }));
    agent.handleMessage(createMessage('LOOP_EXIT', {}));
    expect(graph.looping).toBe(false);
    expect(video.currentTime).toBe(9.1);
    expect(video.paused).toBe(false);
    expect(posted.at(-1)).toEqual(createMessage('LOOP_STATE', { engaged: false, resumeAtS: 9.1 }));
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
