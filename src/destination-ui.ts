type DirectoryHandleWithPermission = FileSystemDirectoryHandle & {
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
};

const HANDLE_DB_NAME = 'download-edicoes-doe-handles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = 'directories';
const SELECTED_KEY = 'selected-download-directory';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir o armazenamento de pastas.'));
  });
}

async function storeHandle(key: string, handle: DirectoryHandleWithPermission): Promise<void> {
  const db = await openHandleDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, 'readwrite');
      transaction.objectStore(HANDLE_STORE).put(handle, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao persistir a pasta selecionada.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Gravação da pasta selecionada foi cancelada.'));
    });
  } finally {
    db.close();
  }
}

async function loadHandle(key: string): Promise<DirectoryHandleWithPermission | null> {
  const db = await openHandleDb();
  try {
    return await new Promise<DirectoryHandleWithPermission | null>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, 'readonly');
      const request = transaction.objectStore(HANDLE_STORE).get(key);
      request.onsuccess = () => resolve((request.result as DirectoryHandleWithPermission | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Falha ao recuperar a pasta selecionada.'));
    });
  } finally {
    db.close();
  }
}

function permissionState(handle: DirectoryHandleWithPermission): Promise<PermissionState> {
  if (typeof handle.queryPermission !== 'function') return Promise.resolve('prompt');
  return handle.queryPermission({ mode: 'readwrite' });
}

function picker(): ((options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirectoryHandleWithPermission>) | null {
  const candidate = (window as typeof window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirectoryHandleWithPermission>;
  }).showDirectoryPicker;
  return typeof candidate === 'function' ? candidate.bind(window) : null;
}

function installStyles(): void {
  if (document.querySelector('#destinationUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'destinationUiStyles';
  style.textContent = `
    .destination-selector {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 11px;
      border: 1px solid #d8dee7;
      border-radius: 10px;
      background: #f8fafc;
    }
    .destination-selector[data-state="ready"] {
      border-color: #bfdfc9;
      background: #f4fbf6;
    }
    .destination-copy {
      display: grid;
      min-width: 0;
      gap: 3px;
    }
    .destination-label {
      color: #475467;
      font-size: 10px;
      font-weight: 650;
    }
    .destination-copy strong {
      overflow: hidden;
      color: #172033;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .destination-copy small {
      color: #667085;
      font-size: 9.5px;
      line-height: 1.35;
    }
    .destination-button {
      min-height: 35px;
      padding: 0 11px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    @media (max-width: 430px) {
      .destination-selector { grid-template-columns: 1fr; }
      .destination-button { width: 100%; }
    }
  `;
  document.head.append(style);
}

function mountDestinationUi(): void {
  const batchForm = document.querySelector<HTMLElement>('.batch-form');
  const createButton = document.querySelector<HTMLButtonElement>('#createBatchButton');
  const errorBox = document.querySelector<HTMLElement>('#batchErrorBox');
  const successBox = document.querySelector<HTMLElement>('#batchSuccessBox');
  if (!batchForm || !createButton || !errorBox || !successBox) return;

  installStyles();

  const wrapper = document.createElement('section');
  wrapper.className = 'destination-selector';
  wrapper.dataset.state = 'pending';
  wrapper.innerHTML = `
    <div class="destination-copy">
      <span class="destination-label">Pasta de destino</span>
      <strong id="batchDestinationName">Nenhuma pasta selecionada</strong>
      <small id="batchDestinationHint">Escolha uma pasta local ou de rede antes de criar o lote.</small>
    </div>
    <button id="chooseDestinationButton" class="secondary-button destination-button" type="button">Escolher pasta</button>
  `;
  batchForm.append(wrapper);

  const chooseButton = wrapper.querySelector<HTMLButtonElement>('#chooseDestinationButton')!;
  const destinationName = wrapper.querySelector<HTMLElement>('#batchDestinationName')!;
  const destinationHint = wrapper.querySelector<HTMLElement>('#batchDestinationHint')!;

  let selectedDirectory: DirectoryHandleWithPermission | null = null;
  const associatedBatches = new Set<number>();

  function renderReady(handle: DirectoryHandleWithPermission): void {
    selectedDirectory = handle;
    destinationName.textContent = handle.name;
    destinationHint.textContent = 'Pasta autorizada para gravação. O caminho completo não é exposto pelo navegador.';
    wrapper.dataset.state = 'ready';
    chooseButton.textContent = 'Trocar pasta';
  }

  function renderNeedsSelection(name?: string): void {
    selectedDirectory = null;
    destinationName.textContent = name ? `${name} (revalidar)` : 'Nenhuma pasta selecionada';
    destinationHint.textContent = name
      ? 'A pasta foi lembrada, mas precisa ser autorizada novamente antes de criar o lote.'
      : 'Escolha uma pasta local ou de rede antes de criar o lote.';
    wrapper.dataset.state = 'pending';
    chooseButton.textContent = name ? 'Revalidar / trocar' : 'Escolher pasta';
  }

  void loadHandle(SELECTED_KEY)
    .then(async (handle) => {
      if (!handle) return;
      const state = await permissionState(handle).catch(() => 'prompt' as PermissionState);
      if (state === 'granted') renderReady(handle);
      else renderNeedsSelection(handle.name);
    })
    .catch(() => undefined);

  chooseButton.addEventListener('click', async () => {
    errorBox.hidden = true;
    errorBox.textContent = '';
    const choose = picker();
    if (!choose) {
      errorBox.hidden = false;
      errorBox.textContent = 'Este Chrome não disponibiliza seleção de diretório pela File System Access API.';
      return;
    }

    chooseButton.disabled = true;
    try {
      const handle = await choose({ mode: 'readwrite', id: 'download-edicoes-doe-destino' });
      await storeHandle(SELECTED_KEY, handle);
      renderReady(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      errorBox.hidden = false;
      errorBox.textContent = `Falha ao selecionar pasta: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      chooseButton.disabled = false;
    }
  });

  createButton.addEventListener('click', (event) => {
    if (selectedDirectory) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    errorBox.hidden = false;
    errorBox.textContent = 'Escolha e autorize a pasta de destino antes de criar o lote.';
  }, true);

  const observer = new MutationObserver(() => {
    if (successBox.hidden || !selectedDirectory) return;
    const match = successBox.textContent?.match(/Lote #(\d+) criado/);
    if (!match) return;
    const batchId = Number(match[1]);
    if (!Number.isSafeInteger(batchId) || batchId <= 0 || associatedBatches.has(batchId)) return;
    associatedBatches.add(batchId);

    const handle = selectedDirectory;
    void storeHandle(`batch:${batchId}`, handle)
      .then(() => {
        const suffix = ` Destino: ${handle.name}.`;
        if (!successBox.textContent?.includes(suffix)) {
          successBox.textContent = `${successBox.textContent ?? ''}${suffix}`;
        }
      })
      .catch((error) => {
        associatedBatches.delete(batchId);
        errorBox.hidden = false;
        errorBox.textContent = `O lote #${batchId} foi criado, mas não foi possível associar a pasta de destino: ${error instanceof Error ? error.message : String(error)}`;
      });
  });
  observer.observe(successBox, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

mountDestinationUi();
