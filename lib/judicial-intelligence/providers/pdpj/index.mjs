import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { CAPABILITIES, createProvider } from '../../core/capability-registry.mjs';
import { SOURCE_IDS } from '../../core/provenance.mjs';
import { HttpTransport } from '../../core/http.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { cleanCnj } from '../../../judicial/omni/contracts.mjs';
import {
  PDPJ_DEFAULT_BASE_URL,
  PdpjClient,
  extractItems,
  extractSearchAfter,
  extractTotal
} from './client.mjs';
import { createPdpjTokenProvider } from './auth.mjs';
import { buildProcessQuery } from './processes.mjs';
import { normalizeProcess, normalizeProcessCandidate } from './normalizer.mjs';
import { listDocuments, downloadDocument } from './documents.mjs';
import { listCommunications } from './communications.mjs';

export { PdpjClient, PDPJ_DEFAULT_BASE_URL, PDPJ_ENDPOINTS, PDPJ_BROWSER_HEADERS } from './client.mjs';
export { createPdpjTokenProvider, inspectPdpjToken, decodeJwtPayload } from './auth.mjs';
export { detectPdpjQueryType, buildProcessQuery, normalizeCnj } from './processes.mjs';
export { normalizeProcess, normalizeProcessCandidate, normalizeParty, normalizeMovement } from './normalizer.mjs';
export { normalizeDocumentMetadata, extractDocumentList, listDocuments, downloadDocument, DOWNLOAD_STATUS } from './documents.mjs';
export { normalizeCommunication, listCommunications } from './communications.mjs';

function parseJson(result) {
  return JSON.parse(result.body.toString('utf8'));
}

function clampLimit(limit, fallback = 20) {
  return Math.min(Math.max(1, Number(limit) || fallback), 200);
}

export function createPdpjProvider({
  env = process.env,
  transport,
  baseUrl = null,
  endpoints = {},
  token = null,
  tokenProvider = null,
  recorder = null,
  allowDisabled = false
} = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_PDPJ_PROVIDER', env);

  const tokens = tokenProvider ?? createPdpjTokenProvider({ env, token });
  const client = new PdpjClient({
    transport: transport ?? new HttpTransport({ policy: { hostSpacingMs: 400 }, requireHttps: true }),
    tokenProvider: () => tokens.get(),
    baseUrl: baseUrl ?? env?.PDPJ_API_BASE_URL ?? PDPJ_DEFAULT_BASE_URL,
    endpoints,
    recorder
  });
  const sourcePortal = client.baseUrl();

  return createProvider({
    id: 'pdpj',
    label: 'PDPJ — Portal de Serviços do Poder Judiciário',
    source: SOURCE_IDS.PDPJ,
    maturity: 'experimental',
    notes: 'Endpoints UNVERIFIED contra produção; exige token humano efêmero e nunca automatiza login/CAPTCHA.',
    capabilities: [
      CAPABILITIES.PROCESS_SEARCH,
      CAPABILITIES.PROCESS_DETAIL,
      CAPABILITIES.PARTIES,
      CAPABILITIES.MOVEMENTS,
      CAPABILITIES.DOCUMENT_LIST,
      CAPABILITIES.DOCUMENT_DOWNLOAD,
      CAPABILITIES.COMMUNICATIONS
    ],
    probe: async () => {
      const description = tokens.describe();
      if (!description.present) return { status: 'human_required', verificationState: 'HUMAN_REQUIRED', detail: 'Token humano ausente para esta execução.' };
      if (description.expired) return { status: 'unavailable', verificationState: 'UNAVAILABLE', detail: 'Token expirado; capture um novo.' };
      return { status: 'experimental', verificationState: 'UNVERIFIED', detail: 'Token presente; endpoints não confirmados contra produção.' };
    },
    implementation: {
      client,
      tokens,
      sourcePortal,
      async findProcesses(query, { limit = 20, searchAfter = null } = {}) {
        const built = buildProcessQuery(query);
        const params = { ...built.params, itensPorPagina: clampLimit(limit) };
        if (searchAfter) params.searchAfter = searchAfter;
        const result = await client.searchRaw(params);
        const payload = parseJson(result);
        const candidates = extractItems(payload).map(raw => normalizeProcessCandidate(raw, { sourcePortal }));
        return {
          query: built,
          candidates,
          searchAfter: extractSearchAfter(payload),
          total: extractTotal(payload)
        };
      },
      async getProcess(cnj) {
        const numero = cleanCnj(cnj);
        const result = await client.processRaw(numero);
        const payload = parseJson(result);
        const raw = Array.isArray(payload)
          ? payload[0]
          : (Array.isArray(payload?.content) ? payload.content[0] : payload);
        if (!raw) return null;
        return normalizeProcess(raw, { sourcePortal, queryKind: 'process' });
      },
      async listMovements(cnj) {
        const process = await this.getProcess(cnj);
        return { movements: process?.movements ?? [], provenance: process?.provenance ?? null };
      },
      async listDocuments(cnj) {
        const numero = cleanCnj(cnj);
        return listDocuments(client, numero, { cnj: numero, sourcePortal });
      },
      async downloadDocument(documentId, { cnj } = {}) {
        if (!cnj) {
          throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT,
            'downloadDocument exige o CNJ do processo (o PDPJ endereça documentos por processo).');
        }
        return downloadDocument(client, cleanCnj(cnj), documentId, { cnj: cleanCnj(cnj), sourcePortal });
      },
      async listCommunications(query = {}) {
        return listCommunications(client, query, { sourcePortal });
      }
    }
  });
}
