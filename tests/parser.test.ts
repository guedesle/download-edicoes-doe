import { describe, expect, it } from 'vitest';
import { parseBrDate, parseBrDateTime, parseEditionPage } from '../src/parser';

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
    <td><a title="Visualizar Edição" href="/admin/edicoes/view/22349">ver</a></td>
  </tr></tbody>
</table>
<div class="paging_bootstrap pagination"><ul><li class="next"><a href="/admin/edicoes/index/page:2">›</a></li></ul></div>`;

describe('parser EGBANET', () => {
  it('normaliza datas brasileiras', () => {
    expect(parseBrDate('07/08/2026')).toBe('2026-08-07');
    expect(parseBrDateTime('07/08/2026 00:11:29')).toBe('2026-08-07T00:11:29');
    expect(parseBrDateTime('')).toBeNull();
  });

  it('resolve colunas pelo cabeçalho, não pela posição', () => {
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
      viewUrl: '/admin/edicoes/view/22349',
      paginaOrigem: 1
    });
  });

  it('aceita somente o padrão conhecido da próxima página', () => {
    expect(parseEditionPage(html, 1).nextHref).toBe('/admin/edicoes/index/page:2');
    const malicious = html.replace('/admin/edicoes/index/page:2', 'https://example.com/steal');
    expect(parseEditionPage(malicious, 1).nextHref).toBeNull();
  });

  it('falha explicitamente quando a tabela esperada desaparece', () => {
    expect(() => parseEditionPage('<html><body>login</body></html>', 1)).toThrow(/Tabela de edições não encontrada/);
  });
});
