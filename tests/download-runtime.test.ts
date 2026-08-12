import { describe, expect, it } from 'vitest';
import { resolveEditionDownloadUrl, splitDownloadRelativePath } from '../src/download-runtime';

describe('runtime de downloads', () => {
  it('aceita somente URLs de download do EGBANET', () => {
    expect(resolveEditionDownloadUrl('/admin/edicoes/download_versao/123_4/0'))
      .toBe('https://egbanet.egba.ba.gov.br/admin/edicoes/download_versao/123_4/0');
    expect(() => resolveEditionDownloadUrl('https://example.com/admin/edicoes/download_versao/123_4/0'))
      .toThrow('URL de download inválida');
    expect(() => resolveEditionDownloadUrl('/admin/edicoes/download_versao/123_4/2'))
      .toThrow('URL de download inválida');
  });

  it('separa subpastas e nome do PDF com segurança', () => {
    expect(splitDownloadRelativePath('2022/07/normal/2022-07-31-12345-NORMAL.pdf')).toEqual({
      directories: ['2022', '07', 'normal'],
      filename: '2022-07-31-12345-NORMAL.pdf'
    });
    expect(() => splitDownloadRelativePath('../fora.pdf')).toThrow('Caminho relativo inválido');
    expect(() => splitDownloadRelativePath('2022\\07\\arquivo.pdf')).toThrow('Caminho relativo inválido');
  });
});
