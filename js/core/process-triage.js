/**
 * ATRIUM — Leitura das sugestões de triagem assistiva de processos (derivado
 * `process-suggestions.json`, gerado no servidor).
 *
 * Somente leitura: o cliente nunca classifica nem escreve. A sugestão de tipo de
 * andamento é aviso de conferência e as lacunas de cadastro (tribunal, comarca, classe,
 * assunto) são apenas sinalizadas — nenhuma alteração de processo acontece aqui.
 */

let windowRef = globalThis.window;
let status = { enabled: false, available: false, reason: '', loaded: false };
let suggestions = new Map();
let inflight = null;

export function setProcessTriageWindow(value) {
  windowRef = value;
}

export function getProcessTriageStatus() {
  return { ...status, count: suggestions.size };
}

export function resetProcessTriageForTests() {
  status = { enabled: false, available: false, reason: '', loaded: false };
  suggestions = new Map();
  inflight = null;
}

export function processTriageBadge(processId) {
  if (!status.enabled) return null;
  const entry = suggestions.get(String(processId || ''));
  if (!entry || typeof entry !== 'object') return null;
  const missingFields = Array.isArray(entry.missingFields) ? entry.missingFields.map(String).filter(Boolean) : [];
  const movementType = String(entry.movementType || '');
  const needsAttention = String(entry.needsAttention || '');
  if (!movementType && !missingFields.length && !needsAttention) return null;
  return {
    movementType,
    movementConfidence: Number(entry.movementConfidence) || 0,
    needsAttention,
    missingFields,
    action: entry.action || 'review'
  };
}

export async function loadProcessTriageSuggestions() {
  if (!status.enabled || !windowRef?.fetch) {
    suggestions = new Map();
    return suggestions;
  }
  try {
    const response = await windowRef.fetch('/api/ai-classifier/process-suggestions', { headers: { Accept: 'application/json' } });
    if (!response.ok) return suggestions;
    const data = await response.json().catch(() => ({}));
    const next = new Map();
    for (const [id, entry] of Object.entries(data?.suggestions || {})) {
      if (entry && typeof entry === 'object') next.set(String(id), entry);
    }
    suggestions = next;
  } catch {
    suggestions = new Map();
  }
  return suggestions;
}

export async function refreshProcessTriage() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await windowRef.fetch('/api/ai-classifier/status', { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      status = {
        enabled: response.ok && data?.enabled === true,
        available: data?.available === true,
        reason: String(data?.reason || ''),
        loaded: true
      };
    } catch {
      if (!status.loaded) status = { enabled: false, available: false, reason: 'Não foi possível consultar.', loaded: true };
    }
    if (status.enabled) await loadProcessTriageSuggestions();
    else suggestions = new Map();
    return getProcessTriageStatus();
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
