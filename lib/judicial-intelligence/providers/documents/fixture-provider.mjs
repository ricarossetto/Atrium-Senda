import { createAcquisitionProvider } from './acquisition-provider.mjs';
import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { sha256Hex } from '../../document-intelligence/checksum.mjs';

export const FIXTURE_DOCUMENT_TYPES = Object.freeze(['PETICAO', 'DECISAO', 'SENTENCA', 'LAUDO', 'ATA']);

export function createFixtureAcquisitionProvider({
  documents = 5,
  failingIds = [],
  transientIds = [],
  duplicateIds = [],
  cnj = '0000000-00.0000.0.00.0000',
  typeFor = sequence => FIXTURE_DOCUMENT_TYPES[(sequence - 1) % FIXTURE_DOCUMENT_TYPES.length]
} = {}) {
  const failSet = new Set(failingIds.map(String));
  const transientSet = new Set(transientIds.map(String));
  const duplicateSet = new Set(duplicateIds.map(String));
  const attemptsSeen = new Map();

  const bytesFor = sequence => Buffer.from(`DOCUMENTO SINTETICO ${sequence} ${cnj}`, 'utf8');

  return createAcquisitionProvider({
    id: 'fixture',
    label: 'Fixture de aquisição (somente testes)',
    source: SOURCE_IDS.FIXTURE,
    notes: 'Provider determinístico para testes de lote, retomada, deduplicação e falha isolada.',
    async listDocuments(targetCnj = cnj) {
      return Array.from({ length: Math.max(0, Number(documents)) }, (unused, index) => ({
        sourceId: `fx-${index + 1}`,
        cnj: targetCnj,
        sequence: index + 1,
        date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
        type: typeFor(index + 1),
        description: `Documento sintético ${index + 1}`,
        pageCount: index + 1,
        mimeType: 'application/pdf',
        size: null,
        sha256: null,
        source: SOURCE_IDS.FIXTURE,
        downloadStatus: 'PENDING'
      }));
    },
    async downloadDocument(sourceId, { cnj: targetCnj = cnj } = {}) {
      const sequence = Number(String(sourceId).replace('fx-', ''));
      const seen = (attemptsSeen.get(sourceId) ?? 0) + 1;
      attemptsSeen.set(sourceId, seen);
      if (failSet.has(String(sourceId))) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, 'Falha sintética permanente no documento.', {
          retryable: true
        });
      }
      if (transientSet.has(String(sourceId)) && seen < 2) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.TIMEOUT, 'Falha sintética transitória.', { retryable: true });
      }
      const bytes = duplicateSet.has(String(sourceId)) ? bytesFor(1) : bytesFor(sequence);
      return {
        bytes,
        sha256: sha256Hex(bytes),
        mimeType: 'application/pdf',
        source: SOURCE_IDS.FIXTURE,
        provenance: createProvenance({
          source: SOURCE_IDS.FIXTURE,
          kind: PROVENANCE_KINDS.AUTHENTICATED_DOCUMENT,
          queryKind: 'fixture',
          confidence: 1,
          payload: sourceId
        })
      };
    },
    describeReadiness: async () => ({ ready: true, humanAction: null, targetCnj: cnj })
  });
}
