/**
 * ATRIUM — Sugestão assistiva de risco de estouro por tarefa. Arquivo DERIVADO por workspace
 * (`task-risk.json`), nunca oficial e nunca fonte de verdade.
 *
 * Puro: não lê disco, rede nem estado oficial. O chamador injeta o texto já redigido e a função de
 * hash; a persistência fica no servidor.
 *
 * Elegibilidade: tarefa aberta (fora de `concluida`/`cancelada`) com id e algum texto.
 * O cliente nunca é enviado ao classificador — o texto é título, descrição, processo e a situação
 * temporal da própria tarefa (situação, prazo da tarefa, prazo fatal e prazo declarado pela fonte).
 *
 * Semântica: cada entrada guarda o risco sugerido (`alto`/`medio`/`baixo`) com confiança, a ação e o
 * `payloadHash` do texto comparado. Entrada sem hash atual é reavaliada. **A sugestão nunca cria,
 * altera ou infere prazo** — ela só prioriza o que já existe (§16).
 */

export const TASK_RISK_VERSION = 1;
export const TASK_RISK_LIMIT = 500;
export const TASK_RISK_BATCH_LIMIT = 50;

const TERMINAL_STATUSES = Object.freeze(['concluida', 'cancelada']);

function cleanEntry(entry = {}) {
  return {
    risk: String(entry.risk || ''),
    riskConfidence: Number(entry.riskConfidence) || 0,
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

export function normalizeTaskRiskStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(id)] = cleanEntry(entry);
  }
  return { version: TASK_RISK_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertTaskRiskEntry(store, id, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizeTaskRiskStore(store);
  next.entries[String(id)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const ids = Object.keys(next.entries);
  if (ids.length > TASK_RISK_LIMIT) {
    ids.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of ids.slice(0, ids.length - TASK_RISK_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function pruneTaskRiskStore(store, validIds) {
  const next = normalizeTaskRiskStore(store);
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

/**
 * Texto comparado: a tarefa como ela está (situação + prazos existentes). Datas entram apenas como
 * leitura — o modelo não cria prazo nem decide contagem, só aponta risco do que já está lá.
 */
export function taskRiskText(record) {
  const partes = [
    `título: ${String(record?.title || '').trim() || 'sem título'}`,
    `situação: ${String(record?.status || '').trim() || 'não informada'}`,
    `prioridade: ${String(record?.priority || '').trim() || 'normal'}`,
    `prazo da tarefa: ${String(record?.deadline || '').trim() || 'sem prazo'}`,
    `prazo fatal: ${String(record?.fatalDeadline || '').trim() || 'não informado'}`,
    `prazo declarado pela fonte: ${String(record?.sourceReportedDeadlineAt || '').trim() || 'não informado'}`,
    `responsável: ${String(record?.responsible || '').trim() ? 'definido' : 'não definido'}`,
    `tempo apontado (min): ${(Array.isArray(record?.timeLogs) ? record.timeLogs : []).reduce((total, log) => total + (Number(log?.minutes) || 0), 0)}`,
    `descrição: ${String(record?.description || '').trim().slice(0, 600) || 'sem descrição'}`
  ];
  return partes.join('\n');
}

export function isTaskRiskEligible(record) {
  if (!record || typeof record !== 'object') return false;
  if (!String(record.id || '').trim()) return false;
  if (record.absorbedInto || record.active === false) return false;
  if (TERMINAL_STATUSES.includes(String(record.status || ''))) return false;
  return Boolean(String(record.title || record.description || '').trim());
}

export function taskRiskPending({ tasks = [], store = null, hashOf } = {}) {
  const entries = normalizeTaskRiskStore(store).entries;
  const pending = [];
  for (const record of tasks) {
    if (!isTaskRiskEligible(record)) continue;
    const text = taskRiskText(record);
    const hash = typeof hashOf === 'function' ? hashOf(text) : '';
    const current = entries[String(record.id)];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ id: String(record.id), text, hash });
  }
  return pending;
}

export function taskRiskTargets({ tasks = [], store = null, limit = TASK_RISK_BATCH_LIMIT, ids = null, hashOf } = {}) {
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const size = Math.max(1, Math.min(Number(limit) || TASK_RISK_BATCH_LIMIT, TASK_RISK_BATCH_LIMIT));
  const pending = taskRiskPending({ tasks, store, hashOf });
  const filtered = wanted ? pending.filter(target => wanted.has(target.id)) : pending;
  return filtered.slice(0, size);
}
