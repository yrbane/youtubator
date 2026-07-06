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

const BLOCK = 1024;

class TapProcessor extends AudioWorkletProcessor {
  #acc = new BlockAccumulator(BLOCK);

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const l = input[0];
    const r = input[1] ?? input[0];
    const block = this.#acc.push(l, r);
    if (block) {
      this.port.postMessage(
        { l: block.l.buffer, r: block.r.buffer, energy: block.energy },
        [block.l.buffer, block.r.buffer],
      );
    }
    return true;
  }
}

registerProcessor('youtubator-tap', TapProcessor);
