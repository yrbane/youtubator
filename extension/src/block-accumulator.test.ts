import { describe, expect, it } from 'vitest';
import { BlockAccumulator } from './block-accumulator.js';

function quantum(value: number, n = 128): Float32Array {
  return new Float32Array(n).fill(value);
}

describe('BlockAccumulator — quanta de 128 → blocs de 1024 + énergie', () => {
  it('émet un bloc complet après 8 quanta', () => {
    const acc = new BlockAccumulator(1024);
    const blocks: Array<{ l: Float32Array; r: Float32Array; energy: number }> = [];
    for (let i = 0; i < 8; i++) {
      const out = acc.push(quantum(0.5), quantum(-0.5));
      if (out) blocks.push(out);
    }
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.l.length).toBe(1024);
    expect(blocks[0]!.l[0]).toBe(0.5);
    expect(blocks[0]!.r[512]).toBe(-0.5);
    expect(blocks[0]!.energy).toBeCloseTo(0.5, 5); // RMS d'un signal constant 0,5
  });

  it('rien avant le remplissage, et chaque bloc est un buffer neuf (transférable)', () => {
    const acc = new BlockAccumulator(1024);
    expect(acc.push(quantum(1), quantum(1))).toBeNull();
    const blocks: Float32Array[] = [];
    for (let i = 0; i < 16; i++) {
      const out = acc.push(quantum(1), quantum(1));
      if (out) blocks.push(out.l);
    }
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).not.toBe(blocks[1]); // pas de réutilisation après transfert
  });

  it('gère un quantum plus court (fin de flux) sans déborder', () => {
    const acc = new BlockAccumulator(256);
    acc.push(quantum(0.1), quantum(0.1));
    const out = acc.push(quantum(0.1), quantum(0.1));
    expect(out).not.toBeNull();
    expect(out!.energy).toBeCloseTo(0.1, 5);
  });
});
