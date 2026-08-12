import { SQLITE_IMPORT_MAX_BYTES, validateSqliteImportMetadata } from './sqlite-import';

interface ImportResult {
  bytes: number;
  editions: number;
  capturedEditions: number;
  signedLinks: number;
  diaryLinks: number;
  signedSizes: number;
  diarySizes: number;
  batches: number;
}

class ImportWorkerClient {
  private worker = new Worker(new URL('./sqlite-import-worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<string, { resolve: (value: ImportResult) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const response = event.data as { requestId: string; ok: boolean; result?: ImportResult; error?: string };
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      if (response.ok && response.result) request.resolve(response.result);
      else request.reject(new Error(response.error ?? 'Falha ao importar o SQLite.'));
    });
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha ao iniciar o worker de importação.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  import(bytes: Uint8Array): Promise<ImportResult> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, bytes });
    });
  }
}

const importer = new ImportWorkerClient();
let importRunning = false;

function assertExtensionBlobUrl(blobUrl: string): void {
  const extensionOrigin = chrome.runtime.getURL('');
  if (!blobUrl.startsWith(`blob:${extensionOrigin}`)) {
    throw new Error('Origem do arquivo de importação inválida.');
  }
}

async function publishImportedStatus(result: ImportResult): Promise<void> {
  const now = new Date().toISOString();
  await chrome.runtime.sendMessage({
    target: 'service-worker',
    type: 'STATUS_UPDATE',
    status: {
      state: 'completed',
      startedAt: now,
      finishedAt: now,
      pagesProcessed: 0,
      editionsSeen: result.editions,
      inserted: 0,
      updated: 0,
      totalEditions: result.editions
    }
  });
  await chrome.runtime.sendMessage({
    target: 'service-worker',
    type: 'DOWNLOAD_STATUS_UPDATE',
    status: {
      state: 'completed',
      mode: 'pending',
      startedAt: now,
      finishedAt: now,
      totalEditions: result.editions,
      totalTargets: 0,
      processed: 0,
      signedFound: result.signedLinks,
      diaryFound: result.diaryLinks,
      signedSizesFound: result.signedSizes,
      diarySizesFound: result.diarySizes,
      failures: 0,
      capturedEditions: result.capturedEditions
    }
  });
}

async function importFromBlob(message: { blobUrl?: unknown; filename?: unknown; size?: unknown }): Promise<ImportResult> {
  if (importRunning) throw new Error('Já existe uma importação em andamento.');
  const blobUrl = String(message.blobUrl ?? '');
  const filename = String(message.filename ?? '');
  const size = Number(message.size);
  validateSqliteImportMetadata(filename, size);
  assertExtensionBlobUrl(blobUrl);
  importRunning = true;
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`Não foi possível ler o arquivo selecionado (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== size) throw new Error('O tamanho do arquivo mudou durante a leitura. Selecione-o novamente.');
    if (buffer.byteLength > SQLITE_IMPORT_MAX_BYTES) throw new Error('O arquivo excede o limite permitido para importação.');
    const result = await importer.import(new Uint8Array(buffer));
    await publishImportedStatus(result);
    return result;
  } finally {
    importRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message.type !== 'IMPORT_SQLITE') return;
  void importFromBlob(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    }));
  return true;
});
