import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mixer } from './mixer.svelte.js';

describe('Mixer — cycle de vie du ticker de phase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('destroy() arrête le setInterval de verrouillage de phase', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const mixer = new Mixer();

    mixer.destroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
