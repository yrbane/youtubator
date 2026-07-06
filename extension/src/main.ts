import { FrameAgent } from './frame-agent.js';
import { createEqGraph } from './audio-graph.js';

// Bootstrap du content script : écoute le protocole immédiatement (l'embed
// ne crée son <video> qu'au premier play), attache la vidéo dès qu'elle existe.

const METER_INTERVAL_MS = 100;

const agent = new FrameAgent({
  createGraph: (video) => createEqGraph(video as HTMLVideoElement),
  postToParent: (msg) => window.parent.postMessage(msg, '*'),
});

window.addEventListener('message', (e) => {
  if (e.source === window.parent) agent.handleMessage(e.data);
});

setInterval(() => agent.meterTick(), METER_INTERVAL_MS);

function watchForVideo(): void {
  const existing = document.querySelector('video');
  if (existing) {
    agent.attachVideo(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video) {
      observer.disconnect();
      agent.attachVideo(video);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

watchForVideo();
