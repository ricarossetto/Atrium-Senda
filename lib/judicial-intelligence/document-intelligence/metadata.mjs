export const DOCUMENT_REQUIRED_FIELDS = Object.freeze(['sourceId', 'cnj', 'source']);

export const DOCUMENT_TYPES = Object.freeze({
  PETICAO: 'PETICAO',
  DECISAO: 'DECISAO',
  SENTENCA: 'SENTENCA',
  ACORDAO: 'ACORDAO',
  LAUDO: 'LAUDO',
  ATA: 'ATA',
  CERTIDAO: 'CERTIDAO',
  COMPROVANTE: 'COMPROVANTE',
  OUTRO: 'OUTRO'
});

export function normalizeDocumentRecord(raw = {}, { cnj = null, source = null } = {}) {
  const record = {
    sourceId: String(raw.sourceId ?? raw.id ?? '').trim(),
    cnj: raw.cnj ?? cnj,
    sequence: Number.isFinite(Number(raw.sequence)) ? Number(raw.sequence) : null,
    date: raw.date ?? null,
    type: raw.type ?? null,
    description: raw.description ?? null,
    pageCount: Number.isFinite(Number(raw.pageCount)) ? Number(raw.pageCount) : null,
    mimeType: raw.mimeType ?? 'application/pdf',
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
    sha256: raw.sha256 ?? null,
    source: raw.source ?? source,
    sourcePortal: raw.sourcePortal ?? null,
    downloadStatus: raw.downloadStatus ?? 'PENDING',
    provenance: raw.provenance ?? null
  };
  return record;
}

export function assertDocumentRecord(record) {
  const missing = DOCUMENT_REQUIRED_FIELDS.filter(field => record?.[field] === null || record?.[field] === undefined || record?.[field] === '');
  if (missing.length > 0) {
    const error = new Error(`Documento sem campos obrigatórios: ${missing.join(', ')}`);
    error.code = 'INVALID_DOCUMENT_RECORD';
    throw error;
  }
  return record;
}

export function documentSortKey(record) {
  return [record.sequence ?? Number.MAX_SAFE_INTEGER, record.date ?? '', record.sourceId ?? ''].join('|');
}

export function sortDocuments(records = []) {
  return [...records].sort((left, right) => documentSortKey(left).localeCompare(documentSortKey(right)));
}

export function toDocumentMetadata(record) {
  const { bytes, ...metadata } = record;
  return metadata;
}
