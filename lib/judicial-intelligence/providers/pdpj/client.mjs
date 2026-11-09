import { JudicialIntelligenceError, JI_ERROR_CODES, humanRequiredError } from '../../core/errors.mjs';
import { HttpTransport, detectHumanChallenge } from '../../core/http.mjs';

export const PDPJ_DEFAULT_BASE_URL = 'https://portaldeservicos.pdpj.jus.br';
export const PDPJ_SOURCE = 'PDPJ';

export const PDPJ_ENDPOINTS = Object.freeze({
  search: '/v2/processos',
  process: numero => `/v2/processos/${numero}`,
  documents: numero => `/v2/processos/${numero}/documentos`,
  documentBinary: (numero, documentId) => `/v2/processos/${numero}/documentos/${documentId}/binario`,
  communications: '/v2/comunicacoes'
});

export const PDPJ_BROWSER_HEADERS = Object.freeze({
  accept: 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest'
});

function joinUrl(baseUrl, pathname) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export function buildQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function assertPdpjResponse(result, { provider = 'pdpj', operation = 'request' } = {}) {
  const bodyText = result.body?.toString('utf8') ?? '';
  const challenge = detectHumanChallenge({ status: result.status, bodyText });
  if (challenge.required) {
    throw humanRequiredError(provider, operation,
      'O PDPJ exigiu verificação humana (WAF/CAPTCHA). Autentique-se manualmente no portal e repita com um novo token.');
  }
  if (result.status === 401) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAUTHORIZED, 'Token PDPJ ausente, inválido ou expirado.', {
      provider,
      operation,
      status: 401,
      humanAction: 'Capture um novo JWT na sua sessão autenticada do PDPJ (validade aproximada de 8h).'
    });
  }
  if (result.status === 403) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'PDPJ recusou a requisição (403).', {
      provider,
      operation,
      status: 403,
      humanAction: 'Confirme a sessão, o token e as permissões do usuário no portal.'
    });
  }
  if (result.status === 404) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.NOT_FOUND, 'Recurso não localizado no PDPJ.', {
      provider,
      operation,
      status: 404
    });
  }
  if (!result.ok) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, `PDPJ respondeu ${result.status}.`, {
      provider,
      operation,
      status: result.status
    });
  }
  return result;
}

export class PdpjClient {
  #transport;
  #tokenProvider;
  #baseUrl;
  #endpoints;
  #recorder;

  constructor({
    transport = new HttpTransport({ policy: { hostSpacingMs: 400 }, requireHttps: true }),
    tokenProvider,
    baseUrl = PDPJ_DEFAULT_BASE_URL,
    endpoints = {},
    recorder = null
  } = {}) {
    if (typeof tokenProvider !== 'function') {
      throw new TypeError('tokenProvider obrigatório para o cliente PDPJ.');
    }
    this.#transport = transport;
    this.#tokenProvider = tokenProvider;
    this.#baseUrl = baseUrl;
    this.#endpoints = { ...PDPJ_ENDPOINTS, ...endpoints };
    this.#recorder = recorder;
  }

  baseUrl() {
    return this.#baseUrl;
  }

  async #request(pathname, { operation, query = {}, method = 'GET', binary = false, headers = {} } = {}) {
    const token = await this.#tokenProvider();
    if (!token) {
      throw humanRequiredError('pdpj', operation,
        'Forneça um token PDPJ capturado na sua própria sessão (PDPJ_ACCESS_TOKEN) para esta execução local.');
    }
    const operation1 = this.#recorder?.start?.('pdpj', operation);
    const url = `${joinUrl(this.#baseUrl, pathname)}${buildQueryString(query)}`;
    try {
      const result = await this.#transport.request(url, {
        method,
        headers: {
          ...PDPJ_BROWSER_HEADERS,
          authorization: `Bearer ${token}`,
          ...headers
        }
      });
      assertPdpjResponse(result, { operation });
      operation1?.finish?.({ status: 'ok', items: binary ? 1 : 0 });
      return result;
    } catch (error) {
      operation1?.finish?.({ status: 'failed', errorClass: error?.code ?? 'INTERNAL' });
      throw error;
    }
  }

  async searchRaw(params = {}) {
    return this.#request(this.#endpoints.search, { operation: 'search', query: params });
  }

  async processRaw(numero) {
    return this.#request(this.#endpoints.process(numero), { operation: 'process' });
  }

  async documentsRaw(numero) {
    return this.#request(this.#endpoints.documents(numero), { operation: 'documents' });
  }

  async documentBinaryRaw(numero, documentId) {
    return this.#request(this.#endpoints.documentBinary(numero, documentId), {
      operation: 'downloadDocument',
      binary: true,
      headers: { accept: 'application/pdf, application/octet-stream, */*' }
    });
  }

  async communicationsRaw(params = {}) {
    return this.#request(this.#endpoints.communications, { operation: 'communications', query: params });
  }
}

export function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'items', 'data', 'processos', 'results', 'registros']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function extractSearchAfter(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.searchAfter ?? payload.nextSearchAfter ?? payload.cursor ?? null;
}

export function extractTotal(payload) {
  const total = payload?.totalElements ?? payload?.total ?? payload?.count;
  return Number.isFinite(Number(total)) ? Number(total) : null;
}
