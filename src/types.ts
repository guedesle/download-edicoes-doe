export type SyncState = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

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
  viewUrl: string;
  paginaOrigem: number;
}

export interface ParsedEditionPage {
  editions: EditionRecord[];
  nextHref: string | null;
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

export interface DbResponse<T = unknown> {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: string;
}
