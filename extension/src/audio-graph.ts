import { EQ_BANDS } from '@youtubator/audio-engine';
import type { EqBand } from '@youtubator/audio-engine';
import type { EqGraph } from './frame-agent.js';

/**
 * Graphe Web Audio réel, construit sur le <video> de la frame :
 * captureStream → low-shelf → peaking → high-shelf → gain → analyser → destination.
 * Couche mince volontairement non testée unitairement (adaptateur I/O).
 */
export function createEqGraph(video: HTMLVideoElement): EqGraph {
  const ctx = new AudioContext();
  const stream = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  const source = ctx.createMediaStreamSource(stream);

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

  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  node.connect(gain);
  gain.connect(analyser);
  analyser.connect(ctx.destination);

  const buffer = new Uint8Array(analyser.frequencyBinCount);

  return {
    setBandGain(band, gainDb) {
      filters[band].gain.setTargetAtTime(gainDb, ctx.currentTime, 0.02);
    },
    setGain(v) {
      gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
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
  };
}
