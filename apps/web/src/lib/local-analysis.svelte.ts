import { computeAutoGain } from '@youtubator/audio-engine';
import { analyze } from './analysis.js';
import { computeBuckets, computeChroma, computeEnvelope } from './local-files.js';
import { getLocalFile } from './local-library.js';
import { loadWaveform, saveWaveform } from './library.js';

/** Décodage hors lecture : OfflineAudioContext (pas de geste utilisateur requis). */
async function decodeMono(file: File): Promise<{ pcm: Float32Array; sampleRate: number; durationS: number }> {
  const ctx = new OfflineAudioContext(1, 2, 44100);
  const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  const pcm = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) pcm[i]! += data[i]! / buffer.numberOfChannels;
  }
  return { pcm, sampleRate: buffer.sampleRate, durationS: buffer.duration };
}

/**
 * File d'analyse des fichiers locaux (⚡) : décode chaque morceau et remplit
 * son dossier — waveform complète, BPM/grille, tonalité, auto-gain. Un par un,
 * sans occuper de deck ni nécessiter l'extension.
 */
class LocalAnalysisQueue {
  queue = $state<string[]>([]);
  current = $state<string | null>(null);
  /** Analyses terminées depuis le dernier repos (affichage de progression). */
  done = $state(0);

  #running = false;

  get pending(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  enqueue(videoId: string): void {
    if (this.queue.includes(videoId) || this.current === videoId) return;
    this.queue = [...this.queue, videoId];
    void this.#pump();
  }

  async #pump(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue[0]!;
        this.queue = this.queue.slice(1);
        this.current = id;
        try {
          await this.#analyzeOne(id);
        } catch {
          // fichier illisible/permission refusée : on passe au suivant
        }
        this.done += 1;
        this.current = null;
      }
    } finally {
      this.#running = false;
      this.current = null;
      this.done = 0;
    }
  }

  async #analyzeOne(videoId: string): Promise<void> {
    const existing = await loadWaveform(videoId);
    if (existing?.real && existing.bpm && existing.keyCamelot) return; // dossier complet
    const file = await getLocalFile(videoId);
    if (!file) return;
    const { pcm, sampleRate, durationS } = await decodeMono(file);
    const { data, envelopeRate } = computeEnvelope(pcm, sampleRate);
    const chroma = computeChroma(pcm, sampleRate);
    const { bpm: detection, key } = await analyze(data, envelopeRate, chroma);
    await saveWaveform({
      videoId,
      durationS,
      buckets: computeBuckets(pcm, sampleRate, durationS),
      real: true,
      cues: existing?.cues ?? [],
      bpm: detection && detection.confidence >= 0.12 ? detection.bpm : existing?.bpm ?? null,
      anchorS: detection && detection.confidence >= 0.12 ? detection.anchorS : existing?.anchorS ?? null,
      gridV: 2,
      loopInS: existing?.loopInS ?? null,
      loopOutS: existing?.loopOutS ?? null,
      keyCamelot: key?.camelot ?? existing?.keyCamelot ?? null,
      keyName: key?.name ?? existing?.keyName ?? null,
      autoGain: computeAutoGain(data),
      updatedAt: Date.now(),
    });
  }
}

export const localAnalysis = new LocalAnalysisQueue();
