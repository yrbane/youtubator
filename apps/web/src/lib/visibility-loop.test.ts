import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startVisibilityAwareLoop } from './visibility-loop.js';

describe('startVisibilityAwareLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it("n'arme plus de frame après stop(), même arrêtée pendant la veille (onglet caché)", () => {
    const tick = vi.fn();
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

    const stop = startVisibilityAwareLoop(tick, 500);
    // 1re frame : voit l'onglet caché, arme le setTimeout de veille (500 ms)
    vi.advanceTimersByTime(20);
    const callsBeforeStop = rafSpy.mock.calls.length;

    // arrêt pendant la fenêtre de veille : le setTimeout est toujours en vol
    stop();
    // laisse le setTimeout de veille (500 ms) avoir l'occasion de se déclencher
    vi.advanceTimersByTime(1000);

    expect(rafSpy.mock.calls.length).toBe(callsBeforeStop);
    expect(tick).not.toHaveBeenCalled();
  });
});
