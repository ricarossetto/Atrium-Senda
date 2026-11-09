// ATRIUM — identidade oficial de contatos (puro, sem DOM, sem I/O).
//
// Fonte única para normalização, agrupamento, mesclagem e religação de
// contatos duplicados. Usado pelo frontend (js/features/contacts.js),
// pelos coletores (collector/adapters/datajud.mjs, eproc-a1-downloader) e
// pelo script de deduplicação (scripts/dedupe-contacts.mjs).
//
// Regra de segurança: homônimos (mesmo nome, sem identificador forte)
// NUNCA são mesclados automaticamente. Somente grupos que compartilham
// documento normalizado ou externalId são fundidos sem revisão; grupos
// só por nome vão para relatório de revisão humana.

export function normalizeContactName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeContactDocument(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

function mergeSources(left, right) {
  return [...new Set([...String(left || '').split(' + '), right].map(value => String(value || '').trim()).filter(Boolean))].join(' + ');
}

// Chave de agrupamento: documento primeiro (identificador forte), nome se não houver.
export function contactGroupKey(record) {
  const document = normalizeContactDocument(record?.document || record?.cpf || record?.cnpj);
  if (document) return `doc:${document}`;
  const externalId = String(record?.externalId || '').trim();
  if (externalId) return `ext:${externalId}`;
  const name = normalizeContactName(record?.name);
  return name ? `name:${name}` : '';
}

// Encontra índices de duplicados fortes (mesmo documento ou externalId).
export function findStrongDuplicateIndexes(records, incoming) {
  const list = Array.isArray(records) ? records : [];
  const document = normalizeContactDocument(incoming?.document || incoming?.cpf || incoming?.cnpj);
  if (document) {
    const matches = list
      .map((record, index) => (normalizeContactDocument(record?.document || record?.cpf || record?.cnpj) === document ? index : -1))
      .filter(index => index >= 0);
    if (matches.length > 1) return matches;
  }
  const externalId = String(incoming?.externalId || '').trim();
  if (externalId) {
    const matches = list
      .map((record, index) => (String(record?.externalId || '').trim() === externalId ? index : -1))
      .filter(index => index >= 0);
    if (matches.length > 1) return matches;
  }
  return [];
}

// Guardião do grupo: mais antigo por registeredAt/createdAt; sem data perde
// para datado; empate vai para o menor índice. Determinístico.
export function pickKeeperIndex(records, indexes) {
  const unique = [...new Set(indexes)];
  let best = unique[0];
  let bestDate = String(records[best]?.registeredAt || records[best]?.createdAt || '');
  for (const index of unique.slice(1)) {
    const date = String(records[index]?.registeredAt || records[index]?.createdAt || '');
    if (!date) continue;
    if (!bestDate || date <= bestDate) { best = index; bestDate = date; }
  }
  return best;
}

// Funde perdedores no guardião (pickKeeperIndex). Não muta o array:
// devolve { keeper, keeperIndex, removedIds } e o guardião mesclado.
export function mergeDuplicateGroup(records, indexes) {
  const unique = [...new Set(indexes)];
  const keeperIndex = pickKeeperIndex(records, unique);
  const keeper = { ...(records[keeperIndex] || {}) };
  for (const index of unique) {
    if (index === keeperIndex) continue;
    const loser = records[index] || {};
    for (const [field, value] of Object.entries(loser)) {
      if (['id', 'externalId', 'registeredAt', 'createdAt', 'updatedAt'].includes(field)) continue;
      if (['relatedProcessNumbers', 'monitoredTermIds'].includes(field)) continue;
      if (!meaningful(keeper[field]) && meaningful(value)) keeper[field] = value;
    }
    keeper.relatedProcessNumbers = uniqueStrings([...(keeper.relatedProcessNumbers || []), ...(loser.relatedProcessNumbers || [])]);
    keeper.monitoredTermIds = uniqueStrings([...(keeper.monitoredTermIds || []), ...(loser.monitoredTermIds || [])]);
    keeper.source = mergeSources(keeper.source, loser.source);
  }
  keeper.updatedAt = new Date().toISOString();
  const removedIds = unique.filter(index => index !== keeperIndex).map(index => String(records[index]?.id || '')).filter(Boolean);
  return { keeper, keeperIndex, removedIds };
}

// Religação de referências de contato no estado (processos, tarefas, agenda,
// documentos). Devolve quantas referências foram movidas. Financeiro usa ids
// derivados em tempo de leitura e não guarda referência armazenada.
export function rewireContactReferences(state, keeperId, loserIds) {
  const losers = new Set((Array.isArray(loserIds) ? loserIds : []).map(String));
  if (!losers.size || !keeperId) return 0;
  let moved = 0;
  const move = (value) => String(value || '') !== '' && losers.has(String(value));
  for (const process of state?.processes || []) {
    if (process && move(process.contactId)) { process.contactId = keeperId; moved++; }
  }
  for (const collection of [state?.tasks, state?.agenda, state?.events]) {
    for (const record of collection || []) {
      if (!record) continue;
      if (move(record.contactId)) { record.contactId = keeperId; moved++; }
      if (move(record.clientContactId)) { record.clientContactId = keeperId; moved++; }
    }
  }
  for (const document of state?.documents || []) {
    if (!document) continue;
    if (document.ownerType === 'contact' && move(document.ownerId)) { document.ownerId = keeperId; moved++; }
    if (move(document.contactId)) { document.contactId = keeperId; moved++; }
  }
  return moved;
}
