/**
 * ATRIUM — Cliente do Domicílio Eletrônico (PDPJ / Jus.br)
 *
 * Integração **somente leitura** com a API oficial da Central de Comunicações
 * (`gateway.cloud.pje.jus.br/domicilio-eletronico`). Lista comunicações do
 * representante e consulta o ticket de uma comunicação. Autenticação por
 * `Authorization: Bearer <JWT>` capturado na sessão do próprio usuário, com o
 * header `tenantId` do escritório.
 *
 * Invariantes de segurança e contrato:
 * - este módulo **nunca** executa escrita: não informa ciência, não peticiona,
 *   não assina e não altera nada no portal. Qualquer método de escrita é
 *   proibido por desenho (`assertReadOnly`) e não deve ser adicionado aqui;
 * - a janela de consulta da API é limitada a 7 dias corridos por requisição;
 * - token, tenantId e conteúdo judicial nunca são logados nem persistidos aqui.
 */

export const DOMICILIO_BASE_URL = 'https://gateway.cloud.pje.jus.br/domicilio-eletronico';
export const DOMICILIO_PORTAL_ID = 'domicilio-eletronico';
export const DOMICILIO_MAX_WINDOW_DAYS = 7;
export const DOMICILIO_DEFAULT_PAGE_SIZE = 50;
export const DOMICILIO_MAX_PAGES = 40;

export class DomicilioError extends Error {
  constructor(message, { statusCode = 502, code = 'DOMICILIO_ERROR', retryAfterSeconds = null } = {}) {
    super(message);
    this.name = 'DomicilioError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function joinUrl(baseUrl, pathname) {
  const base = String(baseUrl || DOMICILIO_BASE_URL).replace(/\/+$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function dateOnly(value) {
  const raw = String(value || '').trim();
  if (raw.length < 10) return null;
  const candidate = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function assertDomicilioWindow(dataInicio, dataFim, { maxDays = DOMICILIO_MAX_WINDOW_DAYS } = {}) {
  const inicio = dateOnly(dataInicio);
  const fim = dateOnly(dataFim);
  if (!inicio || !fim) {
    throw new DomicilioError('Informe dataInicio e dataFim (AAAA-MM-DD) para consultar o Domicílio Eletrônico.', {
      statusCode: 400,
      code: 'DOMICILIO_WINDOW_INVALID'
    });
  }
  const start = Date.parse(`${inicio}T12:00:00Z`);
  const end = Date.parse(`${fim}T12:00:00Z`);
  if (end < start) {
    throw new DomicilioError('A janela do Domicílio Eletrônico tem data final anterior à inicial.', {
      statusCode: 400,
      code: 'DOMICILIO_WINDOW_INVALID'
    });
  }
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > maxDays) {
    throw new DomicilioError(`A API do Domicílio Eletrônico aceita no máximo ${maxDays} dias por consulta (recebido: ${days}).`, {
      statusCode: 400,
      code: 'DOMICILIO_WINDOW_EXCEEDED'
    });
  }
  return { dataInicio: inicio, dataFim: fim, days };
}

export function extractDomicilioItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'comunicacoes', 'items', 'data', 'results', 'registros']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function domicilioPageInfo(payload, fallbackPage = 0) {
  const page = Number(payload?.number ?? payload?.pagina ?? payload?.page ?? fallbackPage);
  const totalPages = Number(payload?.totalPages ?? payload?.totalPaginas);
  const last = payload?.last === true || payload?.ultima === true
    || (Number.isFinite(totalPages) && Number.isFinite(page) && page + 1 >= totalPages);
  return {
    page: Number.isFinite(page) ? page : fallbackPage,
    totalPages: Number.isFinite(totalPages) ? totalPages : null,
    totalElements: Number.isFinite(Number(payload?.totalElements ?? payload?.total ?? payload?.count))
      ? Number(payload?.totalElements ?? payload?.total ?? payload?.count)
      : null,
    last
  };
}

function describeStatus(status) {
  if (status === 400) return { code: 'DOMICILIO_BAD_REQUEST', message: 'O Domicílio Eletrônico recusou os parâmetros da consulta.' };
  if (status === 401) return { code: 'DOMICILIO_UNAUTHORIZED', message: 'Sessão do Domicílio Eletrônico ausente, inválida ou expirada.' };
  if (status === 403) return { code: 'DOMICILIO_FORBIDDEN', message: 'O Domicílio Eletrônico recusou a requisição (403).' };
  if (status === 404) return { code: 'DOMICILIO_NOT_FOUND', message: 'Recurso não localizado no Domicílio Eletrônico.' };
  if (status === 429) return { code: 'DOMICILIO_RATE_LIMITED', message: 'Limite temporário do Domicílio Eletrônico atingido.' };
  if (status >= 500) return { code: 'DOMICILIO_UNAVAILABLE', message: `Domicílio Eletrônico indisponível (HTTP ${status}).` };
  return { code: 'DOMICILIO_HTTP', message: `Domicílio Eletrônico respondeu HTTP ${status}.` };
}

function assertReadOnly(method) {
  if (String(method || 'GET').toUpperCase() !== 'GET') {
    throw new DomicilioError('O Domicílio Eletrônico é consultado somente em leitura neste produto.', {
      statusCode: 500,
      code: 'DOMICILIO_WRITE_FORBIDDEN'
    });
  }
}

export function createDomicilioClient({
  baseUrl = process.env.DOMICILIO_API_BASE_URL || DOMICILIO_BASE_URL,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 45_000,
  maxPages = DOMICILIO_MAX_PAGES
} = {}) {
  const request = async (pathname, {
    session,
    query = null,
    operation = 'request',
    allowEmpty = false
  } = {}) => {
    const token = String(session?.accessToken || '').trim();
    const tenantId = String(session?.tenantId || '').trim();
    if (!token || !tenantId) {
      throw new DomicilioError('Sessão do Domicílio Eletrônico não configurada (Bearer + tenantId ausentes).', {
        statusCode: 409,
        code: 'DOMICILIO_NOT_AUTHENTICATED'
      });
    }
    assertReadOnly('GET');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 45_000));
    let response;
    try {
      response = await fetchImpl(`${joinUrl(baseUrl, pathname)}${buildQuery(query)}`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          tenantId
        },
        redirect: 'error',
        signal: controller.signal
      });
    } catch (error) {
      throw new DomicilioError(`Falha de rede ao consultar o Domicílio Eletrônico (${operation}).`, { code: 'DOMICILIO_NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    const contentType = String(response.headers?.get?.('content-type') || '');
    let payload = null;
    if (contentType.includes('json')) payload = await response.json().catch(() => null);
    else {
      const text = await response.text().catch(() => '');
      try { payload = JSON.parse(text); } catch { payload = text; }
    }

    if (!response.ok) {
      const described = describeStatus(response.status);
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      throw new DomicilioError(described.message, {
        statusCode: response.status,
        code: described.code,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
      });
    }
    if (!allowEmpty && payload === null) {
      throw new DomicilioError('O Domicílio Eletrônico respondeu sem conteúdo utilizável.', { code: 'DOMICILIO_EMPTY_RESPONSE' });
    }
    return payload;
  };

  /**
   * Lista comunicações do representante na janela informada (máx. 7 dias por chamada).
   * Percorre páginas até `last`/vazio, respeitando o teto de páginas para não estourar custo.
   */
  const listarComunicacoes = async (session, {
    dataInicio,
    dataFim,
    numeroProcesso = null,
    tipoComunicacao = null,
    ciente = null,
    representado = null,
    itensPorPagina = DOMICILIO_DEFAULT_PAGE_SIZE,
    maxPages: pageLimit = maxPages
  } = {}) => {
    const window = assertDomicilioWindow(dataInicio, dataFim);
    const items = [];
    const pages = [];
    let page = 0;
    let last = false;
    let totalPages = null;
    let totalElements = null;
    while (!last && page < Math.max(1, Number(pageLimit) || maxPages)) {
      const payload = await request('/api/v1/comunicacoes-representantes', {
        session,
        operation: 'listarComunicacoes',
        allowEmpty: true,
        query: {
          dataInicio: window.dataInicio,
          dataFim: window.dataFim,
          numeroProcesso: numeroProcesso || null,
          tipoComunicacao: tipoComunicacao || null,
          ciente: ciente === null || ciente === undefined ? null : String(Boolean(ciente)),
          representado: representado || null,
          pagina: page,
          itensPorPagina: Math.min(Math.max(1, Number(itensPorPagina) || DOMICILIO_DEFAULT_PAGE_SIZE), 200)
        }
      });
      const pageItems = extractDomicilioItems(payload);
      items.push(...pageItems);
      const info = domicilioPageInfo(payload, page);
      pages.push({ page: info.page, items: pageItems.length });
      totalPages = info.totalPages ?? totalPages;
      totalElements = info.totalElements ?? totalElements;
      last = info.last || pageItems.length === 0;
      page += 1;
    }
    return {
      window,
      items,
      pages,
      truncated: !last && page >= Math.max(1, Number(pageLimit) || maxPages),
      totalPages,
      totalElements
    };
  };

  const ticket = (session, { numeroProcesso, numeroComunicacao }) => {
    const processo = String(numeroProcesso || '').replace(/\D/g, '');
    const comunicacao = String(numeroComunicacao || '').trim();
    if (!processo || !comunicacao) {
      throw new DomicilioError('Informe processo e comunicação para consultar o ticket oficial.', {
        statusCode: 400,
        code: 'DOMICILIO_TICKET_INVALID'
      });
    }
    return request(`/api/v1/processo/${encodeURIComponent(processo)}/comunicacao/${encodeURIComponent(comunicacao)}/ticket`, {
      session,
      operation: 'ticket'
    });
  };

  return {
    baseUrl,
    listarComunicacoes,
    ticket,
    /**
     * GET autenticado para endpoints leves do próprio portal (identificação do
     * representante/tenant). Nunca usar para escrita: o cliente é read-only.
     */
    getJson: (session, pathname) => {
      const path = String(pathname || '');
      if (!path.startsWith('/api/v1/')) {
        throw new DomicilioError('Endpoint do Domicílio Eletrônico inválido.', { statusCode: 400, code: 'DOMICILIO_PATH_INVALID' });
      }
      return request(path, { session, operation: 'getJson' });
    }
  };
}

/**
 * Minimização para log: nunca devolve nome de parte, advogado, assunto ou texto.
 */
export function summarizeDomicilioPayload(payload) {
  const items = extractDomicilioItems(payload);
  return {
    items: items.length,
    ids: items.slice(0, 5).map(item => String(item?.numeroComunicacao ?? item?.id ?? '')).filter(Boolean)
  };
}
