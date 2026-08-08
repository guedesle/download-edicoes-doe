const OFFSCREEN_URL = 'offscreen.html';
const INVENTORY_STATUS_KEY = 'inventorySyncStatus';
const DOWNLOAD_STATUS_KEY = 'downloadCaptureStatus';

async function ensureOffscreenDocument(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Processar HTML autenticado do EGBANET e manter o worker SQLite durante as operações.'
  });
}

async function persistStatus(key: string, status: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: status });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'service-worker') return;

  if (message.type === 'STATUS_UPDATE' || message.type === 'DOWNLOAD_STATUS_UPDATE') {
    const key = message.type === 'STATUS_UPDATE' ? INVENTORY_STATUS_KEY : DOWNLOAD_STATUS_KEY;
    void persistStatus(key, message.status)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message : String(error)
        });
      });
    return true;
  }

  const forwardedTypes = new Set([
    'START_SYNC',
    'CANCEL_SYNC',
    'START_DOWNLOAD_CAPTURE',
    'CANCEL_DOWNLOAD_CAPTURE',
    'GET_DOWNLOAD_CAPTURE_STATS'
  ]);

  if (forwardedTypes.has(message.type)) {
    void (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: message.type,
          mode: message.mode
        });
        sendResponse(result ?? { ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    })();
    return true;
  }
});
