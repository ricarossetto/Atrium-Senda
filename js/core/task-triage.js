/**
 * ATRIUM — Leitura das sugestões de triagem assistiva de tarefas (derivado
 * `task-triage.json`, gerado no servidor).
 *
 * Somente leitura: o cliente nunca classifica nem escreve — a sugestão é exibida como
 * aviso de conferência e nada na tarefa é alterado. O classificador roda no servidor,
 * ligado por `settings.aiClassifier` (administrador), com o transporte local da JEV.
 */

let windowRef = globalThis.window;
let status = { enabled: false, available: false, reason: '', loaded: false };
let suggestions = new Map();
let inflight = null;

export function setTaskTriageWindow(value) {
  windowRef = value;
}

export function getTaskTriageStatus() {
  return { ...status, count: suggestions.size };
}

export function resetTaskTriageForTests() {
  status = { enabled: false, available: false, reason: '', loaded: false };
  suggestions = new Map();
  inflight = null;
}

export function taskTriageBadge(taskId) {
  if (!status.enabled) return null;
  const entry = suggestions.get(String(taskId || ''));
  if (!entry || (!entry.category && !entry.urgency)) return null;
  return {
    category: entry.category || '',
    categoryConfidence: Number(entry.categoryConfidence) || 0,
    urgency: entry.urgency || '',
    urgencyConfidence: Number(entry.urgencyConfidence) || 0,
    confidence: Math.max(Number(entry.categoryConfidence) || 0, Number(entry.urgencyConfidence) || 0),
    action: entry.action || 'review'
  };
}

export async function loadTaskTriageSuggestions() {
  if (!status.enabled || !windowRef?.fetch) {
    suggestions = new Map();
    return suggestions;
  }
  try {
    const response = await windowRef.fetch('/api/ai-classifier/task-suggestions', { headers: { Accept: 'application/json' } });
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

export async function refreshTaskTriage() {
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
    if (status.enabled) await loadTaskTriageSuggestions();
    else suggestions = new Map();
    return getTaskTriageStatus();
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
