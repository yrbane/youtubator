import { lastContiguousStart } from './contiguous.js';

/** Taille d'un bloc de capture (échantillons). */
export const BLOCK = 1024;
/** Durée du ring buffer PCM (mémoire ~16 Mo stéréo à 44,1 kHz). */
const RING_S = 48;

export interface CaptureRing {
  /** Enveloppe du dernier segment continu (null si trop tôt). */
  getEnvelope(): { rate: number; data: number[]; endTimeS: number; mode: 'worklet' | 'script' } | null;
  /** Index absolu du bloc le plus proche d'un temps vidéo. */
  findBlock(videoTimeS: number): number | null;
  /** Région PCM [inBlock, outBlock) recopiée du ring (canaux séparés). */
  copyRegion(inBlock: number, outBlock: number): { l: Float32Array; r: Float32Array };
  blockCount(): number;
  readonly ringBlocks: number;
}

/**
 * Ring de capture PCM + enveloppe + correspondance bloc → temps vidéo.
 * AudioWorklet (thread audio temps réel, buffers recyclés) avec repli
 * ScriptProcessor. L'horloge audio d'émission voyage avec chaque bloc pour
 * un horodatage vidéo précis (calage de la grille de beats).
 */
export function createCaptureRing(
  ctx: AudioContext,
  source: AudioNode,
  video: HTMLVideoElement,
): CaptureRing {
  const sr = ctx.sampleRate;
  const ringBlocks = Math.ceil((RING_S * sr) / BLOCK);
  const ringL = new Float32Array(ringBlocks * BLOCK);
  const ringR = new Float32Array(ringBlocks * BLOCK);
  const blockVideoTime = new Float64Array(ringBlocks).fill(-1);
  const blockEnergy = new Float32Array(ringBlocks);
  let blockCount = 0;
  let captureMode: 'worklet' | 'script' = 'script';

  function writeBlock(l: Float32Array, r: Float32Array, energy: number, emittedAtCtxTime?: number): void {
    if (video.paused) return; // on ne capture que la lecture réelle
    const slot = blockCount % ringBlocks;
    ringL.set(l, slot * BLOCK);
    ringR.set(r, slot * BLOCK);
    blockEnergy[slot] = energy;
    const lag = emittedAtCtxTime !== undefined ? Math.max(0, ctx.currentTime - emittedAtCtxTime) : 0;
    blockVideoTime[slot] = video.currentTime - lag * (video.playbackRate || 1);
    blockCount++;
  }

  const sink = ctx.createGain();
  sink.gain.value = 0; // le tap doit être relié à la destination pour tourner
  sink.connect(ctx.destination);

  void (async () => {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const runtime = (globalThis as any).chrome?.runtime ?? (globalThis as any).browser?.runtime;
      await ctx.audioWorklet.addModule(runtime.getURL('worklet.js'));
      const tap = new AudioWorkletNode(ctx, 'youtubator-tap', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      tap.port.onmessage = (e: MessageEvent<{ l: ArrayBuffer; r: ArrayBuffer; energy: number; t: number }>) => {
        writeBlock(new Float32Array(e.data.l), new Float32Array(e.data.r), e.data.energy, e.data.t);
        // renvoie les buffers au worklet pour réutilisation (zéro GC audio)
        tap.port.postMessage({ recycle: [e.data.l, e.data.r] }, [e.data.l, e.data.r]);
      };
      source.connect(tap);
      tap.connect(sink);
      captureMode = 'worklet';
    } catch {
      // repli : ScriptProcessor (main thread) si le worklet est indisponible
      const tap = ctx.createScriptProcessor(BLOCK, 2, 1);
      source.connect(tap);
      tap.connect(sink);
      tap.onaudioprocess = (e) => {
        const inL = e.inputBuffer.getChannelData(0);
        const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
        let sum = 0;
        for (let i = 0; i < inL.length; i++) sum += inL[i]! * inL[i]!;
        writeBlock(inL, inR, Math.sqrt(sum / inL.length));
      };
    }
  })();

  return {
    ringBlocks,
    blockCount: () => blockCount,

    getEnvelope() {
      const available = Math.min(blockCount, ringBlocks);
      if (available < 64) return null;
      // seul le dernier segment continu est exploitable : un seek ou une
      // pause casse la correspondance enveloppe ↔ temps (grille de beats)
      const times = new Array<number>(available);
      for (let k = 0; k < available; k++) {
        times[k] = blockVideoTime[(blockCount - available + k) % ringBlocks]!;
      }
      const start = lastContiguousStart(times);
      const usable = available - start;
      if (usable < 64) return null;
      const data = new Array<number>(usable);
      for (let k = 0; k < usable; k++) {
        data[k] = blockEnergy[(blockCount - usable + k) % ringBlocks]!;
      }
      const newest = blockVideoTime[(blockCount - 1) % ringBlocks]!;
      return { rate: sr / BLOCK, data, endTimeS: newest, mode: captureMode };
    },

    findBlock(videoTimeS) {
      const available = Math.min(blockCount, ringBlocks);
      let best: number | null = null;
      let bestDist = Infinity;
      for (let k = 1; k <= available; k++) {
        const abs = blockCount - k;
        const t = blockVideoTime[abs % ringBlocks]!;
        if (t < 0) continue;
        const d = Math.abs(t - videoTimeS);
        if (d < bestDist) {
          bestDist = d;
          best = abs;
        } else if (t < videoTimeS - 2) {
          break; // on s'éloigne dans le passé
        }
      }
      return best !== null && bestDist < 0.5 ? best : null;
    },

    copyRegion(inBlock, outBlock) {
      const nSamples = (outBlock - inBlock) * BLOCK;
      const l = new Float32Array(nSamples);
      const r = new Float32Array(nSamples);
      for (let b = 0; b < outBlock - inBlock; b++) {
        const slot = (inBlock + b) % ringBlocks;
        l.set(ringL.subarray(slot * BLOCK, (slot + 1) * BLOCK), b * BLOCK);
        r.set(ringR.subarray(slot * BLOCK, (slot + 1) * BLOCK), b * BLOCK);
      }
      return { l, r };
    },
  };
}
