/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  buildDownloadItemPath,
  normalizeDownloadBatchFilter,
  requestedItemTypes
} from './download-batches';
import type {
  DbResponse,
  DownloadBatchCreated,
  DownloadBatchFilter,
  DownloadBatchItemType,
  DownloadBatchPreview,
  DownloadCaptureMode,
  DownloadCaptureStats,
  DownloadCaptureTarget,
  EditionRecord
} from './types';

const DB_NAME = '/download-edicoes-doe.sqlite3';
const SCHEMA_VERSION = 6;
let sqlite3Promise: Promise<any> | null = null;
let dbPromise: Promise<any> | null = null;

const EDITIONS_TABLE = `
CREATE TABLE IF NOT EXISTS edicoes (
  egbanet_id INTEGER PRIMARY KEY,
  tipo_edicao TEXT NOT NULL,
  data_edicao TEXT NOT NULL,
  numero_edicao INTEGER NOT NULL,
  suplemento INTEGER,
  numero_paginas INTEGER,
  materias INTEGER,
  materias_pendentes INTEGER,
  downloads INTEGER,
  publicada_internet INTEGER,
  data_publicacao TEXT,
  edit_url TEXT NOT NULL,
  view_url TEXT NOT NULL,
  download_assinado_url TEXT,
  download_assinado_bytes INTEGER,
  download_diario_url TEXT,
  download_diario_bytes INTEGER,
  download_links_capturados_em TEXT,
  pagina_origem INTEGER NOT NULL,
  primeira_coleta_em TEXT NOT NULL,
  ultima_coleta_em TEXT NOT NULL
);
`;

const EDITIONS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_edicoes_data ON edicoes(data_edicao DESC);
CREATE INDEX IF NOT EXISTS idx_edicoes_numero ON edicoes(numero_edicao DESC);
CREATE INDEX IF NOT EXISTS idx_edicoes_tipo ON edicoes(tipo_edicao);
CREATE INDEX IF NOT EXISTS idx_edicoes_identidade_editorial
  ON edicoes(tipo_edicao, data_edicao, numero_edicao);
CREATE INDEX IF NOT EXISTS idx_edicoes_download_capture
  ON edicoes(download_links_capturados_em);
`;

const SYNC_TABLE = `
CREATE TABLE IF NOT EXISTS sincronizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iniciada_em TEXT NOT NULL,
  concluida_em TEXT,
  paginas_processadas INTEGER NOT NULL DEFAULT 0,
  registros_encontrados INTEGER NOT NULL DEFAULT 0,
  registros_inseridos INTEGER NOT NULL DEFAULT 0,
  registros_atualizados INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  erro TEXT
);
`;

const DOWNLOAD_TABLES = `
CREATE TABLE IF NOT EXISTS download_lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  iniciado_em TEXT,
  concluido_em TEXT,
  nome TEXT,
  criterio_tipo TEXT NOT NULL,
  criterio_valor TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  tipos_arquivo TEXT NOT NULL,
  destino_descritivo TEXT,
  total_itens INTEGER NOT NULL DEFAULT 0,
  itens_concluidos INTEGER NOT NULL DEFAULT 0,
  itens_falhos INTEGER NOT NULL DEFAULT 0,
  bytes_previstos INTEGER,
  bytes_conhecidos INTEGER NOT NULL DEFAULT 0,
  bytes_concluidos INTEGER NOT NULL DEFAULT 0,
  links_ausentes INTEGER NOT NULL DEFAULT 0,
  tamanhos_desconhecidos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  erro TEXT
);

CREATE TABLE IF NOT EXISTS download_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id INTEGER NOT NULL,
  egbanet_id INTEGER NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  bytes_esperados INTEGER,
  nome_arquivo TEXT NOT NULL,
  caminho_relativo TEXT,
  chrome_download_id INTEGER,
  tentativas INTEGER NOT NULL DEFAULT 0,
  iniciado_em TEXT,
  concluido_em TEXT,
  status TEXT NOT NULL,
  erro TEXT,
  FOREIGN KEY (lote_id) REFERENCES download_lotes(id) ON DELETE CASCADE,
  FOREIGN KEY (egbanet_id) REFERENCES edicoes(egbanet_id),
  UNIQUE(lote_id, egbanet_id, tipo_arquivo)
);
`;

const DOWNLOAD_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_download_lotes_status_criado
  ON download_lotes(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_download_itens_lote_status
  ON download_itens(lote_id, status);
CREATE INDEX IF NOT EXISTS idx_download_itens_edicao
  ON download_itens(egbanet_id);
`;

interface BatchEditionRow {
  egbanetId: number;
  dataEdicao: string;
  numeroEdicao: number;
  numeroPaginas: number | null;
  normalUrl: string | null;
  normalBytes: number | null;
  signedUrl: string | null;
  signedBytes: number | null;
  supplementNumber: number | null;
}

function editionsTableExists(db: any): boolean {
  return Number(db.selectValue(
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='edicoes'"
  )) > 0;
}

function migrateLegacyToV5(db: any): void {
  db.transaction(() => {
    db.exec(`
      DROP INDEX IF EXISTS idx_edicoes_data;
      DROP INDEX IF EXISTS idx_edicoes_numero;
      DROP INDEX IF EXISTS idx_edicoes_tipo;
      DROP INDEX IF EXISTS idx_edicoes_identidade_editorial;
      DROP INDEX IF EXISTS idx_edicoes_download_capture;

      ALTER TABLE edicoes RENAME TO edicoes_legacy;

      ${EDITIONS_TABLE}

      INSERT INTO edicoes (
        egbanet_id, tipo_edicao, data_edicao, numero_edicao, suplemento,
        numero_paginas, materias, materias_pendentes, downloads, publicada_internet,
        data_publicacao, edit_url, view_url,
        download_assinado_url, download_assinado_bytes,
        download_diario_url, download_diario_bytes, download_links_capturados_em,
        pagina_origem, primeira_coleta_em, ultima_coleta_em
      )
      SELECT
        egbanet_id, tipo_edicao, data_edicao, numero_edicao, suplemento,
        numero_paginas, materias, materias_pendentes, downloads, publicada_internet,
        data_publicacao,
        '/admin/edicoes/edit/' || egbanet_id,
        view_url,
        NULL, NULL, NULL, NULL, NULL,
        pagina_origem, primeira_coleta_em, ultima_coleta_em
      FROM edicoes_legacy;

      DROP TABLE edicoes_legacy;
      ${EDITIONS_INDEXES}
      PRAGMA user_version=5;
    `);
  });
}

function migrateV3ToV5(db: any): void {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE edicoes ADD COLUMN download_assinado_url TEXT;
      ALTER TABLE edicoes ADD COLUMN download_assinado_bytes INTEGER;
      ALTER TABLE edicoes ADD COLUMN download_diario_url TEXT;
      ALTER TABLE edicoes ADD COLUMN download_diario_bytes INTEGER;
      ALTER TABLE edicoes ADD COLUMN download_links_capturados_em TEXT;
      ${EDITIONS_INDEXES}
      PRAGMA user_version=5;
    `);
  });
}

function migrateV4ToV5(db: any): void {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE edicoes ADD COLUMN download_assinado_bytes INTEGER;
      ALTER TABLE edicoes ADD COLUMN download_diario_bytes INTEGER;
      ${EDITIONS_INDEXES}
      PRAGMA user_version=5;
    `);
  });
}

function migrateV5ToV6(db: any): void {
  db.transaction(() => {
    db.exec(`${DOWNLOAD_TABLES}${DOWNLOAD_INDEXES}PRAGMA user_version=${SCHEMA_VERSION};`);
  });
}

function initializeSchema(db: any): void {
  db.exec('PRAGMA foreign_keys=ON;');

  if (!editionsTableExists(db)) {
    db.exec(`${EDITIONS_TABLE}${EDITIONS_INDEXES}${SYNC_TABLE}${DOWNLOAD_TABLES}${DOWNLOAD_INDEXES}PRAGMA user_version=${SCHEMA_VERSION};`);
    return;
  }

  let version = Number(db.selectValue('PRAGMA user_version'));
  if (version > SCHEMA_VERSION) {
    throw new Error(`Banco SQLite usa schema v${version}, superior ao suportado v${SCHEMA_VERSION}.`);
  }

  if (version < 3) {
    migrateLegacyToV5(db);
  } else if (version === 3) {
    migrateV3ToV5(db);
  } else if (version === 4) {
    migrateV4ToV5(db);
  }

  version = Number(db.selectValue('PRAGMA user_version'));
  if (version === 5) migrateV5ToV6(db);

  db.exec(`${EDITIONS_INDEXES}${SYNC_TABLE}${DOWNLOAD_TABLES}${DOWNLOAD_INDEXES}`);
}

async function getSqlite3(): Promise<any> {
  if (!sqlite3Promise) sqlite3Promise = sqlite3InitModule();
  return sqlite3Promise;
}

async function getDb(): Promise<any> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!self.crossOriginIsolated) {
        throw new Error('SQLite OPFS requer isolamento COOP/COEP. Recarregue a extensão após atualizar o manifest.');
      }

      const sqlite3 = await getSqlite3();
      if (!sqlite3?.oo1?.OpfsDb) {
        throw new Error('SQLite OPFS não está disponível neste navegador.');
      }
      const db = new sqlite3.oo1.OpfsDb(DB_NAME, 'c');
      initializeSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

function bool(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}

async function beginSync(startedAt: string): Promise<number> {
  const db = await getDb();
  db.exec({
    sql: 'INSERT INTO sincronizacoes (iniciada_em, status) VALUES (?, ?)',
    bind: [startedAt, 'running']
  });
  return Number(db.selectValue('SELECT last_insert_rowid()'));
}

async function upsertBatch(editions: EditionRecord[]): Promise<{ inserted: number; updated: number; total: number }> {
  const db = await getDb();
  if (editions.length === 0) {
    return { inserted: 0, updated: 0, total: Number(db.selectValue('SELECT COUNT(*) FROM edicoes')) };
  }

  const existing = new Set<number>();
  const placeholders = editions.map(() => '?').join(',');
  db.exec({
    sql: `SELECT egbanet_id FROM edicoes WHERE egbanet_id IN (${placeholders})`,
    bind: editions.map((edition) => edition.egbanetId),
    rowMode: 'array',
    callback: (row: unknown[]) => existing.add(Number(row[0]))
  });

  const now = new Date().toISOString();
  const sql = `
    INSERT INTO edicoes (
      egbanet_id, tipo_edicao, data_edicao, numero_edicao, suplemento,
      numero_paginas, materias, materias_pendentes, downloads, publicada_internet,
      data_publicacao, edit_url, view_url, pagina_origem, primeira_coleta_em, ultima_coleta_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(egbanet_id) DO UPDATE SET
      tipo_edicao=excluded.tipo_edicao,
      data_edicao=excluded.data_edicao,
      numero_edicao=excluded.numero_edicao,
      suplemento=excluded.suplemento,
      numero_paginas=excluded.numero_paginas,
      materias=excluded.materias,
      materias_pendentes=excluded.materias_pendentes,
      downloads=excluded.downloads,
      publicada_internet=excluded.publicada_internet,
      data_publicacao=excluded.data_publicacao,
      edit_url=excluded.edit_url,
      view_url=excluded.view_url,
      pagina_origem=excluded.pagina_origem,
      ultima_coleta_em=excluded.ultima_coleta_em
  `;

  db.transaction(() => {
    for (const edition of editions) {
      db.exec({
        sql,
        bind: [
          edition.egbanetId,
          edition.tipoEdicao,
          edition.dataEdicao,
          edition.numeroEdicao,
          bool(edition.suplemento),
          edition.numeroPaginas,
          edition.materias,
          edition.materiasPendentes,
          edition.downloads,
          bool(edition.publicadaInternet),
          edition.dataPublicacao,
          edition.editUrl,
          edition.viewUrl,
          edition.paginaOrigem,
          now,
          now
        ]
      });
    }
  });

  const updated = editions.filter((edition) => existing.has(edition.egbanetId)).length;
  const inserted = editions.length - updated;
  const total = Number(db.selectValue('SELECT COUNT(*) FROM edicoes'));
  return { inserted, updated, total };
}

async function updateSync(syncId: number, values: Record<string, number>): Promise<void> {
  const db = await getDb();
  db.exec({
    sql: 'UPDATE sincronizacoes SET paginas_processadas=?, registros_encontrados=?, registros_inseridos=?, registros_atualizados=? WHERE id=?',
    bind: [values.pagesProcessed, values.editionsSeen, values.inserted, values.updated, syncId]
  });
}

async function finishSync(syncId: number, status: string, finishedAt: string, error: string | null): Promise<void> {
  const db = await getDb();
  db.exec({
    sql: 'UPDATE sincronizacoes SET concluida_em=?, status=?, erro=? WHERE id=?',
    bind: [finishedAt, status, error, syncId]
  });
}

async function downloadCaptureStats(): Promise<DownloadCaptureStats> {
  const db = await getDb();
  return {
    totalEditions: Number(db.selectValue('SELECT COUNT(*) FROM edicoes')),
    capturedEditions: Number(db.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_links_capturados_em IS NOT NULL')),
    signedLinks: Number(db.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_assinado_url IS NOT NULL')),
    diaryLinks: Number(db.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_diario_url IS NOT NULL')),
    signedSizes: Number(db.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_assinado_bytes IS NOT NULL')),
    diarySizes: Number(db.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_diario_bytes IS NOT NULL'))
  };
}

async function listDownloadCaptureTargets(mode: DownloadCaptureMode): Promise<DownloadCaptureTarget[]> {
  const db = await getDb();
  const targets: DownloadCaptureTarget[] = [];
  const where = mode === 'all' ? '' : 'WHERE download_links_capturados_em IS NULL';
  db.exec({
    sql: `SELECT egbanet_id, edit_url FROM edicoes ${where} ORDER BY data_edicao DESC, egbanet_id DESC`,
    rowMode: 'array',
    callback: (row: unknown[]) => targets.push({
      egbanetId: Number(row[0]),
      editUrl: String(row[1])
    })
  });
  return targets;
}

async function saveDownloadLinks(payload: {
  egbanetId: number;
  downloadAssinadoUrl: string | null;
  downloadAssinadoBytes: number | null;
  downloadDiarioUrl: string | null;
  downloadDiarioBytes: number | null;
  capturedAt: string;
}): Promise<void> {
  const db = await getDb();
  db.exec({
    sql: `
      UPDATE edicoes
      SET download_assinado_url=?, download_assinado_bytes=?,
          download_diario_url=?, download_diario_bytes=?, download_links_capturados_em=?
      WHERE egbanet_id=?
    `,
    bind: [
      payload.downloadAssinadoUrl,
      payload.downloadAssinadoBytes,
      payload.downloadDiarioUrl,
      payload.downloadDiarioBytes,
      payload.capturedAt,
      payload.egbanetId
    ]
  });
}

function queryBatchEditions(db: any, input: DownloadBatchFilter): { filter: DownloadBatchFilter; rows: BatchEditionRow[] } {
  const filter = normalizeDownloadBatchFilter(input);
  const rows: BatchEditionRow[] = [];
  let sql = `
    SELECT e.egbanet_id, e.data_edicao, e.numero_edicao, e.numero_paginas,
           e.download_diario_url, e.download_diario_bytes,
           e.download_assinado_url, e.download_assinado_bytes,
           CASE
             WHEN e.suplemento = 0 THEN NULL
             ELSE (
               SELECT COUNT(*)
               FROM edicoes AS s
               WHERE s.data_edicao = e.data_edicao
                 AND s.numero_edicao = e.numero_edicao
                 AND (s.suplemento IS NULL OR s.suplemento <> 0)
                 AND s.egbanet_id <= e.egbanet_id
             )
           END AS suplemento_numero
    FROM edicoes AS e
  `;
  const conditions: string[] = [];
  const bind: unknown[] = [];

  if (filter.criterion === 'period') {
    conditions.push('e.data_edicao BETWEEN ? AND ?');
    bind.push(filter.startDate, filter.endDate);
  } else {
    const ids = filter.egbanetIds ?? [];
    const placeholders = ids.map(() => '?').join(',');
    conditions.push(`e.egbanet_id IN (${placeholders})`);
    bind.push(...ids);
  }

  if (filter.editionScope === 'regular') {
    conditions.push('e.suplemento = 0');
  } else if (filter.editionScope === 'supplements') {
    conditions.push('(e.suplemento IS NULL OR e.suplemento <> 0)');
  }

  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY e.data_edicao ASC, e.egbanet_id ASC';

  db.exec({
    sql,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => rows.push({
      egbanetId: Number(row[0]),
      dataEdicao: String(row[1]),
      numeroEdicao: Number(row[2]),
      numeroPaginas: row[3] === null ? null : Number(row[3]),
      normalUrl: row[4] === null ? null : String(row[4]),
      normalBytes: row[5] === null ? null : Number(row[5]),
      signedUrl: row[6] === null ? null : String(row[6]),
      signedBytes: row[7] === null ? null : Number(row[7]),
      supplementNumber: row[8] === null ? null : Number(row[8])
    })
  });

  return { filter, rows };
}

function buildBatchPreview(filter: DownloadBatchFilter, rows: BatchEditionRow[]): DownloadBatchPreview {
  const types = requestedItemTypes(filter.fileType);
  const preview: DownloadBatchPreview = {
    editions: rows.length,
    requestedFiles: rows.length * types.length,
    availableFiles: 0,
    normalFiles: 0,
    signedFiles: 0,
    missingLinks: 0,
    missingEditions: filter.criterion === 'egbanet_ids'
      ? Math.max(0, (filter.egbanetIds?.length ?? 0) - rows.length)
      : 0,
    pages: 0,
    unknownPages: 0,
    knownBytes: 0,
    unknownSizes: 0
  };

  for (const row of rows) {
    if (row.numeroPaginas === null) preview.unknownPages += 1;
    else preview.pages += row.numeroPaginas;

    for (const type of types) {
      const url = type === 'normal' ? row.normalUrl : row.signedUrl;
      const bytes = type === 'normal' ? row.normalBytes : row.signedBytes;
      if (!url) {
        preview.missingLinks += 1;
        continue;
      }
      preview.availableFiles += 1;
      if (type === 'normal') preview.normalFiles += 1;
      else preview.signedFiles += 1;
      if (bytes === null) preview.unknownSizes += 1;
      else preview.knownBytes += bytes;
    }
  }

  return preview;
}

async function previewDownloadBatch(input: DownloadBatchFilter): Promise<DownloadBatchPreview> {
  const db = await getDb();
  const { filter, rows } = queryBatchEditions(db, input);
  return buildBatchPreview(filter, rows);
}

function itemSource(row: BatchEditionRow, type: DownloadBatchItemType): { url: string | null; bytes: number | null } {
  return type === 'normal'
    ? { url: row.normalUrl, bytes: row.normalBytes }
    : { url: row.signedUrl, bytes: row.signedBytes };
}

async function createDownloadBatch(input: DownloadBatchFilter): Promise<DownloadBatchCreated> {
  const db = await getDb();
  return db.transaction(() => {
    const { filter, rows } = queryBatchEditions(db, input);
    const preview = buildBatchPreview(filter, rows);
    if (preview.editions === 0) throw new Error('Nenhuma edição corresponde ao filtro informado.');
    if (preview.availableFiles === 0) throw new Error('Nenhum arquivo disponível para o tipo solicitado. Capture os links antes de criar o lote.');

    const createdAt = new Date().toISOString();
    const batchName = filter.name ?? `Lote ${createdAt.slice(0, 16).replace('T', ' ')}`;
    const criterionValue = filter.criterion === 'egbanet_ids'
      ? JSON.stringify(filter.egbanetIds ?? [])
      : null;
    const predictedBytes = preview.unknownSizes === 0 ? preview.knownBytes : null;

    db.exec({
      sql: `
        INSERT INTO download_lotes (
          criado_em, nome, criterio_tipo, criterio_valor, data_inicio, data_fim,
          tipos_arquivo, total_itens, bytes_previstos, bytes_conhecidos,
          links_ausentes, tamanhos_desconhecidos, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      bind: [
        createdAt,
        batchName,
        filter.criterion,
        criterionValue,
        filter.startDate ?? null,
        filter.endDate ?? null,
        filter.fileType,
        preview.availableFiles,
        predictedBytes,
        preview.knownBytes,
        preview.missingLinks,
        preview.unknownSizes,
        'queued'
      ]
    });
    const batchId = Number(db.selectValue('SELECT last_insert_rowid()'));

    const insertItemSql = `
      INSERT INTO download_itens (
        lote_id, egbanet_id, tipo_arquivo, url, bytes_esperados,
        nome_arquivo, caminho_relativo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const row of rows) {
      for (const type of requestedItemTypes(filter.fileType)) {
        const source = itemSource(row, type);
        if (!source.url) continue;
        const path = buildDownloadItemPath(
          row.dataEdicao,
          row.numeroEdicao,
          row.egbanetId,
          type,
          row.supplementNumber
        );
        db.exec({
          sql: insertItemSql,
          bind: [
            batchId,
            row.egbanetId,
            type,
            source.url,
            source.bytes,
            path.filename,
            path.relativePath,
            'queued'
          ]
        });
      }
    }

    return { batchId, items: preview.availableFiles, preview };
  });
}

async function exportDatabase(): Promise<Uint8Array> {
  const db = await getDb();
  const sqlite3 = await getSqlite3();
  const bytes = sqlite3.capi.sqlite3_js_db_export(db);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error('O SQLite retornou uma exportação vazia.');
  }
  return bytes;
}

async function handle(action: string, payload: any): Promise<unknown> {
  switch (action) {
    case 'beginSync': return beginSync(payload.startedAt);
    case 'upsertBatch': return upsertBatch(payload.editions);
    case 'updateSync': return updateSync(payload.syncId, payload.values);
    case 'finishSync': return finishSync(payload.syncId, payload.status, payload.finishedAt, payload.error ?? null);
    case 'stats': {
      const db = await getDb();
      return { total: Number(db.selectValue('SELECT COUNT(*) FROM edicoes')) };
    }
    case 'downloadCaptureStats': return downloadCaptureStats();
    case 'listDownloadCaptureTargets': return listDownloadCaptureTargets(payload.mode);
    case 'saveDownloadLinks': return saveDownloadLinks(payload);
    case 'previewDownloadBatch': return previewDownloadBatch(payload.filter);
    case 'createDownloadBatch': return createDownloadBatch(payload.filter);
    case 'exportDatabase': return exportDatabase();
    default: throw new Error(`Ação SQLite desconhecida: ${action}`);
  }
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { requestId, action, payload } = event.data ?? {};
  const response: DbResponse = { requestId, ok: true };
  try {
    response.data = await handle(action, payload);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : String(error);
  }
  self.postMessage(response);
});
