/**
 * Accumule les quanta audio (128 échantillons) en blocs de taille fixe,
 * avec calcul d'énergie RMS. Les buffers émis sont neufs à chaque bloc :
 * ils peuvent être transférés (postMessage) sans copie.
 */
export class BlockAccumulator {
  #size: number;
  #l: Float32Array;
  #r: Float32Array;
  #filled = 0;
  #sumSquares = 0;
  #acquire: (() => { l: Float32Array; r: Float32Array } | null) | null;

  /**
   * `acquire` (optionnel) fournit des buffers recyclés — sur le thread
   * audio, allouer à chaque bloc provoque des passages de GC (coupures).
   */
  constructor(blockSize: number, acquire?: () => { l: Float32Array; r: Float32Array } | null) {
    this.#size = blockSize;
    this.#l = new Float32Array(blockSize);
    this.#r = new Float32Array(blockSize);
    this.#acquire = acquire ?? null;
  }

  push(left: Float32Array, right: Float32Array): { l: Float32Array; r: Float32Array; energy: number } | null {
    const n = Math.min(left.length, this.#size - this.#filled);
    this.#l.set(left.subarray(0, n), this.#filled);
    this.#r.set(right.subarray(0, n), this.#filled);
    for (let i = 0; i < n; i++) this.#sumSquares += left[i]! * left[i]!;
    this.#filled += n;
    if (this.#filled < this.#size) return null;

    const block = {
      l: this.#l,
      r: this.#r,
      energy: Math.sqrt(this.#sumSquares / this.#size),
    };
    // buffers suivants : recyclés si possible, neufs sinon (transfert en cours)
    const next = this.#acquire?.() ?? null;
    this.#l = next?.l ?? new Float32Array(this.#size);
    this.#r = next?.r ?? new Float32Array(this.#size);
    this.#filled = 0;
    this.#sumSquares = 0;
    // reste du quantum (si le bloc s'est rempli en cours de route)
    if (n < left.length) this.push(left.subarray(n), right.subarray(n));
    return block;
  }
}
