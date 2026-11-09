/**
 * ATRIUM — Sugestões de triagem assistiva por tarefa. Arquivo DERIVADO por workspace
 * (`task-triage.json`), nunca oficial e nunca fonte de verdade.
 *
 * Puro: não lê disco, rede nem estado oficial. O chamador injeta o texto já redigido
 * e a função de hash; a persistência fica no servidor.
 *
 * Elegibilidade: tarefa aberta (fora de `concluida`/`cancelada`) com id e algum texto.
 * O cliente nunca é enviado ao classificador — o texto é título, descrição e processo.
 *
 * Semântica: cada entrada guarda categoria/urgência sugeridas com confiança, a ação
 * (`suggest`/`review`/`abstain`) e o `payloadHash` do texto redigido. Entrada sem hash
 * atual é reclassificada; a sugestão nunca cria, move ou conclui tarefa.
 */

export const TASK_TRIAGE_VERSION = 1;
export const TASK_TRIAGE_LIMIT = 500;
export const TASK_TRIAGE_BATCH_LIMIT = 50;

const TERMINAL_STATUSES = Object.freeze(['concluida', 'cancelada']);

function cleanEntry(entry = {}) {
  return {
    category: String(entry.category || ''),
    categoryConfidence: Number(entry.categoryConfidence) || 0,
    urgency: String(entry.urgency || ''),
    urgencyConfidence: Number(entry.urgencyConfidence) || 0,
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

export function normalizeTaskTriageStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(id)] = cleanEntry(entry);
  }
  return { version: TASK_TRIAGE_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertTaskTriageEntry(store, id, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizeTaskTriageStore(store);
  next.entries[String(id)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const ids = Object.keys(next.entries);
  if (ids.length > TASK_TRIAGE_LIMIT) {
    ids.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of ids.slice(0, ids.length - TASK_TRIAGE_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function pruneTaskTriageStore(store, validIds) {
  const next = normalizeTaskTriageStore(store);
  const keep = new Set((validIds || []).map(String));
  if (keep.size === 0) return next;
  let removed = 0;
  for (const id of Object.keys(next.entries)) {
    if (keep.has(id)) continue;
    delete next.entries[id];
    removed += 1;
  }
  next.removed = removed;
  return next;
}

export function taskTriageText(record) {
  return [record?.title, record?.description, record?.process]
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function isTaskTriageEligible(record) {
  if (!record || typeof record !== 'object') return false;
  if (!String(record.id || '').trim()) return false;
  if (TERMINAL_STATUSES.includes(String(record.status || ''))) return false;
  return Boolean(taskTriageText(record));
}

export function taskTriagePending({ tasks = [], store = null, hashOf } = {}) {
  const entries = normalizeTaskTriageStore(store).entries;
  const pending = [];
  for (const record of tasks) {
    if (!isTaskTriageEligible(record)) continue;
    const text = taskTriageText(record);
    const hash = typeof hashOf === 'function' ? hashOf(text) : '';
    const current = entries[String(record.id)];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ id: String(record.id), text, hash });
  }
  return pending;
}

export function taskTriageTargets({ tasks = [], store = null, limit = TASK_TRIAGE_BATCH_LIMIT, ids = null, hashOf } = {}) {
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const size = Math.max(1, Math.min(Number(limit) || TASK_TRIAGE_BATCH_LIMIT, TASK_TRIAGE_BATCH_LIMIT));
  const pending = taskTriagePending({ tasks, store, hashOf });
  const filtered = wanted ? pending.filter(target => wanted.has(target.id)) : pending;
  return filtered.slice(0, size);
}
