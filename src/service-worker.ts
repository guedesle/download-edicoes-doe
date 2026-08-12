const OFFSCREEN_URL = 'offscreen.html';
const INVENTORY_STATUS_KEY = 'inventorySyncStatus';
const DOWNLOAD_STATUS_KEY = 'downloadCaptureStatus';
const BATCH_DOWNLOAD_STATUS_KEY = 'batchDownloadStatus';
let databaseImportRunning = false;

function storedState(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = (value as { state?: unknown }).state;
  return typeof state === 'string' ? state : undefined;
}

async function configureSidePanel(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

void configureSidePanel().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel().catch(() => undefined);
});

async function ensureOffscreenDocument(): Promise<void> {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Processar HTML autenticado, manter SQLite e gravar lotes de PDFs no diretório autorizado.'
  });
}

async function persistStatus(key: string, status: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: status });
}

async function isBatchDownloadRunning(): Promise<boolean> {
  const result = await chrome.storage.local.get(BATCH_DOWNLOAD_STATUS_KEY);
  return storedState(result[BATCH_DOWNLOAD_STATUS_KEY]) === 'running';
}

async function anotherOperationIsRunning(): Promise<boolean> {
  if (databaseImportRunning) return true;
  const result = await chrome.storage.local.get([INVENTORY_STATUS_KEY, DOWNLOAD_STATUS_KEY, BATCH_DOWNLOAD_STATUS_KEY]);
  return storedState(result[INVENTORY_STATUS_KEY]) === 'running'
    || storedState(result[DOWNLOAD_STATUS_KEY]) === 'running'
    || storedState(result[BATCH_DOWNLOAD_STATUS_KEY]) === 'running';
}

async function exportSqlite(): Promise<{ ok: boolean; downloadId?: number; bytes?: number; reason?: string }> {
  if (await anotherOperationIsRunning()) return { ok: false, reason: 'Já existe uma operação em andamento.' };
  await ensureOffscreenDocument();
  const prepared = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'PREPARE_SQLITE_EXPORT'
  });

  if (!prepared?.ok) {
    return { ok: false, reason: prepared?.reason ?? 'Não foi possível preparar o banco para exportação.' };
  }

  const downloadId = await chrome.downloads.download({
    url: prepared.blobUrl,
    filename: prepared.filename ?? 'download-edicoes-doe.sqlite3',
    saveAs: true,
    conflictAction: 'uniquify'
  });

  return {
    ok: true,
    downloadId,
    bytes: Number(prepared.bytes) || undefined
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'service-worker') return;

  if (
    message.type === 'STATUS_UPDATE'
    || message.type === 'DOWNLOAD_STATUS_UPDATE'
    || message.type === 'BATCH_DOWNLOAD_STATUS_UPDATE'
  ) {
    const key = message.type === 'STATUS_UPDATE'
      ? INVENTORY_STATUS_KEY
      : message.type === 'DOWNLOAD_STATUS_UPDATE'
        ? DOWNLOAD_STATUS_KEY
        : BATCH_DOWNLOAD_STATUS_KEY;
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

  if (message.type === 'EXPORT_SQLITE') {
    void exportSqlite()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }

  const forwardedTypes = new Set([
    'START_SYNC',
    'CANCEL_SYNC',
    'START_DOWNLOAD_CAPTURE',
    'CANCEL_DOWNLOAD_CAPTURE',
    'GET_DOWNLOAD_CAPTURE_STATS',
    'PREVIEW_DOWNLOAD_BATCH',
    'CREATE_DOWNLOAD_BATCH',
    'START_BATCH_DOWNLOAD',
    'CANCEL_BATCH_DOWNLOAD',
    'IMPORT_SQLITE'
  ]);

  if (forwardedTypes.has(message.type)) {
    void (async () => {
      const importing = message.type === 'IMPORT_SQLITE';
      try {
        if (importing) {
          if (await anotherOperationIsRunning()) {
            sendResponse({ ok: false, reason: 'Já existe uma operação em andamento.' });
            return;
          }
          databaseImportRunning = true;
        } else if (databaseImportRunning) {
          sendResponse({ ok: false, reason: 'Importação do SQLite em andamento.' });
          return;
        } else if (message.type === 'START_BATCH_DOWNLOAD') {
          if (await anotherOperationIsRunning()) {
            sendResponse({ ok: false, reason: 'operation-running' });
            return;
          }
        } else if (message.type !== 'CANCEL_BATCH_DOWNLOAD' && await isBatchDownloadRunning()) {
          sendResponse({ ok: false, reason: 'operation-running' });
          return;
        }

        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          ...message,
          target: 'offscreen'
        });
        sendResponse(result ?? { ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          reason: error instanceof Error ? error.message : String(error)
        });
      } finally {
        if (importing) databaseImportRunning = false;
      }
    })();
    return true;
  }
});
