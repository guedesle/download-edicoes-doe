/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  FILE_SIZE_DISTRIBUTION,
  PAGE_DISTRIBUTION,
  analyticsPeriodSql,
  buildFixedDistribution,
  buildGaussianHistogram,
  calculateDescriptiveStats,
  calculateLinearRegression,
  normalizeAnalyticsGranularity
} from './analytics-model';
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
import { buildEditionQueryWhere } from './query-model';
import type { EditionQueryFilter } from './query-model';

const DB_NAME = '/download-edicoes-doe.sqlite3';
let dbPromise: Promise<any> | null = null;

interface AnalyticsSummary {
  editions: number;
  pages: number;
  files: number;
  knownBytes: number;
}

interface AnalyticsQuality {
  missingPages: number;
  missingNormalLinks: number;
  missingSignedLinks: number;
  unknownFileSizes: number;
}

export interface AnalyticsDashboardData {
  summary: AnalyticsSummary;
  quality: AnalyticsQuality;
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

async function getDb(): Promise<any> {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!self.crossOriginIsolated) {
        throw new Error('SQLite OPFS requer isolamento COOP/COEP. Recarregue a extensão.');
      }
      const sqlite3 = await sqlite3InitModule();
      if (!sqlite3?.oo1?.OpfsDb) throw new Error('SQLite OPFS não está disponível neste navegador.');
      return new sqlite3.oo1.OpfsDb(DB_NAME, 'r');
    })();
  }
  return dbPromise;
}

function editionsTableExists(db: any): boolean {
  return Number(db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='edicoes'")) > 0;
}

function addWhereCondition(whereSql: string, condition: string): string {
  return whereSql ? `${whereSql} AND ${condition}` : `WHERE ${condition}`;
}

function emptyDashboard(granularity: AnalyticsGranularity): AnalyticsDashboardData {
  return {
    summary: { editions: 0, pages: 0, files: 0, knownBytes: 0 },
    quality: { missingPages: 0, missingNormalLinks: 0, missingSignedLinks: 0, unknownFileSizes: 0 },
    series: [],
    typeSeries: [],
    typeSummary: [],
    pageDistribution: buildFixedDistribution([], PAGE_DISTRIBUTION),
    fileSizeDistribution: buildFixedDistribution([], FILE_SIZE_DISTRIBUTION),
    pageGaussian: [],
    fileSizeGaussian: [],
    pageStats: calculateDescriptiveStats([]),
    fileSizeStats: calculateDescriptiveStats([]),
    pageRegression: calculateLinearRegression([]),
    granularity
  };
}

async function queryOptions(): Promise<{ editionTypes: string[] }> {
  const db = await getDb();
  if (!editionsTableExists(db)) return { editionTypes: [] };

  const editionTypes: string[] = [];
  db.exec({
    sql: `SELECT DISTINCT tipo_edicao FROM edicoes
          WHERE tipo_edicao IS NOT NULL AND TRIM(tipo_edicao) <> ''
          ORDER BY tipo_edicao COLLATE NOCASE ASC`,
    rowMode: 'array',
    callback: (row: unknown[]) => editionTypes.push(String(row[0]))
  });
  return { editionTypes };
}

async function queryDashboard(inputFilter: AnalyticsFilter, inputGranularity: unknown): Promise<AnalyticsDashboardData> {
  const db = await getDb();
  const granularity = normalizeAnalyticsGranularity(inputGranularity ?? 'month');
  if (!editionsTableExists(db)) return emptyDashboard(granularity);

  const { whereSql, bind } = buildEditionQueryWhere(inputFilter as EditionQueryFilter);

  let summaryRow: unknown[] | null = null;
  db.exec({
    sql: `
      SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(numero_paginas, 0)), 0),
        COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL THEN 1 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(COALESCE(download_diario_bytes, 0) + COALESCE(download_assinado_bytes, 0)), 0)
      FROM edicoes
      ${whereSql}
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => { summaryRow = row; }
  });

  const summary: AnalyticsSummary = summaryRow
    ? {
        editions: Number(summaryRow[0]),
        pages: Number(summaryRow[1]),
        files: Number(summaryRow[2]),
        knownBytes: Number(summaryRow[3])
      }
    : { editions: 0, pages: 0, files: 0, knownBytes: 0 };

  let qualityRow: unknown[] | null = null;
  db.exec({
    sql: `
      SELECT
        COALESCE(SUM(CASE WHEN numero_paginas IS NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN download_diario_url IS NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN download_assinado_url IS NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL AND download_diario_bytes IS NULL THEN 1 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL AND download_assinado_bytes IS NULL THEN 1 ELSE 0 END), 0)
      FROM edicoes
      ${whereSql}
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => { qualityRow = row; }
  });

  const quality: AnalyticsQuality = qualityRow
    ? {
        missingPages: Number(qualityRow[0]),
        missingNormalLinks: Number(qualityRow[1]),
        missingSignedLinks: Number(qualityRow[2]),
        unknownFileSizes: Number(qualityRow[3])
      }
    : { missingPages: 0, missingNormalLinks: 0, missingSignedLinks: 0, unknownFileSizes: 0 };

  const periodSql = analyticsPeriodSql(granularity);
  const series: AnalyticsSeriesPoint[] = [];
  db.exec({
    sql: `
      SELECT
        ${periodSql} AS periodo,
        COUNT(*),
        COALESCE(SUM(COALESCE(numero_paginas, 0)), 0),
        COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL THEN 1 ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(COALESCE(download_diario_bytes, 0) + COALESCE(download_assinado_bytes, 0)), 0)
      FROM edicoes
      ${whereSql}
      GROUP BY periodo
      ORDER BY periodo ASC
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => series.push({
      period: String(row[0]),
      editions: Number(row[1]),
      pages: Number(row[2]),
      files: Number(row[3]),
      bytes: Number(row[4])
    })
  });

  const typeSummary: AnalyticsTypeSummary[] = [];
  db.exec({
    sql: `
      SELECT COALESCE(NULLIF(TRIM(tipo_edicao), ''), '(sem tipo)') AS tipo,
             COUNT(*), COALESCE(SUM(COALESCE(numero_paginas, 0)), 0)
      FROM edicoes
      ${whereSql}
      GROUP BY tipo
      ORDER BY COUNT(*) DESC, tipo COLLATE NOCASE ASC
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => typeSummary.push({ type: String(row[0]), editions: Number(row[1]), pages: Number(row[2]) })
  });

  const typeSeries: AnalyticsTypePoint[] = [];
  db.exec({
    sql: `
      SELECT ${periodSql} AS periodo,
             COALESCE(NULLIF(TRIM(tipo_edicao), ''), '(sem tipo)') AS tipo,
             COUNT(*), COALESCE(SUM(COALESCE(numero_paginas, 0)), 0)
      FROM edicoes
      ${whereSql}
      GROUP BY periodo, tipo
      ORDER BY periodo ASC, tipo COLLATE NOCASE ASC
    `,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => typeSeries.push({
      period: String(row[0]),
      type: String(row[1]),
      editions: Number(row[2]),
      pages: Number(row[3])
    })
  });

  const pageValues: number[] = [];
  db.exec({
    sql: `SELECT numero_paginas FROM edicoes ${addWhereCondition(whereSql, 'numero_paginas IS NOT NULL AND numero_paginas >= 0')}`,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => pageValues.push(Number(row[0]))
  });

  const fileSizeValues: number[] = [];
  db.exec({
    sql: `SELECT download_diario_bytes FROM edicoes ${addWhereCondition(whereSql, 'download_diario_bytes IS NOT NULL AND download_diario_bytes > 0')}`,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => fileSizeValues.push(Number(row[0]))
  });
  db.exec({
    sql: `SELECT download_assinado_bytes FROM edicoes ${addWhereCondition(whereSql, 'download_assinado_bytes IS NOT NULL AND download_assinado_bytes > 0')}`,
    bind,
    rowMode: 'array',
    callback: (row: unknown[]) => fileSizeValues.push(Number(row[0]))
  });

  return {
    summary,
    quality,
    series,
    typeSeries,
    typeSummary,
    pageDistribution: buildFixedDistribution(pageValues, PAGE_DISTRIBUTION),
    fileSizeDistribution: buildFixedDistribution(fileSizeValues, FILE_SIZE_DISTRIBUTION),
    pageGaussian: buildGaussianHistogram(pageValues),
    fileSizeGaussian: buildGaussianHistogram(fileSizeValues),
    pageStats: calculateDescriptiveStats(pageValues),
    fileSizeStats: calculateDescriptiveStats(fileSizeValues),
    pageRegression: calculateLinearRegression(series.map((point) => point.pages)),
    granularity
  };
}

async function handle(action: string, payload: any): Promise<unknown> {
  if (action === 'analyticsOptions') return queryOptions();
  if (action === 'analyticsDashboard') return queryDashboard(payload.filter ?? {}, payload.granularity ?? 'month');
  throw new Error(`Ação de analytics desconhecida: ${action}`);
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { requestId, action, payload } = event.data ?? {};
  const response: { requestId: string; ok: boolean; data?: unknown; error?: string } = { requestId, ok: true };
  try {
    response.data = await handle(action, payload);
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : String(error);
  }
  self.postMessage(response);
});
