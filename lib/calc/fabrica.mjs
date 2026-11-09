/**
 * ATRIUM — Cliente da Fábrica de Cálculos (TRF3 / PDPJ-Br)
 *
 * Integração read-only com as APIs públicas oficiais de cálculo, índices e
 * leitura documental. Autenticação por `x-api-key` (classe do consumidor
 * atribuída na emissão da chave); cotas por minuto valem só para POST, com
 * `429` + `Retry-After`. Este módulo nunca dá ciência, nunca peticiona e nunca
 * baixa documento protegido por CAPTCHA.
 *
 * Regras de segurança: a chave vive apenas em ambiente do servidor; payloads
 * com PII (CNIS/Carta/RDCTC/PrevJud) nunca são logados nem persistidos aqui.
 */

export const FABRICA_BASE_URL = 'https://fabrica-de-calculos.app.trf3.jus.br';

// O WAF da Fábrica atende navegadores: requisição sem User-Agent de navegador fica
// pendurada até o timeout (verificado em produção na VPS). Estes headers são de
// identificação do cliente HTTP, não de autenticação — a chave continua no x-api-key.
export const FABRICA_BROWSER_HEADERS = Object.freeze({
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
});

export const FABRICA_LIMITS = Object.freeze({
  publicPostsPerMinute: 30,
  institutionalPostsPerMinute: 120,
  defaultUploadBytes: 20 * 1024 * 1024,
  judiciaryUploadBytes: 150 * 1024 * 1024,
  cnisMaxPages: 5_000,
  mcpBodyBytes: 8 * 1024 * 1024
});

export class FabricaError extends Error {
  constructor(message, { statusCode = 502, code = 'FABRICA_ERROR', retryAfterSeconds = null, messages = [] } = {}) {
    super(message);
    this.name = 'FabricaError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.messages = Array.isArray(messages) ? messages : [];
  }
}

function joinUrl(baseUrl, pathname) {
  const base = String(baseUrl || FABRICA_BASE_URL).replace(/\/+$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function buildQuery(params = null) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item !== null && item !== undefined && item !== '') search.append(key, String(item));
      continue;
    }
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function readFabricaEnvelope(payload) {
  const status = String(payload?.status || '').toLowerCase();
  const messages = Array.isArray(payload?.messages) ? payload.messages.map(message => String(message || '').slice(0, 500)) : [];
  return {
    status: status || 'unknown',
    ok: status === 'ok',
    inProgress: status === 'in-progress',
    code: payload?.code ?? null,
    errorCode: payload?.errorCode ?? null,
    messages,
    result: payload?.result ?? null,
    permalink: typeof payload?.permalink === 'string' ? payload.permalink : null
  };
}

export function describeFabricaError(payload, status) {
  const envelope = readFabricaEnvelope(payload);
  const detail = envelope.messages.filter(Boolean).join(' ');
  if (status === 401 || status === 403) return { code: 'FABRICA_UNAUTHORIZED', message: detail || 'A Fábrica de Cálculos recusou a chave de API.' };
  if (status === 404) return { code: 'FABRICA_NOT_FOUND', message: detail || 'Recurso não encontrado na Fábrica de Cálculos.' };
  if (status === 413) return { code: 'FABRICA_PAYLOAD_TOO_LARGE', message: detail || 'Documento acima do limite aceito pela Fábrica de Cálculos.' };
  if (status === 422) return { code: 'FABRICA_UNPROCESSABLE', message: detail || 'A Fábrica de Cálculos não conseguiu processar o conteúdo enviado.' };
  if (status === 429) return { code: 'FABRICA_RATE_LIMITED', message: detail || 'Cota temporária da Fábrica de Cálculos atingida.' };
  if (status === 504) return { code: 'FABRICA_TIMEOUT', message: detail || 'A Fábrica de Cálculos excedeu o tempo de processamento.' };
  return { code: 'FABRICA_UPSTREAM', message: detail || `A Fábrica de Cálculos respondeu ${status}.` };
}

export function createFabricaClient({
  apiKey = process.env.FC_API_KEY || '',
  baseUrl = process.env.FC_API_BASE_URL || FABRICA_BASE_URL,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 90_000,
  maxRetries = 2,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
} = {}) {
  // Aceita função para a chave trocada pelo painel valer sem reiniciar o servidor.
  const currentKey = () => String((typeof apiKey === 'function' ? apiKey() : apiKey) || '').trim();

  const request = async (pathname, {
    method = 'GET',
    query = null,
    body = null,
    form = null,
    operation = 'request',
    accept = 'application/json',
    binary = false,
    allowInProgress = false,
    allowStatusless = false,
    extraHeaders = null,
    retries = maxRetries
  } = {}) => {
    const key = currentKey();
    if (!key) {
      throw new FabricaError('A Fábrica de Cálculos não está configurada neste servidor (FC_API_KEY ausente).', {
        statusCode: 409,
        code: 'FABRICA_NOT_CONFIGURED'
      });
    }
    const url = `${joinUrl(baseUrl, pathname)}${buildQuery(query)}`;
    let attempt = 0;
    // Retry consciente da cota: respeita Retry-After do 429 antes de desistir.
    for (;;) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 90_000));
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            ...FABRICA_BROWSER_HEADERS,
            'x-api-key': key,
            accept,
            ...(extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {}),
            ...(form ? {} : body !== null ? { 'content-type': 'application/json' } : {})
          },
          ...(form ? { body: form } : body !== null ? { body: JSON.stringify(body) } : {}),
          redirect: 'error',
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timer);
        if (attempt <= retries) {
          await sleep(500 * attempt);
          continue;
        }
        throw new FabricaError(`Falha de rede ao falar com a Fábrica de Cálculos (${operation}).`, { code: 'FABRICA_NETWORK' });
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 429 && attempt <= retries) {
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) : 5 * attempt;
        await sleep(waitSeconds * 1_000);
        continue;
      }

      const contentType = String(response.headers?.get?.('content-type') || '');
      let payload = null;
      let rawBody = null;
      if (!binary) {
        if (contentType.includes('json')) {
          // Lê o texto UMA vez: o JSON é derivado dele, e o texto serve como
          // prova de proveniência (hash do que o provedor realmente enviou).
          const text = await response.text().catch(() => '');
          rawBody = text;
          try {
            payload = JSON.parse(text);
          } catch {
            payload = null;
          }
        } else {
          const text = await response.text().catch(() => '');
          rawBody = text;
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
        }
      }

      if (!response.ok) {
        const described = describeFabricaError(payload, response.status);
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        throw new FabricaError(described.message, {
          statusCode: response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
          code: described.code,
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
          messages: readFabricaEnvelope(payload).messages
        });
      }

      if (binary) return response;
      const envelope = readFabricaEnvelope(payload);
      /* `raw` é o corpo textual EXATO recebido do provedor. Fica disponível
       * para quem precisa atestar proveniência (hash do que o provedor enviou),
       * sem alterar o formato de retorno consumido pelos demais chamadores. */
      const comBruto = rawBody === null ? envelope : { ...envelope, raw: rawBody };
      // Endpoints de metadados (`/info`, `/status/.../health`) respondem o próprio
      // conteúdo sem envelope `status`; nesses casos o 2xx é a confirmação.
      if (allowStatusless && envelope.status === 'unknown') {
        return { ...comBruto, result: envelope.result ?? payload };
      }
      if (!envelope.ok && !(allowInProgress && envelope.inProgress)) {
        throw new FabricaError(envelope.messages.filter(Boolean).join(' ') || 'A Fábrica de Cálculos não confirmou a operação.', {
          statusCode: 502,
          code: envelope.errorCode || 'FABRICA_NOT_OK',
          messages: envelope.messages
        });
      }
      return comBruto;
    }
  };

  const lerDocumento = async (tipo, { buffer, filename, text = null, opcoesFiltro = null } = {}) => {
    const supported = ['cnis', 'carta', 'rdctc', 'pap', 'prevjud'];
    if (!supported.includes(tipo)) {
      throw new FabricaError('Tipo de documento não suportado pela leitura oficial.', { statusCode: 400, code: 'FABRICA_DOCUMENT_TYPE' });
    }
    let form;
    if (buffer) {
      form = new FormData();
      form.append('file', new Blob([buffer], { type: 'application/pdf' }), String(filename || `${tipo}.pdf`).slice(0, 120));
    } else if (text) {
      form = new FormData();
      form.append('file', new Blob([String(text)], { type: 'text/plain' }), String(filename || `${tipo}.txt`).slice(0, 120));
    } else {
      throw new FabricaError('Envie o documento (PDF ou texto) para a leitura oficial.', { statusCode: 400, code: 'FABRICA_DOCUMENT_MISSING' });
    }
    if (opcoesFiltro) form.append('opcoesFiltro', JSON.stringify(opcoesFiltro).slice(0, 4_000));
    return request(`/rgps/api/v1/documentos/${tipo}/ler`, { method: 'POST', form, operation: `documentos.${tipo}.ler` });
  };

  return {
    get configured() { return Boolean(currentKey()); },
    baseUrl,
    get keyPresent() { return Boolean(currentKey()); },

    info: () => request('/info', { operation: 'info', allowStatusless: true }),
    // Diagnóstico: os paths de serviço do health ainda não são estáveis por decisão
    // da própria Fábrica ("caminhos desconhecidos respondem 404"), então 404 aqui é
    // resposta legítima e não deve ser tratado como falha da integração.
    health: servico => request(`/status/${encodeURIComponent(String(servico || 'calculadoras'))}/health`, { operation: 'health', allowStatusless: true }),
    fundamentos: () => request('/rgps/api/v1/fundamentos', { operation: 'fundamentos' }),
    marcosTemporais: () => request('/rgps/api/v1/marcos-temporais', { operation: 'marcos-temporais' }),
    calculadoras: () => request('/apps/api/v1/calculadoras', { operation: 'calculadoras' }),
    documentosLegais: slug => request(slug ? `/apps/api/v1/documentos-legais/${encodeURIComponent(slug)}` : '/apps/api/v1/documentos-legais', { operation: 'documentos-legais' }),

    indices: (tabela, query = null) => {
      const allowed = ['adiantamento', 'moedas', 'os121', 'reajuste', 'reajuste-pre-real', 'tabela', 'tabua-mortalidade'];
      if (!allowed.includes(tabela)) {
        throw new FabricaError('Tabela de índices desconhecida na Fábrica de Cálculos.', { statusCode: 400, code: 'FABRICA_INDEX_TABLE' });
      }
      const path = tabela === 'tabela' ? '/indices/api/v1/tabela' : `/indices/api/v1/${tabela}`;
      return request(path, { query, operation: `indices.${tabela}` });
    },
    tabelaCompetencia: competencia => request(`/indices/api/v1/tabela/${encodeURIComponent(String(competencia || ''))}`, { operation: 'indices.tabela.competencia' }),

    lerDocumento,
    lerCnis: options => lerDocumento('cnis', options),
    lerCarta: options => lerDocumento('carta', options),
    lerRdctc: options => lerDocumento('rdctc', options),
    lerPap: options => lerDocumento('pap', options),
    lerPrevjud: options => lerDocumento('prevjud', options),

    calcularTempo: (body, query = null) => request('/rgps/api/v1/calculos-tempo', { method: 'POST', body, query, operation: 'tempo.calcular' }),
    calcularTempoPorGrupos: (body, query = null) => request('/rgps/api/v1/calculos-tempo/por-grupos', { method: 'POST', body, query, operation: 'tempo.por-grupos' }),
    calcularTempoPrevjud: (body, query = null) => request('/rgps/api/v1/calculos-tempo/prevjud/calcular', { method: 'POST', body, query, operation: 'tempo.prevjud' }),
    calcularAtrasados: (body, query = null) => request('/rgps/api/v1/calculos-atrasados', { method: 'POST', body, query, operation: 'atrasados.calcular' }),
    calcularRmi: (body, query = null) => request('/rgps/api/v1/calculos-rmi', { method: 'POST', body, query, operation: 'rmi.calcular' }),
    calcularRmiPorFundamento: (body, query = null) => request('/rgps/api/v1/calculos-rmi/por-fundamento', { method: 'POST', body, query, operation: 'rmi.por-fundamento' }),
    calcularRmiDesvinculada: (body, query = null) => request('/rgps/api/v1/calculos-rmi/desvinculada', { method: 'POST', body, query, operation: 'rmi.desvinculada' }),
    criarJobRmi: (body, { idempotencyKey = null, numeroMaximoIteracoes = null } = {}) => request('/rgps/api/v1/calculos-rmi/async', {
      method: 'POST',
      body,
      query: numeroMaximoIteracoes ? { numeroMaximoIteracoes } : null,
      operation: 'rmi.async',
      allowInProgress: true,
      extraHeaders: idempotencyKey ? { 'idempotency-key': String(idempotencyKey).slice(0, 128) } : null
    }),
    jobRmi: jobId => request(`/rgps/api/v1/calculos-rmi/jobs/${encodeURIComponent(String(jobId || ''))}`, { operation: 'rmi.job', allowInProgress: true }),
    resultadoJobRmi: jobId => request(`/rgps/api/v1/calculos-rmi/jobs/${encodeURIComponent(String(jobId || ''))}/resultado`, { operation: 'rmi.job.resultado' })
  };
}

/**
 * Minimização para o que é exibido/registrado: nunca devolve CPF/NIT/nome de
 * mãe em logs ou resumos; o resultado completo fica restrito ao fluxo da UI.
 */
export function summarizeFabricaResult(envelope) {
  const result = envelope?.result;
  const summary = {
    status: envelope?.status || 'unknown',
    code: envelope?.code ?? null,
    permalink: envelope?.permalink || null,
    messages: Array.isArray(envelope?.messages) ? envelope.messages.slice(0, 5) : []
  };
  if (Array.isArray(result)) summary.items = result.length;
  else if (result && typeof result === 'object') summary.fields = Object.keys(result).slice(0, 20);
  return summary;
}
