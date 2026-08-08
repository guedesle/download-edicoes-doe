import { parseEditionPage } from './parser';
import type { DbResponse, SyncStatus } from './types';

const EGBANET_ORIGIN = 'https://egbanet.egba.ba.gov.br';
const FIRST_PAGE = `${EGBANET_ORIGIN}/admin/edicoes`;
const STATUS_KEY = 'inventorySyncStatus';
const REQUEST_DELAY_MS = 120;

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
let running = false;
let cancelled = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publish(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: status });
}

function isAuthenticationFailure(response: Response, html: string): boolean {
  const finalUrl = response.url.toLowerCase();
  if (response.status === 401 || response.status === 403) return true;
  if (finalUrl.includes('/login') || finalUrl.includes('/usuarios/login')) return true;
  return /<input[^>]+type=["']password["']/i.test(html) && !/Tipo de Edi[cç][aã]o/i.test(html);
}

async function crawl(): Promise<void> {
  if (running) return;
  running = true;
  cancelled = false;

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
    syncId = await db.call<number>('beginSync', { startedAt });
    await publish(status);

    const visited = new Set<string>();
    let currentUrl: string | null = FIRST_PAGE;
    let pageNumber = 1;

    while (currentUrl) {
      if (cancelled) throw new DOMException('Sincronização cancelada pelo usuário.', 'AbortError');
      if (visited.has(currentUrl)) throw new Error(`Loop de paginação detectado em ${currentUrl}`);
      visited.add(currentUrl);

      status.currentUrl = currentUrl;
      await publish(status);

      const response = await fetch(currentUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow'
      });
      const html = await response.text();

      if (!response.ok) throw new Error(`EGBANET respondeu HTTP ${response.status} na página ${pageNumber}.`);
      if (isAuthenticationFailure(response, html)) {
        throw new Error('Sessão do EGBANET expirada. Autentique-se no EGBANET e tente novamente.');
      }

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
      await publish(status);

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
    await publish(status);
  } catch (error) {
    const isCancelled = error instanceof DOMException && error.name === 'AbortError';
    status.state = isCancelled ? 'cancelled' : 'error';
    status.finishedAt = new Date().toISOString();
    status.error = error instanceof Error ? error.message : String(error);
    delete status.currentUrl;

    if (syncId !== null) {
      await db.call('finishSync', {
        syncId,
        status: status.state,
        finishedAt: status.finishedAt,
        error: status.error
      }).catch(() => undefined);
    }
    await publish(status);
  } finally {
    running = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  if (message.type === 'START_SYNC') {
    if (running) {
      sendResponse({ ok: false, reason: 'already-running' });
    } else {
      void crawl();
      sendResponse({ ok: true });
    }
    return;
  }

  if (message.type === 'CANCEL_SYNC') {
    cancelled = true;
    sendResponse({ ok: true });
  }
});
