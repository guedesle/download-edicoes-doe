export type SyncState = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
export type DownloadCaptureMode = 'pending' | 'all';
export type DownloadBatchCriterion = 'period' | 'egbanet_ids';
export type DownloadBatchFileType = 'normal' | 'signed' | 'both';
export type DownloadBatchEditionScope = 'all' | 'regular' | 'supplements';
export type DownloadBatchItemType = 'normal' | 'signed';

export interface EditionRecord {
  egbanetId: number;
  tipoEdicao: string;
  dataEdicao: string;
  numeroEdicao: number;
  suplemento: boolean | null;
  numeroPaginas: number | null;
  materias: number | null;
  materiasPendentes: number | null;
  downloads: number | null;
  publicadaInternet: boolean | null;
  dataPublicacao: string | null;
  editUrl: string;
  viewUrl: string;
  paginaOrigem: number;
}

export interface ParsedEditionPage {
  editions: EditionRecord[];
  nextHref: string | null;
}

export interface EditionDownloadLinks {
  downloadAssinadoUrl: string | null;
  downloadDiarioUrl: string | null;
}

export interface DownloadCaptureTarget {
  egbanetId: number;
  editUrl: string;
}

export interface SyncStatus {
  state: SyncState;
  startedAt?: string;
  finishedAt?: string;
  pagesProcessed: number;
  editionsSeen: number;
  inserted: number;
  updated: number;
  totalEditions: number;
  currentUrl?: string;
  error?: string;
}

export interface DownloadCaptureStatus {
  state: SyncState;
  mode: DownloadCaptureMode;
  startedAt?: string;
  finishedAt?: string;
  totalEditions: number;
  totalTargets: number;
  processed: number;
  signedFound: number;
  diaryFound: number;
  signedSizesFound: number;
  diarySizesFound: number;
  failures: number;
  capturedEditions: number;
  currentEditionId?: number;
  error?: string;
}

export interface DownloadCaptureStats {
  totalEditions: number;
  capturedEditions: number;
  signedLinks: number;
  diaryLinks: number;
  signedSizes: number;
  diarySizes: number;
}

export interface DownloadBatchFilter {
  criterion: DownloadBatchCriterion;
  fileType: DownloadBatchFileType;
  editionScope?: DownloadBatchEditionScope;
  startDate?: string;
  endDate?: string;
  egbanetIds?: number[];
  name?: string;
}

export interface DownloadBatchPreview {
  editions: number;
  requestedFiles: number;
  availableFiles: number;
  normalFiles: number;
  signedFiles: number;
  missingLinks: number;
  missingEditions: number;
  pages: number;
  unknownPages: number;
  knownBytes: number;
  unknownSizes: number;
}

export interface DownloadBatchCreated {
  batchId: number;
  items: number;
  preview: DownloadBatchPreview;
}

export interface DbResponse<T = unknown> {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: string;
}
