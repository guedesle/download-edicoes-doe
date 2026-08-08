const OFFSCREEN_URL = 'offscreen.html';
const STATUS_KEY = 'inventorySyncStatus';

async function ensureOffscreenDocument(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Processar HTML autenticado do EGBANET e manter o worker SQLite durante a sincronização.'
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'service-worker') return;

  if (message.type === 'STATUS_UPDATE') {
    void chrome.storage.local
      .set({ [STATUS_KEY]: message.status })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message : String(error)
        });
      });
    return true;
  }

  if (message.type === 'START_SYNC' || message.type === 'CANCEL_SYNC') {
    void (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: message.type
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
