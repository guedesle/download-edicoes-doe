import { createXlsx, type XlsxCell } from './xlsx';

const EGBANET_ORIGIN = 'https://egbanet.egba.ba.gov.br';

export interface EditionExportRow {
  egbanetId: number;
  editionType: string;
  date: string;
  editionNumber: number;
  supplement: boolean;
  pages: number | null;
  normalUrl: string | null;
  normalBytes: number | null;
  signedUrl: string | null;
  signedBytes: number | null;
}

const HEADERS = [
  'Data',
  'Número da edição',
  'ID EGBANET',
  'Tipo de edição',
  'Suplemento',
  'Páginas',
  'URL normal',
  'Bytes normal',
  'URL assinado',
  'Bytes assinado',
  'Bytes total'
];

function absoluteUrl(relativeUrl: string | null): string {
  return relativeUrl ? new URL(relativeUrl, EGBANET_ORIGIN).href : '';
}

function values(row: EditionExportRow): XlsxCell[] {
  return [
    row.date,
    row.editionNumber,
    row.egbanetId,
    row.editionType,
    row.supplement ? 'Sim' : 'Não',
    row.pages,
    absoluteUrl(row.normalUrl),
    row.normalBytes,
    absoluteUrl(row.signedUrl),
    row.signedBytes,
    (row.normalBytes ?? 0) + (row.signedBytes ?? 0)
  ];
}

function csvCell(value: XlsxCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createQueryCsv(rows: EditionExportRow[]): Uint8Array {
  const lines = [HEADERS, ...rows.map(values)].map((row) => row.map(csvCell).join(';'));
  return new TextEncoder().encode(`\ufeff${lines.join('\r\n')}\r\n`);
}

export function createQueryXlsx(rows: EditionExportRow[]): Uint8Array {
  return createXlsx([HEADERS, ...rows.map(values)], 'Edições');
}
