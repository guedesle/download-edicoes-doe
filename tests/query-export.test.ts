import { describe, expect, it } from 'vitest';
import { createQueryCsv, createQueryXlsx, type EditionExportRow } from '../src/query-export';

const rows: EditionExportRow[] = [
  {
    egbanetId: 22180,
    editionType: 'Diário Oficial do Estado da Bahia',
    date: '2026-07-08',
    editionNumber: 24429,
    supplement: true,
    pages: 2,
    normalUrl: '/admin/edicoes/download_versao/22180_1/0',
    normalBytes: 123456,
    signedUrl: '/admin/edicoes/download_versao/22180_1/1',
    signedBytes: 234567
  },
  {
    egbanetId: 999,
    editionType: 'Tipo; com "aspas"',
    date: '2026-01-01',
    editionNumber: 1,
    supplement: false,
    pages: null,
    normalUrl: null,
    normalBytes: null,
    signedUrl: null,
    signedBytes: null
  }
];

describe('exportação da consulta', () => {
  it('gera CSV UTF-8 com BOM, separador pt-BR e URLs absolutas', () => {
    const bytes = createQueryCsv(rows);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('Data;Número da edição;ID EGBANET');
    expect(text).toContain('https://egbanet.egba.ba.gov.br/admin/edicoes/download_versao/22180_1/0');
    expect(text).toContain('"Tipo; com ""aspas"""');
  });

  it('gera um pacote XLSX/ZIP válido em modo store com todas as linhas', () => {
    const bytes = createQueryXlsx(rows);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const raw = new TextDecoder().decode(bytes);
    expect(raw).toContain('[Content_Types].xml');
    expect(raw).toContain('xl/worksheets/sheet1.xml');
    expect(raw).toContain('24429');
    expect(raw).toContain('Diário Oficial do Estado da Bahia');
    expect(raw).toContain('https://egbanet.egba.ba.gov.br/admin/edicoes/download_versao/22180_1/1');
  });
});
