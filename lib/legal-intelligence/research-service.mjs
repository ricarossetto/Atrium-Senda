/**
 * Serviço de pesquisa jurídica multi-fonte.
 *
 * Executa o fan-out por provedor/consulta/ferramenta respeitando o orçamento
 * declarado, normaliza e deduplica os itens, ranqueia por aderência ao claim e
 * reporta cobertura e falha por fonte. Nenhum resultado é inventado: provedor
 * sem itens responde `empty`, falha responde `error` e ausência de provedor
 * configurado responde `unavailable`. Tudo permanece discovery.
 */

import { LEGAL_MCP_ALLOWED_TOOLS, LEGAL_MCP_DEFAULT_TOOLS } from './providers/provider-registry.mjs';
import {
  buildResearchCoverage,
  dedupeResearchItems,
  extractResearchItems,
  normalizeResearchItem,
  rankResearchItems
} from './research-normalizer.mjs';

export const RESEARCH_ITEM_LIMIT = 40;
export const RESEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
export const RESEARCH_CACHE_LIMIT = 200;

export function createResearchCache({ ttlMs = RESEARCH_CACHE_TTL_MS, limit = RESEARCH_CACHE_LIMIT, now = () => Date.now() } = {}) {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (now() - entry.at > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      if (!key) return;
      if (store.size >= limit && !store.has(key)) store.delete(store.keys().next().value);
      store.set(key, { at: now(), value });
    },
    get size() {
      return store.size;
    },
    clear() {
      store.clear();
    }
  };
}

export function researchCacheKey({ claim = '', tools = [], providerIds = [] } = {}) {
  const normalizedClaim = String(claim || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 320);
  if (!normalizedClaim) return '';
  return `${normalizedClaim}|${[...tools].sort().join(',')}|${[...providerIds].sort().join(',')}`;
}

export async function runMultiSourceResearch({
  claim = '',
  queries = [],
  sources = [],
  tools = LEGAL_MCP_DEFAULT_TOOLS,
  maxResults = 10,
  itemLimit = RESEARCH_ITEM_LIMIT
} = {}) {
  const requestedTools = (Array.isArray(tools) ? tools : []).filter(tool => LEGAL_MCP_ALLOWED_TOOLS.includes(tool));
  const effectiveTools = requestedTools.length ? requestedTools : [...LEGAL_MCP_DEFAULT_TOOLS];
  const coverage = [];
  const collected = [];
  let anyOk = false;
  let anyConfigured = false;

  for (const source of Array.isArray(sources) ? sources : []) {
    const provider = source?.provider;
    if (!provider || typeof provider.callTool !== 'function') continue;
    const configured = Boolean(provider.isConfigured?.());
    if (configured) anyConfigured = true;
    const declaredTools = Array.isArray(source.tools) && source.tools.length ? source.tools : [...LEGAL_MCP_DEFAULT_TOOLS];
    const sourceTools = effectiveTools.filter(tool => declaredTools.includes(tool));
    const skippedTools = effectiveTools.filter(tool => !declaredTools.includes(tool));
    let calls = 0;
    let sourceItems = 0;
    let sourceOk = false;
    let sourceError = null;
    if (!configured) {
      coverage.push({ id: source.id, label: source.label, status: 'unconfigured', calls: 0, items: 0, error: null, skippedTools: skippedTools.length });
      continue;
    }
    for (const tool of sourceTools) {
      for (const query of queries) {
        const response = await provider.callTool(tool, { termo: query, max: maxResults });
        calls += 1;
        if (response?.ok) {
          sourceOk = true;
          for (const raw of extractResearchItems(response.result)) {
            const item = normalizeResearchItem(raw, { sourceId: source.id, tool, courtHint: (source.courts || []).join(' ') });
            if (!item) continue;
            collected.push(item);
            sourceItems += 1;
          }
        } else if (!sourceError) {
          sourceError = response?.error?.code || 'PROVIDER_ERROR';
        }
      }
    }
    if (sourceOk) anyOk = true;
    coverage.push({
      id: source.id,
      label: source.label,
      status: sourceOk ? 'ok' : sourceError ? 'error' : 'empty',
      calls,
      items: sourceItems,
      error: sourceError,
      partial: Boolean(sourceOk && sourceError),
      skippedTools: skippedTools.length
    });
  }

  const { items: unique, duplicates } = dedupeResearchItems(collected);
  const ranked = rankResearchItems(unique, {
    claim,
    preferredCourts: (Array.isArray(sources) ? sources : []).flatMap(source => source?.courts || [])
  }).slice(0, itemLimit);
  const partial = anyOk && coverage.some(entry => entry.status === 'error' || entry.partial);
  const status = anyOk ? 'discovery' : anyConfigured ? 'error' : 'unavailable';
  return {
    status,
    partial,
    queries,
    sources: buildResearchCoverage(coverage),
    items: ranked,
    totals: {
      items: ranked.length,
      unique: unique.length,
      duplicates,
      providers: coverage.length,
      calls: coverage.reduce((total, entry) => total + entry.calls, 0)
    },
    verification: 'PENDENTE — resultados externos são discovery, não autoridade. Confirmar em fonte oficial antes de citar.'
  };
}
