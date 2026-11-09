import { HttpTransport } from '../../core/http.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { OFFICIAL_DEFAULT_KEY } from '../../../../collector/adapters/datajud.mjs';
import { resolveDatajudAlias } from './tribunal-resolver.mjs';

export const DATAJUD_DEFAULT_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';
export const DATAJUD_KEY_PAGE = 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/';

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
    const operationRecord = this.#recorder?.start?.('datajud', operation);
    try {
      const result = await this.#transport.request(`${this.#baseUrl}/api_publica_${alias}/_search`, {
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
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, `DataJud respondeu ${result.status}.`, {
          provider: 'datajud',
          operation,
          status: result.status
        });
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

  async health() {
    const payload = await this.searchAlias('tjrs', {
      size: 1,
      query: { match_all: {} }
    }, { operation: 'health' });
    return { ok: true, total: extractTotalHits(payload) };
  }
}
