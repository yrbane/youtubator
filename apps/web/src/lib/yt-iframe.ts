import type { PlayerFactory, YtPlayerHandle } from '@youtubator/audio-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

/** Charge le script officiel de l'IFrame Player API (une seule fois). */
export function loadYouTubeApi(): Promise<any> {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.YT?.Player) return resolve(window.YT);
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export interface RealPlayerFactory extends PlayerFactory {
  getIframe(): HTMLIFrameElement | null;
}

/**
 * Fabrique de players réels dans `container`.
 * Prérequis : loadYouTubeApi() résolu (le constructeur YT.Player est synchrone ensuite).
 */
export function createPlayerFactory(container: HTMLElement): RealPlayerFactory {
  let player: any = null;
  return {
    create(opts): YtPlayerHandle {
      const host = document.createElement('div');
      container.appendChild(host);
      player = new window.YT.Player(host, {
        videoId: opts.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          enablejsapi: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => opts.onReady(),
          onStateChange: (e: { data: number }) => opts.onStateChange(e.data),
        },
      });
      return {
        // cueVideoById : pas d'autoplay au chargement d'un nouveau morceau
        loadVideoById: (id) => player.cueVideoById(id),
        playVideo: () => player.playVideo(),
        pauseVideo: () => player.pauseVideo(),
        seekTo: (s, ahead) => player.seekTo(s, ahead),
        setVolume: (v) => player.setVolume(v),
        setPlaybackRate: (r) => player.setPlaybackRate(r),
        getAvailablePlaybackRates: () => player.getAvailablePlaybackRates?.() ?? [1],
        getCurrentTime: () => player.getCurrentTime?.() ?? 0,
        getDuration: () => player.getDuration?.() ?? 0,
        destroy: () => player.destroy(),
      };
    },
    getIframe: () => player?.getIframe?.() ?? null,
  };
}
