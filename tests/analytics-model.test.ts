import { describe, expect, it } from 'vitest';
import {
  FILE_SIZE_DISTRIBUTION,
  PAGE_DISTRIBUTION,
  analyticsMetricLabel,
  analyticsMetricValue,
  analyticsPeriodSql,
  buildFixedDistribution,
  buildGaussianHistogram,
  calculateDescriptiveStats,
  calculateLinearRegression,
  gaussianDensity,
  normalizeAnalyticsGranularity,
  normalizeAnalyticsMetric,
  type AnalyticsSeriesPoint
} from '../src/analytics-model';

const point: AnalyticsSeriesPoint = {
  period: '2026-07',
  editions: 25,
  pages: 2144,
  files: 50,
  bytes: 2372969431
};

describe('analytics-model', () => {
  it('gera expressão SQL determinística para mês e ano', () => {
    expect(analyticsPeriodSql('month')).toBe("substr(data_edicao, 1, 7)");
    expect(analyticsPeriodSql('year')).toBe("substr(data_edicao, 1, 4)");
  });

  it('valida granularidade e métricas', () => {
    expect(normalizeAnalyticsGranularity('month')).toBe('month');
    expect(normalizeAnalyticsMetric('bytes')).toBe('bytes');
    expect(analyticsMetricLabel('bytes')).toBe('Volume');
    expect(() => normalizeAnalyticsGranularity('week')).toThrow('Granularidade analítica inválida');
    expect(() => normalizeAnalyticsMetric('median')).toThrow('Métrica analítica inválida');
  });

  it('seleciona a métrica correta da série', () => {
    expect(analyticsMetricValue(point, 'editions')).toBe(25);
    expect(analyticsMetricValue(point, 'pages')).toBe(2144);
    expect(analyticsMetricValue(point, 'files')).toBe(50);
    expect(analyticsMetricValue(point, 'bytes')).toBe(2372969431);
  });

  it('calcula estatística descritiva e boxplot com quartis determinísticos', () => {
    const stats = calculateDescriptiveStats([10, 20, 30, 40, 50]);
    expect(stats.count).toBe(5);
    expect(stats.mean).toBe(30);
    expect(stats.median).toBe(30);
    expect(stats.q1).toBe(20);
    expect(stats.q3).toBe(40);
    expect(stats.outliers).toBe(0);
  });

  it('classifica páginas e tamanhos nas faixas fixas', () => {
    const pages = buildFixedDistribution([10, 20, 21, 40, 201], PAGE_DISTRIBUTION);
    expect(pages.map((bin) => bin.count)).toEqual([2, 2, 0, 0, 0, 0, 0, 1]);
    const mb = 1024 * 1024;
    const sizes = buildFixedDistribution([5 * mb, 10 * mb, 20 * mb, 250 * mb], FILE_SIZE_DISTRIBUTION);
    expect(sizes.map((bin) => bin.count)).toEqual([2, 1, 0, 0, 0, 1]);
  });

  it('monta histograma gaussiano determinístico', () => {
    const bins = buildGaussianHistogram([0, 1, 2, 3, 4, 5, 6, 7], 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(8);
    expect(gaussianDensity(0, 0, 1)).toBeCloseTo(0.39894228, 6);
  });

  it('calcula regressão linear e R²', () => {
    const regression = calculateLinearRegression([10, 20, 30, 40]);
    expect(regression.slope).toBeCloseTo(10, 8);
    expect(regression.intercept).toBeCloseTo(10, 8);
    expect(regression.rSquared).toBeCloseTo(1, 8);
  });
});
