/** Grille de beats d'un morceau : tempo + ancre temporelle d'un beat. */
export interface BeatGrid {
  bpm: number;
  /** Instant (secondes, temps vidéo) d'un beat de référence. */
  anchorS: number;
}

export interface BpmDetection {
  bpm: number;
  anchorS: number;
  /** 0..1 — rapport du pic d'autocorrélation à l'énergie moyenne. */
  confidence: number;
}

const BPM_MIN = 60;
const BPM_MAX = 180;

export function periodS(grid: BeatGrid): number {
  return 60 / grid.bpm;
}

/** Phase normalisée 0..1 dans le beat courant. */
export function beatPhase(grid: BeatGrid, timeS: number): number {
  const p = periodS(grid);
  const phase = ((timeS - grid.anchorS) / p) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Position normalisée 0..1 dans la mesure (4 beats par défaut). */
export function measurePhase(grid: BeatGrid, timeS: number, beatsPerMeasure = 4): number {
  const p = periodS(grid) * beatsPerMeasure;
  const phase = ((timeS - grid.anchorS) / p) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Index du beat courant dans la mesure (0..beatsPerMeasure-1). */
export function beatIndexInMeasure(grid: BeatGrid, timeS: number, beatsPerMeasure = 4): number {
  return Math.floor(measurePhase(grid, timeS, beatsPerMeasure) * beatsPerMeasure + 1e-9) % beatsPerMeasure;
}

/** Beat précédent ou égal à l'instant donné. */
export function floorBeat(grid: BeatGrid, timeS: number): number {
  const p = periodS(grid);
  return grid.anchorS + Math.floor((timeS - grid.anchorS) / p + 1e-9) * p;
}

/**
 * Bornes d'une boucle des N derniers beats : sortie calée sur le beat
 * courant (floor), entrée N périodes plus tôt. Null si le passé manque.
 */
export function beatLoopBounds(
  grid: BeatGrid,
  nowS: number,
  beats: number,
): { inS: number; outS: number } | null {
  const outS = floorBeat(grid, nowS);
  const inS = outS - beats * periodS(grid);
  if (inS < 0) return null;
  return { inS, outS };
}

/**
 * Décalage (secondes) à appliquer à l'esclave pour aligner sa phase de beat
 * sur celle du maître — le plus court chemin (avance ou retard).
 */
export function alignPhaseDelta(
  master: BeatGrid,
  masterTimeS: number,
  slave: BeatGrid,
  slaveTimeS: number,
): number {
  const target = beatPhase(master, masterTimeS);
  const current = beatPhase(slave, slaveTimeS);
  let diff = target - current; // en fractions de beat
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return diff * periodS(slave);
}

/** Bend maximal du verrouillage de phase (±2 % : inaudible). */
const MAX_PHASE_BEND = 0.02;

/**
 * Micro-ajustement de rate pour résorber un écart de phase sans seek
 * (façon PLL / pitch-bend DJ) : l'écart est corrigé sur ~2 s, borné à ±2 %.
 */
export function phaseBend(deltaS: number): number {
  return Math.min(MAX_PHASE_BEND, Math.max(-MAX_PHASE_BEND, deltaS / 2));
}

/**
 * Détection de BPM par autocorrélation de la nouveauté d'énergie
 * (flux d'attaques), puis recherche de phase par peigne. Pure et rapide :
 * pas besoin de WASM pour une enveloppe à ~50 Hz.
 */
export function detectBpm(envelope: Float32Array, envelopeRate: number): BpmDetection | null {
  const n = envelope.length;
  if (n < envelopeRate * 8) return null; // moins de 8 s : pas fiable

  // nouveauté : dérivée positive de l'énergie (attaques)
  const novelty = new Float32Array(n);
  for (let i = 1; i < n; i++) novelty[i] = Math.max(0, envelope[i]! - envelope[i - 1]!);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += novelty[i]!;
  mean /= n;
  if (mean < 1e-6) return null; // enveloppe plate
  for (let i = 0; i < n; i++) novelty[i]! -= mean;

  // autocorrélation sur la plage de lags correspondant à 60..180 BPM
  const lagMin = Math.floor((envelopeRate * 60) / BPM_MAX);
  const lagMax = Math.min(Math.ceil((envelopeRate * 60) / BPM_MIN), Math.floor(n / 2));
  let bestLag = 0;
  let bestScore = -Infinity;
  const scores = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += novelty[i]! * novelty[i - lag]!;
    scores[lag] = s / (n - lag);
  }
  const corrAt = (lag: number): number => {
    if (lag < 2 || lag >= n) return 0;
    let s = 0;
    for (let i = lag; i < n; i++) s += novelty[i]! * novelty[i - lag]!;
    return s / (n - lag);
  };
  for (let lag = lagMin; lag <= lagMax; lag++) {
    // bonus harmonique : le double du lag doit corréler (anti-octave)
    const harmonic = lag * 2 <= lagMax ? 0.4 * scores[lag * 2]! : 0;
    // pénalité sesquialtère : si lag×2/3 corrèle fort, ce candidat est
    // l'erreur 3:2 d'un groove syncopé (le vrai beat est à 2/3 de ce lag)
    const sesquialtera = 0.6 * Math.max(0, corrAt(Math.round((lag * 2) / 3)));
    const s = scores[lag]! + harmonic - sesquialtera;
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestScore <= 0) return null;

  // interpolation parabolique pour un lag sub-échantillon
  let lag = bestLag;
  const s0 = scores[bestLag - 1] ?? 0;
  const s1 = scores[bestLag]!;
  const s2 = scores[bestLag + 1] ?? 0;
  const denom = s0 - 2 * s1 + s2;
  if (Math.abs(denom) > 1e-12) {
    const delta = (0.5 * (s0 - s2)) / denom;
    if (Math.abs(delta) < 1) lag = bestLag + delta;
  }
  const bpm = (60 * envelopeRate) / lag;

  // confiance : contraste du pic vs énergie moyenne de l'autocorrélation
  let avg = 0;
  let count = 0;
  for (let l = lagMin; l <= lagMax; l++) {
    avg += Math.abs(scores[l]!);
    count++;
  }
  avg /= Math.max(1, count);
  const confidence = Math.min(1, avg > 0 ? s1 / (avg * 4) : 0);
  if (confidence < 0.1) return null;

  // phase : offset du peigne qui capte le plus de nouveauté
  const period = (60 / bpm) * envelopeRate; // en échantillons
  let bestOffset = 0;
  let bestComb = -Infinity;
  const steps = Math.max(8, Math.floor(period));
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * period;
    let sum = 0;
    for (let t = offset; t < n; t += period) sum += novelty[Math.round(t)] ?? 0;
    if (sum > bestComb) {
      bestComb = sum;
      bestOffset = offset;
    }
  }

  return { bpm, anchorS: bestOffset / envelopeRate, confidence };
}
