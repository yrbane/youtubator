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

/**
 * Beats restants avant la prochaine frontière de phrase (16 beats par défaut,
 * phrases ancrées sur la grille) : 16 pile sur une frontière, puis 15…1.
 */
export function beatsToPhrase(grid: BeatGrid, timeS: number, phraseBeats = 16): number {
  const p = periodS(grid);
  let beatsIn = ((timeS - grid.anchorS) / p) % phraseBeats;
  if (beatsIn < 0) beatsIn += phraseBeats;
  // le modulo final absorbe le cas « juste sous la frontière » que l'epsilon arrondit à la phrase pleine
  return phraseBeats - (Math.floor(beatsIn + 1e-9) % phraseBeats);
}

/**
 * Tap tempo : BPM depuis les horodatages (ms) des taps — moyenne des
 * intervalles des 8 derniers, null si < 3 taps ou hors plage 40–250.
 */
export function tapTempo(tapsMs: readonly number[]): number | null {
  const taps = tapsMs.slice(-8);
  if (taps.length < 3) return null;
  let sum = 0;
  for (let i = 1; i < taps.length; i++) sum += taps[i]! - taps[i - 1]!;
  const meanMs = sum / (taps.length - 1);
  const bpm = 60000 / meanMs;
  return bpm >= 40 && bpm <= 250 ? bpm : null;
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
 * PLL serrée façon Traktor : zone morte de ±2 ms (aucun tremblement une fois
 * calé), puis correction proportionnelle visant ~1 s de convergence,
 * bornée à ±2 % (inaudible, surtout en Master Tempo).
 */
export function pllBend(deltaS: number, deadbandS = 0.002): number {
  if (Math.abs(deltaS) <= deadbandS) return 0;
  return Math.min(MAX_PHASE_BEND, Math.max(-MAX_PHASE_BEND, deltaS));
}

/** Flux de nouveauté (attaques) : dérivée positive, centrée. */
function noveltyOf(envelope: Float32Array): Float32Array | null {
  const n = envelope.length;
  const novelty = new Float32Array(n);
  for (let i = 1; i < n; i++) novelty[i] = Math.max(0, envelope[i]! - envelope[i - 1]!);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += novelty[i]!;
  mean /= n;
  if (mean < 1e-6) return null;
  for (let i = 0; i < n; i++) novelty[i]! -= mean;
  return novelty;
}

/** Offset (échantillons, sub-échantillon) du peigne qui capte le plus d'attaques. */
function combOffset(novelty: Float32Array, from: number, to: number, periodSamples: number): number {
  const steps = Math.max(32, Math.ceil(periodSamples * 4)); // résolution ≤ P/32
  let best = 0;
  let bestSum = -Infinity;
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * periodSamples;
    let sum = 0;
    for (let t = from + offset; t < to; t += periodSamples) sum += novelty[Math.round(t)] ?? 0;
    if (sum > bestSum) {
      bestSum = sum;
      best = offset;
    }
  }
  return best;
}

/**
 * Affinage du BPM par dérive de phase : le peigne est calé indépendamment
 * sur chaque moitié de l'enveloppe ; le glissement d'offset entre les deux
 * donne la correction de période (précision ~±0,05 BPM, indispensable pour
 * que la grille ne dérive pas loin du point de détection).
 */
export function refineBpm(
  envelope: Float32Array,
  envelopeRate: number,
  roughBpm: number,
): { bpm: number; anchorS: number } | null {
  const novelty = noveltyOf(envelope);
  if (!novelty) return null;
  const n = novelty.length;
  const period = (60 / roughBpm) * envelopeRate;
  if (n < period * 8) return null;

  const half = Math.floor(n / 2);
  const periodsSpanned = Math.round(half / period);
  if (periodsSpanned < 4) return null;

  // itératif : chaque passe réduit la dérive résiduelle, le peigne se
  // resserre et l'estimation de phase gagne en précision
  let refinedPeriod = period;
  for (let pass = 0; pass < 3; pass++) {
    const o1 = combOffset(novelty, 0, half, refinedPeriod);
    const o2 = combOffset(novelty, half, n, refinedPeriod); // offset relatif à `half`
    // offset attendu de la moitié 2 si la période était exacte
    const expected = (((o1 - half) % refinedPeriod) + refinedPeriod) % refinedPeriod;
    let drift = o2 - expected;
    if (drift > refinedPeriod / 2) drift -= refinedPeriod;
    if (drift < -refinedPeriod / 2) drift += refinedPeriod;
    refinedPeriod += drift / Math.round(half / refinedPeriod);
    if (Math.abs(drift) < 0.02) break; // convergé
  }

  const anchor = combOffset(novelty, 0, n, refinedPeriod);
  return { bpm: (60 * envelopeRate) / refinedPeriod, anchorS: anchor / envelopeRate };
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

  // autocorrélation en une passe sur une plage étendue : elle couvre à la
  // fois les candidats 60..180 BPM et leurs lags ×2/3 (pénalité sesquialtère)
  const lagMin = Math.floor((envelopeRate * 60) / BPM_MAX);
  const lagMax = Math.min(Math.ceil((envelopeRate * 60) / BPM_MIN), Math.floor(n / 2));
  const lagLow = Math.max(2, Math.floor((lagMin * 2) / 3));
  const scores = new Float32Array(lagMax + 1);
  for (let lag = lagLow; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += novelty[i]! * novelty[i - lag]!;
    scores[lag] = s / (n - lag);
  }
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    // bonus harmonique : le double du lag doit corréler (anti-octave)
    const harmonic = lag * 2 <= lagMax ? 0.4 * scores[lag * 2]! : 0;
    // pénalité sesquialtère : si lag×2/3 corrèle fort, ce candidat est
    // l'erreur 3:2 d'un groove syncopé (le vrai beat est à 2/3 de ce lag)
    const sesquialtera = 0.6 * Math.max(0, scores[Math.round((lag * 2) / 3)] ?? 0);
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

  // affinage par dérive de phase (précision de période) puis phase fine
  const refined = refineBpm(envelope, envelopeRate, bpm);
  if (refined) return { bpm: refined.bpm, anchorS: refined.anchorS, confidence };

  const period = (60 / bpm) * envelopeRate;
  const offset = combOffset(novelty, 0, n, period);
  return { bpm, anchorS: offset / envelopeRate, confidence };
}
