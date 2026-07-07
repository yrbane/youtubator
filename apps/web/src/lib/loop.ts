/** Boucle manuelle IN/OUT d'un deck (fonctions pures). */
export interface LoopState {
  inS: number | null;
  outS: number | null;
  active: boolean;
}

export function emptyLoop(): LoopState {
  return { inS: null, outS: null, active: false };
}

/** Pose le point d'entrée (invalide une sortie antérieure ou égale). */
export function pressIn(loop: LoopState, timeS: number): LoopState {
  return { inS: timeS, outS: null, active: false };
}

/** Pose la sortie et active la boucle (ignoré sans IN ou si OUT ≤ IN). */
export function pressOut(loop: LoopState, timeS: number): LoopState {
  if (loop.inS === null || timeS <= loop.inS) return loop;
  return { inS: loop.inS, outS: timeS, active: true };
}

/** Coupe / relance (reloop) la boucle en gardant les points. */
export function toggleActive(loop: LoopState): LoopState {
  if (loop.inS === null || loop.outS === null) return loop;
  return { ...loop, active: !loop.active };
}

/**
 * Position fantôme (loop roll) : là où serait la lecture si la boucle
 * n'avait jamais été engagée.
 */
export function ghostPosition(engagedAtS: number, elapsedWallS: number, rate: number): number {
  return engagedAtS + elapsedWallS * rate;
}

/**
 * Redimensionne la boucle (÷2 / ×2 façon Traktor) : IN reste fixe, OUT bouge.
 * Inchangée si incomplète ou si la nouvelle longueur sort de [minLenS, maxLenS].
 */
export function resizeLoop(loop: LoopState, factor: number, minLenS = 0.05, maxLenS = 64): LoopState {
  if (loop.inS === null || loop.outS === null) return loop;
  const length = (loop.outS - loop.inS) * factor;
  if (length < minLenS || length > maxLenS) return loop;
  return { ...loop, outS: loop.inS + length };
}

/** Position de re-saut si la tête de lecture a franchi la sortie. */
export function shouldJump(loop: LoopState, timeS: number): number | null {
  if (!loop.active || loop.inS === null || loop.outS === null) return null;
  return timeS >= loop.outS ? loop.inS : null;
}
