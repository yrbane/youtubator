import { loadYouTubeApi } from './yt-iframe.js';
import { isLocalTrackId } from './local-files.js';
import { getLocalFile } from './local-library.js';
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

  #localAudio: HTMLAudioElement | null = null;
  #localUrl: string | null = null;

  async toggle(track: Track): Promise<void> {
    if (this.current === track.videoId) return this.stop();
    if (isLocalTrackId(track.videoId)) return this.#toggleLocal(track);
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

  /** Pré-écoute d'un fichier local : un simple <audio> sur blob, départ au tiers. */
  async #toggleLocal(track: Track): Promise<void> {
    this.stop();
    this.current = track.videoId;
    const file = await getLocalFile(track.videoId);
    if (!file || this.current !== track.videoId) return this.stop();
    this.#localUrl = URL.createObjectURL(file);
    const audio = new Audio(this.#localUrl);
    audio.volume = 0.6;
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = audio.duration > 0 ? audio.duration / 3 : 0;
      void audio.play();
    });
    audio.addEventListener('ended', () => this.stop());
    this.#localAudio = audio;
  }

  stop(): void {
    this.#player?.destroy?.();
    this.#player = null;
    this.#localAudio?.pause();
    this.#localAudio = null;
    if (this.#localUrl) URL.revokeObjectURL(this.#localUrl);
    this.#localUrl = null;
    this.current = null;
    if (this.#container) this.#container.innerHTML = '';
  }
}

export const preview = new PreviewPlayer();
