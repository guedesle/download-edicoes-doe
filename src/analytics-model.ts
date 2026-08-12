import type { EditionQueryAvailability, EditionQuerySupplement } from './query-model';

export type AnalyticsGranularity = 'month' | 'year';
export type AnalyticsMetric = 'editions' | 'pages' | 'files' | 'bytes';

export interface AnalyticsFilter { startDate?: string; endDate?: string; editionType?: string; supplement?: EditionQuerySupplement; availability?: EditionQueryAvailability; }
export interface AnalyticsSeriesPoint { period: string; editions: number; pages: number; files: number; bytes: number; }
export interface AnalyticsTypePoint { period: string; type: string; editions: number; pages: number; }
export interface AnalyticsTypeSummary { type: string; editions: number; pages: number; }
export interface AnalyticsDistributionBin { label: string; lower: number; upper: number | null; count: number; }
export interface AnalyticsGaussianBin { lower: number; upper: number; center: number; count: number; }
export interface AnalyticsDescriptiveStats { count: number; min: number; max: number; mean: number; stdDev: number; q1: number; median: number; q3: number; iqr: number; lowerWhisker: number; upperWhisker: number; outliers: number; }
export interface AnalyticsRegression { count: number; slope: number; intercept: number; rSquared: number; }

const MB = 1024 * 1024;
export const PAGE_DISTRIBUTION = [
  { label: '0–20', lower: 0, upper: 20 },
  { label: '21–40', lower: 20, upper: 40 },
  { label: '41–60', lower: 40, upper: 60 },
  { label: '61–80', lower: 60, upper: 80 },
  { label: '81–100', lower: 80, upper: 100 },
  { label: '101–150', lower: 100, upper: 150 },
  { label: '151–200', lower: 150, upper: 200 },
  { label: '201+', lower: 200, upper: null }
] as const;
export const FILE_SIZE_DISTRIBUTION = [
  { label: '≤ 10 MB', lower: 0, upper: 10 * MB },
  { label: '10–25 MB', lower: 10 * MB, upper: 25 * MB },
  { label: '25–50 MB', lower: 25 * MB, upper: 50 * MB },
  { label: '50–100 MB', lower: 50 * MB, upper: 100 * MB },
  { label: '100–200 MB', lower: 100 * MB, upper: 200 * MB },
  { label: '> 200 MB', lower: 200 * MB, upper: null }
] as const;

function finiteValues(values: readonly number[]): number[] { return values.filter((value) => Number.isFinite(value)).map(Number); }
function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function calculateDescriptiveStats(input: readonly number[]): AnalyticsDescriptiveStats {
  const values = finiteValues(input).sort((a, b) => a - b);
  if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0, stdDev: 0, q1: 0, median: 0, q3: 0, iqr: 0, lowerWhisker: 0, upperWhisker: 0, outliers: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const q1 = quantile(values, 0.25), median = quantile(values, 0.5), q3 = quantile(values, 0.75), iqr = q3 - q1;
  const lowerFence = q1 - (1.5 * iqr), upperFence = q3 + (1.5 * iqr);
  const nonOutliers = values.filter((value) => value >= lowerFence && value <= upperFence);
  return { count: values.length, min: values[0], max: values[values.length - 1], mean, stdDev: Math.sqrt(variance), q1, median, q3, iqr, lowerWhisker: nonOutliers[0] ?? values[0], upperWhisker: nonOutliers[nonOutliers.length - 1] ?? values[values.length - 1], outliers: values.length - nonOutliers.length };
}

export function buildFixedDistribution(values: readonly number[], definitions: readonly { label: string; lower: number; upper: number | null }[]): AnalyticsDistributionBin[] {
  const clean = finiteValues(values);
  return definitions.map((definition, index) => ({ ...definition, count: clean.filter((value) => (index === 0 ? value >= definition.lower : value > definition.lower) && (definition.upper === null || value <= definition.upper)).length }));
}

export function buildGaussianHistogram(input: readonly number[], binCount = 12): AnalyticsGaussianBin[] {
  const values = finiteValues(input);
  if (values.length === 0) return [];
  const min = Math.min(...values), max = Math.max(...values);
  if (min === max) return [{ lower: min, upper: max, center: min, count: values.length }];
  const count = Math.max(4, Math.min(30, Math.trunc(binCount))), width = (max - min) / count;
  const bins = Array.from({ length: count }, (_, index) => { const lower = min + (index * width), upper = index === count - 1 ? max : min + ((index + 1) * width); return { lower, upper, center: (lower + upper) / 2, count: 0 }; });
  for (const value of values) { const raw = Math.floor((value - min) / width), index = Math.max(0, Math.min(count - 1, raw)); bins[index].count += 1; }
  return bins;
}

export function gaussianDensity(x: number, mean: number, stdDev: number): number { if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(stdDev) || stdDev <= 0) return 0; const z = (x - mean) / stdDev; return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI)); }
export function calculateLinearRegression(valuesInput: readonly number[]): AnalyticsRegression {
  const values = finiteValues(valuesInput), count = values.length;
  if (count < 2) return { count, slope: 0, intercept: values[0] ?? 0, rSquared: 0 };
  const meanX = (count - 1) / 2, meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let covariance = 0, varianceX = 0, varianceY = 0;
  for (let index = 0; index < count; index += 1) { const dx = index - meanX, dy = values[index] - meanY; covariance += dx * dy; varianceX += dx * dx; varianceY += dy * dy; }
  const slope = varianceX === 0 ? 0 : covariance / varianceX, intercept = meanY - (slope * meanX), rSquared = varianceX === 0 || varianceY === 0 ? 0 : Math.max(0, Math.min(1, (covariance * covariance) / (varianceX * varianceY)));
  return { count, slope, intercept, rSquared };
}
export function normalizeAnalyticsGranularity(value: unknown): AnalyticsGranularity { if (value === 'month' || value === 'year') return value; throw new Error('Granularidade analítica inválida.'); }
export function normalizeAnalyticsMetric(value: unknown): AnalyticsMetric { if (value === 'editions' || value === 'pages' || value === 'files' || value === 'bytes') return value; throw new Error('Métrica analítica inválida.'); }
export function analyticsPeriodSql(granularity: AnalyticsGranularity): string { return granularity === 'year' ? "substr(data_edicao, 1, 4)" : "substr(data_edicao, 1, 7)"; }
export function analyticsMetricValue(point: AnalyticsSeriesPoint, metric: AnalyticsMetric): number { return point[metric]; }
export function analyticsMetricLabel(metric: AnalyticsMetric): string { switch (metric) { case 'pages': return 'Páginas'; case 'files': return 'Arquivos'; case 'bytes': return 'Volume'; default: return 'Edições'; } }
