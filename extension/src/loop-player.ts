import { BLOCK, type CaptureRing } from './capture.js';

export interface LoopPlayer {
  /** Joue [inS, outS] en boucle sample-accurate depuis le ring. */
  engage(inS: number, outS: number): boolean;
  /** Arrête ; retourne la position vidéo de reprise (null si inactif). */
  exit(): number | null;
  /** Aligne la vitesse de la boucle sur celle de la vidéo. */
  setRate(rate: number): void;
}

/**
 * Lecteur de boucle sample-accurate : extrait la région du ring de capture
 * en AudioBuffer et la joue en boucle native (zéro seek YouTube), à travers
 * la chaîne d'effets (`output`).
 */
export function createLoopPlayer(
  ctx: AudioContext,
  capture: CaptureRing,
  output: AudioNode,
  initialRate: number,
): LoopPlayer {
  let source: AudioBufferSourceNode | null = null;
  let startCtx = 0;
  let loopInS = 0;
  let mediaSpan = 0;
  let bufferDur = 0;
  let currentRate = initialRate;
  let captureRate = initialRate;

  return {
    engage(inS, outS) {
      const inBlock = capture.findBlock(inS);
      const outBlock = capture.findBlock(outS);
      if (inBlock === null || outBlock === null || outBlock <= inBlock) return false;
      if (capture.blockCount() - inBlock > capture.ringBlocks) return false; // sorti du ring
      const { l, r } = capture.copyRegion(inBlock, outBlock);
      const audio = ctx.createBuffer(2, l.length, ctx.sampleRate);
      audio.getChannelData(0).set(l);
      audio.getChannelData(1).set(r);

      this.exit(); // remplace une éventuelle boucle en cours
      captureRate = currentRate || 1;
      source = ctx.createBufferSource();
      source.buffer = audio;
      source.loop = true;
      source.playbackRate.value = 1; // capturé au rate courant : rejoué à l'identique
      source.connect(output);
      source.start();
      startCtx = ctx.currentTime;
      loopInS = inS;
      mediaSpan = outS - inS;
      bufferDur = audio.duration;
      return true;
    },

    exit() {
      if (!source) return null;
      const elapsed = (ctx.currentTime - startCtx) * source.playbackRate.value;
      source.stop();
      source.disconnect();
      source = null;
      const posInBuffer = bufferDur > 0 ? elapsed % bufferDur : 0;
      return loopInS + (posInBuffer / bufferDur) * mediaSpan;
    },

    setRate(rate) {
      currentRate = rate;
      if (source && captureRate > 0) source.playbackRate.value = rate / captureRate;
    },
  };
}

export { BLOCK };
