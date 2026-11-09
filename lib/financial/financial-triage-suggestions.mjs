/**
 * ATRIUM — Sugestões de triagem assistiva por lançamento financeiro. Arquivo DERIVADO por
 * workspace (`financial-triage.json`), nunca oficial e nunca fonte de verdade.
 *
 * Puro: não lê disco, rede nem estado oficial. O chamador injeta o texto já redigido e a
 * função de hash; a persistência fica no servidor.
 *
 * Regras do contrato financeiro (`specs/financial-entries.md`):
 * - a sugestão é **selo de conferência**: nunca cria, edita, paga ou reembolsa lançamento;
 * - não introduz categoria obrigatória nem migration — a descrição continua livre;
 * - o nome do cliente nunca é enviado: o texto é descrição, tipo do lançamento e o número do
 *   processo vinculado (quando houver);
 * - os rótulos de bucket são os do próprio produto (honorários, custas, reembolso, RPV/alvará,
 *   despesa operacional, outros) e servem para organizar a conferência humana, não para gravar
 *   campo novo no registro.
 */

export const FINANCIAL_TRIAGE_VERSION = 1;
export const FINANCIAL_TRIAGE_LIMIT = 500;
export const FINANCIAL_TRIAGE_BATCH_LIMIT = 50;

export const FINANCIAL_BUCKETS = Object.freeze([
  { key: 'honorarios', label: 'Honorários' },
  { key: 'custas', label: 'Custas e despesas processuais' },
  { key: 'reembolso', label: 'Reembolso' },
  { key: 'rpv_alvara', label: 'RPV / alvará' },
  { key: 'despesa_operacional', label: 'Despesa operacional' },
  { key: 'outros', label: 'Outros' }
]);

const BUCKET_KEYS = Object.freeze(FINANCIAL_BUCKETS.map(bucket => bucket.key));

export function isFinancialBucket(value) {
  return BUCKET_KEYS.includes(String(value || '').trim());
}

function cleanEntry(entry = {}) {
  const bucket = String(entry.bucket || '');
  return {
    bucket: isFinancialBucket(bucket) ? bucket : '',
    bucketConfidence: Number(entry.bucketConfidence) || 0,
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

export function normalizeFinancialTriageStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(id)] = cleanEntry(entry);
  }
  return { version: FINANCIAL_TRIAGE_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertFinancialTriageEntry(store, id, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizeFinancialTriageStore(store);
  next.entries[String(id)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const ids = Object.keys(next.entries);
  if (ids.length > FINANCIAL_TRIAGE_LIMIT) {
    ids.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of ids.slice(0, ids.length - FINANCIAL_TRIAGE_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function pruneFinancialTriageStore(store, validIds) {
  const next = normalizeFinancialTriageStore(store);
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

/** Chave estável do lançamento na conferência: id oficial quando existe, senão a chave de edição da UI. */
export function financialTriageKey(record) {
  const id = String(record?.id || '').trim();
  if (id) return id;
  return String(record?.editKey || '').trim();
}

/** Texto enviado ao classificador: descrição + tipo + processo (nunca o nome do cliente). */
export function financialTriageText(record) {
  const partes = [
    record?.description,
    record?.kind || record?.type,
    record?.process || record?.processNumber
  ];
  return partes.map(part => String(part || '').trim()).filter(Boolean).join('\n\n');
}

export function isFinancialTriageEligible(record) {
  if (!record || typeof record !== 'object') return false;
  if (!financialTriageKey(record)) return false;
  return Boolean(String(record.description || '').trim());
}

export function financialTriagePending({ records = [], store = null, hashOf } = {}) {
  const entries = normalizeFinancialTriageStore(store).entries;
  const pending = [];
  for (const record of records) {
    if (!isFinancialTriageEligible(record)) continue;
    const key = financialTriageKey(record);
    const text = financialTriageText(record);
    const hash = typeof hashOf === 'function' ? hashOf(text) : '';
    const current = entries[key];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ id: key, text, hash });
  }
  return pending;
}

export function financialTriageTargets({ records = [], store = null, limit = FINANCIAL_TRIAGE_BATCH_LIMIT, ids = null, hashOf } = {}) {
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const size = Math.max(1, Math.min(Number(limit) || FINANCIAL_TRIAGE_BATCH_LIMIT, FINANCIAL_TRIAGE_BATCH_LIMIT));
  const pending = financialTriagePending({ records, store, hashOf });
  const filtered = wanted ? pending.filter(target => wanted.has(target.id)) : pending;
  return filtered.slice(0, size);
}

/**
 * Achata os lançamentos com descrição livre do estado oficial, espelhando o que a carteira
 * mostra: despesas, recebimentos e parcelas de processos e contatos, mais as despesas
 * operacionais do escritório (`officeExpenses`). Requisições/RPV e honorários contratuais são
 * dirigidos por status do tribunal e não têm descrição livre — ficam fora do escopo.
 */
export function collectFinancialRecords(state) {
  const records = [];
  const push = (owner, kind, list, processNumber) => {
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String(entry.id || '').trim();
      const description = String(entry.description || '').trim();
      if (!id || !description) continue;
      records.push({
        id,
        description,
        kind,
        process: String(processNumber || entry.process || '').trim(),
        owner: String(owner || '').trim()
      });
    }
  };
  for (const process of Array.isArray(state?.processes) ? state.processes : []) {
    if (!process || typeof process !== 'object') continue;
    const numero = String(process.number || process.processNumber || '').trim();
    push(process.id, 'despesa', process.expenses, numero);
    push(process.id, 'recebimento', process.receipts, numero);
    push(process.id, 'parcela', process.feeInstallments, numero);
  }
  for (const contact of Array.isArray(state?.contacts) ? state.contacts : []) {
    if (!contact || typeof contact !== 'object') continue;
    push(contact.id, 'despesa', contact.expenses, contact.process || '');
    push(contact.id, 'recebimento', contact.receipts, contact.process || '');
    push(contact.id, 'parcela', contact.feeInstallments, contact.process || '');
  }
  push('office', 'despesa', state?.officeExpenses, 'Escritório');
  return records;
}
