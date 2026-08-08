import type { EditionDownloadLinks, EditionRecord, ParsedEditionPage } from './types';

const REQUIRED_HEADERS = ['id', 'tipo de edicao', 'data edicao', 'numero'];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function text(cell: Element | undefined): string {
  return cell?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function integer(value: string): number | null {
  const normalized = value.replace(/\D/g, '');
  return normalized ? Number(normalized) : null;
}

function yesNo(value: string): boolean | null {
  const normalized = normalize(value);
  if (normalized === 'sim') return true;
  if (normalized === 'nao') return false;
  return null;
}

export function parseBrDate(value: string): string {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Data de edição inválida: ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseBrDateTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}`;
  const normal = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!normal) throw new Error(`Data de publicação inválida: ${value}`);
  return `${normal[3]}-${normal[2]}-${normal[1]}T${normal[4]}:${normal[5]}:${normal[6]}`;
}

function resolveTable(document: Document): HTMLTableElement {
  const tables = [...document.querySelectorAll('table')];
  const table = tables.find((candidate) => {
    const headers = [...candidate.querySelectorAll('thead th')].map((header) => normalize(text(header)));
    return REQUIRED_HEADERS.every((required) => headers.includes(required));
  });

  if (!table) {
    throw new Error('Tabela de edições não encontrada. A sessão pode ter expirado ou o EGBANET mudou a estrutura da página.');
  }
  return table as HTMLTableElement;
}

function headerMap(table: HTMLTableElement): Map<string, number> {
  const map = new Map<string, number>();
  [...table.querySelectorAll('thead th')].forEach((header, index) => map.set(normalize(text(header)), index));
  return map;
}

function cell(cells: Element[], headers: Map<string, number>, label: string): Element | undefined {
  const index = headers.get(normalize(label));
  return index === undefined ? undefined : cells[index];
}

function requiredInteger(value: string, label: string): number {
  const parsed = integer(value);
  if (parsed === null) throw new Error(`${label} inválido: ${value}`);
  return parsed;
}

function parseRow(row: Element, headers: Map<string, number>, pageNumber: number): EditionRecord {
  const cells = [...row.querySelectorAll(':scope > td')];
  const actionsCell = cell(cells, headers, 'Ações');
  const editLink = actionsCell?.querySelector<HTMLAnchorElement>('a[title="Editar"], a[href^="/admin/edicoes/edit/"]');
  const viewLink = actionsCell?.querySelector<HTMLAnchorElement>('a[title="Visualizar Edição"], a[href^="/admin/edicoes/view/"]');
  const egbanetId = requiredInteger(text(cell(cells, headers, 'ID')), 'ID EGBANET');

  return {
    egbanetId,
    tipoEdicao: text(cell(cells, headers, 'Tipo de Edição')),
    dataEdicao: parseBrDate(text(cell(cells, headers, 'Data Edição'))),
    numeroEdicao: requiredInteger(text(cell(cells, headers, 'Número')), 'Número da edição'),
    suplemento: yesNo(text(cell(cells, headers, 'Suplemento'))),
    numeroPaginas: integer(text(cell(cells, headers, 'Num. Pags.'))),
    materias: integer(text(cell(cells, headers, 'Matérias'))),
    materiasPendentes: integer(text(cell(cells, headers, 'Matérias Pendentes'))),
    downloads: integer(text(cell(cells, headers, 'Downloads'))),
    publicadaInternet: yesNo(text(cell(cells, headers, 'Pub. Internet'))),
    dataPublicacao: parseBrDateTime(text(cell(cells, headers, 'Data Pub.'))),
    editUrl: editLink?.getAttribute('href') ?? `/admin/edicoes/edit/${egbanetId}`,
    viewUrl: viewLink?.getAttribute('href') ?? `/admin/edicoes/view/${egbanetId}`,
    paginaOrigem: pageNumber
  };
}

function resolveCurrentVersionRow(table: HTMLTableElement): HTMLTableRowElement {
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody > tr')];
  const current = rows.find((row) => {
    const firstCell = row.querySelector(':scope > td');
    return normalize(text(firstCell ?? undefined)).includes('versao atual');
  });

  if (!current) {
    throw new Error('A tabela de versões não possui uma linha contendo a expressão Versão Atual.');
  }
  return current;
}

function validateDownloadHref(href: string | null, egbanetId: number, kind: '0' | '1'): string | null {
  if (!href) return null;
  const match = href.match(/^\/admin\/edicoes\/download_versao\/(\d+)_\d+\/([012])$/);
  if (!match) return null;
  if (Number(match[1]) !== egbanetId || match[2] !== kind) return null;
  return href;
}

export function parseEditionDownloadLinks(html: string, egbanetId: number): EditionDownloadLinks {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = document.querySelector<HTMLTableElement>('table#table_list');
  if (!table) {
    throw new Error(`Tabela de versões não encontrada na edição ${egbanetId}.`);
  }

  const headers = headerMap(table);
  if (!headers.has('download assinado') || !headers.has('normal')) {
    throw new Error(`Colunas de download esperadas não foram encontradas na edição ${egbanetId}.`);
  }

  const currentRow = resolveCurrentVersionRow(table);
  const cells = [...currentRow.querySelectorAll(':scope > td')];
  const signedHref = cell(cells, headers, 'Download Assinado')?.querySelector<HTMLAnchorElement>('a[href]')?.getAttribute('href') ?? null;
  const diaryHref = cell(cells, headers, 'Normal')?.querySelector<HTMLAnchorElement>('a[href]')?.getAttribute('href') ?? null;

  return {
    downloadAssinadoUrl: validateDownloadHref(signedHref, egbanetId, '1'),
    downloadDiarioUrl: validateDownloadHref(diaryHref, egbanetId, '0')
  };
}

export function parseEditionPage(html: string, pageNumber: number): ParsedEditionPage {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const table = resolveTable(document);
  const headers = headerMap(table);
  const editions = [...table.querySelectorAll('tbody > tr')]
    .filter((row) => row.querySelector('td'))
    .map((row) => parseRow(row, headers, pageNumber));

  const nextLink = document.querySelector<HTMLAnchorElement>('div.paging_bootstrap.pagination li.next:not(.disabled) > a');
  const candidate = nextLink?.getAttribute('href') ?? null;
  const nextHref = candidate && /^\/admin\/edicoes\/index\/page:\d+$/.test(candidate) ? candidate : null;

  return { editions, nextHref };
}
