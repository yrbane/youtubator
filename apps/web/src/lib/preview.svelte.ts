import { loadYouTubeApi } from './yt-iframe.js';
import type { Track } from './tracks.js';

const PREVIEW_VOLUME = 60;

/**
 * Pré-écoute 🎧 depuis le browser : un lecteur YouTube caché, sans occuper
 * de deck. Démarre au tiers du morceau (le cœur du sujet, pas l'intro).
 * Sort sur la sortie audio principale — le routage casque séparé viendra
 * avec les permissions de périphériques de l'extension.
 */
class PreviewPlayer {
  /** videoId en cours de pré-écoute (null = silence). */
  current = $state<string | null>(null);
  #container: HTMLElement | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #player: any = null;

  attach(container: HTMLElement): void {
    this.#container = container;
  }

  async toggle(track: Track): Promise<void> {
    if (this.current === track.videoId) return this.stop();
    if (!this.#container) return;
    this.stop();
    this.current = track.videoId;
    const YT = await loadYouTubeApi();
    if (this.current !== track.videoId) return; // arrêtée pendant le chargement
    const host = document.createElement('div');
    this.#container.appendChild(host);
    const startS = track.durationS > 0 ? Math.floor(track.durationS / 3) : 60;
    this.#player = new YT.Player(host, {
      videoId: track.videoId,
      width: 1,
      height: 1,
      playerVars: { autoplay: 1, start: startS, controls: 0, playsinline: 1, origin: location.origin },
      events: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onReady: (e: any) => {
          e.target.setVolume(PREVIEW_VOLUME);
          e.target.playVideo();
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === 0) this.stop(); // fin de vidéo
        },
      },
    });
  }

  stop(): void {
    this.#player?.destroy?.();
    this.#player = null;
    this.current = null;
    if (this.#container) this.#container.innerHTML = '';
  }
}

export const preview = new PreviewPlayer();
