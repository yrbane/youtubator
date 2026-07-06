import { EQ_BANDS } from '@youtubator/audio-engine';
import type { EqBand } from '@youtubator/audio-engine';
import { lastContiguousStart } from './contiguous.js';
import type { EqGraph } from './frame-agent.js';

/** Durée du ring buffer PCM (mémoire ~16 Mo stéréo à 44,1 kHz). */
const RING_S = 48;
const BLOCK = 1024;

/**
 * Graphe Web Audio réel, construit sur le <video> de la frame :
 * MediaElementSource → low-shelf → peaking → high-shelf → gain → analyser → destination.
 * Un ScriptProcessor en dérivation du source alimente :
 *  - un ring buffer PCM stéréo (boucles sample-accurate) ;
 *  - une enveloppe d'énergie par bloc (détection de BPM côté page) ;
 *  - la correspondance bloc → temps vidéo (localisation des régions).
 * Couche mince volontairement non testée unitairement (adaptateur I/O).
 */
export function createEqGraph(video: HTMLVideoElement): EqGraph {
  // 'playback' : buffer de sortie plus grand qu'en 'interactive' → bien plus
  // tolérant aux à-coups du système (anti-coupures ; on n'est pas un synthé,
  // quelques ms de latence supplémentaires sont invisibles ici)
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const source = ctx.createMediaElementSource(video);

  const filters = {} as Record<EqBand, BiquadFilterNode>;
  let node: AudioNode = source;
  for (const band of ['low', 'mid', 'high'] as const) {
    const spec = EQ_BANDS[band];
    const filter = ctx.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.frequency;
    if (spec.q !== undefined) filter.Q.value = spec.q;
    filter.gain.value = 0;
    node.connect(filter);
    node = filter;
    filters[band] = filter;
  }

  // filtre bipolaire LP/HP — neutre = peaking gain 0 (réponse plate)
  const bipolarFilter = ctx.createBiquadFilter();
  bipolarFilter.type = 'peaking';
  bipolarFilter.gain.value = 0;
  bipolarFilter.frequency.value = 1000;
  node.connect(bipolarFilter);

  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  bipolarFilter.connect(gain);
  gain.connect(analyser);
  analyser.connect(ctx.destination);

  // delay synchronisé au BPM : dérivation post-filtre, réinjection avec feedback
  const delayNode = ctx.createDelay(2);
  const delayFeedback = ctx.createGain();
  const delayWet = ctx.createGain();
  delayFeedback.gain.value = 0.45;
  delayWet.gain.value = 0;
  bipolarFilter.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayWet);
  delayWet.connect(gain);

  const buffer = new Uint8Array(analyser.frequencyBinCount);

  // analyseur dédié au chromagramme (résolution fine, branché avant l'EQ)
  const chromaAnalyser = ctx.createAnalyser();
  chromaAnalyser.fftSize = 8192;
  source.connect(chromaAnalyser);
  const spectrum = new Float32Array(chromaAnalyser.frequencyBinCount);
  const chroma = new Float64Array(12);
  let chromaSamples = 0;

  // --- ring PCM + enveloppe + temps vidéo par bloc ---
  const sr = ctx.sampleRate;
  const ringBlocks = Math.ceil((RING_S * sr) / BLOCK);
  const ringL = new Float32Array(ringBlocks * BLOCK);
  const ringR = new Float32Array(ringBlocks * BLOCK);
  const blockVideoTime = new Float64Array(ringBlocks).fill(-1);
  const blockEnergy = new Float32Array(ringBlocks);
  let blockCount = 0; // compteur absolu de blocs écrits

  /**
   * Écrit un bloc capturé dans le ring. `emittedAtCtxTime` (horloge audio à
   * l'émission worklet) corrige la latence de livraison du message pour un
   * horodatage vidéo précis (calage de la grille de beats).
   */
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

  // capture : AudioWorklet (thread audio temps réel) avec repli ScriptProcessor
  let captureMode: 'worklet' | 'script' = 'script';
  const sink = ctx.createGain();
  sink.gain.value = 0; // le tap doit être connecté à la destination pour tourner
  sink.connect(ctx.destination);

  void (async () => {
    try {
      const runtime = (globalThis as any).chrome?.runtime ?? (globalThis as any).browser?.runtime;
      const workletUrl: string = runtime.getURL('worklet.js');
      await ctx.audioWorklet.addModule(workletUrl);
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

  /** Index absolu du bloc le plus proche d'un temps vidéo (recherche arrière). */
  function findBlock(videoTimeS: number): number | null {
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
  }

  // --- boucle sample-accurate ---
  let loopSource: AudioBufferSourceNode | null = null;
  let loopStartCtx = 0;
  let loopInS = 0;
  let loopMediaSpan = 0;
  let loopBufferDur = 0;
  let currentRate = video.playbackRate;
  let captureRate = currentRate;

  return {
    setBandGain(band, gainDb) {
      filters[band].gain.setTargetAtTime(gainDb, ctx.currentTime, 0.02);
    },
    setGain(v) {
      gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    resume() {
      if (ctx.state === 'suspended') void ctx.resume();
    },
    isRunning() {
      return ctx.state === 'running';
    },
    getLevel() {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const b of buffer) {
        const centered = (b - 128) / 128;
        sum += centered * centered;
      }
      return Math.min(1, Math.sqrt(sum / buffer.length) * 2);
    },

    accumulateChroma() {
      chromaAnalyser.getFloatFrequencyData(spectrum);
      const binHz = sr / chromaAnalyser.fftSize;
      for (let k = 1; k < spectrum.length; k++) {
        const f = k * binHz;
        if (f < 60 || f > 5000) continue;
        const mag = Math.pow(10, spectrum[k]! / 20);
        if (!Number.isFinite(mag) || mag <= 0) continue;
        const midi = Math.round(12 * Math.log2(f / 440) + 69);
        chroma[((midi % 12) + 12) % 12] += mag;
      }
      chromaSamples++;
    },

    getChroma() {
      if (chromaSamples < 30) return null; // ~3 s minimum d'accumulation
      const max = Math.max(...chroma);
      if (max <= 0) return null;
      return { bins: [...chroma].map((v) => v / max), samples: chromaSamples };
    },

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

    engageLoop(inS, outS) {
      const inBlock = findBlock(inS);
      const outBlock = findBlock(outS);
      if (inBlock === null || outBlock === null || outBlock <= inBlock) return false;
      if (blockCount - inBlock > ringBlocks) return false; // sorti du ring
      const nSamples = (outBlock - inBlock) * BLOCK;
      const audio = ctx.createBuffer(2, nSamples, sr);
      const outL = audio.getChannelData(0);
      const outR = audio.getChannelData(1);
      for (let b = 0; b < outBlock - inBlock; b++) {
        const slot = (inBlock + b) % ringBlocks;
        outL.set(ringL.subarray(slot * BLOCK, (slot + 1) * BLOCK), b * BLOCK);
        outR.set(ringR.subarray(slot * BLOCK, (slot + 1) * BLOCK), b * BLOCK);
      }
      this.exitLoop(); // remplace une éventuelle boucle en cours
      captureRate = currentRate || 1;
      loopSource = ctx.createBufferSource();
      loopSource.buffer = audio;
      loopSource.loop = true;
      // le buffer a été capturé au rate courant : on rejoue à l'identique
      loopSource.playbackRate.value = 1;
      loopSource.connect(filters.low);
      loopSource.start();
      loopStartCtx = ctx.currentTime;
      loopInS = inS;
      loopMediaSpan = outS - inS;
      loopBufferDur = audio.duration;
      return true;
    },

    exitLoop() {
      if (!loopSource) return null;
      const elapsed = (ctx.currentTime - loopStartCtx) * loopSource.playbackRate.value;
      loopSource.stop();
      loopSource.disconnect();
      loopSource = null;
      const posInBuffer = loopBufferDur > 0 ? elapsed % loopBufferDur : 0;
      return loopInS + (posInBuffer / loopBufferDur) * loopMediaSpan;
    },

    setLoopRate(rate) {
      currentRate = rate;
      if (loopSource && captureRate > 0) loopSource.playbackRate.value = rate / captureRate;
    },

    setDelay(timeS, wet, feedback) {
      delayNode.delayTime.setTargetAtTime(Math.min(2, Math.max(0.01, timeS)), ctx.currentTime, 0.05);
      delayWet.gain.setTargetAtTime(Math.min(1, Math.max(0, wet)), ctx.currentTime, 0.05);
      delayFeedback.gain.setTargetAtTime(Math.min(0.9, Math.max(0, feedback)), ctx.currentTime, 0.05);
    },

    setFilter(setting) {
      if (setting === null) {
        bipolarFilter.type = 'peaking';
        bipolarFilter.gain.value = 0;
        bipolarFilter.frequency.value = 1000;
      } else {
        bipolarFilter.type = setting.type;
        bipolarFilter.Q.value = 1.1; // légère résonance, façon filtre DJ
        bipolarFilter.frequency.setTargetAtTime(setting.frequency, ctx.currentTime, 0.02);
      }
    },
  };
}
