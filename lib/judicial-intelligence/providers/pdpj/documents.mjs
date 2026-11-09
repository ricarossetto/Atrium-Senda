import { documentChecksum } from '../../../documents/document-service.mjs';
import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { extractItems } from './client.mjs';

export const DOWNLOAD_STATUS = Object.freeze({
  PENDING: 'PENDING',
  DOWNLOADED: 'DOWNLOADED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
});

export function normalizeDocumentMetadata(raw, { cnj, sourcePortal = null } = {}) {
  const pageCount = Number(raw?.paginas ?? raw?.pageCount ?? raw?.numeroPaginas);
  const size = Number(raw?.tamanho ?? raw?.size ?? raw?.tamanhoBytes);
  return {
    sourceId: String(raw?.id ?? raw?.documentoId ?? raw?.documentId ?? raw?.sequencia ?? ''),
    cnj,
    sequence: Number.isFinite(Number(raw?.sequencia ?? raw?.sequence)) ? Number(raw.sequencia ?? raw.sequence) : null,
    date: raw?.data ?? raw?.dataDocumento ?? raw?.dataJuntada ?? null,
    type: raw?.tipo ?? raw?.tipoDocumento ?? null,
    description: raw?.descricao ?? raw?.nome ?? raw?.titulo ?? null,
    pageCount: Number.isFinite(pageCount) ? pageCount : null,
    mimeType: raw?.mimeType ?? raw?.mime ?? null,
    size: Number.isFinite(size) ? size : null,
    sha256: null,
    source: SOURCE_IDS.PDPJ,
    sourcePortal,
    downloadStatus: DOWNLOAD_STATUS.PENDING
  };
}

export function extractDocumentList(payload, { cnj, sourcePortal = null } = {}) {
  return extractItems(payload).map(raw => normalizeDocumentMetadata(raw, { cnj, sourcePortal }));
}

export async function listDocuments(client, numero, { cnj = null, sourcePortal = null } = {}) {
  const result = await client.documentsRaw(numero);
  const documents = extractDocumentList(JSON.parse(result.body.toString('utf8')), { cnj: cnj ?? numero, sourcePortal });
  return {
    documents,
    provenance: createProvenance({
      source: SOURCE_IDS.PDPJ,
      sourcePortal,
      kind: PROVENANCE_KINDS.AUTHENTICATED_DOCUMENT,
      queryKind: 'documents',
      confidence: 0.95,
      payload: documents.map(document => document.sourceId)
    })
  };
}

export async function downloadDocument(client, numero, documentId, { cnj = null, sourcePortal = null } = {}) {
  const result = await client.documentBinaryRaw(numero, documentId);
  const bytes = result.body;
  return {
    documentId: String(documentId),
    cnj: cnj ?? numero,
    bytes,
    size: bytes.length,
    sha256: documentChecksum(bytes),
    mimeType: result.headers?.['content-type'] ?? 'application/octet-stream',
    source: SOURCE_IDS.PDPJ,
    sourcePortal,
    downloadStatus: DOWNLOAD_STATUS.DOWNLOADED,
    provenance: createProvenance({
      source: SOURCE_IDS.PDPJ,
      sourcePortal,
      kind: PROVENANCE_KINDS.AUTHENTICATED_DOCUMENT,
      queryKind: 'document-binary',
      confidence: 0.95,
      payload: documentId
    })
  };
}
