/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { EditionRecord, DbResponse } from './types';

const DB_NAME = '/download-edicoes-doe.sqlite3';
let dbPromise: Promise<any> | null = null;

const SCHEMA = `
PRAGMA foreign_keys=ON;

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
  view_url TEXT NOT NULL,
  pagina_origem INTEGER NOT NULL,
  primeira_coleta_em TEXT NOT NULL,
  ultima_coleta_em TEXT NOT NULL,
  UNIQUE (tipo_edicao, data_edicao, numero_edicao)
);

CREATE INDEX IF NOT EXISTS idx_edicoes_data ON edicoes(data_edicao DESC);
CREATE INDEX IF NOT EXISTS idx_edicoes_numero ON edicoes(numero_edicao DESC);
CREATE INDEX IF NOT EXISTS idx_edicoes_tipo ON edicoes(tipo_edicao);

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

async function getDb(): Promise<any> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const sqlite3 = await sqlite3InitModule();
      if (!sqlite3?.oo1?.OpfsDb) {
        throw new Error('SQLite OPFS não está disponível neste navegador.');
      }
      const db = new sqlite3.oo1.OpfsDb(DB_NAME, 'c');
      db.exec(SCHEMA);
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
      data_publicacao, view_url, pagina_origem, primeira_coleta_em, ultima_coleta_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      view_url=excluded.view_url,
      pagina_origem=excluded.pagina_origem,
      ultima_coleta_em=excluded.ultima_coleta_em
  `;

  db.exec('BEGIN IMMEDIATE');
  try {
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
          edition.viewUrl,
          edition.paginaOrigem,
          now,
          now
        ]
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

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
