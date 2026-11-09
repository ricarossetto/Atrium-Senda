/**
 * ATRIUM — Sugestões de triagem assistiva por processo. Arquivo DERIVADO por workspace
 * (`process-suggestions.json`), nunca oficial, nunca fonte de verdade.
 *
 * Puro: o chamador injeta o texto já redigido e a função de hash; a persistência fica no
 * servidor. Duas coisas convivem aqui:
 *
 * 1. **Campos faltantes** — determinístico, sem modelo: aponta lacunas de cadastro
 *    (tribunal/órgão, comarca, classe) tratando os placeholders conhecidos como vazio.
 * 2. **Tipo de andamento** — sugestão assistiva (choice) a partir do último andamento,
 *    com sinalização de que o andamento parece exigir providência. Nunca cria prazo,
 *    tarefa, etiqueta ou mudança de cadastro.
 */

export const PROCESS_TRIAGE_VERSION = 1;
export const PROCESS_TRIAGE_LIMIT = 1200;
export const PROCESS_TRIAGE_BATCH_LIMIT = 50;

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^n[aã]o informad[oa]$/i,
  /^classe n[aã]o informada$/i,
  /^tipo de a[cç][aã]o n[aã]o informado$/i,
  /^fase n[aã]o informada$/i,
  /^sem informa[cç][aã]o$/i,
  /^n\/?i$/i,
  /^-+$/
];

function cleanEntry(entry = {}) {
  return {
    movementType: String(entry.movementType || ''),
    movementConfidence: Number(entry.movementConfidence) || 0,
    needsAttention: String(entry.needsAttention || ''),
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    missingFields: Array.isArray(entry.missingFields) ? entry.missingFields.map(String).slice(0, 8) : [],
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

function isBlank(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Lacunas de cadastro do processo (determinístico). Rótulos em linguagem de escritório.
 */
export function processMissingFields(record) {
  if (!record || typeof record !== 'object') return [];
  const fields = [];
  if (isBlank(record.court || record.courtUnit)) fields.push('tribunal/órgão');
  if (isBlank(record.county)) fields.push('comarca');
  if (isBlank(record.actionClass) && isBlank(record.actionType)) fields.push('classe');
  if (isBlank(record.subject)) fields.push('assunto');
  return fields;
}

export function normalizeProcessTriageStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(id)] = cleanEntry(entry);
  }
  return { version: PROCESS_TRIAGE_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertProcessTriageEntry(store, id, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizeProcessTriageStore(store);
  next.entries[String(id)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const ids = Object.keys(next.entries);
  if (ids.length > PROCESS_TRIAGE_LIMIT) {
    ids.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of ids.slice(0, ids.length - PROCESS_TRIAGE_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function pruneProcessTriageStore(store, validIds) {
  const next = normalizeProcessTriageStore(store);
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

export function processTriageText(record) {
  return [record?.lastMovement, record?.actionClass || record?.actionType, record?.judicialPhase || record?.stage]
    .map(part => String(part || '').trim())
    .filter(part => part && !PLACEHOLDER_PATTERNS.some(pattern => pattern.test(part)))
    .join('\n\n');
}

export function isProcessTriageEligible(record) {
  if (!record || typeof record !== 'object') return false;
  if (!String(record.id || '').trim()) return false;
  return !isBlank(record.lastMovement);
}

export function processTriagePending({ processes = [], store = null, hashOf } = {}) {
  const entries = normalizeProcessTriageStore(store).entries;
  const pending = [];
  for (const record of processes) {
    if (!isProcessTriageEligible(record)) continue;
    const text = processTriageText(record);
    if (!text) continue;
    const missingFields = processMissingFields(record);
    const hash = typeof hashOf === 'function' ? hashOf(`${text}\n\nlacunas:${missingFields.join(',')}`) : '';
    const current = entries[String(record.id)];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ id: String(record.id), text, hash, missingFields });
  }
  return pending;
}

export function processTriageTargets({ processes = [], store = null, limit = PROCESS_TRIAGE_BATCH_LIMIT, ids = null, hashOf } = {}) {
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const size = Math.max(1, Math.min(Number(limit) || PROCESS_TRIAGE_BATCH_LIMIT, PROCESS_TRIAGE_BATCH_LIMIT));
  const pending = processTriagePending({ processes, store, hashOf });
  const filtered = wanted ? pending.filter(target => wanted.has(target.id)) : pending;
  return filtered.slice(0, size);
}
