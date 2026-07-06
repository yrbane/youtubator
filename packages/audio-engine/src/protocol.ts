import type { EqBand } from './eq.js';

export const PROTOCOL_NS = 'youtubator';
export const PROTOCOL_VERSION = 1;

export type TempoMode = 'master-tempo' | 'vinyl';

export interface DeckCapabilities {
  eq: boolean;
  continuousRate: boolean;
  tempoModes: boolean;
}

/** Corps de chaque type de message du protocole page ↔ frame. */
export interface ProtocolPayloads {
  HELLO: Record<string, never>;
  HELLO_ACK: { capabilities: DeckCapabilities };
  SET_RATE: { rate: number };
  SET_TEMPO_MODE: { mode: TempoMode };
  SET_EQ: { band: EqBand; gainDb: number };
  SET_GAIN: { gain: number };
  METER: { level: number };
}

export type ProtocolType = keyof ProtocolPayloads;

export type ProtocolMessage<T extends ProtocolType = ProtocolType> = {
  ns: typeof PROTOCOL_NS;
  v: typeof PROTOCOL_VERSION;
  type: T;
} & ProtocolPayloads[T];

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'HELLO',
  'HELLO_ACK',
  'SET_RATE',
  'SET_TEMPO_MODE',
  'SET_EQ',
  'SET_GAIN',
  'METER',
] satisfies ProtocolType[]);

/** Construit un message estampillé namespace + version. */
export function createMessage<T extends ProtocolType>(
  type: T,
  payload: ProtocolPayloads[T],
): ProtocolMessage<T> {
  return { ns: PROTOCOL_NS, v: PROTOCOL_VERSION, type, ...payload };
}

/** Valide une donnée reçue par postMessage ; null si étrangère au protocole. */
export function parseMessage(data: unknown): ProtocolMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m['ns'] !== PROTOCOL_NS) return null;
  if (m['v'] !== PROTOCOL_VERSION) return null;
  if (typeof m['type'] !== 'string' || !KNOWN_TYPES.has(m['type'])) return null;
  return data as ProtocolMessage;
}
