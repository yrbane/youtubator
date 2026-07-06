/* eslint-disable @typescript-eslint/no-explicit-any */
declare const chrome: any;

// Enregistrement du mix : clic sur l'icône = start/stop.
// MV3 : tabCapture est inaccessible au service worker → un document offscreen
// fait getUserMedia(streamId) + MediaRecorder, et rejoue le flux pour ne pas
// couper le son de l'onglet.

let recordingTabId: number | null = null;

chrome.action.onClicked.addListener(async (tab: any) => {
  if (!chrome.tabCapture?.getMediaStreamId) return; // Firefox : non supporté
  if (recordingTabId !== null) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_STOP' });
    return;
  }
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_START', streamId });
  recordingTabId = tab.id;
  void chrome.action.setBadgeText({ text: 'REC' });
  void chrome.action.setBadgeBackgroundColor({ color: '#ff4d5e' });
});

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg?.target !== 'background') return;
  if (msg.type === 'REC_DONE') {
    recordingTabId = null;
    void chrome.action.setBadgeText({ text: '' });
    if (msg.url) {
      void chrome.downloads.download({
        url: msg.url,
        filename: `youtubator-mix-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`,
      });
    }
  }
});

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts && contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Enregistrer le mix audio de l’onglet (MediaRecorder).',
  });
}
