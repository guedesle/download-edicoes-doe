import { parseEditionDownloadLinks, parseEditionPage } from './parser';
import type {
  DbResponse,
  DownloadCaptureMode,
  DownloadCaptureStats,
  DownloadCaptureStatus,
  DownloadCaptureTarget,
  SyncStatus
} from './types';

const EGBANET_ORIGIN = 'https://egbanet.egba.ba.gov.br';
const FIRST_PAGE = `${EGBANET_ORIGIN}/admin/edicoes`;
const REQUEST_DELAY_MS = 120;
const EXPORT_URL_TTL_MS = 30 * 60 * 1000;

class AuthenticationError extends Error {}

class DbClient {
  private worker = new Worker(new URL('./db-worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<DbResponse>) => {
      const response = event.data;
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      if (response.ok) request.resolve(response.data);
      else request.reject(new Error(response.error ?? 'Falha no SQLite.'));
    });

    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha ao inicializar o worker SQLite.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  call<T>(action: string, payload: unknown = {}): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, action, payload });
    });
  }
}

const db = new DbClient();
let inventoryRunning = false;
let captureRunning = false;
let exportRunning = false;
let inventoryCancelled = false;
let captureCancelled = false;
let activeRequest: AbortController | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function anyOperationRunning(): boolean {
  return inventoryRunning || captureRunning || exportRunning;
}

async function publishInventory(status: SyncStatus): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    target: 'service-worker',
    type: 'STATUS_UPDATE',
    status
  });
  if (result?.ok === false) {
    throw new Error(result.reason ?? 'Não foi possível persistir o status da sincronização.');
  }
}

async function publishCapture(status: DownloadCaptureStatus): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    target: 'service-worker',
    type: 'DOWNLOAD_STATUS_UPDATE',
    status
  });
  if (result?.ok === false) {
    throw new Error(result.reason ?? 'Não foi possível persistir o status da captura de links.');
  }
}

function responseLooksUnauthenticated(response: Response): boolean {
  const finalUrl = response.url.toLowerCase();
  return response.status === 401
    || response.status === 403
    || finalUrl.includes('/login')
    || finalUrl.includes('/usuarios/login');
}

function isAuthenticationFailure(response: Response, html: string): boolean {
  return responseLooksUnauthenticated(response)
    || /<input[^>]+type=["']password["']/i.test(html);
}

async function fetchPage(url: string): Promise<{ response: Response; html: string }> {
  activeRequest = new AbortController();
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: activeRequest.signal
    });
    const html = await response.text();
    return { response, html };
  } finally {
    activeRequest = null;
  }
}

async function fetchFileSize(relativeUrl: string | null): Promise<number | null> {
  if (!relativeUrl) return null;

  const url = new URL(relativeUrl, EGBANET_ORIGIN);
  if (url.origin !== EGBANET_ORIGIN || !/^\/admin\/edicoes\/download_versao\/\d+_\d+\/[01]$/.test(url.pathname)) {
    return null;
  }

  activeRequest = new AbortController();
  try {
    const response = await fetch(url.href, {
      method: 'HEAD',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: activeRequest.signal
    });

    if (responseLooksUnauthenticated(response)) {
      throw new AuthenticationError('Sessão do EGBANET expirada. Autentique-se no EGBANET e tente novamente.');
    }

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) return null;

    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') return null;

    const rawLength = response.headers.get('content-length');
    if (!rawLength || !/^\d+$/.test(rawLength)) return null;

    const bytes = Number(rawLength);
    return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
  } finally {
    activeRequest = null;
  }
}

function assertAuthenticated(response: Response, html: string): void {
  if (isAuthenticationFailure(response, html)) {
    throw new AuthenticationError('Sessão do EGBANET expirada. Autentique-se no EGBANET e tente novamente.');
  }
}

function validatedEditUrl(target: DownloadCaptureTarget): string {
  const match = target.editUrl.match(/^\/admin\/edicoes\/edit\/(\d+)$/);
  if (!match || Number(match[1]) !== target.egbanetId) {
    throw new Error(`URL de edição inválida para o ID ${target.egbanetId}: ${target.editUrl}`);
  }
  return new URL(target.editUrl, EGBANET_ORIGIN).href;
}

async function crawl(): Promise<void> {
  if (anyOperationRunning()) return;
  inventoryRunning = true;
  inventoryCancelled = false;

  const startedAt = new Date().toISOString();
  const status: SyncStatus = {
    state: 'running',
    startedAt,
    pagesProcessed: 0,
    editionsSeen: 0,
    inserted: 0,
    updated: 0,
    totalEditions: 0,
    currentUrl: FIRST_PAGE
  };

  let syncId: number | null = null;

  try {
    await publishInventory(status);
    syncId = await db.call<number>('beginSync', { startedAt });

    const visited = new Set<string>();
    let currentUrl: string | null = FIRST_PAGE;
    let pageNumber = 1;

    while (currentUrl) {
      if (inventoryCancelled) throw new DOMException('Sincronização cancelada pelo usuário.', 'AbortError');
      if (visited.has(currentUrl)) throw new Error(`Loop de paginação detectado em ${currentUrl}`);
      visited.add(currentUrl);

      status.currentUrl = currentUrl;
      await publishInventory(status);

      const { response, html } = await fetchPage(currentUrl);
      if (!response.ok) throw new Error(`EGBANET respondeu HTTP ${response.status} na página ${pageNumber}.`);
      assertAuthenticated(response, html);

      const parsed = parseEditionPage(html, pageNumber);
      const batch = await db.call<{ inserted: number; updated: number; total: number }>('upsertBatch', {
        editions: parsed.editions
      });

      status.pagesProcessed += 1;
      status.editionsSeen += parsed.editions.length;
      status.inserted += batch.inserted;
      status.updated += batch.updated;
      status.totalEditions = batch.total;

      await db.call('updateSync', {
        syncId,
        values: {
          pagesProcessed: status.pagesProcessed,
          editionsSeen: status.editionsSeen,
          inserted: status.inserted,
          updated: status.updated
        }
      });
      await publishInventory(status);

      if (!parsed.nextHref) break;
      const nextUrl = new URL(parsed.nextHref, EGBANET_ORIGIN);
      if (nextUrl.origin !== EGBANET_ORIGIN || !/^\/admin\/edicoes\/index\/page:\d+$/.test(nextUrl.pathname)) {
        throw new Error(`Próxima página inválida: ${parsed.nextHref}`);
      }

      currentUrl = nextUrl.href;
      pageNumber += 1;
      await sleep(REQUEST_DELAY_MS);
    }

    status.state = 'completed';
    status.finishedAt = new Date().toISOString();
    delete status.currentUrl;
    await db.call('finishSync', { syncId, status: 'completed', finishedAt: status.finishedAt });
    await publishInventory(status);
  } catch (error) {
    const isCancelled = inventoryCancelled || (error instanceof DOMException && error.name === 'AbortError');
    status.state = isCancelled ? 'cancelled' : 'error';
    status.finishedAt = new Date().toISOString();
    status.error = isCancelled
      ? 'Sincronização cancelada pelo usuário.'
      : error instanceof Error ? error.message : String(error);
    delete status.currentUrl;

    if (syncId !== null) {
      await db.call('finishSync', {
        syncId,
        status: status.state,
        finishedAt: status.finishedAt,
        error: status.error
      }).catch(() => undefined);
    }
    await publishInventory(status).catch(() => undefined);
  } finally {
    activeRequest = null;
    inventoryRunning = false;
  }
}

async function captureDownloadLinks(mode: DownloadCaptureMode): Promise<void> {
  if (anyOperationRunning()) return;
  captureRunning = true;
  captureCancelled = false;

  const startedAt = new Date().toISOString();
  const status: DownloadCaptureStatus = {
    state: 'running',
    mode,
    startedAt,
    totalEditions: 0,
    totalTargets: 0,
    processed: 0,
    signedFound: 0,
    diaryFound: 0,
    signedSizesFound: 0,
    diarySizesFound: 0,
    failures: 0,
    capturedEditions: 0
  };

  try {
    await publishCapture(status);

    const initialStats = await db.call<DownloadCaptureStats>('downloadCaptureStats');
    const targets = await db.call<DownloadCaptureTarget[]>('listDownloadCaptureTargets', { mode });
    status.totalEditions = initialStats.totalEditions;
    status.capturedEditions = initialStats.capturedEditions;
    status.totalTargets = targets.length;
    await publishCapture(status);

    for (const target of targets) {
      if (captureCancelled) throw new DOMException('Captura cancelada pelo usuário.', 'AbortError');
      status.currentEditionId = target.egbanetId;
      await publishCapture(status);

      try {
        const url = validatedEditUrl(target);
        const { response, html } = await fetchPage(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} ao consultar a edição ${target.egbanetId}.`);
        assertAuthenticated(response, html);

        const links = parseEditionDownloadLinks(html, target.egbanetId);
        const downloadAssinadoBytes = await fetchFileSize(links.downloadAssinadoUrl);
        const downloadDiarioBytes = await fetchFileSize(links.downloadDiarioUrl);

        await db.call('saveDownloadLinks', {
          egbanetId: target.egbanetId,
          ...links,
          downloadAssinadoBytes,
          downloadDiarioBytes,
          capturedAt: new Date().toISOString()
        });

        if (links.downloadAssinadoUrl) status.signedFound += 1;
        if (links.downloadDiarioUrl) status.diaryFound += 1;
        if (downloadAssinadoBytes !== null) status.signedSizesFound += 1;
        if (downloadDiarioBytes !== null) status.diarySizesFound += 1;
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        if (captureCancelled || (error instanceof DOMException && error.name === 'AbortError')) throw error;
        status.failures += 1;
      } finally {
        status.processed += 1;
        await publishCapture(status).catch(() => undefined);
      }

      await sleep(REQUEST_DELAY_MS);
    }

    const finalStats = await db.call<DownloadCaptureStats>('downloadCaptureStats');
    status.state = 'completed';
    status.finishedAt = new Date().toISOString();
    status.capturedEditions = finalStats.capturedEditions;
    delete status.currentEditionId;
    await publishCapture(status);
  } catch (error) {
    const isCancelled = captureCancelled || (error instanceof DOMException && error.name === 'AbortError');
    status.state = isCancelled ? 'cancelled' : 'error';
    status.finishedAt = new Date().toISOString();
    status.error = isCancelled
      ? 'Captura de links cancelada pelo usuário.'
      : error instanceof Error ? error.message : String(error);
    delete status.currentEditionId;
    await publishCapture(status).catch(() => undefined);
  } finally {
    activeRequest = null;
    captureRunning = false;
  }
}

async function prepareSqliteExport(): Promise<{ blobUrl: string; filename: string; bytes: number }> {
  if (anyOperationRunning()) throw new Error('Já existe uma operação em andamento.');
  exportRunning = true;
  try {
    const bytes = await db.call<Uint8Array>('exportDatabase');
    const exportBytes = new Uint8Array(bytes);
    const blob = new Blob([exportBytes], { type: 'application/x-sqlite3' });
    const blobUrl = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(blobUrl), EXPORT_URL_TTL_MS);
    return {
      blobUrl,
      filename: 'download-edicoes-doe.sqlite3',
      bytes: exportBytes.byteLength
    };
  } finally {
    exportRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  if (message.type === 'START_SYNC') {
    if (anyOperationRunning()) {
      sendResponse({ ok: false, reason: 'operation-running' });
    } else {
      void crawl();
      sendResponse({ ok: true });
    }
    return;
  }

  if (message.type === 'CANCEL_SYNC') {
    inventoryCancelled = true;
    activeRequest?.abort();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'START_DOWNLOAD_CAPTURE') {
    if (anyOperationRunning()) {
      sendResponse({ ok: false, reason: 'operation-running' });
    } else {
      const mode: DownloadCaptureMode = message.mode === 'all' ? 'all' : 'pending';
      void captureDownloadLinks(mode);
      sendResponse({ ok: true });
    }
    return;
  }

  if (message.type === 'CANCEL_DOWNLOAD_CAPTURE') {
    captureCancelled = true;
    activeRequest?.abort();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'GET_DOWNLOAD_CAPTURE_STATS') {
    void db.call<DownloadCaptureStats>('downloadCaptureStats')
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((error) => sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }

  if (message.type === 'PREPARE_SQLITE_EXPORT') {
    void prepareSqliteExport()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({
        ok: false,
        reason: error instanceof Error ? error.message : String(error)
      }));
    return true;
  }
});
