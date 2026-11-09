export const LEGAL_MCP_TOOLS = Object.freeze({
  jurisprudencia_buscar: { path: 'jurisprudencia/buscar', required: ['termo'], optional: ['tipo', 'max'] },
  jurisprudencia_sumulas: { path: 'jurisprudencia/sumulas', required: ['termo'], optional: ['max'] },
  natjus_buscar: { path: 'natjus/buscar', required: ['termo'], optional: ['max'] },
  djen_search_comunicacoes: {
    path: 'djen/search/comunicacoes',
    required: [],
    optional: ['numero_oab', 'uf_oab', 'nome_advogado', 'nome_parte', 'numero_processo', 'sigla_tribunal', 'data_inicio', 'data_fim', 'meio', 'texto', 'pagina', 'itens_por_pagina']
  },
  djen_processos_por_parte: { path: 'djen/processos/por/parte', required: ['nome_parte'], optional: ['sigla_tribunal', 'data_inicio', 'data_fim', 'itens_por_pagina', 'pagina'] },
  djen_get_certidao: { path: 'djen/get/certidao', required: ['hash'], optional: [] },
  processos_buscar_por_nome: { path: 'processos/buscar/por/nome', required: ['nome'], optional: ['platforms', 'tribunais', 'max_results'] },
  processos_buscar_por_documento: { path: 'processos/buscar/por/documento', required: ['documento'], optional: ['platforms', 'tribunais', 'max_results'] },
  processos_get_resultado: { path: 'processos/get/resultado', required: ['job_id'], optional: ['job_ids'] },
  cnpj_consultar: { path: 'cnpj/consultar', required: ['cnpj'], optional: [] },
  cnpj_processos: { path: 'cnpj/processos', required: ['cnpj'], optional: ['incluir_socios'] },
  legal_dossie: {
    path: 'dossie',
    required: [],
    optional: ['nome', 'cnpj', 'cpf', 'nome_titular', 'numero_processo', 'incluir_andamento', 'incluir_socios', 'incluir_sancoes', 'incluir_mencoes_municipais', 'max_processos', 'sigla_tribunal']
  }
});

export const DEFAULT_LEGAL_MCP_BASE_URL = 'https://api.mcp.ai/api/legal';

export function resolveLegalMcpConfig(env = {}) {
  const enabled = String(env.ATRIUM_LEGAL_MCP_ENABLED || '').trim().toLowerCase() === 'true';
  const baseUrl = String(env.ATRIUM_LEGAL_MCP_BASE_URL || DEFAULT_LEGAL_MCP_BASE_URL).trim().replace(/\/+$/, '');
  const apiKey = env.ATRIUM_LEGAL_MCP_API_KEY ? String(env.ATRIUM_LEGAL_MCP_API_KEY) : '';
  const timeoutMs = Number(env.ATRIUM_LEGAL_MCP_TIMEOUT_MS) > 0 ? Number(env.ATRIUM_LEGAL_MCP_TIMEOUT_MS) : 20_000;
  const maxResults = Number(env.ATRIUM_LEGAL_MCP_MAX_RESULTS) > 0 ? Math.min(Number(env.ATRIUM_LEGAL_MCP_MAX_RESULTS), 25) : 10;
  return { enabled, baseUrl, apiKey, timeoutMs, maxResults };
}

export function createLegalMcpProvider({
  baseUrl = '',
  apiKey = '',
  enabled = false,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  maxResults = 10,
  userAgent = 'ATRIUM-LegalIntelligence/1.0'
} = {}) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const configured = Boolean(enabled && base && typeof fetchImpl === 'function');

  function status() {
    return {
      enabled: Boolean(enabled),
      configured,
      baseUrl: configured ? base : '',
      hasApiKey: Boolean(apiKey),
      timeoutMs,
      maxResults,
      tools: Object.keys(LEGAL_MCP_TOOLS)
    };
  }

  function buildHeaders() {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  async function callTool(name, params = {}, { timeoutMs: override } = {}) {
    const tool = LEGAL_MCP_TOOLS[name];
    if (!tool) return { ok: false, error: { code: 'TOOL_NOT_ALLOWED', message: `Ferramenta não autorizada: ${String(name)}.` } };
    if (!configured) return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Provider Legal MCP não habilitado neste ambiente.' } };
    const missing = tool.required.filter(key => params[key] === undefined || params[key] === null || params[key] === '');
    if (missing.length) return { ok: false, error: { code: 'INVALID_PARAMS', message: `Parâmetros obrigatórios ausentes: ${missing.join(', ')}.` } };
    const body = {};
    for (const key of [...tool.required, ...tool.optional]) {
      if (params[key] !== undefined) body[key] = params[key];
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), override || timeoutMs);
    try {
      const response = await fetchImpl(`${base}/${tool.path}`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: {
            code: response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_HTTP',
            message: `Falha do provider de pesquisa (HTTP ${response.status}).`
          }
        };
      }
      return { ok: true, tool: name, result: payload && typeof payload === 'object' && 'result' in payload ? payload.result : payload };
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return {
        ok: false,
        error: {
          code: aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK',
          message: aborted ? 'Tempo esgotado na consulta ao provider de pesquisa.' : 'Falha de rede na consulta ao provider de pesquisa.'
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function researchClaim({ claim, max = maxResults } = {}) {
    const termo = String(claim || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!termo) return { ok: false, error: { code: 'EMPTY_CLAIM', message: 'Claim vazio para pesquisa.' } };
    const [jurisprudence, sumulas] = await Promise.all([
      callTool('jurisprudencia_buscar', { termo, max }),
      callTool('jurisprudencia_sumulas', { termo, max: Math.min(max, 5) })
    ]);
    return { ok: Boolean(jurisprudence.ok || sumulas.ok), jurisprudence, sumulas };
  }

  return { status, callTool, researchClaim, isConfigured: () => configured, tools: LEGAL_MCP_TOOLS };
}
