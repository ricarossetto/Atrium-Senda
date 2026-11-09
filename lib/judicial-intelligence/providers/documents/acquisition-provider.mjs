import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { normalizeDocumentRecord } from '../../document-intelligence/metadata.mjs';

export const ACQUISITION_METHODS = Object.freeze(['listDocuments', 'downloadDocument']);

export const ACQUISITION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  DOWNLOADED: 'DOWNLOADED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  DUPLICATE: 'DUPLICATE'
});

export function assertAcquisitionProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Provider de aquisição inválido.');
  }
  for (const method of ACQUISITION_METHODS) {
    if (typeof provider[method] !== 'function') {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.CAPABILITY_UNSUPPORTED,
        `Provider de aquisição ${provider.id ?? '?'} sem ${method}().`);
    }
  }
  return provider;
}

export function createAcquisitionProvider({
  id,
  label = id,
  source,
  listDocuments,
  downloadDocument,
  downloadCase = null,
  describeReadiness = null,
  notes = null
} = {}) {
  const provider = {
    id,
    label,
    source,
    notes,
    listDocuments: async (cnj, options) => (await listDocuments(cnj, options)).map(record =>
      normalizeDocumentRecord(record, { cnj, source })),
    downloadDocument,
    downloadCase,
    describeReadiness: describeReadiness ?? (async () => ({ ready: true, humanAction: null }))
  };
  return Object.freeze(assertAcquisitionProvider(provider));
}
