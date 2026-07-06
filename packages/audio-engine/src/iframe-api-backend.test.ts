import { describe, expect, it, vi } from 'vitest';
import { IframeApiBackend, nearestRate } from './iframe-api-backend.js';
import type { PlayerFactory, YtPlayerHandle } from './iframe-api-backend.js';

function makeFakePlayer(): YtPlayerHandle & Record<string, ReturnType<typeof vi.fn>> {
  return {
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    getAvailablePlaybackRates: vi.fn(() => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]),
    getCurrentTime: vi.fn(() => 12.3),
    destroy: vi.fn(),
  };
}

function makeBackend() {
  const player = makeFakePlayer();
  let handlers: { onReady(): void; onStateChange(code: number): void } | null = null;
  const factory: PlayerFactory = {
    create: vi.fn((opts) => {
      handlers = opts;
      return player;
    }),
  };
  const backend = new IframeApiBackend(factory);
  return { backend, player, factory, fire: () => handlers! };
}

describe('nearestRate', () => {
  it('retourne le palier disponible le plus proche', () => {
    const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    expect(nearestRate(1.06, rates)).toBe(1);
    expect(nearestRate(1.2, rates)).toBe(1.25);
    expect(nearestRate(5, rates)).toBe(2);
  });
});

describe('IframeApiBackend', () => {
  it('déclare des capabilities dégradées (pas d’EQ, rate à paliers)', () => {
    const { backend } = makeBackend();
    expect(backend.capabilities).toEqual({ eq: false, continuousRate: false, tempoModes: false });
  });

  it('crée le player au premier load et résout quand il est prêt', async () => {
    const { backend, factory, fire } = makeBackend();
    const loading = backend.load('abc123');
    fire().onReady();
    await loading;
    expect(factory.create).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'abc123' }));
  });

  it('réutilise le player pour les chargements suivants', async () => {
    const { backend, player, factory, fire } = makeBackend();
    const p = backend.load('abc123');
    fire().onReady();
    await p;
    await backend.load('def456');
    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(player.loadVideoById).toHaveBeenCalledWith('def456');
  });

  it('délègue play/pause/seek au player', async () => {
    const { backend, player, fire } = makeBackend();
    const p = backend.load('abc');
    fire().onReady();
    await p;
    backend.play();
    backend.pause();
    backend.seekTo(30);
    expect(player.playVideo).toHaveBeenCalled();
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(30, true);
  });

  it('convertit le volume 0..1 vers l’échelle YouTube 0..100', async () => {
    const { backend, player, fire } = makeBackend();
    const p = backend.load('abc');
    fire().onReady();
    await p;
    backend.setVolume(0.5);
    expect(player.setVolume).toHaveBeenCalledWith(50);
  });

  it('snape le rate demandé au palier le plus proche et retourne le rate effectif', async () => {
    const { backend, player, fire } = makeBackend();
    const p = backend.load('abc');
    fire().onReady();
    await p;
    await expect(backend.setPlaybackRate(1.06)).resolves.toBe(1);
    expect(player.setPlaybackRate).toHaveBeenCalledWith(1);
  });

  it('refuse l’EQ et les modes tempo (non supportés sans extension)', () => {
    const { backend } = makeBackend();
    expect(backend.setEq('low', -12)).toBe(false);
    expect(backend.setTempoMode('vinyl')).toBe(false);
  });

  it('traduit les codes d’état YouTube en états métier', async () => {
    const { backend, fire } = makeBackend();
    const seen: string[] = [];
    backend.onStateChange((s) => seen.push(s));
    const p = backend.load('abc');
    fire().onReady();
    await p;
    fire().onStateChange(1);
    fire().onStateChange(2);
    fire().onStateChange(0);
    expect(seen).toEqual(['playing', 'paused', 'ended']);
  });
});
