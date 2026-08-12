import type { EditionQueryAvailability, EditionQueryFilter, EditionQuerySupplement } from './query-model';

const EGBANET_ORIGIN = 'https://egbanet.egba.ba.gov.br';

interface EditionQueryRow {
  egbanetId: number;
  editionType: string;
  date: string;
  editionNumber: number;
  supplement: boolean | null;
  pages: number | null;
  normalUrl: string | null;
  normalBytes: number | null;
  signedUrl: string | null;
  signedBytes: number | null;
}

interface EditionQueryResult {
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    editions: number;
    pages: number;
    unknownPages: number;
    normalFiles: number;
    signedFiles: number;
    knownBytes: number;
  };
  rows: EditionQueryRow[];
}

class QueryClient {
  private worker = new Worker(new URL('./query-db-worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent) => {
      const response = event.data as { requestId: string; ok: boolean; data?: unknown; error?: string };
      const request = this.pending.get(response.requestId);
      if (!request) return;
      this.pending.delete(response.requestId);
      if (response.ok) request.resolve(response.data);
      else request.reject(new Error(response.error ?? 'Falha na consulta do SQLite.'));
    });

    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falha ao inicializar o worker de consulta.');
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

const query = new QueryClient();

const queryTabButton = document.querySelector<HTMLButtonElement>('#queryTabButton')!;
const queryPanel = document.querySelector<HTMLElement>('#queryPanel')!;
const queryForm = document.querySelector<HTMLFormElement>('#queryForm')!;
const queryStartDate = document.querySelector<HTMLInputElement>('#queryStartDate')!;
const queryEndDate = document.querySelector<HTMLInputElement>('#queryEndDate')!;
const queryEditionNumber = document.querySelector<HTMLInputElement>('#queryEditionNumber')!;
const queryEgbanetId = document.querySelector<HTMLInputElement>('#queryEgbanetId')!;
const queryEditionType = document.querySelector<HTMLSelectElement>('#queryEditionType')!;
const querySupplement = document.querySelector<HTMLSelectElement>('#querySupplement')!;
const queryAvailability = document.querySelector<HTMLSelectElement>('#queryAvailability')!;
const querySubmitButton = document.querySelector<HTMLButtonElement>('#querySubmitButton')!;
const queryClearButton = document.querySelector<HTMLButtonElement>('#queryClearButton')!;
const queryErrorBox = document.querySelector<HTMLElement>('#queryErrorBox')!;
const querySummaryEditions = document.querySelector<HTMLElement>('#querySummaryEditions')!;
const querySummaryPages = document.querySelector<HTMLElement>('#querySummaryPages')!;
const querySummaryFiles = document.querySelector<HTMLElement>('#querySummaryFiles')!;
const querySummaryBytes = document.querySelector<HTMLElement>('#querySummaryBytes')!;
const queryResultCount = document.querySelector<HTMLElement>('#queryResultCount')!;
const queryTableBody = document.querySelector<HTMLTableSectionElement>('#queryTableBody')!;
const queryPrevButton = document.querySelector<HTMLButtonElement>('#queryPrevButton')!;
const queryNextButton = document.querySelector<HTMLButtonElement>('#queryNextButton')!;
const queryPageLabel = document.querySelector<HTMLElement>('#queryPageLabel')!;

const existingTabs = [
  document.querySelector<HTMLButtonElement>('#inventoryTabButton'),
  document.querySelector<HTMLButtonElement>('#downloadsTabButton'),
  document.querySelector<HTMLButtonElement>('#batchTabButton')
].filter((value): value is HTMLButtonElement => value !== null);

const existingPanels = [
  document.querySelector<HTMLElement>('#inventoryPanel'),
  document.querySelector<HTMLElement>('#downloadsPanel'),
  document.querySelector<HTMLElement>('#batchPanel')
].filter((value): value is HTMLElement => value !== null);

let optionsLoaded = false;
let firstQueryDone = false;
let currentPage = 1;
let totalPages = 0;
let busy = false;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
  return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function parseOptionalPositiveInteger(input: HTMLInputElement, label: string): number | undefined {
  const raw = input.value.trim();
  if (!raw) return undefined;
  if (!/^\d+$/.test(raw)) throw new Error(`${label} deve conter somente números.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} inválido.`);
  return value;
}

function collectFilter(page: number): EditionQueryFilter {
  return {
    startDate: queryStartDate.value || undefined,
    endDate: queryEndDate.value || undefined,
    editionNumber: parseOptionalPositiveInteger(queryEditionNumber, 'Número da edição'),
    egbanetId: parseOptionalPositiveInteger(queryEgbanetId, 'ID EGBANET'),
    editionType: queryEditionType.value || undefined,
    supplement: querySupplement.value as EditionQuerySupplement,
    availability: queryAvailability.value as EditionQueryAvailability,
    page,
    pageSize: 25
  };
}

function syncControls(): void {
  querySubmitButton.disabled = busy;
  queryClearButton.disabled = busy;
  queryPrevButton.disabled = busy || currentPage <= 1 || totalPages === 0;
  queryNextButton.disabled = busy || totalPages === 0 || currentPage >= totalPages;
  querySubmitButton.textContent = busy ? 'Consultando…' : 'Consultar';
}

function createDownloadLink(relativeUrl: string | null, label: string, bytes: number | null): HTMLElement {
  if (!relativeUrl) {
    const missing = document.createElement('span');
    missing.className = 'query-link-missing';
    missing.textContent = '—';
    return missing;
  }

  const anchor = document.createElement('a');
  anchor.className = 'query-file-link';
  anchor.href = new URL(relativeUrl, EGBANET_ORIGIN).href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = label;
  if (bytes !== null) anchor.title = formatBytes(bytes);
  return anchor;
}

function renderRows(rows: EditionQueryRow[]): void {
  queryTableBody.replaceChildren();
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'query-empty';
    td.textContent = 'Nenhuma edição corresponde aos filtros.';
    tr.append(td);
    queryTableBody.append(tr);
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');

    const date = document.createElement('td');
    date.textContent = formatDate(row.date);

    const edition = document.createElement('td');
    const editionStrong = document.createElement('strong');
    editionStrong.textContent = row.editionNumber.toLocaleString('pt-BR');
    const editionId = document.createElement('small');
    editionId.textContent = `ID ${row.egbanetId}`;
    edition.append(editionStrong, editionId);

    const type = document.createElement('td');
    type.textContent = row.editionType;
    if (row.supplement === true) {
      const badge = document.createElement('span');
      badge.className = 'query-mini-badge';
      badge.textContent = 'Suplemento';
      type.append(document.createElement('br'), badge);
    }

    const pages = document.createElement('td');
    pages.textContent = row.pages === null ? '—' : row.pages.toLocaleString('pt-BR');

    const normal = document.createElement('td');
    normal.append(createDownloadLink(row.normalUrl, 'Normal', row.normalBytes));

    const signed = document.createElement('td');
    signed.append(createDownloadLink(row.signedUrl, 'Assinado', row.signedBytes));

    const id = document.createElement('td');
    id.textContent = row.egbanetId.toLocaleString('pt-BR');

    tr.append(date, edition, type, pages, normal, signed, id);
    queryTableBody.append(tr);
  }
}

function render(result: EditionQueryResult): void {
  currentPage = result.page;
  totalPages = result.totalPages;
  querySummaryEditions.textContent = result.summary.editions.toLocaleString('pt-BR');
  querySummaryPages.textContent = result.summary.pages.toLocaleString('pt-BR');
  querySummaryFiles.textContent = (result.summary.normalFiles + result.summary.signedFiles).toLocaleString('pt-BR');
  querySummaryBytes.textContent = formatBytes(result.summary.knownBytes);
  queryResultCount.textContent = `${result.summary.editions.toLocaleString('pt-BR')} edição(ões)`;
  queryPageLabel.textContent = totalPages === 0 ? 'Página 0 de 0' : `Página ${currentPage} de ${totalPages}`;
  renderRows(result.rows);
  syncControls();
}

async function loadOptions(): Promise<void> {
  if (optionsLoaded) return;
  const result = await query.call<{ editionTypes: string[] }>('queryOptions');
  for (const editionType of result.editionTypes) {
    const option = document.createElement('option');
    option.value = editionType;
    option.textContent = editionType;
    queryEditionType.append(option);
  }
  optionsLoaded = true;
}

async function runQuery(page = 1): Promise<void> {
  busy = true;
  queryErrorBox.hidden = true;
  queryErrorBox.textContent = '';
  syncControls();
  try {
    await loadOptions();
    const result = await query.call<EditionQueryResult>('queryEditions', { filter: collectFilter(page) });
    render(result);
    firstQueryDone = true;
  } catch (error) {
    queryErrorBox.hidden = false;
    queryErrorBox.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
    syncControls();
  }
}

function activateQueryTab(): void {
  for (const panel of existingPanels) panel.hidden = true;
  for (const tab of existingTabs) {
    tab.classList.remove('is-active');
    tab.setAttribute('aria-selected', 'false');
  }
  queryPanel.hidden = false;
  queryTabButton.classList.add('is-active');
  queryTabButton.setAttribute('aria-selected', 'true');
  if (!firstQueryDone) void runQuery(1);
}

for (const tab of existingTabs) {
  tab.addEventListener('click', () => {
    queryPanel.hidden = true;
    queryTabButton.classList.remove('is-active');
    queryTabButton.setAttribute('aria-selected', 'false');
  });
}

queryTabButton.addEventListener('click', activateQueryTab);
queryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void runQuery(1);
});
queryClearButton.addEventListener('click', () => {
  queryForm.reset();
  void runQuery(1);
});
queryPrevButton.addEventListener('click', () => void runQuery(Math.max(1, currentPage - 1)));
queryNextButton.addEventListener('click', () => void runQuery(currentPage + 1));

syncControls();
