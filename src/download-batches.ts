import type {
  DownloadBatchFilter,
  DownloadBatchItemType
} from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MANUAL_IDS = 500;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) throw new Error(`${label} inválida.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} inválida.`);
  }
}

export function parseEgbanetIdList(value: string): number[] {
  const tokens = value.trim().split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const ids = tokens.map((token) => {
    if (!/^\d+$/.test(token)) throw new Error(`ID EGBANET inválido: ${token}`);
    const id = Number(token);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`ID EGBANET inválido: ${token}`);
    return id;
  });

  const unique = [...new Set(ids)];
  if (unique.length > MAX_MANUAL_IDS) {
    throw new Error(`A seleção manual aceita no máximo ${MAX_MANUAL_IDS} IDs por lote.`);
  }
  return unique;
}

export function normalizeDownloadBatchFilter(input: DownloadBatchFilter): DownloadBatchFilter {
  if (!['period', 'egbanet_ids'].includes(input.criterion)) {
    throw new Error('Critério de lote inválido.');
  }
  if (!['normal', 'signed', 'both'].includes(input.fileType)) {
    throw new Error('Tipo de arquivo inválido.');
  }

  const name = input.name?.trim() || undefined;

  if (input.criterion === 'period') {
    const startDate = input.startDate?.trim() ?? '';
    const endDate = input.endDate?.trim() ?? '';
    assertIsoDate(startDate, 'Data inicial');
    assertIsoDate(endDate, 'Data final');
    if (startDate > endDate) throw new Error('A data inicial não pode ser posterior à data final.');
    return { criterion: 'period', fileType: input.fileType, startDate, endDate, name };
  }

  const egbanetIds = [...new Set(input.egbanetIds ?? [])];
  if (egbanetIds.length === 0) throw new Error('Informe ao menos um ID EGBANET.');
  if (egbanetIds.length > MAX_MANUAL_IDS) {
    throw new Error(`A seleção manual aceita no máximo ${MAX_MANUAL_IDS} IDs por lote.`);
  }
  for (const id of egbanetIds) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`ID EGBANET inválido: ${id}`);
  }
  return { criterion: 'egbanet_ids', fileType: input.fileType, egbanetIds, name };
}

export function requestedItemTypes(fileType: DownloadBatchFilter['fileType']): DownloadBatchItemType[] {
  if (fileType === 'both') return ['normal', 'signed'];
  return [fileType];
}

export function buildDownloadItemPath(
  dataEdicao: string,
  numeroEdicao: number,
  egbanetId: number,
  type: DownloadBatchItemType,
  supplementNumber: number | null = null
): { filename: string; relativePath: string } {
  assertIsoDate(dataEdicao, 'Data da edição');
  if (!Number.isSafeInteger(numeroEdicao) || numeroEdicao < 0) throw new Error('Número da edição inválido.');
  if (!Number.isSafeInteger(egbanetId) || egbanetId <= 0) throw new Error('ID EGBANET inválido.');
  if (supplementNumber !== null && (!Number.isSafeInteger(supplementNumber) || supplementNumber <= 0)) {
    throw new Error('Número do suplemento inválido.');
  }

  const year = dataEdicao.slice(0, 4);
  const month = dataEdicao.slice(5, 7);
  const typeLabel = type === 'normal' ? 'NORMAL' : 'ASSINADO';
  const typeFolder = type === 'normal' ? 'normal' : 'assinado';
  const supplementLabel = supplementNumber === null ? '' : `-SUP-${supplementNumber}`;
  const filename = `${dataEdicao}-${numeroEdicao}${supplementLabel}-${typeLabel}.pdf`;
  return { filename, relativePath: `${year}/${month}/${typeFolder}/${filename}` };
}
