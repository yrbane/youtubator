import type { MessageChannelLike } from '@youtubator/audio-engine';

/** Canal postMessage vers la frame YouTube d'un deck (extension). */
export function iframeChannel(iframe: HTMLIFrameElement): MessageChannelLike {
  return {
    send: (msg) => iframe.contentWindow?.postMessage(msg, '*'),
    onMessage: (cb) => {
      const handler = (e: MessageEvent): void => {
        if (e.source === iframe.contentWindow) cb(e.data);
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },
  };
}
