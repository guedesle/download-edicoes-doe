import './styles.css';
import { parseEgbanetIdList } from './download-batches';
import type {
  DownloadBatchCreated,
  DownloadBatchFileType,
  DownloadBatchFilter,
  DownloadBatchPreview,
  DownloadCaptureMode,
  DownloadCaptureStats,
  DownloadCaptureStatus,
  SyncStatus
} from './types';

const INVENTORY_STATUS_KEY = 'inventorySyncStatus';
const DOWNLOAD_STATUS_KEY = 'downloadCaptureStatus';

type AppTab = 'inventory' | 'downloads' | 'batch';

const elements = {
  inventoryTabButton: document.querySelector<HTMLButtonElement>('#inventoryTabButton')!,
  downloadsTabButton: document.querySelector<HTMLButtonElement>('#downloadsTabButton')!,
  batchTabButton: document.querySelector<HTMLButtonElement>('#batchTabButton')!,
  inventoryPanel: document.querySelector<HTMLElement>('#inventoryPanel')!,
  downloadsPanel: document.querySelector<HTMLElement>('#downloadsPanel')!,
  batchPanel: document.querySelector<HTMLElement>('#batchPanel')!,

  statusBadge: document.querySelector<HTMLElement>('#statusBadge')!,
  totalEditions: document.querySelector<HTMLElement>('#totalEditions')!,
  pagesProcessed: document.querySelector<HTMLElement>('#pagesProcessed')!,
  progressPanel: document.querySelector<HTMLElement>('#progressPanel')!,
  progressBar: document.querySelector<HTMLElement>('#progressBar')!,
  progressText: document.querySelector<HTMLElement>('#progressText')!,
  lastSync: document.querySelector<HTMLElement>('#lastSync')!,
  insertedCount: document.querySelector<HTMLElement>('#insertedCount')!,
  updatedCount: document.querySelector<HTMLElement>('#updatedCount')!,
  errorBox: document.querySelector<HTMLElement>('#errorBox')!,
  syncButton: document.querySelector<HTMLButtonElement>('#syncButton')!,
  exportSqliteButton: document.querySelector<HTMLButtonElement>('#exportSqliteButton')!,
  cancelButton: document.querySelector<HTMLButtonElement>('#cancelButton')!,

  downloadStatusBadge: document.querySelector<HTMLElement>('#downloadStatusBadge')!,
  capturedEditions: document.querySelector<HTMLElement>('#capturedEditions')!,
  downloadProcessed: document.querySelector<HTMLElement>('#downloadProcessed')!,
  downloadProgressPanel: document.querySelector<HTMLElement>('#downloadProgressPanel')!,
  downloadProgressBar: document.querySelector<HTMLElement>('#downloadProgressBar')!,
  downloadProgressText: document.querySelector<HTMLElement>('#downloadProgressText')!,
  signedLinksCount: document.querySelector<HTMLElement>('#signedLinksCount')!,
  diaryLinksCount: document.querySelector<HTMLElement>('#diaryLinksCount')!,
  sizesCount: document.querySelector<HTMLElement>('#sizesCount')!,
  downloadFailures: document.querySelector<HTMLElement>('#downloadFailures')!,
  downloadErrorBox: document.querySelector<HTMLElement>('#downloadErrorBox')!,
  capturePendingButton: document.querySelector<HTMLButtonElement>('#capturePendingButton')!,
  captureAllButton: document.querySelector<HTMLButtonElement>('#captureAllButton')!,
  cancelCaptureButton: document.querySelector<HTMLButtonElement>('#cancelCaptureButton')!,

  batchCriterionSelect: document.querySelector<HTMLSelectElement>('#batchCriterionSelect')!,
  batchPeriodFields: document.querySelector<HTMLElement>('#batchPeriodFields')!,
  batchIdsField: document.querySelector<HTMLElement>('#batchIdsField')!,
  batchStartDate: document.querySelector<HTMLInputElement>('#batchStartDate')!,
  batchEndDate: document.querySelector<HTMLInputElement>('#batchEndDate')!,
  batchIdsInput: document.querySelector<HTMLTextAreaElement>('#batchIdsInput')!,
  batchFileTypeSelect: document.querySelector<HTMLSelectElement>('#batchFileTypeSelect')!,
  batchNameInput: document.querySelector<HTMLInputElement>('#batchNameInput')!,
  batchErrorBox: document.querySelector<HTMLElement>('#batchErrorBox')!,
  batchSuccessBox: document.querySelector<HTMLElement>('#batchSuccessBox')!,
  batchPreviewPanel: document.querySelector<HTMLElement>('#batchPreviewPanel')!,
  batchPreviewEditions: document.querySelector<HTMLElement>('#batchPreviewEditions')!,
  batchPreviewFiles: document.querySelector<HTMLElement>('#batchPreviewFiles')!,
  batchPreviewPages: document.querySelector<HTMLElement>('#batchPreviewPages')!,
  batchPreviewSize: document.querySelector<HTMLElement>('#batchPreviewSize')!,
  batchPreviewNormal: document.querySelector<HTMLElement>('#batchPreviewNormal')!,
  batchPreviewSigned: document.querySelector<HTMLElement>('#batchPreviewSigned')!,
  batchPreviewMissingLinks: document.querySelector<HTMLElement>('#batchPreviewMissingLinks')!,
  batchPreviewUnknownSizes: document.querySelector<HTMLElement>('#batchPreviewUnknownSizes')!,
  batchPreviewNote: document.querySelector<HTMLElement>('#batchPreviewNote')!,
  previewBatchButton: document.querySelector<HTMLButtonElement>('#previewBatchButton')!,
  createBatchButton: document.querySelector<HTMLButtonElement>('#createBatchButton')!
};

const EMPTY_STATUS: SyncStatus = {
  state: 'idle',
  pagesProcessed: 0,
  editionsSeen: 0,
  inserted: 0,
  updated: 0,
  totalEditions: 0
};

const EMPTY_DOWNLOAD_STATUS: DownloadCaptureStatus = {
  state: 'idle',
  mode: 'pending',
  totalEditions: 0,
  totalTargets: 0,
  processed: 0,
  signedFound: 0,
  diaryFound: 0,
  signedSizesFound: 0,
  diarySizesFound: 0,
  failures: 0,
  capturedEditions: 0
};

let inventoryStatus: SyncStatus = EMPTY_STATUS;
let downloadStatus: DownloadCaptureStatus = EMPTY_DOWNLOAD_STATUS;
let exportRunning = false;
let batchBusy = false;
let currentBatchPreview: DownloadBatchPreview | null = null;

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(value));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
  const gb = mb / 1024;
  return `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

function stateLabel(state: SyncStatus['state']): string {
  switch (state) {
    case 'running': return 'Executando';
    case 'completed': return 'Concluído';
    case 'cancelled': return 'Cancelado';
    case 'error': return 'Atenção';
    default: return 'Pronto';
  }
}

function syncControls(): void {
  const inventoryRunning = inventoryStatus.state === 'running';
  const captureRunning = downloadStatus.state === 'running';
  const anyRunning = inventoryRunning || captureRunning || exportRunning;

  elements.syncButton.disabled = anyRunning || batchBusy;
  elements.syncButton.textContent = inventoryRunning ? 'Sincronizando…' : 'Sincronizar edições';
  elements.exportSqliteButton.disabled = anyRunning || batchBusy;
  elements.exportSqliteButton.textContent = exportRunning ? 'Preparando…' : 'Exportar SQLite';
  elements.cancelButton.hidden = !inventoryRunning;

  elements.capturePendingButton.disabled = anyRunning || batchBusy;
  elements.captureAllButton.disabled = anyRunning || batchBusy;
  elements.capturePendingButton.textContent = captureRunning ? 'Capturando…' : 'Capturar pendentes';
  elements.cancelCaptureButton.hidden = !captureRunning;

  elements.previewBatchButton.disabled = anyRunning || batchBusy;
  elements.previewBatchButton.textContent = batchBusy ? 'Processando…' : 'Calcular prévia';
  elements.createBatchButton.disabled = anyRunning || batchBusy || currentBatchPreview === null;
}

function renderInventory(status: SyncStatus): void {
  inventoryStatus = status;
  const running = status.state === 'running';
  elements.statusBadge.textContent = stateLabel(status.state);
  elements.statusBadge.dataset.state = status.state;
  elements.totalEditions.textContent = status.totalEditions.toLocaleString('pt-BR');
  elements.pagesProcessed.textContent = status.pagesProcessed.toLocaleString('pt-BR');
  elements.insertedCount.textContent = status.inserted.toLocaleString('pt-BR');
  elements.updatedCount.textContent = status.updated.toLocaleString('pt-BR');
  elements.lastSync.textContent = formatDate(status.finishedAt ?? status.startedAt);

  elements.progressPanel.dataset.running = String(running);
  elements.progressBar.classList.toggle('is-running', running);
  elements.progressText.textContent = running
    ? `Página ${status.pagesProcessed + 1} · ${status.editionsSeen.toLocaleString('pt-BR')} edições encontradas`
    : status.state === 'completed'
      ? `${status.editionsSeen.toLocaleString('pt-BR')} edições verificadas na última sincronização.`
      : status.state === 'cancelled'
        ? 'Sincronização interrompida. Os dados já gravados foram preservados.'
        : 'Nenhuma sincronização em andamento.';

  elements.errorBox.hidden = status.state !== 'error';
  elements.errorBox.textContent = status.error ?? '';
  syncControls();
}

function renderDownloadStats(stats: DownloadCaptureStats): void {
  elements.capturedEditions.textContent = `${stats.capturedEditions.toLocaleString('pt-BR')}/${stats.totalEditions.toLocaleString('pt-BR')}`;
  elements.signedLinksCount.textContent = stats.signedLinks.toLocaleString('pt-BR');
  elements.diaryLinksCount.textContent = stats.diaryLinks.toLocaleString('pt-BR');
  elements.sizesCount.textContent = (stats.signedSizes + stats.diarySizes).toLocaleString('pt-BR');
}

function renderDownload(status: DownloadCaptureStatus): void {
  downloadStatus = status;
  const running = status.state === 'running';
  elements.downloadStatusBadge.textContent = stateLabel(status.state);
  elements.downloadStatusBadge.dataset.state = status.state;
  elements.downloadProcessed.textContent = status.processed.toLocaleString('pt-BR');
  elements.downloadFailures.textContent = status.failures.toLocaleString('pt-BR');
  elements.downloadProgressPanel.dataset.running = String(running);

  if (running && status.totalTargets > 0) {
    const percentage = Math.min(100, (status.processed / status.totalTargets) * 100);
    elements.downloadProgressBar.classList.remove('is-running');
    elements.downloadProgressBar.style.width = `${percentage}%`;
  } else if (running) {
    elements.downloadProgressBar.style.width = '';
    elements.downloadProgressBar.classList.add('is-running');
  } else {
    elements.downloadProgressBar.classList.remove('is-running');
    elements.downloadProgressBar.style.width = status.state === 'completed' ? '100%' : '0';
  }

  elements.downloadProgressText.textContent = running
    ? `Edição ${status.currentEditionId ?? '—'} · ${status.processed.toLocaleString('pt-BR')} de ${status.totalTargets.toLocaleString('pt-BR')}`
    : status.state === 'completed'
      ? `${status.processed.toLocaleString('pt-BR')} edições processadas na última captura.`
      : status.state === 'cancelled'
        ? 'Captura interrompida. Os links já persistidos foram preservados.'
        : 'Nenhuma captura em andamento.';

  elements.downloadErrorBox.hidden = status.state !== 'error';
  elements.downloadErrorBox.textContent = status.error ?? '';
  syncControls();
}

function activateTab(tab: AppTab): void {
  const inventory = tab === 'inventory';
  const downloads = tab === 'downloads';
  const batch = tab === 'batch';

  elements.inventoryPanel.hidden = !inventory;
  elements.downloadsPanel.hidden = !downloads;
  elements.batchPanel.hidden = !batch;

  elements.inventoryTabButton.classList.toggle('is-active', inventory);
  elements.downloadsTabButton.classList.toggle('is-active', downloads);
  elements.batchTabButton.classList.toggle('is-active', batch);
  elements.inventoryTabButton.setAttribute('aria-selected', String(inventory));
  elements.downloadsTabButton.setAttribute('aria-selected', String(downloads));
  elements.batchTabButton.setAttribute('aria-selected', String(batch));

  if (downloads) void refreshDownloadStats();
}

async function send(type: string, extra: Record<string, unknown> = {}): Promise<any> {
  return chrome.runtime.sendMessage({ target: 'service-worker', type, ...extra });
}

function showOperationError(message: string, target: 'inventory' | 'downloads'): void {
  const status = target === 'inventory'
    ? { ...EMPTY_STATUS, state: 'error' as const, error: message }
    : { ...EMPTY_DOWNLOAD_STATUS, state: 'error' as const, error: message };
  if (target === 'inventory') renderInventory(status as SyncStatus);
  else renderDownload(status as DownloadCaptureStatus);
}

async function startInventory(): Promise<void> {
  try {
    const result = await send('START_SYNC');
    if (result?.ok === false) {
      showOperationError(result.reason === 'operation-running' ? 'Já existe uma operação em andamento.' : result.reason ?? 'Não foi possível iniciar a sincronização.', 'inventory');
    }
  } catch (error) {
    showOperationError(`Falha ao comunicar com a extensão: ${error instanceof Error ? error.message : String(error)}`, 'inventory');
  }
}

async function exportSqlite(): Promise<void> {
  exportRunning = true;
  elements.errorBox.hidden = true;
  elements.errorBox.textContent = '';
  syncControls();

  try {
    const result = await send('EXPORT_SQLITE');
    if (result?.ok === false) {
      throw new Error(result.reason ?? 'Não foi possível exportar o SQLite.');
    }
  } catch (error) {
    elements.errorBox.hidden = false;
    elements.errorBox.textContent = `Falha ao exportar SQLite: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    exportRunning = false;
    syncControls();
  }
}

async function startCapture(mode: DownloadCaptureMode): Promise<void> {
  try {
    const result = await send('START_DOWNLOAD_CAPTURE', { mode });
    if (result?.ok === false) {
      showOperationError(result.reason === 'operation-running' ? 'Já existe uma operação em andamento.' : result.reason ?? 'Não foi possível iniciar a captura.', 'downloads');
    }
  } catch (error) {
    showOperationError(`Falha ao comunicar com a extensão: ${error instanceof Error ? error.message : String(error)}`, 'downloads');
  }
}

async function refreshDownloadStats(): Promise<void> {
  try {
    const result = await send('GET_DOWNLOAD_CAPTURE_STATS');
    if (result?.ok && result.stats) renderDownloadStats(result.stats as DownloadCaptureStats);
  } catch {
    // O status operacional continua visível; uma próxima interação tentará novamente.
  }
}

function updateBatchCriterionFields(): void {
  const byPeriod = elements.batchCriterionSelect.value === 'period';
  elements.batchPeriodFields.hidden = !byPeriod;
  elements.batchIdsField.hidden = byPeriod;
}

function clearBatchMessages(): void {
  elements.batchErrorBox.hidden = true;
  elements.batchErrorBox.textContent = '';
  elements.batchSuccessBox.hidden = true;
  elements.batchSuccessBox.textContent = '';
}

function invalidateBatchPreview(): void {
  currentBatchPreview = null;
  elements.batchPreviewPanel.hidden = true;
  elements.createBatchButton.disabled = true;
  clearBatchMessages();
  syncControls();
}

function collectBatchFilter(): DownloadBatchFilter {
  const criterion = elements.batchCriterionSelect.value === 'egbanet_ids' ? 'egbanet_ids' : 'period';
  const fileType = elements.batchFileTypeSelect.value as DownloadBatchFileType;
  const name = elements.batchNameInput.value.trim() || undefined;

  if (criterion === 'period') {
    const startDate = elements.batchStartDate.value;
    const endDate = elements.batchEndDate.value;
    if (!startDate || !endDate) throw new Error('Informe a data inicial e a data final.');
    if (startDate > endDate) throw new Error('A data inicial não pode ser posterior à data final.');
    return { criterion, fileType, startDate, endDate, name };
  }

  const egbanetIds = parseEgbanetIdList(elements.batchIdsInput.value);
  if (egbanetIds.length === 0) throw new Error('Informe ao menos um ID EGBANET.');
  return { criterion, fileType, egbanetIds, name };
}

function renderBatchPreview(preview: DownloadBatchPreview): void {
  elements.batchPreviewEditions.textContent = preview.editions.toLocaleString('pt-BR');
  elements.batchPreviewFiles.textContent = preview.availableFiles.toLocaleString('pt-BR');
  elements.batchPreviewPages.textContent = preview.pages.toLocaleString('pt-BR');
  elements.batchPreviewSize.textContent = formatBytes(preview.knownBytes);
  elements.batchPreviewNormal.textContent = preview.normalFiles.toLocaleString('pt-BR');
  elements.batchPreviewSigned.textContent = preview.signedFiles.toLocaleString('pt-BR');
  elements.batchPreviewMissingLinks.textContent = preview.missingLinks.toLocaleString('pt-BR');
  elements.batchPreviewUnknownSizes.textContent = preview.unknownSizes.toLocaleString('pt-BR');

  const notes: string[] = [];
  if (preview.missingEditions > 0) notes.push(`${preview.missingEditions} ID(s) não existem no inventário local.`);
  if (preview.missingLinks > 0) notes.push(`${preview.missingLinks} arquivo(s) solicitado(s) não têm link capturado e ficarão fora do lote.`);
  if (preview.unknownSizes > 0) notes.push(`O volume exibido é parcial: ${preview.unknownSizes} arquivo(s) não têm tamanho conhecido.`);
  if (preview.unknownPages > 0) notes.push(`${preview.unknownPages} edição(ões) não têm número de páginas conhecido.`);
  if (notes.length === 0) notes.push('Todos os arquivos selecionados têm link e metadados de tamanho disponíveis.');
  elements.batchPreviewNote.textContent = notes.join(' ');
  elements.batchPreviewPanel.hidden = false;
}

async function previewBatch(): Promise<void> {
  clearBatchMessages();
  batchBusy = true;
  currentBatchPreview = null;
  elements.batchPreviewPanel.hidden = true;
  syncControls();

  try {
    const filter = collectBatchFilter();
    const result = await send('PREVIEW_DOWNLOAD_BATCH', { filter });
    if (!result?.ok || !result.preview) throw new Error(result?.reason ?? 'Não foi possível calcular a prévia do lote.');
    currentBatchPreview = result.preview as DownloadBatchPreview;
    renderBatchPreview(currentBatchPreview);
  } catch (error) {
    elements.batchErrorBox.hidden = false;
    elements.batchErrorBox.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    batchBusy = false;
    syncControls();
  }
}

async function createBatch(): Promise<void> {
  if (!currentBatchPreview) return;
  clearBatchMessages();
  batchBusy = true;
  syncControls();

  try {
    const filter = collectBatchFilter();
    const result = await send('CREATE_DOWNLOAD_BATCH', { filter });
    if (!result?.ok || !result.created) throw new Error(result?.reason ?? 'Não foi possível criar o lote.');
    const created = result.created as DownloadBatchCreated;
    currentBatchPreview = null;
    elements.createBatchButton.disabled = true;
    elements.batchSuccessBox.hidden = false;
    elements.batchSuccessBox.textContent = `Lote #${created.batchId} criado com ${created.items.toLocaleString('pt-BR')} arquivo(s). Nenhum download foi iniciado.`;
  } catch (error) {
    elements.batchErrorBox.hidden = false;
    elements.batchErrorBox.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    batchBusy = false;
    syncControls();
  }
}

elements.inventoryTabButton.addEventListener('click', () => activateTab('inventory'));
elements.downloadsTabButton.addEventListener('click', () => activateTab('downloads'));
elements.batchTabButton.addEventListener('click', () => activateTab('batch'));
elements.syncButton.addEventListener('click', () => void startInventory());
elements.exportSqliteButton.addEventListener('click', () => void exportSqlite());
elements.cancelButton.addEventListener('click', () => void send('CANCEL_SYNC'));
elements.capturePendingButton.addEventListener('click', () => void startCapture('pending'));
elements.captureAllButton.addEventListener('click', () => void startCapture('all'));
elements.cancelCaptureButton.addEventListener('click', () => void send('CANCEL_DOWNLOAD_CAPTURE'));
elements.previewBatchButton.addEventListener('click', () => void previewBatch());
elements.createBatchButton.addEventListener('click', () => void createBatch());

elements.batchCriterionSelect.addEventListener('change', () => {
  updateBatchCriterionFields();
  invalidateBatchPreview();
});
for (const element of [
  elements.batchStartDate,
  elements.batchEndDate,
  elements.batchIdsInput,
  elements.batchFileTypeSelect
]) {
  element.addEventListener('input', invalidateBatchPreview);
  element.addEventListener('change', invalidateBatchPreview);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[INVENTORY_STATUS_KEY]) {
    renderInventory((changes[INVENTORY_STATUS_KEY].newValue as SyncStatus | undefined) ?? EMPTY_STATUS);
  }
  if (changes[DOWNLOAD_STATUS_KEY]) {
    const next = (changes[DOWNLOAD_STATUS_KEY].newValue as DownloadCaptureStatus | undefined) ?? EMPTY_DOWNLOAD_STATUS;
    renderDownload(next);
    if (next.state === 'completed' || next.state === 'cancelled') void refreshDownloadStats();
  }
});

updateBatchCriterionFields();
void chrome.storage.local.get([INVENTORY_STATUS_KEY, DOWNLOAD_STATUS_KEY]).then((result) => {
  renderInventory((result[INVENTORY_STATUS_KEY] as SyncStatus | undefined) ?? EMPTY_STATUS);
  renderDownload((result[DOWNLOAD_STATUS_KEY] as DownloadCaptureStatus | undefined) ?? EMPTY_DOWNLOAD_STATUS);
  void refreshDownloadStats();
});
