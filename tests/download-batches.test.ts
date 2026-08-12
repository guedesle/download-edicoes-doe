import { describe, expect, it } from 'vitest';
import {
  buildDownloadItemPath,
  normalizeDownloadBatchFilter,
  parseEgbanetIdList,
  requestedItemTypes
} from '../src/download-batches';

describe('planejamento de lotes', () => {
  it('normaliza e remove IDs EGBANET duplicados', () => {
    expect(parseEgbanetIdList('21535, 21536\n21535; 21540')).toEqual([21535, 21536, 21540]);
  });

  it('rejeita token de ID inválido', () => {
    expect(() => parseEgbanetIdList('21535, abc')).toThrow('ID EGBANET inválido');
  });

  it('valida período e ordem das datas', () => {
    expect(normalizeDownloadBatchFilter({
      criterion: 'period',
      fileType: 'normal',
      startDate: '2022-01-30',
      endDate: '2022-07-31',
      name: '  Lote histórico  '
    })).toEqual({
      criterion: 'period',
      fileType: 'normal',
      startDate: '2022-01-30',
      endDate: '2022-07-31',
      name: 'Lote histórico'
    });

    expect(() => normalizeDownloadBatchFilter({
      criterion: 'period',
      fileType: 'normal',
      startDate: '2022-08-01',
      endDate: '2022-07-31'
    })).toThrow('data inicial');
  });

  it('expande ambos para normal e assinado', () => {
    expect(requestedItemTypes('both')).toEqual(['normal', 'signed']);
    expect(requestedItemTypes('normal')).toEqual(['normal']);
  });

  it('gera nome com NORMAL ou ASSINADO e separa por subpasta', () => {
    expect(buildDownloadItemPath('2022-07-31', 12345, 21535, 'normal')).toEqual({
      filename: '2022-07-31-12345-NORMAL.pdf',
      relativePath: '2022/07/normal/2022-07-31-12345-NORMAL.pdf'
    });

    expect(buildDownloadItemPath('2022-07-31', 12345, 21535, 'signed')).toEqual({
      filename: '2022-07-31-12345-ASSINADO.pdf',
      relativePath: '2022/07/assinado/2022-07-31-12345-ASSINADO.pdf'
    });
  });
});
