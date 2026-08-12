/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { assertSqliteHeader, SQLITE_IMPORT_SCHEMA_VERSION } from './sqlite-import';

const DB_NAME = '/download-edicoes-doe.sqlite3';

const TABLES = [
  {
    name: 'edicoes',
    columns: [
      'egbanet_id', 'tipo_edicao', 'data_edicao', 'numero_edicao', 'suplemento',
      'numero_paginas', 'materias', 'materias_pendentes', 'downloads', 'publicada_internet',
      'data_publicacao', 'edit_url', 'view_url', 'download_assinado_url', 'download_assinado_bytes',
      'download_diario_url', 'download_diario_bytes', 'download_links_capturados_em',
      'pagina_origem', 'primeira_coleta_em', 'ultima_coleta_em'
    ]
  },
  {
    name: 'sincronizacoes',
    columns: [
      'id', 'iniciada_em', 'concluida_em', 'paginas_processadas', 'registros_encontrados',
      'registros_inseridos', 'registros_atualizados', 'status', 'erro'
    ]
  },
  {
    name: 'download_lotes',
    columns: [
      'id', 'criado_em', 'iniciado_em', 'concluido_em', 'nome', 'criterio_tipo',
      'criterio_valor', 'data_inicio', 'data_fim', 'tipos_arquivo', 'destino_descritivo',
      'total_itens', 'itens_concluidos', 'itens_falhos', 'bytes_previstos', 'bytes_conhecidos',
      'bytes_concluidos', 'links_ausentes', 'tamanhos_desconhecidos', 'status', 'erro'
    ]
  },
  {
    name: 'download_itens',
    columns: [
      'id', 'lote_id', 'egbanet_id', 'tipo_arquivo', 'url', 'bytes_esperados',
      'nome_arquivo', 'caminho_relativo', 'chrome_download_id', 'tentativas',
      'iniciado_em', 'concluido_em', 'status', 'erro'
    ]
  }
] as const;

function tableExists(db: any, table: string): boolean {
  return Number(db.selectValue(
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
    [table]
  )) > 0;
}

function tableColumns(db: any, table: string): Set<string> {
  const columns = new Set<string>();
  db.exec({
    sql: `PRAGMA table_info(${table})`,
    rowMode: 'array',
    callback: (row: unknown[]) => columns.add(String(row[1]))
  });
  return columns;
}

function countForeignKeyViolations(db: any): number {
  let count = 0;
  db.exec({
    sql: 'PRAGMA foreign_key_check',
    rowMode: 'array',
    callback: () => { count += 1; }
  });
  return count;
}

function validateSource(source: any): void {
  const integrity = String(source.selectValue('PRAGMA integrity_check'));
  if (integrity !== 'ok') throw new Error(`Falha no integrity_check do arquivo importado: ${integrity}`);

  const version = Number(source.selectValue('PRAGMA user_version'));
  if (version !== SQLITE_IMPORT_SCHEMA_VERSION) {
    throw new Error(`Schema incompatível: arquivo v${version}; esta extensão requer v${SQLITE_IMPORT_SCHEMA_VERSION}.`);
  }

  for (const table of TABLES) {
    if (!tableExists(source, table.name)) throw new Error(`Banco importado não contém a tabela obrigatória ${table.name}.`);
    const actual = tableColumns(source, table.name);
    const missing = table.columns.filter((column) => !actual.has(column));
    if (missing.length > 0) throw new Error(`Tabela ${table.name} incompatível; coluna(s) ausente(s): ${missing.join(', ')}.`);
  }

  const fkViolations = countForeignKeyViolations(source);
  if (fkViolations > 0) throw new Error(`Banco importado possui ${fkViolations} violação(ões) de chave estrangeira.`);
}

function copyTable(source: any, target: any, table: typeof TABLES[number]): number {
  const placeholders = table.columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`;
  let count = 0;
  source.exec({
    sql: `SELECT ${table.columns.join(', ')} FROM ${table.name}`,
    rowMode: 'array',
    callback: (row: unknown[]) => {
      target.exec({ sql: insertSql, bind: row });
      count += 1;
    }
  });
  return count;
}

function resetSequences(target: any): void {
  if (!tableExists(target, 'sqlite_sequence')) return;
  target.exec("DELETE FROM sqlite_sequence WHERE name IN ('sincronizacoes','download_lotes','download_itens')");
  for (const table of ['sincronizacoes', 'download_lotes', 'download_itens']) {
    const maxId = Number(target.selectValue(`SELECT COALESCE(MAX(id), 0) FROM ${table}`));
    target.exec({ sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)', bind: [table, maxId] });
  }
}

function sourceToMemoryDb(sqlite3: any, bytes: Uint8Array): any {
  const source = new sqlite3.oo1.DB();
  const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(
    source.pointer,
    'main',
    pointer,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
  );
  source.checkRc(rc);
  return source;
}

async function importDatabase(bytes: Uint8Array): Promise<{
  bytes: number;
  editions: number;
  capturedEditions: number;
  signedLinks: number;
  diaryLinks: number;
  signedSizes: number;
  diarySizes: number;
  batches: number;
}> {
  assertSqliteHeader(bytes);
  const sqlite3 = await sqlite3InitModule();
  if (!sqlite3?.oo1?.OpfsDb) throw new Error('SQLite OPFS não está disponível neste navegador.');

  const source = sourceToMemoryDb(sqlite3, bytes);
  let target: any;
  try {
    validateSource(source);
    target = new sqlite3.oo1.OpfsDb(DB_NAME, 'c');
    target.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

    for (const table of TABLES) {
      if (!tableExists(target, table.name)) {
        throw new Error(`Banco local não está inicializado: tabela ${table.name} ausente. Recarregue a extensão e tente novamente.`);
      }
    }

    target.transaction(() => {
      target.exec('DELETE FROM download_itens; DELETE FROM download_lotes; DELETE FROM sincronizacoes; DELETE FROM edicoes;');
      for (const table of TABLES) copyTable(source, target, table);
      resetSequences(target);
      target.exec(`PRAGMA user_version=${SQLITE_IMPORT_SCHEMA_VERSION};`);
      const violations = countForeignKeyViolations(target);
      if (violations > 0) throw new Error(`A importação produziria ${violations} violação(ões) de chave estrangeira.`);
      const integrity = String(target.selectValue('PRAGMA integrity_check'));
      if (integrity !== 'ok') throw new Error(`A importação produziria um banco inconsistente: ${integrity}`);
    });

    return {
      bytes: bytes.byteLength,
      editions: Number(target.selectValue('SELECT COUNT(*) FROM edicoes')),
      capturedEditions: Number(target.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_links_capturados_em IS NOT NULL')),
      signedLinks: Number(target.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_assinado_url IS NOT NULL')),
      diaryLinks: Number(target.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_diario_url IS NOT NULL')),
      signedSizes: Number(target.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_assinado_bytes IS NOT NULL')),
      diarySizes: Number(target.selectValue('SELECT COUNT(*) FROM edicoes WHERE download_diario_bytes IS NOT NULL')),
      batches: Number(target.selectValue('SELECT COUNT(*) FROM download_lotes'))
    };
  } finally {
    try { target?.close(); } catch { /* noop */ }
    try { source.close(); } catch { /* noop */ }
  }
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { requestId, bytes } = event.data ?? {};
  try {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    const result = await importDatabase(input);
    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
