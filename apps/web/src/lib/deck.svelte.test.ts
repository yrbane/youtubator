import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Track } from './tracks.js';

vi.mock('./library.js', () => ({
  loadWaveform: vi.fn(async () => undefined),
  saveWaveform: vi.fn(async () => undefined),
}));

vi.mock('./local-backend.js', () => {
  class LocalFileBackend {
    capabilities = { eq: true, continuousRate: true, tempoModes: true };
    #stateCb: ((s: string) => void) | null = null;
    onStateChange(cb: (s: string) => void) {
      this.#stateCb = cb;
      return () => {
        this.#stateCb = null;
      };
    }
    onTimeUpdate() {
      return () => {};
    }
    onMeter() {
      return () => {};
    }
    async load() {
      this.#stateCb?.('cued');
    }
    async decodeForAnalysis() {
      return null;
    }
    play() {}
    pause() {}
    seekTo() {}
    setVolume() {}
    async setPlaybackRate(rate: number) {
      return rate;
    }
    getAvailableRates() {
      return [1];
    }
    setEq() {
      return true;
    }
    setTempoMode() {
      return true;
    }
    destroy() {}
  }
  return { LocalFileBackend };
});

vi.mock('./yt-iframe.js', () => ({
  createPlayerFactory: () => ({ getIframe: () => null }),
}));

// Le vrai IframeApiBackend gère son propre timer interne (250 ms) : le mocker
// isole le test sur le seul ticker géré par Deck (#tickTimer), celui qui fuyait.
vi.mock('@youtubator/audio-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@youtubator/audio-engine')>();
  class FakeIframeApiBackend {
    capabilities = { eq: false, continuousRate: false, tempoModes: false };
    #stateCb: ((s: string) => void) | null = null;
    onStateChange(cb: (s: string) => void) {
      this.#stateCb = cb;
      return () => {
        this.#stateCb = null;
      };
    }
    onTimeUpdate() {
      return () => {};
    }
    async load() {
      this.#stateCb?.('cued');
    }
    play() {}
    pause() {}
    seekTo() {}
    setVolume() {}
    async setPlaybackRate(rate: number) {
      return rate;
    }
    getAvailableRates() {
      return [1];
    }
    setEq() {
      return false;
    }
    setTempoMode() {
      return false;
    }
    destroy() {}
  }
  return { ...actual, IframeApiBackend: FakeIframeApiBackend };
});

const { Deck } = await import('./deck.svelte.js');

function localTrack(id: string): Track {
  return { videoId: `file:${id}`, title: id, channel: '', durationS: 0, thumbnailUrl: '' };
}

function ytTrack(id: string): Track {
  return { videoId: id, title: id, channel: '', durationS: 0, thumbnailUrl: '' };
}

describe('Deck — nettoyage du ticker au changement de backend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne garde qu’un seul setInterval actif après plusieurs bascules local ↔ YouTube', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const deck = new Deck('a', 0);
    deck.attach(document.createElement('div'));

    await deck.loadTrack(localTrack('one'));
    await deck.loadTrack(ytTrack('two')); // bascule locale -> YouTube : doit clear l'ancien ticker
    await deck.loadTrack(localTrack('three')); // bascule YouTube -> locale : idem

    // 2 bascules de kind => 2 anciens tickers à nettoyer, en plus de tout clear initial à null.
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);

    deck.destroy();
    // destroy() nettoie le dernier ticker en cours : 3 clearInterval au total.
    expect(clearIntervalSpy).toHaveBeenCalledTimes(3);
  });
});
