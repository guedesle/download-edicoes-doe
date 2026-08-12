export const SQLITE_IMPORT_SCHEMA_VERSION = 6;
export const SQLITE_IMPORT_SUPPORTED_SOURCE_VERSIONS = [5, 6] as const;
export const SQLITE_IMPORT_MAX_BYTES = 512 * 1024 * 1024;

const SQLITE_HEADER = 'SQLite format 3\u0000';

export function validateSqliteImportMetadata(filename: string, size: number): void {
  if (!filename.toLowerCase().endsWith('.sqlite3')) {
    throw new Error('Selecione um arquivo com extensão .sqlite3.');
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('O arquivo SQLite está vazio ou possui tamanho inválido.');
  }
  if (size > SQLITE_IMPORT_MAX_BYTES) {
    throw new Error(`O arquivo excede o limite de ${SQLITE_IMPORT_MAX_BYTES / 1024 / 1024} MB para importação.`);
  }
}

export function assertSqliteHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < 100) throw new Error('Arquivo muito pequeno para ser um banco SQLite válido.');
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, SQLITE_HEADER.length));
  if (header !== SQLITE_HEADER) throw new Error('O arquivo selecionado não possui um cabeçalho SQLite válido.');
}

export function isSupportedSqliteImportSchemaVersion(version: number): boolean {
  return SQLITE_IMPORT_SUPPORTED_SOURCE_VERSIONS.includes(
    version as (typeof SQLITE_IMPORT_SUPPORTED_SOURCE_VERSIONS)[number]
  );
}
