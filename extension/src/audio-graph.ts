import { EQ_BANDS } from '@youtubator/audio-engine';
import type { EqBand } from '@youtubator/audio-engine';
import { createCaptureRing } from './capture.js';
import { createLoopPlayer } from './loop-player.js';
import type { EqGraph } from './frame-agent.js';

/**
 * Graphe Web Audio réel, construit sur le <video> de la frame :
 * MediaElementSource → EQ 3 bandes → filtre bipolaire → gain → analyser →
 * destination, avec dérivation delay. La capture (ring PCM, enveloppe,
 * chromagramme) et la lecture de boucle vivent dans capture.ts /
 * loop-player.ts. Couche mince volontairement non testée unitairement.
 */
export function createEqGraph(video: HTMLVideoElement): EqGraph {
  // 'playback' : buffer de sortie plus grand qu'en 'interactive' → bien plus
  // tolérant aux à-coups du système (anti-coupures ; on n'est pas un synthé,
  // quelques ms de latence supplémentaires sont invisibles ici)
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const source = ctx.createMediaElementSource(video);

  // --- chaîne EQ ---
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

  const vuBuffer = new Uint8Array(analyser.frequencyBinCount);

  // analyseur dédié au chromagramme (résolution fine, branché avant l'EQ)
  const chromaAnalyser = ctx.createAnalyser();
  chromaAnalyser.fftSize = 8192;
  source.connect(chromaAnalyser);
  const spectrum = new Float32Array(chromaAnalyser.frequencyBinCount);
  const chroma = new Float64Array(12);
  let chromaSamples = 0;

  // capture + boucle sample-accurate (la boucle rejoue à travers l'EQ)
  const capture = createCaptureRing(ctx, source, video);
  const loop = createLoopPlayer(ctx, capture, filters.low, video.playbackRate);

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
      analyser.getByteTimeDomainData(vuBuffer);
      let sum = 0;
      for (const b of vuBuffer) {
        const centered = (b - 128) / 128;
        sum += centered * centered;
      }
      return Math.min(1, Math.sqrt(sum / vuBuffer.length) * 2);
    },

    accumulateChroma() {
      chromaAnalyser.getFloatFrequencyData(spectrum);
      const binHz = ctx.sampleRate / chromaAnalyser.fftSize;
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

    getEnvelope: () => capture.getEnvelope(),
    engageLoop: (inS, outS) => loop.engage(inS, outS),
    exitLoop: () => loop.exit(),
    setLoopRate: (rate) => loop.setRate(rate),

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
