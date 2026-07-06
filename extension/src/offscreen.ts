/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

// Document offscreen : capture l'audio de l'onglet, l'enregistre en webm
// et le rejoue en direct (tabCapture mute l'onglet sinon).

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let playback: AudioContext | null = null;

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'REC_START') void start(msg.streamId);
  if (msg.type === 'REC_STOP') recorder?.stop();
});

async function start(streamId: string): Promise<void> {
  const stream: MediaStream = await (navigator.mediaDevices as any).getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: false,
  });

  // re-jeu du flux : sans ça, tabCapture coupe le son de l'onglet
  playback = new AudioContext({ latencyHint: 'playback' });
  playback.createMediaStreamSource(stream).connect(playback.destination);

  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    chrome.runtime.sendMessage({ target: 'background', type: 'REC_DONE', url });
    stream.getTracks().forEach((t) => t.stop());
    void playback?.close();
    playback = null;
    recorder = null;
  };
  recorder.start(1000);
}
