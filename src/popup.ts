import './styles.css';
import type {
  DownloadCaptureMode,
  DownloadCaptureStats,
  DownloadCaptureStatus,
  SyncStatus
} from './types';

const INVENTORY_STATUS_KEY = 'inventorySyncStatus';
const DOWNLOAD_STATUS_KEY = 'downloadCaptureStatus';

const elements = {
  inventoryTabButton: document.querySelector<HTMLButtonElement>('#inventoryTabButton')!,
  downloadsTabButton: document.querySelector<HTMLButtonElement>('#downloadsTabButton')!,
  inventoryPanel: document.querySelector<HTMLElement>('#inventoryPanel')!,
  downloadsPanel: document.querySelector<HTMLElement>('#downloadsPanel')!,

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
  cancelCaptureButton: document.querySelector<HTMLButtonElement>('#cancelCaptureButton')!
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

const EMPTY_DOWNLOAD_STATS: DownloadCaptureStats = {
  totalEditions: 0,
  capturedEditions: 0,
  signedLinks: 0,
  diaryLinks: 0,
  signedSizes: 0,
  diarySizes: 0
};

let inventoryStatus: SyncStatus = EMPTY_STATUS;
let downloadStatus: DownloadCaptureStatus = EMPTY_DOWNLOAD_STATUS;
let downloadStats: DownloadCaptureStats = EMPTY_DOWNLOAD_STATS;
let exportRunning = false;

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(value));
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

  elements.syncButton.disabled = anyRunning;
  elements.syncButton.textContent = inventoryRunning ? 'Sincronizando…' : 'Sincronizar edições';
  elements.exportSqliteButton.disabled = anyRunning;
  elements.exportSqliteButton.textContent = exportRunning ? 'Preparando…' : 'Exportar SQLite';
  elements.cancelButton.hidden = !inventoryRunning;

  elements.capturePendingButton.disabled = anyRunning;
  elements.captureAllButton.disabled = anyRunning;
  elements.capturePendingButton.textContent = captureRunning ? 'Capturando…' : 'Capturar pendentes';
  elements.cancelCaptureButton.hidden = !captureRunning;
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
  downloadStats = stats;
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

function activateTab(tab: 'inventory' | 'downloads'): void {
  const inventory = tab === 'inventory';
  elements.inventoryPanel.hidden = !inventory;
  elements.downloadsPanel.hidden = inventory;
  elements.inventoryTabButton.classList.toggle('is-active', inventory);
  elements.downloadsTabButton.classList.toggle('is-active', !inventory);
  elements.inventoryTabButton.setAttribute('aria-selected', String(inventory));
  elements.downloadsTabButton.setAttribute('aria-selected', String(!inventory));

  if (!inventory) void refreshDownloadStats();
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

elements.inventoryTabButton.addEventListener('click', () => activateTab('inventory'));
elements.downloadsTabButton.addEventListener('click', () => activateTab('downloads'));
elements.syncButton.addEventListener('click', () => void startInventory());
elements.exportSqliteButton.addEventListener('click', () => void exportSqlite());
elements.cancelButton.addEventListener('click', () => void send('CANCEL_SYNC'));
elements.capturePendingButton.addEventListener('click', () => void startCapture('pending'));
elements.captureAllButton.addEventListener('click', () => void startCapture('all'));
elements.cancelCaptureButton.addEventListener('click', () => void send('CANCEL_DOWNLOAD_CAPTURE'));

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

void chrome.storage.local.get([INVENTORY_STATUS_KEY, DOWNLOAD_STATUS_KEY]).then((result) => {
  renderInventory((result[INVENTORY_STATUS_KEY] as SyncStatus | undefined) ?? EMPTY_STATUS);
  renderDownload((result[DOWNLOAD_STATUS_KEY] as DownloadCaptureStatus | undefined) ?? EMPTY_DOWNLOAD_STATUS);
  void refreshDownloadStats();
});
