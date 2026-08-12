import { describe, expect, it } from 'vitest';
import {
  assertSqliteHeader,
  isSupportedSqliteImportSchemaVersion,
  SQLITE_IMPORT_MAX_BYTES,
  validateSqliteImportMetadata
} from '../src/sqlite-import';

describe('sqlite import validation', () => {
  it('aceita arquivo .sqlite3 com tamanho válido', () => {
    expect(() => validateSqliteImportMetadata('download-edicoes-doe.sqlite3', 1024)).not.toThrow();
  });

  it('rejeita extensão, arquivo vazio e arquivo acima do limite', () => {
    expect(() => validateSqliteImportMetadata('arquivo.db', 1024)).toThrow(/extensão \.sqlite3/i);
    expect(() => validateSqliteImportMetadata('arquivo.sqlite3', 0)).toThrow(/vazio|tamanho inválido/i);
    expect(() => validateSqliteImportMetadata('arquivo.sqlite3', SQLITE_IMPORT_MAX_BYTES + 1)).toThrow(/limite/i);
  });

  it('valida o cabeçalho SQLite 3', () => {
    const bytes = new Uint8Array(100);
    bytes.set(new TextEncoder().encode('SQLite format 3\u0000'));
    expect(() => assertSqliteHeader(bytes)).not.toThrow();

    const invalid = new Uint8Array(100);
    invalid.set(new TextEncoder().encode('not sqlite'));
    expect(() => assertSqliteHeader(invalid)).toThrow(/cabeçalho SQLite/i);
  });

  it('aceita schemas v5 e v6 como origem e rejeita outros', () => {
    expect(isSupportedSqliteImportSchemaVersion(5)).toBe(true);
    expect(isSupportedSqliteImportSchemaVersion(6)).toBe(true);
    expect(isSupportedSqliteImportSchemaVersion(4)).toBe(false);
    expect(isSupportedSqliteImportSchemaVersion(7)).toBe(false);
  });
});
