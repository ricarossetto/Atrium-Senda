/**
 * Sugestões de triagem assistiva por publicação — arquivo DERIVADO por workspace
 * (`publication-triage.json`), nunca oficial e nunca fonte de verdade.
 *
 * Puro: não lê disco, rede nem estado oficial. O chamador injeta o texto já
 * redigido e a função de hash; a persistência fica no servidor.
 *
 * Elegibilidade: publicações com `treatmentStatus` em untreated/in_review
 * (nunca tratadas/descartadas).
 *
 * Semântica: cada entrada guarda área/prioridade sugeridas com confiança, a ação
 * (`suggest`/`review`/`abstain`) e o `payloadHash` do texto redigido. Entrada sem
 * hash atual é reclassificada; aliases fundidos (`mergedInto`) nunca entram.
 */

export const PUBLICATION_TRIAGE_VERSION = 1;
export const PUBLICATION_TRIAGE_LIMIT = 500;
export const PUBLICATION_TRIAGE_BATCH_LIMIT = 50;

const OPEN_STATUSES = Object.freeze(['untreated', 'in_review']);

function cleanEntry(entry = {}) {
  return {
    area: String(entry.area || ''),
    areaConfidence: Number(entry.areaConfidence) || 0,
    priority: String(entry.priority || ''),
    priorityConfidence: Number(entry.priorityConfidence) || 0,
    deadlineSignal: String(entry.deadlineSignal || ''),
    deadlineDays: String(entry.deadlineDays || ''),
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

export function normalizePublicationTriageStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(id)] = cleanEntry(entry);
  }
  return { version: PUBLICATION_TRIAGE_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertPublicationTriageEntry(store, id, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizePublicationTriageStore(store);
  next.entries[String(id)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const ids = Object.keys(next.entries);
  if (ids.length > PUBLICATION_TRIAGE_LIMIT) {
    ids.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of ids.slice(0, ids.length - PUBLICATION_TRIAGE_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function prunePublicationTriageStore(store, validIds) {
  const next = normalizePublicationTriageStore(store);
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

function publicationText(record) {
  return [record.title, record.text, record.fullText].map(part => String(part || '').trim()).filter(Boolean).join('\n\n');
}

function isEligible(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.mergedInto) return false;
  // O funil de triagem usa `treatmentStatus` (untreated/in_review); `status`
  // é o estado de leitura/tarefa e não define pendência.
  if (!OPEN_STATUSES.includes(String(record.treatmentStatus || 'untreated'))) return false;
  return Boolean(String(record.id || '').trim());
}

export function publicationTriagePending({ intimations = [], store = null, hashOf } = {}) {
  const entries = normalizePublicationTriageStore(store).entries;
  const pending = [];
  for (const record of intimations) {
    if (!isEligible(record)) continue;
    const text = publicationText(record);
    if (!text) continue;
    const hash = typeof hashOf === 'function' ? hashOf(text) : '';
    const current = entries[String(record.id)];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ id: String(record.id), text, hash });
  }
  return pending;
}

export function publicationTriageTargets({ intimations = [], store = null, limit = PUBLICATION_TRIAGE_BATCH_LIMIT, ids = null, hashOf } = {}) {
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const size = Math.max(1, Math.min(Number(limit) || PUBLICATION_TRIAGE_BATCH_LIMIT, PUBLICATION_TRIAGE_BATCH_LIMIT));
  const pending = publicationTriagePending({ intimations, store, hashOf });
  const filtered = wanted ? pending.filter(target => wanted.has(target.id)) : pending;
  return filtered.slice(0, size);
}
