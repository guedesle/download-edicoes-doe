/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const DB_NAME = '/download-edicoes-doe.sqlite3';
let dbPromise: Promise<any> | null = null;

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

async function getDb(): Promise<any> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!self.crossOriginIsolated) {
        throw new Error('SQLite OPFS requer isolamento COOP/COEP.');
      }
      const sqlite3 = await sqlite3InitModule();
      if (!sqlite3?.oo1?.OpfsDb) throw new Error('SQLite OPFS não está disponível.');
      return new sqlite3.oo1.OpfsDb(DB_NAME, 'c');
    })();
  }
  return dbPromise;
}

function batchExists(db: any, batchId: number): boolean {
  return Number(db.selectValue({
    sql: 'SELECT COUNT(*) FROM download_lotes WHERE id=?',
    bind: [batchId]
  })) > 0;
}

function refreshBatchCounters(db: any, batchId: number): void {
  db.exec({
    sql: `
      UPDATE download_lotes
      SET itens_concluidos=(SELECT COUNT(*) FROM download_itens WHERE lote_id=? AND status='completed'),
          itens_falhos=(SELECT COUNT(*) FROM download_itens WHERE lote_id=? AND status='failed'),
          bytes_concluidos=(
            SELECT COALESCE(SUM(CASE WHEN status='completed' THEN COALESCE(bytes_esperados, 0) ELSE 0 END), 0)
            FROM download_itens WHERE lote_id=?
          )
      WHERE id=?
    `,
    bind: [batchId, batchId, batchId, batchId]
  });
}

function selectBatchProgress(db: any, batchId: number, includeItems: boolean): BatchProgress {
  if (!batchExists(db, batchId)) throw new Error(`Lote #${batchId} não encontrado.`);

  let batchRow: unknown[] | null = null;
  db.exec({
    sql: `SELECT id, nome, total_itens, itens_concluidos, itens_falhos, bytes_concluidos, status
          FROM download_lotes WHERE id=?`,
    bind: [batchId],
    rowMode: 'array',
    callback: (row: unknown[]) => { batchRow = row; }
  });
  if (!batchRow) throw new Error(`Lote #${batchId} não encontrado.`);

  const items: RunItem[] = [];
  if (includeItems) {
    db.exec({
      sql: `
        SELECT id, lote_id, egbanet_id, tipo_arquivo, url, bytes_esperados,
               nome_arquivo, caminho_relativo, tentativas
        FROM download_itens
        WHERE lote_id=? AND status<>'completed'
        ORDER BY id ASC
      `,
      bind: [batchId],
      rowMode: 'array',
      callback: (row: unknown[]) => items.push({
        id: Number(row[0]),
        loteId: Number(row[1]),
        egbanetId: Number(row[2]),
        type: String(row[3]) as 'normal' | 'signed',
        url: String(row[4]),
        expectedBytes: row[5] === null ? null : Number(row[5]),
        filename: String(row[6]),
        relativePath: String(row[7]),
        attempts: Number(row[8])
      })
    });
  }

  return {
    batchId: Number(batchRow[0]),
    name: String(batchRow[1] ?? `Lote #${batchId}`),
    totalItems: Number(batchRow[2]),
    completed: Number(batchRow[3]),
    failed: Number(batchRow[4]),
    bytesCompleted: Number(batchRow[5]),
    status: String(batchRow[6]),
    items
  };
}

async function prepareBatchRun(payload: { batchId: number; destinationName: string; startedAt: string }): Promise<BatchProgress> {
  const db = await getDb();
  if (!batchExists(db, payload.batchId)) throw new Error(`Lote #${payload.batchId} não encontrado.`);

  db.exec({
    sql: `UPDATE download_itens SET status='queued', erro=NULL
          WHERE lote_id=? AND status IN ('running','failed')`,
    bind: [payload.batchId]
  });
  db.exec({
    sql: `
      UPDATE download_lotes
      SET status='running', iniciado_em=COALESCE(iniciado_em, ?), concluido_em=NULL,
          destino_descritivo=?, erro=NULL
      WHERE id=?
    `,
    bind: [payload.startedAt, payload.destinationName, payload.batchId]
  });
  refreshBatchCounters(db, payload.batchId);
  return selectBatchProgress(db, payload.batchId, true);
}

async function markItemRunning(payload: { itemId: number; startedAt: string }): Promise<void> {
  const db = await getDb();
  db.exec({
    sql: `UPDATE download_itens
          SET status='running', tentativas=tentativas+1, iniciado_em=?, concluido_em=NULL, erro=NULL
          WHERE id=? AND status<>'completed'`,
    bind: [payload.startedAt, payload.itemId]
  });
}

async function markItemCompleted(payload: { itemId: number; batchId: number; finishedAt: string; actualBytes: number }): Promise<BatchProgress> {
  const db = await getDb();
  db.exec({
    sql: `UPDATE download_itens
          SET status='completed', concluido_em=?, erro=NULL,
              bytes_esperados=COALESCE(bytes_esperados, ?)
          WHERE id=?`,
    bind: [payload.finishedAt, payload.actualBytes, payload.itemId]
  });
  refreshBatchCounters(db, payload.batchId);
  return selectBatchProgress(db, payload.batchId, false);
}

async function markItemFailed(payload: { itemId: number; batchId: number; finishedAt: string; error: string }): Promise<BatchProgress> {
  const db = await getDb();
  db.exec({
    sql: `UPDATE download_itens SET status='failed', concluido_em=?, erro=? WHERE id=? AND status<>'completed'`,
    bind: [payload.finishedAt, payload.error, payload.itemId]
  });
  refreshBatchCounters(db, payload.batchId);
  return selectBatchProgress(db, payload.batchId, false);
}

async function markItemQueued(payload: { itemId: number; batchId: number }): Promise<BatchProgress> {
  const db = await getDb();
  db.exec({
    sql: `UPDATE download_itens SET status='queued', concluido_em=NULL, erro=NULL WHERE id=? AND status<>'completed'`,
    bind: [payload.itemId]
  });
  refreshBatchCounters(db, payload.batchId);
  return selectBatchProgress(db, payload.batchId, false);
}

async function finishBatch(payload: { batchId: number; status: string; finishedAt: string; error?: string | null }): Promise<BatchProgress> {
  const db = await getDb();
  refreshBatchCounters(db, payload.batchId);
  db.exec({
    sql: 'UPDATE download_lotes SET status=?, concluido_em=?, erro=? WHERE id=?',
    bind: [payload.status, payload.finishedAt, payload.error ?? null, payload.batchId]
  });
  return selectBatchProgress(db, payload.batchId, false);
}

async function handle(action: string, payload: any): Promise<unknown> {
  switch (action) {
    case 'prepareBatchRun': return prepareBatchRun(payload);
    case 'markItemRunning': return markItemRunning(payload);
    case 'markItemCompleted': return markItemCompleted(payload);
    case 'markItemFailed': return markItemFailed(payload);
    case 'markItemQueued': return markItemQueued(payload);
    case 'finishBatch': return finishBatch(payload);
    case 'batchProgress': {
      const db = await getDb();
      refreshBatchCounters(db, payload.batchId);
      return selectBatchProgress(db, payload.batchId, false);
    }
    default: throw new Error(`Ação de execução SQLite desconhecida: ${action}`);
  }
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { requestId, action, payload } = event.data ?? {};
  const response: { requestId: string; ok: boolean; data?: unknown; error?: string } = { requestId, ok: true };
  try {
    response.data = await handle(action, payload);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : String(error);
  }
  self.postMessage(response);
});
