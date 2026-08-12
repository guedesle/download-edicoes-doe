/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { buildEditionQueryWhere } from './query-model';
import type { EditionQueryFilter } from './query-model';

const DB_NAME = '/download-edicoes-doe.sqlite3';
let dbPromise: Promise<any> | null = null;

interface EditionQueryRow {
  egbanetId: number;
  editionType: string;
  date: string;
  editionNumber: number;
  supplement: boolean | null;
  pages: number | null;
  normalUrl: string | null;
  normalBytes: number | null;
  signedUrl: string | null;
  signedBytes: number | null;
}

interface EditionQuerySummary {
  editions: number;
  pages: number;
  unknownPages: number;
  normalFiles: number;
  signedFiles: number;
  knownBytes: number;
}

async function getDb(): Promise<any> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!self.crossOriginIsolated) {
        throw new Error('SQLite OPFS requer isolamento COOP/COEP. Recarregue a extensão.');
      }
      const sqlite3 = await sqlite3InitModule();
      if (!sqlite3?.oo1?.OpfsDb) throw new Error('SQLite OPFS não está disponível neste navegador.');
      return new sqlite3.oo1.OpfsDb(DB_NAME, 'r');
    })();
  }
  return dbPromise;
}

function editionsTableExists(db: any): boolean {
  return Number(db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='edicoes'")) > 0;
}

async function queryOptions(): Promise<{ editionTypes: string[] }> {
  const db = await getDb();
  if (!editionsTableExists(db)) return { editionTypes: [] };

  const editionTypes: string[] = [];
  db.exec({
    sql: `SELECT DISTINCT tipo_edicao FROM edicoes
          WHERE tipo_edicao IS NOT NULL AND TRIM(tipo_edicao) <> ''
          ORDER BY tipo_edicao COLLATE NOCASE ASC`,
    rowMode: 'array',
    callback: (row: unknown[]) => editionTypes.push(String(row[0]))
  });
  return { editionTypes };
}

async function queryEditions(input: EditionQueryFilter): Promise<{
  page: number;
  pageSize: number;
  totalPages: number;
  summary: EditionQuerySummary;
  rows: EditionQueryRow[];
}> {
  const db = await getDb();
  if (!editionsTableExists(db)) {
    return {
      page: 1,
      pageSize: 25,
      totalPages: 0,
      summary: { editions: 0, pages: 0, unknownPages: 0, normalFiles: 0, signedFiles: 0, knownBytes: 0 },
      rows: []
    };
  }

  const { filter, whereSql, bind } = buildEditionQueryWhere(input);
  let summaryRow: unknown[] | null = null;

  db.exec({
    sql: `
      SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(numero_paginas, 0)), 0),
        COALESCE(SUM(CASE WHEN numero_paginas IS NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(COALESCE(download_diario_bytes, 0) + COALESCE(download_assinado_bytes, 0)), 0)
      FROM edicoes
      ${whereSql}
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => { summaryRow = row; }
  });

  const summary: EditionQuerySummary = summaryRow
    ? {
        editions: Number(summaryRow[0]),
        pages: Number(summaryRow[1]),
        unknownPages: Number(summaryRow[2]),
        normalFiles: Number(summaryRow[3]),
        signedFiles: Number(summaryRow[4]),
        knownBytes: Number(summaryRow[5])
      }
    : { editions: 0, pages: 0, unknownPages: 0, normalFiles: 0, signedFiles: 0, knownBytes: 0 };

  const totalPages = summary.editions === 0 ? 0 : Math.ceil(summary.editions / filter.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(filter.page, totalPages);
  const offset = (page - 1) * filter.pageSize;
  const rows: EditionQueryRow[] = [];

  db.exec({
    sql: `
      SELECT
        egbanet_id, tipo_edicao, data_edicao, numero_edicao, suplemento, numero_paginas,
        download_diario_url, download_diario_bytes,
        download_assinado_url, download_assinado_bytes
      FROM edicoes
      ${whereSql}
      ORDER BY data_edicao DESC, numero_edicao DESC, egbanet_id DESC
      LIMIT ? OFFSET ?
    `,
    bind: [...bind, filter.pageSize, offset],
    rowMode: 'array',
    callback: (row: unknown[]) => rows.push({
      egbanetId: Number(row[0]),
      editionType: String(row[1]),
      date: String(row[2]),
      editionNumber: Number(row[3]),
      supplement: row[4] === null ? null : Number(row[4]) === 1,
      pages: row[5] === null ? null : Number(row[5]),
      normalUrl: row[6] === null ? null : String(row[6]),
      normalBytes: row[7] === null ? null : Number(row[7]),
      signedUrl: row[8] === null ? null : String(row[8]),
      signedBytes: row[9] === null ? null : Number(row[9])
    })
  });

  return { page, pageSize: filter.pageSize, totalPages, summary, rows };
}

async function handle(action: string, payload: any): Promise<unknown> {
  if (action === 'queryOptions') return queryOptions();
  if (action === 'queryEditions') return queryEditions(payload.filter ?? {});
  throw new Error(`Ação de consulta desconhecida: ${action}`);
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
