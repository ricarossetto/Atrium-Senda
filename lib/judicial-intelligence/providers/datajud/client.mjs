import { HttpTransport } from '../../core/http.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { OFFICIAL_DEFAULT_KEY, DATAJUD_PUBLIC_ENDPOINTS, normalizeDatajudAlias } from '../../../../collector/adapters/datajud.mjs';
import { resolveDatajudAlias } from './tribunal-resolver.mjs';

export const DATAJUD_DEFAULT_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';
export const DATAJUD_KEY_PAGE = 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/';
export { DATAJUD_PUBLIC_ENDPOINTS, normalizeDatajudAlias };

export function normalizeDatajudApiKey(value) {
  return String(value || '').replace(/^\s*(?:Authorization\s*:\s*)?APIKey\s+/i, '').trim();
}

export function resolveDatajudApiKey({ apiKey = null, env = process.env } = {}) {
  const candidate = normalizeDatajudApiKey(apiKey || env?.DATAJUD_API_KEY || OFFICIAL_DEFAULT_KEY);
  if (!candidate) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAUTHORIZED, 'Chave pública do DataJud indisponível.', {
      provider: 'datajud',
      operation: 'auth',
      humanAction: `Obtenha a chave pública atualizada em ${DATAJUD_KEY_PAGE} e defina DATAJUD_API_KEY.`
    });
  }
  return candidate;
}

export function extractHits(payload) {
  return Array.isArray(payload?.hits?.hits) ? payload.hits.hits : [];
}

export function extractTotalHits(payload) {
  const total = payload?.hits?.total;
  if (Number.isFinite(Number(total))) return Number(total);
  if (Number.isFinite(Number(total?.value))) return Number(total.value);
  return null;
}

export function extractSortCursor(payload) {
  const hits = extractHits(payload);
  const last = hits.length ? hits[hits.length - 1] : null;
  return Array.isArray(last?.sort) && last.sort.length ? last.sort : null;
}

export class DatajudClient {
  #transport;
  #apiKey;
  #baseUrl;
  #recorder;

  constructor({
    transport = new HttpTransport({ policy: { hostSpacingMs: 150, maxAttempts: 3 }, requireHttps: true }),
    apiKey = null,
    env = process.env,
    baseUrl = DATAJUD_DEFAULT_BASE_URL,
    recorder = null
  } = {}) {
    this.#transport = transport;
    this.#apiKey = resolveDatajudApiKey({ apiKey, env });
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#recorder = recorder;
  }

  credentialState() {
    return { provider: 'datajud', hasKey: this.#apiKey.length > 0, keyLength: this.#apiKey.length };
  }

  async searchAlias(alias, body, { operation = 'search' } = {}) {
    const resolvedAlias = normalizeDatajudAlias(alias) || String(alias || '').trim().toLowerCase();
    const operationRecord = this.#recorder?.start?.('datajud', operation);
    try {
      const result = await this.#transport.request(`${this.#baseUrl}/api_publica_${resolvedAlias}/_search`, {
        method: 'POST',
        headers: {
          authorization: `APIKey ${this.#apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (result.status === 401 || result.status === 403) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAUTHORIZED, 'DataJud recusou a chave pública.', {
          provider: 'datajud',
          operation,
          status: result.status,
          humanAction: `Atualize a chave pública (${DATAJUD_KEY_PAGE}) ou use DATAJUD_API_KEY válida.`
        });
      }
      if (!result.ok) {
        const errorBody = result.body ? result.body.toString('utf8') : '';
        const overloaded = result.status === 429 || /es_rejected_execution_exception/i.test(errorBody);
        throw new JudicialIntelligenceError(
          overloaded ? (JI_ERROR_CODES.RATE_LIMITED || JI_ERROR_CODES.UNAVAILABLE) : JI_ERROR_CODES.UNAVAILABLE,
          overloaded ? `DataJud sobrecarregado (HTTP ${result.status}).` : `DataJud respondeu ${result.status}.`,
          {
            provider: 'datajud',
            operation,
            status: result.status
          }
        );
      }
      const payload = JSON.parse(result.body.toString('utf8'));
      operationRecord?.finish?.({ status: 'ok', items: extractHits(payload).length });
      return payload;
    } catch (error) {
      operationRecord?.finish?.({ status: 'failed', errorClass: error?.code ?? 'INTERNAL' });
      throw error;
    }
  }

  async findByCnj(cnj) {
    const alias = resolveDatajudAlias(cnj);
    const digits = String(cnj).replace(/\D/g, '');
    return this.searchAlias(alias, {
      size: 10,
      query: { match: { numeroProcesso: digits } }
    }, { operation: 'findByCnj' });
  }

  /**
   * Consulta por Classe Processual e/ou Órgão Julgador com paginação `search_after`
   * ordenada por `@timestamp` (Exemplos 2 e 3 da Wiki oficial DataJud/CNJ).
   */
  async searchByClassAndOrgan({
    alias,
    classCode = null,
    organCode = null,
    size = 100,
    searchAfter = null,
    sortOrder = 'asc'
  } = {}) {
    const must = [];
    if (classCode !== null && classCode !== undefined && classCode !== '') {
      must.push({ match: { 'classe.codigo': Number(classCode) } });
    }
    if (organCode !== null && organCode !== undefined && organCode !== '') {
      must.push({ match: { 'orgaoJulgador.codigo': Number(organCode) } });
    }
    if (!must.length) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Informe classCode e/ou organCode para pesquisar no DataJud.');
    }
    const pageSize = Math.max(1, Math.min(10_000, Number(size) || 100));
    const order = String(sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';
    const body = {
      size: pageSize,
      query: { bool: { must } },
      sort: [{ '@timestamp': { order } }],
      ...(Array.isArray(searchAfter) && searchAfter.length ? { search_after: searchAfter } : {})
    };
    const payload = await this.searchAlias(alias, body, { operation: 'searchByClassAndOrgan' });
    return {
      payload,
      hits: extractHits(payload),
      total: extractTotalHits(payload),
      nextSearchAfter: extractSortCursor(payload)
    };
  }

  async health() {
    const payload = await this.searchAlias('tjrs', {
      size: 1,
      query: { match: { numeroProcesso: '00000000000000000000' } }
    }, { operation: 'health' });
    return { ok: true, total: extractTotalHits(payload) };
  }
}
