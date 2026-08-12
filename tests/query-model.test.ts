import { describe, expect, it } from 'vitest';
import { buildEditionQueryWhere, normalizeEditionQueryFilter } from '../src/query-model';

describe('consulta de edições', () => {
  it('normaliza paginação e filtros opcionais', () => {
    expect(normalizeEditionQueryFilter({
      startDate: '2022-01-01',
      endDate: '2022-01-31',
      editionType: '  Diário Oficial  '
    })).toEqual({
      startDate: '2022-01-01',
      endDate: '2022-01-31',
      editionNumber: undefined,
      egbanetId: undefined,
      editionType: 'Diário Oficial',
      supplement: 'any',
      availability: 'any',
      page: 1,
      pageSize: 25
    });
  });

  it('combina período, número, ID, tipo, suplemento e disponibilidade', () => {
    const result = buildEditionQueryWhere({
      startDate: '2022-01-01',
      endDate: '2022-01-31',
      editionNumber: 12345,
      egbanetId: 21535,
      editionType: 'Diário Oficial',
      supplement: 'no',
      availability: 'both',
      page: 2,
      pageSize: 50
    });

    expect(result.whereSql).toContain('data_edicao >= ?');
    expect(result.whereSql).toContain('data_edicao <= ?');
    expect(result.whereSql).toContain('numero_edicao = ?');
    expect(result.whereSql).toContain('egbanet_id = ?');
    expect(result.whereSql).toContain('tipo_edicao = ?');
    expect(result.whereSql).toContain('suplemento = 0');
    expect(result.whereSql).toContain('download_diario_url IS NOT NULL AND download_assinado_url IS NOT NULL');
    expect(result.bind).toEqual(['2022-01-01', '2022-01-31', 12345, 21535, 'Diário Oficial']);
    expect(result.filter.page).toBe(2);
    expect(result.filter.pageSize).toBe(50);
  });

  it('trata NULL legado como suplemento', () => {
    const result = buildEditionQueryWhere({ supplement: 'yes' });
    expect(result.whereSql).toContain('(suplemento = 1 OR suplemento IS NULL)');
  });

  it('filtra edições sem nenhum arquivo', () => {
    const result = buildEditionQueryWhere({ availability: 'none' });
    expect(result.whereSql).toContain('download_diario_url IS NULL AND download_assinado_url IS NULL');
  });

  it('rejeita período invertido e IDs inválidos', () => {
    expect(() => normalizeEditionQueryFilter({
      startDate: '2022-02-01',
      endDate: '2022-01-31'
    })).toThrow('data inicial');

    expect(() => normalizeEditionQueryFilter({ egbanetId: 0 })).toThrow('ID EGBANET');
  });
});
