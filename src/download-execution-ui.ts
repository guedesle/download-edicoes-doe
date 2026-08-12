import './download-execution.css';

const BATCH_DOWNLOAD_STATUS_KEY = 'batchDownloadStatus';

type ExecutionState = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

interface ExecutionStatus {
  state: ExecutionState;
  batchId: number;
  batchName?: string;
  destinationName?: string;
  totalItems: number;
  completed: number;
  failed: number;
  bytesCompleted: number;
  currentItem?: number;
  currentFile?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB`;
  return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

function send(type: string, extra: Record<string, unknown> = {}): Promise<any> {
  return chrome.runtime.sendMessage({ target: 'service-worker', type, ...extra });
}

function mountExecutionUi(): void {
  const batchPanel = document.querySelector<HTMLElement>('#batchPanel');
  const successBox = document.querySelector<HTMLElement>('#batchSuccessBox');
  const previewPanel = document.querySelector<HTMLElement>('#batchPreviewPanel');
  if (!batchPanel || !successBox || !previewPanel) return;

  const panel = document.createElement('section');
  panel.className = 'batch-execution';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="batch-execution-header">
      <div>
        <span class="summary-label">Execução do lote</span>
        <strong id="executionBatchLabel">Lote —</strong>
      </div>
      <span id="executionStatusBadge" class="status-badge">Pronto</span>
    </div>
    <div class="progress-track" aria-hidden="true"><div id="executionProgressBar" class="progress-bar"></div></div>
    <p id="executionProgressText" class="helper-text">Aguardando início.</p>
    <section class="details details--downloads">
      <div><span>Concluídos</span><strong id="executionCompleted">0</strong></div>
      <div><span>Falhas</span><strong id="executionFailed">0</strong></div>
      <div><span>Gravado</span><strong id="executionBytes">0 MB</strong></div>
      <div><span>Destino</span><strong id="executionDestination">—</strong></div>
    </section>
    <p id="executionError" class="error-box" hidden></p>
    <footer class="actions actions--wrap">
      <button id="startBatchDownloadButton" class="primary-button" type="button">Iniciar downloads</button>
      <button id="cancelBatchDownloadButton" class="secondary-button" type="button" hidden>Cancelar</button>
    </footer>
  `;
  batchPanel.insertBefore(panel, previewPanel);

  const batchLabel = panel.querySelector<HTMLElement>('#executionBatchLabel')!;
  const badge = panel.querySelector<HTMLElement>('#executionStatusBadge')!;
  const progressBar = panel.querySelector<HTMLElement>('#executionProgressBar')!;
  const progressText = panel.querySelector<HTMLElement>('#executionProgressText')!;
  const completed = panel.querySelector<HTMLElement>('#executionCompleted')!;
  const failed = panel.querySelector<HTMLElement>('#executionFailed')!;
  const bytes = panel.querySelector<HTMLElement>('#executionBytes')!;
  const destination = panel.querySelector<HTMLElement>('#executionDestination')!;
  const errorBox = panel.querySelector<HTMLElement>('#executionError')!;
  const startButton = panel.querySelector<HTMLButtonElement>('#startBatchDownloadButton')!;
  const cancelButton = panel.querySelector<HTMLButtonElement>('#cancelBatchDownloadButton')!;

  let currentBatchId: number | null = null;

  function revealBatch(batchId: number): void {
    currentBatchId = batchId;
    panel.hidden = false;
    batchLabel.textContent = `Lote #${batchId}`;
    startButton.disabled = false;
  }

  function render(status: ExecutionStatus): void {
    revealBatch(status.batchId);
    const running = status.state === 'running';
    const percentage = status.totalItems > 0 ? Math.min(100, (status.completed / status.totalItems) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    badge.dataset.state = status.state;
    badge.textContent = running
      ? 'Executando'
      : status.state === 'completed'
        ? (status.failed > 0 ? 'Concluído c/ falhas' : 'Concluído')
        : status.state === 'cancelled'
          ? 'Cancelado'
          : status.state === 'error'
            ? 'Erro'
            : 'Pronto';

    batchLabel.textContent = status.batchName ? `Lote #${status.batchId} · ${status.batchName}` : `Lote #${status.batchId}`;
    completed.textContent = `${status.completed.toLocaleString('pt-BR')}/${status.totalItems.toLocaleString('pt-BR')}`;
    failed.textContent = status.failed.toLocaleString('pt-BR');
    bytes.textContent = formatBytes(status.bytesCompleted);
    destination.textContent = status.destinationName ?? '—';
    progressText.textContent = running
      ? `Baixando ${status.currentFile ?? 'próximo arquivo'}…`
      : status.state === 'completed'
        ? `Execução encerrada: ${status.completed.toLocaleString('pt-BR')} arquivo(s) concluído(s).`
        : status.state === 'cancelled'
          ? 'Execução cancelada. Os arquivos concluídos foram preservados.'
          : status.state === 'error'
            ? 'A execução foi interrompida por erro.'
            : 'Aguardando início.';

    errorBox.hidden = status.state !== 'error';
    errorBox.textContent = status.error ?? '';
    startButton.disabled = running;
    startButton.textContent = status.completed > 0 && status.completed < status.totalItems ? 'Retomar downloads' : 'Iniciar downloads';
    cancelButton.hidden = !running;
  }

  startButton.addEventListener('click', async () => {
    if (!currentBatchId) return;
    errorBox.hidden = true;
    errorBox.textContent = '';
    startButton.disabled = true;
    try {
      const result = await send('START_BATCH_DOWNLOAD', { batchId: currentBatchId });
      if (result?.ok === false) {
        throw new Error(result.reason === 'operation-running' ? 'Já existe uma operação em andamento.' : result.reason ?? 'Não foi possível iniciar o lote.');
      }
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error instanceof Error ? error.message : String(error);
      startButton.disabled = false;
    }
  });

  cancelButton.addEventListener('click', () => void send('CANCEL_BATCH_DOWNLOAD'));

  const successObserver = new MutationObserver(() => {
    if (successBox.hidden) return;
    const match = successBox.textContent?.match(/Lote #(\d+) criado/);
    if (!match) return;
    const batchId = Number(match[1]);
    if (Number.isSafeInteger(batchId) && batchId > 0) revealBatch(batchId);
  });
  successObserver.observe(successBox, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[BATCH_DOWNLOAD_STATUS_KEY]?.newValue) return;
    render(changes[BATCH_DOWNLOAD_STATUS_KEY].newValue as ExecutionStatus);
  });

  void chrome.storage.local.get(BATCH_DOWNLOAD_STATUS_KEY).then((result) => {
    const status = result[BATCH_DOWNLOAD_STATUS_KEY] as ExecutionStatus | undefined;
    if (status?.batchId) render(status);
  });
}

mountExecutionUi();
