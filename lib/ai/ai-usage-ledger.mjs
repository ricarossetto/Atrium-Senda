/**
 * Ledger de uso de IA e OCR do plano de administração.
 *
 * Cada chamada de modelo ou extração OCR registra uma entrada operacional
 * mínima (sem conteúdo, prompt, resposta ou dado pessoal): operação, provedor,
 * modelo, duração, sucesso e tokens **somente quando o provedor os informa**.
 * Custo não é estimado sem tabela de preços do operador; confiança de OCR não é
 * fabricada quando a engine local não a reporta. O histórico é limitado e
 * mantido em `data/system/ai-usage.json`, fora dos workspaces.
 */

export const AI_USAGE_VERSION = 1;
export const AI_USAGE_LIMIT = 2000;

const OPERATIONS = new Set([
  'assistente',
  'inteligencia-juridica',
  'conciliacao-clientes',
  'contexto-escritorio',
  'teste-conexao',
  'anexo-assistente',
  'documento',
  'desconhecida'
]);
const ERROR_CATEGORIES = new Set([
  'rate-limit',
  'auth',
  'timeout',
  'network',
  'provider',
  'fallback',
  'engine',
  'unknown'
]);

function cleanText(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function classifyAiUsageError(message) {
  const text = cleanText(message, 300).toLowerCase();
  if (!text) return 'unknown';
  if (/\b429\b|rate limit|limite de requisi|too many requests/.test(text)) return 'rate-limit';
  if (/\b401\b|\b403\b|api key|chave|unauthor|forbidden|permiss/.test(text)) return 'auth';
  if (/timeout|tempo esgotado|abort|timed out/.test(text)) return 'timeout';
  if (/fetch failed|network|econn|enotfound|socket|conex/.test(text)) return 'network';
  if (/ocr|tesseract|poppler/.test(text)) return 'engine';
  return 'provider';
}

export function emptyAiUsageHistory() {
  return { version: AI_USAGE_VERSION, updatedAt: null, entries: [] };
}

export function normalizeAiUsageEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'ocr' ? 'ocr' : raw.kind === 'ai' ? 'ai' : null;
  if (!kind) return null;
  const at = cleanText(raw.at, 40);
  if (!at) return null;
  const operation = OPERATIONS.has(raw.operation) ? raw.operation : 'desconhecida';
  const errorCategory = ERROR_CATEGORIES.has(raw.errorCategory) ? raw.errorCategory : (raw.ok === false ? 'unknown' : null);
  const promptTokens = normalizeCount(raw.promptTokens);
  const completionTokens = normalizeCount(raw.completionTokens);
  const totalTokens = normalizeCount(raw.totalTokens) || (promptTokens + completionTokens);
  return {
    at,
    kind,
    operation,
    workspaceId: cleanText(raw.workspaceId, 80) || null,
    provider: cleanText(raw.provider, 40) || null,
    model: cleanText(raw.model, 80) || null,
    ok: raw.ok !== false,
    durationMs: Math.min(3_600_000, normalizeCount(raw.durationMs)),
    tokensReported: raw.tokensReported === true || totalTokens > 0,
    promptTokens,
    completionTokens,
    totalTokens,
    pages: normalizeCount(raw.pages),
    engine: cleanText(raw.engine, 60) || null,
    errorCategory
  };
}

export function normalizeAiUsageHistory(raw) {
  if (!raw || typeof raw !== 'object') return emptyAiUsageHistory();
  const entries = [];
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    const entry = normalizeAiUsageEntry(item);
    if (entry) entries.push(entry);
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));
  return {
    version: AI_USAGE_VERSION,
    updatedAt: cleanText(raw.updatedAt, 40) || null,
    entries: entries.slice(-AI_USAGE_LIMIT)
  };
}

export function recordAiUsageEntry(history, entry, { now = new Date().toISOString() } = {}) {
  const base = normalizeAiUsageHistory(history);
  const normalized = normalizeAiUsageEntry({ ...entry, at: entry?.at || now });
  if (!normalized) return base;
  const entries = [...base.entries, normalized].slice(-AI_USAGE_LIMIT);
  const updatedAt = !base.updatedAt || normalized.at > base.updatedAt ? normalized.at : base.updatedAt;
  return { version: AI_USAGE_VERSION, updatedAt, entries };
}

function topList(map, keyName, limit = 8) {
  return [...map.entries()]
    .map(([key, value]) => ({ [keyName]: key, ...value }))
    .sort((a, b) => b.calls - a.calls || String(a[keyName]).localeCompare(String(b[keyName])))
    .slice(0, limit);
}

export function summarizeAiUsage(history, { now = new Date().toISOString(), days = 30 } = {}) {
  const base = normalizeAiUsageHistory(history);
  const windowDays = Math.max(1, Math.min(365, Number(days) || 30));
  const since = new Date(Date.parse(now) - windowDays * 86_400_000).toISOString();
  const summary = {
    windowDays,
    since,
    updatedAt: base.updatedAt,
    ai: { calls: 0, failures: 0, fallbacks: 0, tokensReported: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: [], byOperation: [] },
    ocr: { calls: 0, failures: 0, pages: 0, byEngine: [], byOperation: [] }
  };
  const providers = new Map();
  const aiOperations = new Map();
  const engines = new Map();
  const ocrOperations = new Map();
  const bump = (map, key, patch) => {
    const current = map.get(key) || { calls: 0, failures: 0, totalTokens: 0, pages: 0 };
    map.set(key, {
      calls: current.calls + 1,
      failures: current.failures + (patch.failed ? 1 : 0),
      totalTokens: current.totalTokens + (patch.tokens || 0),
      pages: current.pages + (patch.pages || 0)
    });
  };
  for (const entry of base.entries) {
    if (entry.at < since) continue;
    if (entry.kind === 'ai') {
      summary.ai.calls += 1;
      if (!entry.ok && entry.errorCategory !== 'fallback') summary.ai.failures += 1;
      if (entry.errorCategory === 'fallback') summary.ai.fallbacks += 1;
      if (entry.tokensReported) {
        summary.ai.tokensReported += 1;
        summary.ai.promptTokens += entry.promptTokens;
        summary.ai.completionTokens += entry.completionTokens;
        summary.ai.totalTokens += entry.totalTokens;
      }
      bump(providers, entry.provider || 'não informado', { failed: !entry.ok && entry.errorCategory !== 'fallback', tokens: entry.tokensReported ? entry.totalTokens : 0 });
      bump(aiOperations, entry.operation, { failed: !entry.ok && entry.errorCategory !== 'fallback', tokens: entry.tokensReported ? entry.totalTokens : 0 });
    } else {
      summary.ocr.calls += 1;
      if (!entry.ok) summary.ocr.failures += 1;
      summary.ocr.pages += entry.pages;
      bump(engines, entry.engine || 'não informada', { failed: !entry.ok, pages: entry.pages });
      bump(ocrOperations, entry.operation, { failed: !entry.ok, pages: entry.pages });
    }
  }
  summary.ai.byProvider = topList(providers, 'provider');
  summary.ai.byOperation = topList(aiOperations, 'operation');
  summary.ocr.byEngine = topList(engines, 'engine');
  summary.ocr.byOperation = topList(ocrOperations, 'operation');
  return summary;
}
