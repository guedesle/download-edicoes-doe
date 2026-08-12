import { describe, expect, it } from 'vitest';
import {
  parseBrDate,
  parseBrDateTime,
  parseEditionDownloadLinks,
  parseEditionPage
} from '../src/parser';

const html = `
<table class="table">
  <thead><tr>
    <th>Data Edição</th><th>ID</th><th>Número</th><th>Tipo de Edição</th>
    <th>Suplemento</th><th>Num. Pags.</th><th>Matérias</th><th>Matérias Pendentes</th>
    <th>Downloads</th><th>Pub. Internet</th><th>Data Pub.</th><th>Ações</th>
  </tr></thead>
  <tbody><tr>
    <td>07/08/2026</td><td>22349</td><td>24451</td><td>Diário Oficial do Estado da Bahia</td>
    <td>Não</td><td>80</td><td>453</td><td>0</td><td>96</td><td>Sim</td>
    <td>07/08/2026 00:11:29</td>
    <td>
      <a title="Editar" href="/admin/edicoes/edit/22349">editar</a>
      <a title="Visualizar Edição" href="/admin/edicoes/view/22349">ver</a>
    </td>
  </tr></tbody>
</table>
<div class="paging_bootstrap pagination"><ul><li class="next"><a href="/admin/edicoes/index/page:2">›</a></li></ul></div>`;

const versionsHtml = `
<table id="table_list" class="table">
  <thead><tr>
    <th>Versão Número</th>
    <th>Data/hora</th>
    <th>Enviado por</th>
    <th>Download Assinado</th>
    <th>Marca D'água</th>
    <th>Normal</th>
  </tr></thead>
  <tbody>
    <tr>
      <td>Versão Atual (3ª)</td>
      <td>06/03/2026 01:17:45</td>
      <td>gilmar.nascimento</td>
      <td><a href="/admin/edicoes/download_versao/21535_3/1">Download do Assinado</a></td>
      <td><a href="/admin/edicoes/download_versao/21535_3/2">Download do Marca D'água</a></td>
      <td><a href="/admin/edicoes/download_versao/21535_3/0">Download do Diário</a></td>
    </tr>
    <tr>
      <td>2ª Versão</td>
      <td>06/03/2026 00:28:44</td>
      <td>gilmar.nascimento</td>
      <td><a href="/admin/edicoes/download_versao/21535_2/1">histórico assinado</a></td>
      <td><a href="/admin/edicoes/download_versao/21535_2/2">histórico marca</a></td>
      <td><a href="/admin/edicoes/download_versao/21535_2/0">histórico diário</a></td>
    </tr>
    <tr>
      <td>Versão Atual - ocorrência anômala posterior</td>
      <td>06/03/2026 00:24:44</td>
      <td>gilmar.nascimento</td>
      <td><a href="/admin/edicoes/download_versao/21535_1/1">não usar</a></td>
      <td></td>
      <td><a href="/admin/edicoes/download_versao/21535_1/0">não usar</a></td>
    </tr>
  </tbody>
</table>`;

describe('parser EGBANET', () => {
  it('normaliza datas brasileiras', () => {
    expect(parseBrDate('07/08/2026')).toBe('2026-08-07');
    expect(parseBrDateTime('07/08/2026 00:11:29')).toBe('2026-08-07T00:11:29');
    expect(parseBrDateTime('')).toBeNull();
  });

  it('resolve colunas pelo cabeçalho e extrai links de ação relevantes', () => {
    const result = parseEditionPage(html, 1);
    expect(result.editions).toHaveLength(1);
    expect(result.editions[0]).toMatchObject({
      egbanetId: 22349,
      numeroEdicao: 24451,
      dataEdicao: '2026-08-07',
      tipoEdicao: 'Diário Oficial do Estado da Bahia',
      suplemento: false,
      numeroPaginas: 80,
      materias: 453,
      materiasPendentes: 0,
      downloads: 96,
      publicadaInternet: true,
      dataPublicacao: '2026-08-07T00:11:29',
      editUrl: '/admin/edicoes/edit/22349',
      viewUrl: '/admin/edicoes/view/22349',
      paginaOrigem: 1
    });
  });

  it('interpreta marcador ordinal como suplemento', () => {
    const supplementHtml = html.replace('<td>Não</td><td>80</td>', '<td>1º</td><td>80</td>');
    expect(parseEditionPage(supplementHtml, 1).editions[0].suplemento).toBe(true);
  });

  it('usa o padrão conhecido como fallback quando o link Editar não está presente', () => {
    const withoutEdit = html.replace('<a title="Editar" href="/admin/edicoes/edit/22349">editar</a>', '');
    expect(parseEditionPage(withoutEdit, 1).editions[0].editUrl).toBe('/admin/edicoes/edit/22349');
  });

  it('aceita somente o padrão conhecido da próxima página', () => {
    expect(parseEditionPage(html, 1).nextHref).toBe('/admin/edicoes/index/page:2');
    const malicious = html.replace('/admin/edicoes/index/page:2', 'https://example.com/steal');
    expect(parseEditionPage(malicious, 1).nextHref).toBeNull();
  });

  it('falha explicitamente quando a tabela esperada desaparece', () => {
    expect(() => parseEditionPage('<html><body>login</body></html>', 1)).toThrow(/Tabela de edições não encontrada/);
  });

  it('captura somente a primeira linha que contém Versão Atual', () => {
    expect(parseEditionDownloadLinks(versionsHtml, 21535)).toEqual({
      downloadAssinadoUrl: '/admin/edicoes/download_versao/21535_3/1',
      downloadDiarioUrl: '/admin/edicoes/download_versao/21535_3/0'
    });
  });

  it('rejeita links de download cujo ID não corresponde à edição consultada', () => {
    expect(parseEditionDownloadLinks(versionsHtml, 99999)).toEqual({
      downloadAssinadoUrl: null,
      downloadDiarioUrl: null
    });
  });

  it('falha quando não existe linha contendo Versão Atual', () => {
    const withoutCurrent = versionsHtml.replaceAll('Versão Atual', 'Versão histórica');
    expect(() => parseEditionDownloadLinks(withoutCurrent, 21535)).toThrow(/Versão Atual/);
  });
});
