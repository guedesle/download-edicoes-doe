import { validateSqliteImportMetadata } from './sqlite-import';

const importButton = document.querySelector<HTMLButtonElement>('#importSqliteButton')!;
const importInput = document.querySelector<HTMLInputElement>('#importSqliteInput')!;
const importStatus = document.querySelector<HTMLElement>('#importSqliteStatus')!;
const errorBox = document.querySelector<HTMLElement>('#errorBox')!;

let importing = false;

function setBusy(value: boolean): void {
  importing = value;
  importButton.disabled = value;
  importButton.textContent = value ? 'Importando…' : 'Importar SQLite';
}

async function importSelected(file: File): Promise<void> {
  validateSqliteImportMetadata(file.name, file.size);
  const confirmed = window.confirm(
    `Importar ${file.name}?\n\nOs dados atuais do inventário, links capturados e lotes serão substituídos pelos dados desse arquivo. A operação é transacional: se a validação falhar, o banco atual será preservado.`
  );
  if (!confirmed) return;

  setBusy(true);
  errorBox.hidden = true;
  errorBox.textContent = '';
  importStatus.textContent = `Validando e importando ${file.name}…`;
  const blobUrl = URL.createObjectURL(file);
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'service-worker',
      type: 'IMPORT_SQLITE',
      blobUrl,
      filename: file.name,
      size: file.size
    });
    if (!response?.ok || !response.result) {
      throw new Error(response?.reason ?? 'Não foi possível importar o SQLite.');
    }
    const result = response.result as {
      editions: number;
      capturedEditions: number;
      batches: number;
      sourceVersion?: number;
      migrated?: boolean;
    };
    const migration = result.migrated && result.sourceVersion === 5
      ? ' Schema v5 migrado para v6 durante a importação.'
      : '';
    importStatus.textContent = `Importação concluída: ${result.editions.toLocaleString('pt-BR')} edições, ${result.capturedEditions.toLocaleString('pt-BR')} com links capturados e ${result.batches.toLocaleString('pt-BR')} lote(s).${migration} Atualizando o painel…`;
    window.setTimeout(() => window.location.reload(), 700);
  } finally {
    URL.revokeObjectURL(blobUrl);
    setBusy(false);
  }
}

importButton.addEventListener('click', () => {
  if (!importing) importInput.click();
});

importInput.addEventListener('change', () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  void importSelected(file).catch((error) => {
    errorBox.hidden = false;
    errorBox.textContent = `Falha ao importar SQLite: ${error instanceof Error ? error.message : String(error)}`;
    importStatus.textContent = 'Importação não concluída. O banco local foi preservado.';
    setBusy(false);
  });
});
