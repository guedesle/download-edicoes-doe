import { EGBANET_ORIGIN, resolveEditionDownloadUrl, splitDownloadRelativePath } from './download-runtime';

const HANDLE_DB_NAME = 'download-edicoes-doe-handles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = 'directories';

type DirectoryHandleWithPermission = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
};

interface RunItem {
  id: number;
  loteId: number;
  egbanetId: number;
  type: 'normal' | 'signed';
  url: string;
  expectedBytes: number | null;
  filename: string;
  relativePath: string;
  attempts: number;
}

interface BatchProgress {
  batchId: number;
  name: string;
  totalItems: number;
  completed: number;
  failed: number;
  bytesCompleted: number;
  status: string;
  items: RunItem[];
}

interface ExecutionStatus {
  state: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  batchId: number;
  batchName?: string;
  destinationName?: string;
  totalItems: number;
  completed: number;
  failed: number;
  bytesCompleted: number;
  currentItem?: number;
  currentFile?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

class AuthenticationError extends Error {}

class RunDbClient {
  private worker = new Worker(new URL('./download-run-db-worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<{ requestId: string; ok: boolean; data?: unknown; error?: string }>) => {
      const request = this.pending.get(event.data.requestId);
      if (!request) return;
      this.pending.delete(event.data.requestId);
      if (event.data.ok) request.resolve(event.data.data);
      else request.reject(new Error(event.data.error ?? 'Falha no SQLite do lote.'));
    });
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha ao iniciar o worker de execução.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  call<T>(action: string, payload: unknown): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, action, payload });
    });
  }
}

const db = new RunDbClient();
let executionRunning = false;
let executionCancelled = false;
let activeRequest: AbortController | null = null;
let activeItemId: number | null = null;
let activeBatchId: number | null = null;

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o armazenamento da pasta.'));
  });
}

async function loadBatchDirectory(batchId: number): Promise<DirectoryHandleWithPermission | null> {
  const idb = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = idb.transaction(HANDLE_STORE, 'readonly');
      const request = transaction.objectStore(HANDLE_STORE).get(`batch:${batchId}`);
      request.onsuccess = () => resolve((request.result as DirectoryHandleWithPermission | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Falha ao recuperar a pasta do lote.'));
    });
  } finally {
    idb.close();
  }
}

async function publish(status: ExecutionStatus): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    target: 'service-worker',
    type: 'BATCH_DOWNLOAD_STATUS_UPDATE',
    status
  });
  if (result?.ok === false) throw new Error(result.reason ?? 'Não foi possível persistir o progresso do lote.');
}

function responseLooksUnauthenticated(response: Response): boolean {
  const finalUrl = response.url.toLowerCase();
  return response.status === 401
    || response.status === 403
    || finalUrl.includes('/login')
    || finalUrl.includes('/usuarios/login');
}

async function ensureParentDirectory(root: FileSystemDirectoryHandle, relativePath: string): Promise<{
  directory: FileSystemDirectoryHandle;
  filename: string;
}> {
  const { directories, filename } = splitDownloadRelativePath(relativePath);
  let directory = root;
  for (const segment of directories) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  return { directory, filename };
}

async function existingFileSize(directory: FileSystemDirectoryHandle, filename: string): Promise<number | null> {
  try {
    const handle = await directory.getFileHandle(filename);
    const file = await handle.getFile();
    return file.size;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

async function downloadItem(root: FileSystemDirectoryHandle, item: RunItem): Promise<number> {
  const { directory, filename } = await ensureParentDirectory(root, item.relativePath);
  const existingBytes = await existingFileSize(directory, filename);
  if (item.expectedBytes !== null && existingBytes === item.expectedBytes && existingBytes > 0) {
    return existingBytes;
  }

  const url = resolveEditionDownloadUrl(item.url);
  activeRequest = new AbortController();
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: activeRequest.signal
    });

    if (responseLooksUnauthenticated(response)) {
      throw new AuthenticationError('Sessão do EGBANET expirada. Autentique-se novamente e retome o lote.');
    }
    if (!response.ok) throw new Error(`EGBANET respondeu HTTP ${response.status}.`);

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) {
      throw new AuthenticationError('O EGBANET retornou HTML em vez do PDF. Verifique a autenticação.');
    }
    if (!response.body) throw new Error('Resposta do download não contém corpo de dados.');

    const fileHandle = await directory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await response.body.pipeTo(writable, { signal: activeRequest.signal });
    } catch (error) {
      await writable.abort(error).catch(() => undefined);
      throw error;
    }

    const file = await fileHandle.getFile();
    if (item.expectedBytes !== null && file.size !== item.expectedBytes) {
      await directory.removeEntry(filename).catch(() => undefined);
      throw new Error(`Tamanho divergente: esperado ${item.expectedBytes} bytes, recebido ${file.size} bytes.`);
    }
    if (file.size <= 0) {
      await directory.removeEntry(filename).catch(() => undefined);
      throw new Error('Arquivo recebido está vazio.');
    }
    return file.size;
  } finally {
    activeRequest = null;
  }
}

function applyProgress(status: ExecutionStatus, progress: BatchProgress): void {
  status.completed = progress.completed;
  status.failed = progress.failed;
  status.bytesCompleted = progress.bytesCompleted;
}

async function executeBatch(batchId: number): Promise<void> {
  if (executionRunning) return;
  executionRunning = true;
  executionCancelled = false;
  activeBatchId = batchId;

  const startedAt = new Date().toISOString();
  const status: ExecutionStatus = {
    state: 'running',
    batchId,
    totalItems: 0,
    completed: 0,
    failed: 0,
    bytesCompleted: 0,
    startedAt
  };

  try {
    const root = await loadBatchDirectory(batchId);
    if (!root) throw new Error(`Pasta do lote #${batchId} não encontrada. Selecione a pasta novamente e crie um novo lote.`);

    const permission = typeof root.queryPermission === 'function'
      ? await root.queryPermission({ mode: 'readwrite' })
      : 'prompt';
    if (permission !== 'granted') {
      throw new Error('A pasta do lote precisa ser revalidada no painel antes de iniciar os downloads.');
    }

    const prepared = await db.call<BatchProgress>('prepareBatchRun', {
      batchId,
      destinationName: root.name,
      startedAt
    });
    status.batchName = prepared.name;
    status.destinationName = root.name;
    status.totalItems = prepared.totalItems;
    applyProgress(status, prepared);
    await publish(status);

    for (const item of prepared.items) {
      if (executionCancelled) throw new DOMException('Download cancelado pelo usuário.', 'AbortError');

      activeItemId = item.id;
      status.currentItem = item.id;
      status.currentFile = item.filename;
      await db.call('markItemRunning', { itemId: item.id, startedAt: new Date().toISOString() });
      await publish(status);

      try {
        const actualBytes = await downloadItem(root, item);
        const progress = await db.call<BatchProgress>('markItemCompleted', {
          itemId: item.id,
          batchId,
          finishedAt: new Date().toISOString(),
          actualBytes
        });
        applyProgress(status, progress);
      } catch (error) {
        const cancelled = executionCancelled || (error instanceof DOMException && error.name === 'AbortError');
        if (cancelled) {
          const progress = await db.call<BatchProgress>('markItemQueued', { itemId: item.id, batchId });
          applyProgress(status, progress);
          throw new DOMException('Download cancelado pelo usuário.', 'AbortError');
        }

        const message = error instanceof Error ? error.message : String(error);
        const progress = await db.call<BatchProgress>('markItemFailed', {
          itemId: item.id,
          batchId,
          finishedAt: new Date().toISOString(),
          error: message
        });
        applyProgress(status, progress);
        await publish(status);
        if (error instanceof AuthenticationError) throw error;
      } finally {
        activeItemId = null;
      }

      await publish(status);
    }

    delete status.currentItem;
    delete status.currentFile;
    status.state = 'completed';
    status.finishedAt = new Date().toISOString();
    const finalDbStatus = status.failed > 0 ? 'completed_with_errors' : 'completed';
    const finalProgress = await db.call<BatchProgress>('finishBatch', {
      batchId,
      status: finalDbStatus,
      finishedAt: status.finishedAt,
      error: status.failed > 0 ? `${status.failed} arquivo(s) falharam.` : null
    });
    applyProgress(status, finalProgress);
    await publish(status);
  } catch (error) {
    const cancelled = executionCancelled || (error instanceof DOMException && error.name === 'AbortError');
    status.state = cancelled ? 'cancelled' : 'error';
    status.finishedAt = new Date().toISOString();
    status.error = cancelled
      ? 'Download do lote cancelado. Itens concluídos foram preservados.'
      : error instanceof Error ? error.message : String(error);
    delete status.currentItem;
    delete status.currentFile;

    await db.call<BatchProgress>('finishBatch', {
      batchId,
      status: status.state,
      finishedAt: status.finishedAt,
      error: status.error
    }).then((progress) => applyProgress(status, progress)).catch(() => undefined);
    await publish(status).catch(() => undefined);
  } finally {
    executionRunning = false;
    executionCancelled = false;
    activeRequest = null;
    activeItemId = null;
    activeBatchId = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  if (message.type === 'START_BATCH_DOWNLOAD') {
    const batchId = Number(message.batchId);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      sendResponse({ ok: false, reason: 'ID do lote inválido.' });
    } else if (executionRunning) {
      sendResponse({ ok: false, reason: 'operation-running' });
    } else {
      void executeBatch(batchId);
      sendResponse({ ok: true });
    }
    return;
  }

  if (message.type === 'CANCEL_BATCH_DOWNLOAD') {
    if (!executionRunning || activeBatchId === null) {
      sendResponse({ ok: true });
      return;
    }
    executionCancelled = true;
    activeRequest?.abort();
    sendResponse({ ok: true });
    return;
  }
});
