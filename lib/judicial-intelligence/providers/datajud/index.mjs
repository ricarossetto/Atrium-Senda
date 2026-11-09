import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { CAPABILITIES, createProvider } from '../../core/capability-registry.mjs';
import { SOURCE_IDS } from '../../core/provenance.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { HttpTransport } from '../../core/http.mjs';
import { DATAJUD_DEFAULT_BASE_URL, DatajudClient } from './client.mjs';
import { applyMovementIntelligence, normalizeHit, searchProcessByCnj, toCandidate } from './process-search.mjs';
import { describeTribunal, resolveDatajudAlias, resolveTribunalLabel } from './tribunal-resolver.mjs';

export { DatajudClient, DATAJUD_DEFAULT_BASE_URL, DATAJUD_KEY_PAGE, resolveDatajudApiKey, extractHits } from './client.mjs';
export { describeTribunal, resolveDatajudAlias, resolveTribunalLabel } from './tribunal-resolver.mjs';
export { searchProcessByCnj, normalizeHit, applyMovementIntelligence } from './process-search.mjs';
export { classifyMovement, summarizeMovements } from '../../process-intelligence/movement-classifier.mjs';
export { MOVEMENT_CATEGORIES } from '../../process-intelligence/tpu-table.mjs';

export function createDatajudProvider({
  env = process.env,
  transport,
  apiKey = null,
  baseUrl = DATAJUD_DEFAULT_BASE_URL,
  recorder = null,
  allowDisabled = false
} = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_PROCESS_INTELLIGENCE', env);

  const client = new DatajudClient({
    transport: transport ?? new HttpTransport({ policy: { hostSpacingMs: 150, maxAttempts: 3 }, requireHttps: true }),
    apiKey,
    env,
    baseUrl,
    recorder
  });

  return createProvider({
    id: 'datajud',
    label: 'DataJud — Base Pública do CNJ',
    source: SOURCE_IDS.DATAJUD,
    maturity: 'experimental',
    notes: 'Consulta por CNJ (a base pública não descobre por OAB). Altação de movimentos usa TPU provisório e não substitui leitura autenticada.',
    capabilities: [
      CAPABILITIES.PROCESS_SEARCH,
      CAPABILITIES.PROCESS_DETAIL,
      CAPABILITIES.PARTIES,
      CAPABILITIES.MOVEMENTS
    ],
    probe: async () => {
      const health = await client.health();
      return {
        status: 'ok',
        verificationState: 'LIVE_PARTIAL',
        detail: `Endpoint público respondeu (${health.total ?? 0} documentos no alias tjrs); enriquecimento por CNJ ainda não comparado com a fonte oficial.`
      };
    },
    implementation: {
      client,
      async findProcesses(query, { collectedAt } = {}) {
        const cnj = typeof query === 'string' ? query : query?.cnj;
        if (!cnj) {
          throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT,
            'DataJud beta só consulta por CNJ; descoberta por OAB permanece no DJEN/OMNI.');
        }
        const process = await searchProcessByCnj(client, cnj, { collectedAt });
        return {
          query: { type: 'cnj', params: { numeroProcesso: cnj } },
          candidates: process ? [toCandidate(process)] : [],
          total: process ? 1 : 0,
          searchAfter: null
        };
      },
      async getProcess(cnj, { collectedAt } = {}) {
        const process = await searchProcessByCnj(client, cnj, { collectedAt });
        return process ? applyMovementIntelligence(process) : null;
      },
      async listMovements(cnj, options = {}) {
        const process = await this.getProcess(cnj, options);
        return {
          movements: process?.movements ?? [],
          summary: process?.movementSummary ?? null,
          provenance: process?.provenance ?? null
        };
      },
      describeTribunal(cnj) {
        return describeTribunal(cnj);
      },
      resolveAlias(cnj) {
        return resolveDatajudAlias(cnj);
      },
      resolveTribunal(cnj) {
        return resolveTribunalLabel(cnj);
      },
      normalizeHit(hit, options) {
        return normalizeHit(hit, options);
      }
    }
  });
}
