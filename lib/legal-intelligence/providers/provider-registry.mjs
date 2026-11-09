/**
 * Registro de provedores de pesquisa jurídica (MCP) do ATRIUM.
 *
 * O transporte permanece HTTP e opt-in por ambiente: um provider legado único
 * (`ATRIUM_LEGAL_MCP_*`) e/ou uma lista declarada em
 * `ATRIUM_LEGAL_MCP_PROVIDERS` (JSON). Cada provedor declara identidade,
 * tribunais cobertos e ferramentas permitidas; nenhuma credencial sai daqui.
 * Resultado externo é discovery, nunca autoridade.
 */

import { createLegalMcpProvider, LEGAL_MCP_TOOLS } from './legal-mcp-provider.mjs';

export const LEGAL_MCP_PROVIDER_LIMIT = 6;
export const LEGAL_MCP_DEFAULT_TOOLS = Object.freeze(['jurisprudencia_buscar', 'jurisprudencia_sumulas']);
export const LEGAL_MCP_OPTIONAL_TOOLS = Object.freeze(['natjus_buscar']);
export const LEGAL_MCP_ALLOWED_TOOLS = Object.freeze([...LEGAL_MCP_DEFAULT_TOOLS, ...LEGAL_MCP_OPTIONAL_TOOLS]);

const PRIVATE_HOST_RE = /^(?:localhost|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$)/i;

function cleanText(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slug(value, fallback) {
  const normalized = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return normalized || fallback;
}

export function isSafeLegalMcpBaseUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || PRIVATE_HOST_RE.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeCourtList(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map(item => cleanText(item, 12).toUpperCase().replace(/\s+/g, '')).filter(Boolean))].slice(0, 40);
}

function normalizeToolList(value, { allowOptional = false } = {}) {
  const requested = Array.isArray(value) ? value : [];
  const allowed = allowOptional ? LEGAL_MCP_ALLOWED_TOOLS : LEGAL_MCP_DEFAULT_TOOLS;
  const tools = requested.map(item => cleanText(item, 60)).filter(name => allowed.includes(name));
  return [...new Set(tools.length ? tools : LEGAL_MCP_DEFAULT_TOOLS)];
}

export function normalizeLegalMcpProviderConfig(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const baseUrl = cleanText(raw.baseUrl, 300).replace(/\/+$/, '');
  if (!isSafeLegalMcpBaseUrl(baseUrl)) return null;
  return {
    id: slug(raw.id, `provider-${index + 1}`),
    label: cleanText(raw.label, 60) || `Provider ${index + 1}`,
    baseUrl,
    apiKey: raw.apiKey ? String(raw.apiKey) : '',
    enabled: raw.enabled !== false,
    courts: normalizeCourtList(raw.courts),
    tools: normalizeToolList(raw.tools, { allowOptional: true })
  };
}

export function resolveLegalMcpProviderConfigs(env = {}) {
  const configs = [];
  const issues = [];
  const legacyEnabled = String(env.ATRIUM_LEGAL_MCP_ENABLED || '').trim().toLowerCase() === 'true';
  const legacyBaseUrl = cleanText(env.ATRIUM_LEGAL_MCP_BASE_URL, 300).replace(/\/+$/, '');
  if (legacyEnabled && legacyBaseUrl) {
    const legacy = normalizeLegalMcpProviderConfig({
      id: 'legal-mcp',
      label: 'Legal MCP',
      baseUrl: legacyBaseUrl,
      apiKey: env.ATRIUM_LEGAL_MCP_API_KEY || '',
      enabled: true,
      tools: LEGAL_MCP_DEFAULT_TOOLS
    }, 0);
    if (legacy) configs.push(legacy);
    else issues.push({ code: 'INVALID_BASE_URL', provider: 'legal-mcp' });
  }

  const rawList = env.ATRIUM_LEGAL_MCP_PROVIDERS;
  if (rawList) {
    let parsed = null;
    try {
      parsed = typeof rawList === 'string' ? JSON.parse(rawList) : rawList;
    } catch {
      issues.push({ code: 'INVALID_PROVIDERS_JSON' });
    }
    if (parsed !== null && !Array.isArray(parsed)) {
      issues.push({ code: 'INVALID_PROVIDERS_SHAPE' });
      parsed = null;
    }
    for (const [index, raw] of (Array.isArray(parsed) ? parsed : []).entries()) {
      if (configs.length >= LEGAL_MCP_PROVIDER_LIMIT) {
        issues.push({ code: 'PROVIDER_LIMIT', limit: LEGAL_MCP_PROVIDER_LIMIT });
        break;
      }
      const normalized = normalizeLegalMcpProviderConfig(raw, index + 1);
      if (!normalized) {
        issues.push({ code: 'INVALID_PROVIDER', index });
        continue;
      }
      if (configs.some(item => item.id === normalized.id || item.baseUrl === normalized.baseUrl)) {
        issues.push({ code: 'DUPLICATE_PROVIDER', provider: normalized.id });
        continue;
      }
      configs.push(normalized);
    }
  }

  return { providers: configs, issues };
}

export function createLegalMcpProviders({ env = {}, fetchImpl } = {}) {
  const { providers: configs, issues } = resolveLegalMcpProviderConfigs(env);
  const timeoutMs = Number(env.ATRIUM_LEGAL_MCP_TIMEOUT_MS) > 0 ? Number(env.ATRIUM_LEGAL_MCP_TIMEOUT_MS) : 20_000;
  const maxResults = Number(env.ATRIUM_LEGAL_MCP_MAX_RESULTS) > 0 ? Math.min(Number(env.ATRIUM_LEGAL_MCP_MAX_RESULTS), 25) : 10;
  const sources = configs.map(config => ({
    id: config.id,
    label: config.label,
    courts: config.courts,
    tools: config.tools.filter(name => Boolean(LEGAL_MCP_TOOLS[name])),
    provider: createLegalMcpProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      enabled: config.enabled,
      fetchImpl,
      timeoutMs,
      maxResults
    })
  }));
  return { sources, issues, maxResults };
}

export function summarizeLegalMcpProviders(sources = []) {
  return sources.map(source => ({
    id: source.id,
    label: source.label,
    configured: Boolean(source.provider?.isConfigured?.()),
    courts: source.courts,
    tools: source.tools
  }));
}
