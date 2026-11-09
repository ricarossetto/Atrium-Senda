import { createAcquisitionProvider } from './acquisition-provider.mjs';
import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { SOURCE_IDS } from '../../core/provenance.mjs';

export function createPdpjAcquisitionProvider({ pdpjProvider, env = process.env, allowDisabled = false } = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_DOCUMENT_ACQUISITION', env);
  if (!pdpjProvider?.listDocuments || !pdpjProvider?.downloadDocument) {
    throw new TypeError('Provider PDPJ completo (com documentos) é obrigatório para o adapter de aquisição.');
  }
  return createAcquisitionProvider({
    id: 'pdpj-documents',
    label: 'PDPJ — documentos por processo',
    source: SOURCE_IDS.PDPJ,
    notes: 'Depende de token humano efêmero; nenhum documento é persistido sem staging beta explícito.',
    describeReadiness: async () => {
      const description = pdpjProvider.tokens?.describe?.() ?? { present: false };
      if (!description.present) {
        return {
          ready: false,
          verificationState: 'HUMAN_REQUIRED',
          humanAction: 'Capture o JWT na sessão autenticada do PDPJ e exporte PDPJ_ACCESS_TOKEN apenas para a execução local.'
        };
      }
      if (description.expired === true) {
        return { ready: false, verificationState: 'UNAVAILABLE', humanAction: 'Token PDPJ expirado; capture um novo token.' };
      }
      return { ready: true, verificationState: 'UNVERIFIED', humanAction: null };
    },
    async listDocuments(cnj) {
      const result = await pdpjProvider.listDocuments(cnj);
      return result.documents;
    },
    async downloadDocument(sourceId, { cnj } = {}) {
      if (!cnj) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Aquisição PDPJ exige o CNJ do processo.');
      }
      const artifact = await pdpjProvider.downloadDocument(sourceId, { cnj });
      return {
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        mimeType: artifact.mimeType,
        source: SOURCE_IDS.PDPJ,
        provenance: artifact.provenance
      };
    }
  });
}
