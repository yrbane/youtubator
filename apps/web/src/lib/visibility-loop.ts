/**
 * Boucle requestAnimationFrame qui se met en veille douce (poll 500 ms) quand
 * l'onglet est caché plutôt que de tourner à 60/s pour rien. Extrait de
 * WaveformStrip pour être testable sans monter de composant.
 */
export function startVisibilityAwareLoop(tick: () => void, hiddenDelayMs = 500): () => void {
  let raf = 0;
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  const loop = (): void => {
    if (document.hidden) {
      hiddenTimer = setTimeout(() => {
        hiddenTimer = undefined;
        raf = requestAnimationFrame(loop);
      }, hiddenDelayMs);
      return;
    }
    tick();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    if (hiddenTimer !== undefined) clearTimeout(hiddenTimer);
  };
}
