import './styles.css';
import type { SyncStatus } from './types';

const STATUS_KEY = 'inventorySyncStatus';

const elements = {
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
  cancelButton: document.querySelector<HTMLButtonElement>('#cancelButton')!
};

const EMPTY_STATUS: SyncStatus = {
  state: 'idle',
  pagesProcessed: 0,
  editionsSeen: 0,
  inserted: 0,
  updated: 0,
  totalEditions: 0
};

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(new Date(value));
}

function stateLabel(status: SyncStatus): string {
  switch (status.state) {
    case 'running': return 'Sincronizando';
    case 'completed': return 'Concluído';
    case 'cancelled': return 'Cancelado';
    case 'error': return 'Atenção';
    default: return 'Pronto';
  }
}

function render(status: SyncStatus): void {
  const running = status.state === 'running';
  elements.statusBadge.textContent = stateLabel(status);
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
  elements.syncButton.disabled = running;
  elements.syncButton.textContent = running ? 'Sincronizando…' : 'Sincronizar edições';
  elements.cancelButton.hidden = !running;
}

async function send(type: 'START_SYNC' | 'CANCEL_SYNC'): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ target: 'service-worker', type });
    if (result?.ok === false && result.reason !== 'already-running') {
      render({ ...EMPTY_STATUS, state: 'error', error: result.reason ?? 'Não foi possível iniciar a operação.' });
    }
  } catch (error) {
    render({
      ...EMPTY_STATUS,
      state: 'error',
      error: `Falha ao comunicar com a extensão: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

elements.syncButton.addEventListener('click', () => void send('START_SYNC'));
elements.cancelButton.addEventListener('click', () => void send('CANCEL_SYNC'));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STATUS_KEY]) return;
  render((changes[STATUS_KEY].newValue as SyncStatus | undefined) ?? EMPTY_STATUS);
});

void chrome.storage.local.get(STATUS_KEY).then((result) => {
  render((result[STATUS_KEY] as SyncStatus | undefined) ?? EMPTY_STATUS);
});
