export type EditionQueryAvailability = 'any' | 'normal' | 'signed' | 'both' | 'some' | 'none';
export type EditionQuerySupplement = 'any' | 'yes' | 'no' | 'unknown';

export interface EditionQueryFilter {
  startDate?: string;
  endDate?: string;
  editionNumber?: number;
  egbanetId?: number;
  editionType?: string;
  supplement?: EditionQuerySupplement;
  availability?: EditionQueryAvailability;
  page?: number;
  pageSize?: number;
}

export interface NormalizedEditionQueryFilter {
  startDate?: string;
  endDate?: string;
  editionNumber?: number;
  egbanetId?: number;
  editionType?: string;
  supplement: EditionQuerySupplement;
  availability: EditionQueryAvailability;
  page: number;
  pageSize: number;
}

export interface EditionQueryWhere {
  filter: NormalizedEditionQueryFilter;
  whereSql: string;
  bind: Array<string | number>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function normalizeDate(value: string | undefined, label: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!ISO_DATE.test(normalized)) throw new Error(`${label} inválida.`);
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} inválida.`);
  }
  return normalized;
}

function normalizePositiveInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} inválido.`);
  return value;
}

export function normalizeEditionQueryFilter(input: EditionQueryFilter): NormalizedEditionQueryFilter {
  const startDate = normalizeDate(input.startDate, 'Data inicial');
  const endDate = normalizeDate(input.endDate, 'Data final');
  if (startDate && endDate && startDate > endDate) {
    throw new Error('A data inicial não pode ser posterior à data final.');
  }

  const supplement = input.supplement ?? 'any';
  if (!['any', 'yes', 'no', 'unknown'].includes(supplement)) {
    throw new Error('Filtro de suplemento inválido.');
  }

  const availability = input.availability ?? 'any';
  if (!['any', 'normal', 'signed', 'both', 'some', 'none'].includes(availability)) {
    throw new Error('Filtro de disponibilidade inválido.');
  }

  const page = input.page ?? 1;
  if (!Number.isSafeInteger(page) || page <= 0) throw new Error('Página inválida.');

  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`Quantidade por página deve estar entre 1 e ${MAX_PAGE_SIZE}.`);
  }

  const editionType = input.editionType?.trim() || undefined;

  return {
    startDate,
    endDate,
    editionNumber: normalizePositiveInteger(input.editionNumber, 'Número da edição'),
    egbanetId: normalizePositiveInteger(input.egbanetId, 'ID EGBANET'),
    editionType,
    supplement,
    availability,
    page,
    pageSize
  };
}

export function buildEditionQueryWhere(input: EditionQueryFilter): EditionQueryWhere {
  const filter = normalizeEditionQueryFilter(input);
  const conditions: string[] = [];
  const bind: Array<string | number> = [];

  if (filter.startDate) {
    conditions.push('data_edicao >= ?');
    bind.push(filter.startDate);
  }
  if (filter.endDate) {
    conditions.push('data_edicao <= ?');
    bind.push(filter.endDate);
  }
  if (filter.editionNumber !== undefined) {
    conditions.push('numero_edicao = ?');
    bind.push(filter.editionNumber);
  }
  if (filter.egbanetId !== undefined) {
    conditions.push('egbanet_id = ?');
    bind.push(filter.egbanetId);
  }
  if (filter.editionType) {
    conditions.push('tipo_edicao = ?');
    bind.push(filter.editionType);
  }

  if (filter.supplement === 'yes') conditions.push('suplemento = 1');
  else if (filter.supplement === 'no') conditions.push('suplemento = 0');
  else if (filter.supplement === 'unknown') conditions.push('suplemento IS NULL');

  if (filter.availability === 'normal') {
    conditions.push('download_diario_url IS NOT NULL');
  } else if (filter.availability === 'signed') {
    conditions.push('download_assinado_url IS NOT NULL');
  } else if (filter.availability === 'both') {
    conditions.push('download_diario_url IS NOT NULL AND download_assinado_url IS NOT NULL');
  } else if (filter.availability === 'some') {
    conditions.push('(download_diario_url IS NOT NULL OR download_assinado_url IS NOT NULL)');
  } else if (filter.availability === 'none') {
    conditions.push('download_diario_url IS NULL AND download_assinado_url IS NULL');
  }

  return {
    filter,
    whereSql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    bind
  };
}
