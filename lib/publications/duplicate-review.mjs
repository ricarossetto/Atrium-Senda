/**
 * ATRIUM — Revisão assistiva de publicações duplicadas. Arquivo DERIVADO por workspace
 * (`duplicate-review.json`), nunca oficial, nunca fonte de verdade.
 *
 * Puro: os pares vêm do agrupador oficial de identidade (`intimation-identity.mjs`) e o
 * texto vai redigido para o classificador. Nenhuma fusão acontece aqui: o merge oficial
 * continua sendo o único caminho de escrita, decidido por pessoa.
 *
 * Semântica: cada par recebe um veredito (`mesma`/`diferente`/`incerto`) com confiança e o
 * `payloadHash` do texto comparado; par sem hash atual é reavaliado; par que deixa de ser
 * candidato é podado.
 */

export const DUPLICATE_REVIEW_VERSION = 1;
export const DUPLICATE_REVIEW_LIMIT = 500;
export const DUPLICATE_REVIEW_BATCH_LIMIT = 50;

function cleanEntry(entry = {}) {
  return {
    verdict: String(entry.verdict || ''),
    confidence: Number(entry.confidence) || 0,
    action: String(entry.action || 'abstain'),
    reason: String(entry.reason || ''),
    pairType: String(entry.pairType || ''),
    payloadHash: String(entry.payloadHash || ''),
    at: String(entry.at || '')
  };
}

export function normalizeDuplicateReviewStore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries) ? raw.entries : {};
  const entries = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    entries[String(key)] = cleanEntry(entry);
  }
  return { version: DUPLICATE_REVIEW_VERSION, generatedAt: String(raw.generatedAt || ''), entries };
}

export function upsertDuplicateReviewEntry(store, key, entry, { now = new Date().toISOString() } = {}) {
  const next = normalizeDuplicateReviewStore(store);
  next.entries[String(key)] = cleanEntry({ ...entry, at: entry?.at || now });
  next.generatedAt = now;
  const keys = Object.keys(next.entries);
  if (keys.length > DUPLICATE_REVIEW_LIMIT) {
    keys.sort((left, right) => String(next.entries[left].at).localeCompare(String(next.entries[right].at)));
    for (const stale of keys.slice(0, keys.length - DUPLICATE_REVIEW_LIMIT)) delete next.entries[stale];
  }
  return next;
}

export function pruneDuplicateReviewStore(store, validKeys) {
  const next = normalizeDuplicateReviewStore(store);
  const keep = new Set((validKeys || []).map(String));
  if (keep.size === 0) return next;
  let removed = 0;
  for (const key of Object.keys(next.entries)) {
    if (keep.has(key)) continue;
    delete next.entries[key];
    removed += 1;
  }
  next.removed = removed;
  return next;
}

export function pairKey(idA, idB) {
  const left = String(idA || '').trim();
  const right = String(idB || '').trim();
  if (!left || !right) return '';
  return [left, right].sort().join('|');
}

function recordText(record) {
  const parts = [
    String(record?.event || record?.title || '').trim(),
    String(record?.process || record?.processNumber || '').trim(),
    String(record?.sourceReportedAt || record?.publishedAt || record?.date || '').trim(),
    String(record?.source || '').trim()
  ].filter(Boolean);
  const body = String(record?.text || record?.fullText || '').trim().slice(0, 600);
  if (body) parts.push(body);
  return parts.join(' · ');
}

/**
 * Pares candidatos a duplicata, prontos para conferência. Usa o agrupador oficial
 * (`groupDuplicateCandidates`), que já é conservador: só agrupa chave forte ou texto
 * integral idêntico; tolerância de data aparece como candidato de revisão.
 */
export function duplicateReviewPairs({ intimations = [], groupDuplicateCandidates, limit = DUPLICATE_REVIEW_BATCH_LIMIT } = {}) {
  if (typeof groupDuplicateCandidates !== 'function') return [];
  // Registro absorvido (`mergedInto`) já não tem par para conferir: mostrá-lo fazia o painel
  // listar duplicata que não existe mais e o botão de fusão cair em "ja-fundido". Remove antes
  // de agrupar para os índices continuarem alinhados ao array usado na leitura.
  const records = (Array.isArray(intimations) ? intimations : []).filter(record => record && !record.mergedInto);
  const grouped = groupDuplicateCandidates(records);
  const pairs = [];
  const seen = new Set();
  for (const pair of Array.isArray(grouped?.pairs) ? grouped.pairs : []) {
    const left = records[pair.a];
    const right = records[pair.b];
    if (!left || !right) continue;
    const idA = String(left.id || left.externalId || '').trim();
    const idB = String(right.id || right.externalId || '').trim();
    const key = pairKey(idA, idB);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      key,
      group: String(pair.group || ''),
      aId: idA,
      bId: idB,
      aSource: String(left.source || ''),
      bSource: String(right.source || ''),
      pairType: String(pair.pairType || ''),
      exact: pair.exact === true,
      autoSafe: pair.autoSafe !== false,
      text: `LEITURA A (${String(left.source || 'fonte')})\n${recordText(left)}\n\nLEITURA B (${String(right.source || 'fonte')})\n${recordText(right)}`
    });
  }
  // Candidatos de revisão: o agrupador devolve as listas já em forma de membro
  // (`{ index, source, ... }`), então o acesso é por `candidate.a.index` — ler
  // `records[candidate.a]` devolvia `undefined` e descartava o par em silêncio.
  const pushCandidate = (left, right, meta = {}) => {
    if (!left || !right) return;
    const idA = String(left.id || left.externalId || '').trim();
    const idB = String(right.id || right.externalId || '').trim();
    const key = pairKey(idA, idB);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pairs.push({
      key,
      group: String(meta.group || ''),
      aId: idA,
      bId: idB,
      aSource: String(left.source || ''),
      bSource: String(right.source || ''),
      pairType: String(meta.pairType || ''),
      exact: false,
      autoSafe: false,
      matchedBy: String(meta.matchedBy || ''),
      dayGap: Number(meta.dayGap) || 0,
      text: `LEITURA A (${String(left.source || 'fonte')})\n${recordText(left)}\n\nLEITURA B (${String(right.source || 'fonte')})\n${recordText(right)}`
    });
  };
  for (const candidate of Array.isArray(grouped?.nearDateCandidates) ? grouped.nearDateCandidates : []) {
    pushCandidate(records[candidate?.a?.index], records[candidate?.b?.index], {
      pairType: 'near-date',
      matchedBy: candidate?.matchedBy,
      dayGap: candidate?.dayGap
    });
  }
  for (const candidate of Array.isArray(grouped?.fallbackCandidates) ? grouped.fallbackCandidates : []) {
    pushCandidate(records[candidate?.a?.index], records[candidate?.b?.index], {
      pairType: 'fallback',
      matchedBy: candidate?.matchedBy || 'fallback'
    });
  }
  const size = Math.max(1, Math.min(Number(limit) || DUPLICATE_REVIEW_BATCH_LIMIT, DUPLICATE_REVIEW_BATCH_LIMIT));
  return pairs.slice(0, size);
}

export function duplicateReviewPending({ pairs = [], store = null, hashOf } = {}) {
  const entries = normalizeDuplicateReviewStore(store).entries;
  const pending = [];
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (!pair?.key) continue;
    const hash = typeof hashOf === 'function' ? hashOf(pair.text, pair) : '';
    const current = entries[pair.key];
    if (current && hash && current.payloadHash === hash) continue;
    pending.push({ ...pair, hash });
  }
  return pending;
}
