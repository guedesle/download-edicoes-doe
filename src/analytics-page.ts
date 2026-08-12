import './analytics-page.css';
import { gaussianDensity } from './analytics-model';
import type {
  AnalyticsDescriptiveStats,
  AnalyticsDistributionBin,
  AnalyticsFilter,
  AnalyticsGaussianBin,
  AnalyticsGranularity,
  AnalyticsRegression,
  AnalyticsSeriesPoint,
  AnalyticsTypePoint,
  AnalyticsTypeSummary
} from './analytics-model';
import type { EditionQueryAvailability, EditionQuerySupplement } from './query-model';

interface DashboardResult {
  summary: { editions: number; pages: number; files: number; knownBytes: number };
  quality: { missingPages: number; missingNormalLinks: number; missingSignedLinks: number; unknownFileSizes: number };
  series: AnalyticsSeriesPoint[];
  typeSeries: AnalyticsTypePoint[];
  typeSummary: AnalyticsTypeSummary[];
  pageDistribution: AnalyticsDistributionBin[];
  fileSizeDistribution: AnalyticsDistributionBin[];
  pageGaussian: AnalyticsGaussianBin[];
  fileSizeGaussian: AnalyticsGaussianBin[];
  pageStats: AnalyticsDescriptiveStats;
  fileSizeStats: AnalyticsDescriptiveStats;
  pageRegression: AnalyticsRegression;
  granularity: AnalyticsGranularity;
}

class AnalyticsClient {
  private worker = new Worker(new URL('./analytics-db-worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const response = event.data as { requestId: string; ok: boolean; data?: unknown; error?: string };
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      response.ok ? request.resolve(response.data) : request.reject(new Error(response.error ?? 'Falha ao calcular Analytics.'));
    });
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha ao iniciar o worker de Analytics.');
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    });
  }

  call<T>(action: string, payload: unknown = {}): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ requestId, action, payload });
    });
  }
}

const analytics = new AnalyticsClient();
const form = document.querySelector<HTMLFormElement>('#analyticsPageForm')!;
const startDate = document.querySelector<HTMLInputElement>('#analyticsPageStartDate')!;
const endDate = document.querySelector<HTMLInputElement>('#analyticsPageEndDate')!;
const editionType = document.querySelector<HTMLSelectElement>('#analyticsPageEditionType')!;
const supplement = document.querySelector<HTMLSelectElement>('#analyticsPageSupplement')!;
const availability = document.querySelector<HTMLSelectElement>('#analyticsPageAvailability')!;
const granularity = document.querySelector<HTMLSelectElement>('#analyticsPageGranularity')!;
const submitButton = document.querySelector<HTMLButtonElement>('#analyticsPageSubmit')!;
const clearButton = document.querySelector<HTMLButtonElement>('#analyticsPageClear')!;
const gaussianMetric = document.querySelector<HTMLSelectElement>('#analyticsGaussianMetric')!;
const errorBox = document.querySelector<HTMLElement>('#analyticsPageError')!;
let current: DashboardResult | null = null;
let optionsLoaded = false;

const manifest = chrome.runtime.getManifest();
document.querySelector<HTMLElement>('#analyticsPageVersion')!.textContent = `v${manifest.version_name || manifest.version}`;

type SvgAttrs = Record<string, string | number>;
const SVG_NS = 'http://www.w3.org/2000/svg';
const TYPE_CLASSES = ['svg-type-0', 'svg-type-1', 'svg-type-2', 'svg-type-3', 'svg-type-4'];
const TYPE_COLORS = ['#315b8a', '#a15c00', '#21725e', '#7b4ab5', '#9b3a62'];

function svgNode(tag: string, attrs: SvgAttrs = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function svgText(text: string, x: number, y: number, anchor = 'start'): SVGElement {
  const node = svgNode('text', { x, y, 'text-anchor': anchor, class: 'svg-label' });
  node.textContent = text;
  return node;
}

function createSvg(width = 1000, height = 300): SVGSVGElement {
  return svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', preserveAspectRatio: 'xMidYMid meet' }) as SVGSVGElement;
}

function host(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`#${id}`)!;
  element.replaceChildren();
  return element;
}

function showEmpty(target: HTMLElement, message = 'Sem dados para os filtros atuais.'): void {
  const empty = document.createElement('div');
  empty.className = 'chart-empty';
  empty.textContent = message;
  target.append(empty);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
  return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

function formatPeriod(period: string, currentGranularity: AnalyticsGranularity): string {
  if (currentGranularity === 'year') return period;
  const [year, month] = period.split('-');
  return year && month ? `${month}/${year}` : period;
}

function collectFilter(): AnalyticsFilter {
  return {
    startDate: startDate.value || undefined,
    endDate: endDate.value || undefined,
    editionType: editionType.value || undefined,
    supplement: supplement.value as EditionQuerySupplement,
    availability: availability.value as EditionQueryAvailability
  };
}

function filterDescription(filter: AnalyticsFilter): string {
  const parts: string[] = [];
  if (filter.startDate || filter.endDate) parts.push(`período ${filter.startDate ?? 'início'} a ${filter.endDate ?? 'fim'}`);
  if (filter.editionType) parts.push(`tipo “${filter.editionType}”`);
  if (filter.supplement === 'yes') parts.push('somente suplementos');
  else if (filter.supplement === 'no') parts.push('sem suplemento');
  const labels: Record<EditionQueryAvailability, string> = {
    any: '', normal: 'Normal disponível', signed: 'Assinado disponível', both: 'Normal + assinado', some: 'algum arquivo disponível', none: 'sem arquivos'
  };
  const availabilityValue = filter.availability ?? 'any';
  if (availabilityValue !== 'any') parts.push(labels[availabilityValue]);
  return parts.length > 0 ? parts.join(' · ') : 'todo o acervo';
}

function renderTemporalPages(result: DashboardResult): void {
  const target = host('analyticsPagesTrend');
  if (result.series.length === 0) return showEmpty(target);
  const width = 1000, height = 300, left = 62, right = 24, top = 22, bottom = 42;
  const chartW = width - left - right, chartH = height - top - bottom;
  const regression = result.pageRegression;
  const predicted = result.series.map((_, i) => regression.intercept + (regression.slope * i));
  const maxY = Math.max(1, ...result.series.map((p) => p.pages), ...predicted);
  const x = (i: number) => left + (result.series.length === 1 ? chartW / 2 : (i / (result.series.length - 1)) * chartW);
  const y = (value: number) => top + chartH - ((Math.max(0, value) / maxY) * chartH);
  const svg = createSvg(width, height);

  for (let step = 0; step <= 4; step += 1) {
    const value = (maxY / 4) * step;
    const yy = y(value);
    svg.append(svgNode('line', { x1: left, y1: yy, x2: width - right, y2: yy, class: 'svg-grid' }));
    svg.append(svgText(Math.round(value).toLocaleString('pt-BR'), left - 8, yy + 3, 'end'));
  }
  svg.append(svgNode('line', { x1: left, y1: top, x2: left, y2: height - bottom, class: 'svg-axis' }));
  svg.append(svgNode('line', { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, class: 'svg-axis' }));

  const points = result.series.map((point, i) => `${x(i)},${y(point.pages)}`).join(' ');
  svg.append(svgNode('polyline', { points, class: 'svg-line' }));
  for (let i = 0; i < result.series.length; i += 1) svg.append(svgNode('circle', { cx: x(i), cy: y(result.series[i].pages), r: 2.8, class: 'svg-point' }));
  if (result.series.length >= 2) {
    svg.append(svgNode('line', { x1: x(0), y1: y(predicted[0]), x2: x(result.series.length - 1), y2: y(predicted[predicted.length - 1]), class: 'svg-regression' }));
  }

  const labelIndexes = [...new Set([0, Math.floor((result.series.length - 1) / 2), result.series.length - 1])];
  for (const i of labelIndexes) svg.append(svgText(formatPeriod(result.series[i].period, result.granularity), x(i), height - 16, 'middle'));
  target.append(svg);
  const slopeLabel = `${regression.slope >= 0 ? '+' : ''}${regression.slope.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
  document.querySelector<HTMLElement>('#analyticsRegressionSummary')!.textContent = `inclinação ${slopeLabel} páginas/período · R² ${regression.rSquared.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`;
}

function renderTypeTemporal(result: DashboardResult): void {
  const target = host('analyticsTypesTemporal');
  const topTypes = result.typeSummary.slice(0, 5).map((item) => item.type);
  if (result.series.length === 0 || topTypes.length === 0) return showEmpty(target);
  const width = 1000, height = 310, left = 54, right = 24, top = 24, bottom = 44;
  const chartW = width - left - right, chartH = height - top - bottom;
  const periods = result.series.map((point) => point.period);
  const lookup = new Map(result.typeSeries.map((point) => [`${point.period}\u0000${point.type}`, point.editions]));
  const valuesByType = topTypes.map((type) => periods.map((period) => lookup.get(`${period}\u0000${type}`) ?? 0));
  const maxY = Math.max(1, ...valuesByType.flat());
  const x = (i: number) => left + (periods.length === 1 ? chartW / 2 : (i / (periods.length - 1)) * chartW);
  const y = (value: number) => top + chartH - ((value / maxY) * chartH);
  const svg = createSvg(width, height);
  for (let step = 0; step <= 4; step += 1) {
    const value = (maxY / 4) * step;
    const yy = y(value);
    svg.append(svgNode('line', { x1: left, y1: yy, x2: width - right, y2: yy, class: 'svg-grid' }));
    svg.append(svgText(Math.round(value).toLocaleString('pt-BR'), left - 7, yy + 3, 'end'));
  }
  valuesByType.forEach((values, typeIndex) => {
    const points = values.map((value, i) => `${x(i)},${y(value)}`).join(' ');
    svg.append(svgNode('polyline', { points, class: TYPE_CLASSES[typeIndex], 'stroke-width': 2.2 }));
  });
  const labelIndexes = [...new Set([0, Math.floor((periods.length - 1) / 2), periods.length - 1])];
  for (const i of labelIndexes) svg.append(svgText(formatPeriod(periods[i], result.granularity), x(i), height - 16, 'middle'));
  target.append(svg);
  const legend = document.createElement('div');
  legend.className = 'legend';
  topTypes.forEach((type, i) => {
    const item = document.createElement('span'); item.className = 'legend-item';
    const swatch = document.createElement('span'); swatch.className = 'legend-swatch'; swatch.style.background = TYPE_COLORS[i];
    item.append(swatch, document.createTextNode(type)); legend.append(item);
  });
  target.append(legend);
}

function renderBars(id: string, rows: Array<{ label: string; count: number }>): void {
  const target = host(id);
  if (rows.length === 0) return showEmpty(target);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const table = document.createElement('div'); table.className = 'chart-table';
  for (const row of rows) {
    const item = document.createElement('div'); item.className = 'bar-row';
    const label = document.createElement('span'); label.className = 'bar-label'; label.textContent = row.label; label.title = row.label;
    const track = document.createElement('div'); track.className = 'bar-track';
    const bar = document.createElement('div'); bar.className = 'bar-value'; bar.style.width = `${(row.count / max) * 100}%`; track.append(bar);
    const amount = document.createElement('strong'); amount.className = 'bar-amount'; amount.textContent = row.count.toLocaleString('pt-BR');
    item.append(label, track, amount); table.append(item);
  }
  target.append(table);
}

function renderBoxplot(id: string, stats: AnalyticsDescriptiveStats, formatter: (value: number) => string, noteId: string): void {
  const target = host(id);
  const note = document.querySelector<HTMLElement>(`#${noteId}`)!;
  if (stats.count === 0) { note.textContent = ''; return showEmpty(target); }
  const width = 700, height = 180, left = 50, right = 30;
  const range = Math.max(1, stats.max - stats.min);
  const x = (value: number) => left + (((value - stats.min) / range) * (width - left - right));
  const svg = createSvg(width, height);
  const y = 85;
  svg.append(svgNode('line', { x1: x(stats.lowerWhisker), y1: y, x2: x(stats.upperWhisker), y2: y, class: 'svg-whisker' }));
  svg.append(svgNode('line', { x1: x(stats.lowerWhisker), y1: y - 18, x2: x(stats.lowerWhisker), y2: y + 18, class: 'svg-whisker' }));
  svg.append(svgNode('line', { x1: x(stats.upperWhisker), y1: y - 18, x2: x(stats.upperWhisker), y2: y + 18, class: 'svg-whisker' }));
  svg.append(svgNode('rect', { x: x(stats.q1), y: y - 28, width: Math.max(2, x(stats.q3) - x(stats.q1)), height: 56, class: 'svg-box' }));
  svg.append(svgNode('line', { x1: x(stats.median), y1: y - 28, x2: x(stats.median), y2: y + 28, class: 'svg-median' }));
  svg.append(svgText(formatter(stats.min), left, 145, 'start'));
  svg.append(svgText(formatter(stats.median), x(stats.median), 145, 'middle'));
  svg.append(svgText(formatter(stats.max), width - right, 145, 'end'));
  target.append(svg);
  note.textContent = `n=${stats.count.toLocaleString('pt-BR')} · Q1 ${formatter(stats.q1)} · mediana ${formatter(stats.median)} · Q3 ${formatter(stats.q3)} · ${stats.outliers.toLocaleString('pt-BR')} outlier(s) pelo critério 1,5×IQR.`;
}

function renderGaussian(): void {
  const target = host('analyticsGaussianChart');
  const note = document.querySelector<HTMLElement>('#analyticsGaussianNote')!;
  if (!current) return showEmpty(target);
  const pages = gaussianMetric.value === 'pages';
  const bins = pages ? current.pageGaussian : current.fileSizeGaussian;
  const stats = pages ? current.pageStats : current.fileSizeStats;
  if (bins.length === 0 || stats.count === 0) { note.textContent = ''; return showEmpty(target); }
  const width = 1000, height = 310, left = 62, right = 28, top = 24, bottom = 48;
  const chartW = width - left - right, chartH = height - top - bottom;
  const binWidthValue = bins.length > 1 ? bins[0].upper - bins[0].lower : 0;
  const expected = bins.map((bin) => gaussianDensity(bin.center, stats.mean, stats.stdDev) * stats.count * binWidthValue);
  const maxY = Math.max(1, ...bins.map((bin) => bin.count), ...expected);
  const barWidth = chartW / bins.length;
  const y = (value: number) => top + chartH - ((value / maxY) * chartH);
  const svg = createSvg(width, height);
  bins.forEach((bin, index) => {
    const x = left + (index * barWidth);
    svg.append(svgNode('rect', { x: x + 1, y: y(bin.count), width: Math.max(1, barWidth - 2), height: top + chartH - y(bin.count), class: 'svg-bar' }));
  });
  if (stats.stdDev > 0 && binWidthValue > 0) {
    const points = bins.map((bin, index) => `${left + ((index + .5) * barWidth)},${y(expected[index])}`).join(' ');
    svg.append(svgNode('polyline', { points, class: 'svg-gaussian' }));
  }
  const formatter = pages ? (value: number) => Math.round(value).toLocaleString('pt-BR') : (value: number) => `${(value / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  svg.append(svgText(formatter(bins[0].lower), left, height - 16, 'start'));
  svg.append(svgText(formatter(bins[bins.length - 1].upper), width - right, height - 16, 'end'));
  target.append(svg);
  note.textContent = `Histograma observado (barras) e curva normal ajustada pela média ${formatter(stats.mean)} e desvio-padrão ${formatter(stats.stdDev)}. A curva é referência visual; não implica que os dados sejam normalmente distribuídos.`;
}

function renderDashboard(result: DashboardResult, filter: AnalyticsFilter): void {
  current = result;
  document.querySelector<HTMLElement>('#analyticsPageEditions')!.textContent = result.summary.editions.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPagePages')!.textContent = result.summary.pages.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPageFiles')!.textContent = result.summary.files.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPageBytes')!.textContent = formatBytes(result.summary.knownBytes);
  document.querySelector<HTMLElement>('#analyticsPageFilters')!.textContent = `Filtros ativos: ${filterDescription(filter)}.`;
  document.querySelector<HTMLElement>('#analyticsPageMissingPages')!.textContent = result.quality.missingPages.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPageMissingNormal')!.textContent = result.quality.missingNormalLinks.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPageMissingSigned')!.textContent = result.quality.missingSignedLinks.toLocaleString('pt-BR');
  document.querySelector<HTMLElement>('#analyticsPageUnknownSizes')!.textContent = result.quality.unknownFileSizes.toLocaleString('pt-BR');
  renderTemporalPages(result);
  renderTypeTemporal(result);
  renderBars('analyticsTypesBars', result.typeSummary.slice(0, 12).map((row) => ({ label: row.type, count: row.editions })));
  renderBars('analyticsPagesDistribution', result.pageDistribution.map((row) => ({ label: row.label, count: row.count })));
  renderBars('analyticsSizesDistribution', result.fileSizeDistribution.map((row) => ({ label: row.label, count: row.count })));
  renderBoxplot('analyticsPagesBoxplot', result.pageStats, (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 'analyticsPagesBoxplotNote');
  renderBoxplot('analyticsSizesBoxplot', result.fileSizeStats, (value) => formatBytes(value), 'analyticsSizesBoxplotNote');
  renderGaussian();
}

async function loadOptions(): Promise<void> {
  if (optionsLoaded) return;
  const result = await analytics.call<{ editionTypes: string[] }>('analyticsOptions');
  for (const type of result.editionTypes) {
    const option = document.createElement('option'); option.value = type; option.textContent = type; editionType.append(option);
  }
  optionsLoaded = true;
}

async function run(): Promise<void> {
  submitButton.disabled = true;
  clearButton.disabled = true;
  submitButton.textContent = 'Calculando…';
  errorBox.hidden = true;
  errorBox.textContent = '';
  try {
    await loadOptions();
    const filter = collectFilter();
    const result = await analytics.call<DashboardResult>('analyticsDashboard', { filter, granularity: granularity.value });
    renderDashboard(result, filter);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    submitButton.disabled = false;
    clearButton.disabled = false;
    submitButton.textContent = 'Atualizar';
  }
}

form.addEventListener('submit', (event) => { event.preventDefault(); void run(); });
clearButton.addEventListener('click', () => { form.reset(); void run(); });
gaussianMetric.addEventListener('change', renderGaussian);
void run();
