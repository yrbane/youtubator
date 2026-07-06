import { FrameAgent } from './frame-agent.js';
import { createEqGraph } from './audio-graph.js';

// Bootstrap du content script : attend le <video> de la frame embed,
// puis relie l'agent au protocole postMessage de la page parente.

const METER_INTERVAL_MS = 100;

function waitForVideo(): Promise<HTMLVideoElement> {
  return new Promise((resolve) => {
    const existing = document.querySelector('video');
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const video = document.querySelector('video');
      if (video) {
        observer.disconnect();
        resolve(video);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

void waitForVideo().then((video) => {
  const agent = new FrameAgent({
    video,
    createGraph: () => createEqGraph(video),
    postToParent: (msg) => window.parent.postMessage(msg, '*'),
  });
  window.addEventListener('message', (e) => {
    if (e.source === window.parent) agent.handleMessage(e.data);
  });
  setInterval(() => agent.meterTick(), METER_INTERVAL_MS);
});
