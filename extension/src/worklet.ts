import { BlockAccumulator } from './block-accumulator.js';

/**
 * Processor du tap de capture : tourne sur le thread audio temps réel.
 * Accumule les quanta en blocs de 1024 et les poste (transférés, zéro copie)
 * au thread principal qui tient le ring buffer.
 */

declare const AudioWorkletProcessor: {
  new (): { port: MessagePort };
  prototype: { port: MessagePort };
};
declare function registerProcessor(name: string, ctor: unknown): void;
/** Horloge du contexte audio, disponible dans la portée du worklet. */
declare const currentTime: number;

const BLOCK = 1024;

class TapProcessor extends AudioWorkletProcessor {
  /** Buffers renvoyés par le main thread après copie : zéro GC en régime permanent. */
  #freelist: Array<{ l: Float32Array; r: Float32Array }> = [];
  #acc = new BlockAccumulator(BLOCK, () => this.#freelist.pop() ?? null);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ recycle?: [ArrayBuffer, ArrayBuffer] }>) => {
      const pair = e.data?.recycle;
      if (pair && this.#freelist.length < 8) {
        this.#freelist.push({ l: new Float32Array(pair[0]), r: new Float32Array(pair[1]) });
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const l = input[0];
    const r = input[1] ?? input[0];
    const block = this.#acc.push(l, r);
    if (block) {
      // t : horloge audio à l'émission — le main thread s'en sert pour
      // corriger la latence de livraison du message (calage de la grille)
      this.port.postMessage(
        { l: block.l.buffer, r: block.r.buffer, energy: block.energy, t: currentTime },
        [block.l.buffer, block.r.buffer],
      );
    }
    return true;
  }
}

registerProcessor('youtubator-tap', TapProcessor);
