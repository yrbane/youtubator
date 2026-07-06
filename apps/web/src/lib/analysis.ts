import { detectBpm, detectKey, type BpmDetection, type KeyDetection } from '@youtubator/audio-engine';

export interface AnalysisResult {
  bpm: BpmDetection | null;
  key: KeyDetection | null;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: AnalysisResult) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number } & AnalysisResult>) => {
      const resolve = pending.get(e.data.id);
      pending.delete(e.data.id);
      resolve?.({ bpm: e.data.bpm, key: e.data.key });
    };
    worker.onerror = () => {
      // worker HS : les requêtes en cours retombent en synchrone au timeout
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/**
 * Analyse BPM + tonalité hors du main thread (repli synchrone si les
 * workers sont indisponibles ou muets — environnement de test, erreur).
 */
export function analyze(
  envelope: Float32Array,
  envelopeRate: number,
  chroma: number[] | null,
): Promise<AnalysisResult> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve({
      bpm: detectBpm(envelope, envelopeRate),
      key: chroma ? detectKey(chroma) : null,
    });
  }
  return new Promise((resolve) => {
    const id = nextId++;
    const fallback = setTimeout(() => {
      if (pending.delete(id)) {
        resolve({ bpm: detectBpm(envelope, envelopeRate), key: chroma ? detectKey(chroma) : null });
      }
    }, 5000);
    pending.set(id, (r) => {
      clearTimeout(fallback);
      resolve(r);
    });
    w.postMessage({ id, envelope, envelopeRate, chroma });
  });
}
