import { detectBpm, detectKey } from '@youtubator/audio-engine';

// Worker d'analyse : l'autocorrélation BPM et la corrélation K-S tournent
// hors du main thread — zéro à-coup d'UI pendant qu'on mixe.

interface AnalysisRequest {
  id: number;
  envelope: Float32Array;
  envelopeRate: number;
  chroma: number[] | null;
}

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, envelope, envelopeRate, chroma } = e.data;
  const bpm = detectBpm(envelope, envelopeRate);
  const key = chroma ? detectKey(chroma) : null;
  (self as unknown as Worker).postMessage({ id, bpm, key });
};
