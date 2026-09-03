export const SEARCH_INDEX_VERSION = 5;
export const SEARCH_RESULT_LIMIT = 24;

const ENTITY_ORDER = Object.freeze({
  process: 0,
  contact: 1,
  lead: 2,
  publication: 3,
  task: 4,
  document: 5,
  appointment: 6,
  note: 7,
  movement: 8,
  financial: 9,
  prompt: 10,
  audit: 11
});

const SECRET_ASSIGNMENT = /(?:api[_\s-]?key|password|senha|secret|token|passphrase|csrf|totp|credential)\s*[:=]\s*\S+/i;
const SECRET_VALUE = /(?:otpauth:\/\/|-----BEGIN [A-Z ]+PRIVATE KEY-----|\bAIza[\w-]{20,}|\bsk-[\w-]{20,})/i;

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseDefaultPromptsSource(source) {
  const text = String(source || '');
  const assignment = /window\.PROMPTS_DATA\s*=\s*/.exec(text);
  if (!assignment) throw new Error('Catálogo de prompts sem atribuição canônica.');
  const start = assignment.index + assignment[0].length;
  const end = text.lastIndexOf(']');
  if (end < start) throw new Error('Catálogo de prompts incompleto.');
  const prompts = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(prompts)) throw new Error('Catálogo de prompts inválido.');
  return prompts;
}

function visibleText(value, maxLength = 1_000_000) {
  const text = String(value ?? '').replace(/\0/g, '').trim();
  if (!text || SECRET_ASSIGNMENT.test(text) || SECRET_VALUE.test(text)) return '';
  return text.slice(0, maxLength);
}

function field(name, label, value, weight = 1) {
  const text = visibleText(value);
  return text ? { name, label, value: text, normalized: normalizeSearchText(text), weight } : null;
}

function compactFields(fields) {
  return fields.filter(Boolean);
}

function makeEntry({ entityType, target = entityType, id, keyId = id, title, context = '', fields = [] }) {
  const safeId = visibleText(id, 300);
  const safeKeyId = visibleText(keyId, 500);
  const safeTitle = visibleText(title, 500);
  if (!safeId || !safeKeyId || !safeTitle || !Object.hasOwn(ENTITY_ORDER, entityType)) return null;
  const safeContext = visibleText(context, 800);
  const indexedFields = compactFields([
    field('title', 'Título', safeTitle, 10),
    field('context', 'Contexto', safeContext, 4),
    ...fields
  ]);
  return {
    key: `${entityType}:${safeKeyId}`,
    entityType,
    target,
    id: safeId,
    title: safeTitle,
    context: safeContext,
    fields: indexedFields,
    searchable: indexedFields.map(item => item.normalized).join(' '),
    fingerprint: JSON.stringify(indexedFields.map(item => [item.name, item.value, item.weight]))
  };
}

function recordDate(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

function joinContext(...parts) {
  return parts.map(part => visibleText(part, 300)).filter(Boolean).join(' · ');
}

function processPartyContext(item) {
  return (Array.isArray(item?.judicialParties) ? item.judicialParties : []).map(party => joinContext(
    party?.name,
    party?.role,
    (Array.isArray(party?.lawyers) ? party.lawyers : []).map(lawyer => joinContext(lawyer?.name, lawyer?.oabUf, lawyer?.oabNumber)).join(' ')
  )).join(' · ');
}

function processMovementContext(item) {
  return (Array.isArray(item?.movements) ? item.movements : []).map(movement => joinContext(
    movement?.description || movement?.text || movement?.name,
    movement?.date || movement?.occurredAt || movement?.at
  )).join(' · ');
}

function processNumberDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function relatedProcess(record, processes, processesByNumber) {
  const byId = processes.get(record?.processId || record?.ownerId);
  if (byId) return byId;
  return processesByNumber.get(processNumberDigits(record?.process || record?.processNumber)) || null;
}

function processSearchContext(process) {
  return process ? joinContext(process.number, process.client, process.court) : '';
}

function ownerName(document, contacts, processes) {
  const collection = document?.ownerType === 'process' ? processes : contacts;
  const owner = collection.get(document?.ownerId);
  if (!owner) return '';
  return document.ownerType === 'process'
    ? owner.number || owner.client || owner.name || ''
    : owner.name || '';
}

function pruneOcrCache(ocrCache, state) {
  const activeChecksums = new Set((state.documents || [])
    .filter(document => document && !document.deletedAt)
    .map(document => visibleText(document.intelligence?.ocr?.checksum, 200))
    .filter(Boolean));
  for (const checksum of ocrCache.keys()) {
    if (!activeChecksums.has(checksum)) ocrCache.delete(checksum);
  }
}

async function documentEntry(document, { contacts, processes, processesByNumber, loadOcrText, ocrCache }) {
  if (!document || document.deletedAt) return null;
  const ocrChecksum = visibleText(document.intelligence?.ocr?.checksum, 200);
  let ocrText = '';
  if (ocrChecksum) {
    if (ocrCache.has(ocrChecksum)) ocrText = ocrCache.get(ocrChecksum);
    else {
      try {
        ocrText = visibleText(await loadOcrText(ocrChecksum));
        ocrCache.set(ocrChecksum, ocrText);
      } catch {
        ocrCache.set(ocrChecksum, '');
      }
    }
  }
  const owner = ownerName(document, contacts, processes);
  const process = document.ownerType === 'process' ? relatedProcess(document, processes, processesByNumber) : null;
  const metadata = document.metadata || {};
  const entityContext = (metadata.entities || []).map(entity => joinContext(entity?.type, entity?.label, entity?.identifier)).join(' · ');
  return makeEntry({
    entityType: 'document',
    id: document.id,
    title: document.name || document.originalName || 'Documento',
    context: joinContext(processSearchContext(process), owner, document.documentType, document.documentDate, metadata.origin, (metadata.tags || []).join(', ')),
    fields: compactFields([
      field('originalName', 'Nome original', document.originalName, 7),
      field('owner', 'Proprietário', owner, 7),
      field('processContext', 'Processo e cliente', processSearchContext(process), 7),
      field('documentType', 'Tipo documental', document.documentType, 5),
      field('documentDate', 'Data documental', document.documentDate, 3),
      field('metadata', 'Tags e origem', joinContext(metadata.origin, (metadata.tags || []).join(' ')), 5),
      field('summary', 'Resumo documental revisado', metadata.summary, 4),
      field('context', 'Contexto jurídico documental', metadata.context, 4),
      field('entities', 'Entidades documentais', entityContext, 5),
      field('sourceDocumentId', 'Documento de origem', document.sourceDocumentId, 2),
      field('ocr', 'Texto extraído', ocrText, 1)
    ])
  });
}

export async function buildSearchEntries(state = {}, {
  defaultPrompts = [],
  loadOcrText = async () => '',
  ocrCache = new Map()
} = {}) {
  const entries = [];
  const contacts = new Map((state.contacts || []).map(item => [item?.id, item]));
  const processes = new Map((state.processes || []).map(item => [item?.id, item]));
  const processesByNumber = new Map((state.processes || []).map(item => [processNumberDigits(item?.number || item?.protocol), item]).filter(([number]) => number));

  for (const item of state.processes || []) entries.push(makeEntry({
    entityType: 'process',
    id: item.id,
    title: item.number || item.client || 'Processo sem número',
    context: joinContext(item.client, item.court, item.phase || item.stage),
    fields: compactFields([
      field('number', 'Número CNJ', item.number, 10),
      field('numberDigits', 'Número CNJ sem pontuação', processNumberDigits(item.number), 10),
      field('client', 'Cliente', item.client, 8),
      field('opponent', 'Parte contrária', item.opponent || item.opposingParty, 6),
      field('court', 'Tribunal ou unidade', joinContext(item.court, item.district, item.unit), 6),
      field('classification', 'Classe ou fase', joinContext(item.actionType, item.group, item.phase, item.stage), 5),
      field('lastMovement', 'Último andamento', item.lastMovement, 4),
      field('judicialParties', 'Partes e representantes', processPartyContext(item), 4),
      field('movements', 'Histórico de andamentos', processMovementContext(item), 3),
      field('subject', 'Assunto processual', item.subject, 4),
      field('metadata', 'Metadados processuais', joinContext(item.oldNumber, item.folder, item.nb, item.protocol), 3),
      field('status', 'Monitoramento', joinContext(item.status, item.monitoring), 2)
    ])
  }));

  for (const item of state.contacts || []) entries.push(makeEntry({
    entityType: 'contact',
    id: item.id,
    title: item.name || 'Contato',
    context: joinContext(item.contactRole || item.role, item.city, item.state),
    fields: compactFields([
      field('name', 'Nome', item.name, 10),
      field('role', 'Papel', item.contactRole || item.role, 6),
      field('document', 'Documento cadastral', item.document, 6),
      field('cpfCnpj', 'CPF ou CNPJ', joinContext(item.cpf, item.cnpj, item.cpfCnpj), 7),
      field('cpfCnpjDigits', 'CPF ou CNPJ sem pontuação', processNumberDigits(item.document || item.cpf || item.cnpj || item.cpfCnpj), 7),
      field('contact', 'Contato', joinContext(item.mobile, item.phone, item.email), 5),
      field('location', 'Localidade', joinContext(item.city, item.state), 4),
      field('origin', 'Origem', item.leadOrigin || item.origin, 3),
      field('profession', 'Profissão', item.profession, 2)
    ])
  }));

  for (const item of state.leads || []) entries.push(makeEntry({
    entityType: 'lead',
    id: item.id,
    title: item.client || 'Atendimento sem interessado',
    context: joinContext(item.serviceType, item.status, item.responsible),
    fields: compactFields([
      field('client', 'Cliente ou interessado', item.client, 10),
      field('serviceType', 'Serviço jurídico', item.serviceType, 7),
      field('status', 'Status', item.status, 5),
      field('origin', 'Origem', item.origin, 4),
      field('responsible', 'Responsável', item.responsible, 4),
      field('notes', 'Relato do atendimento', item.notes, 2)
    ])
  }));

  for (const item of state.intimations || []) {
    const process = relatedProcess(item, processes, processesByNumber);
    entries.push(makeEntry({
    entityType: 'publication',
    target: 'intimation',
    id: item.id,
    title: item.title || 'Publicação',
    context: joinContext(processSearchContext(process), item.process, item.client, item.court),
    fields: compactFields([
      field('title', 'Título', item.title, 10),
      field('process', 'Processo', item.process, 8),
      field('client', 'Cliente', item.client, 6),
      field('court', 'Tribunal', item.court, 5),
      field('text', 'Conteúdo da publicação', item.text, 3),
      field('source', 'Fonte ou categoria', joinContext(item.source, item.category, item.term), 2)
    ])
    }));
    for (const note of item.workNotes || []) entries.push(makeEntry({
      entityType: 'note', target: 'intimation', id: item.id, keyId: `${item.id}:${note.id || note.createdAt || entries.length}`,
      title: 'Nota interna da publicação', context: joinContext(processSearchContext(process), item.title, note.createdBy),
      fields: compactFields([field('note', 'Nota interna', note.text, 8), field('publication', 'Publicação relacionada', item.title, 5)])
    }));
  }

  for (const item of state.tasks || []) {
    const process = relatedProcess(item, processes, processesByNumber);
    entries.push(makeEntry({
    entityType: 'task',
    id: item.id,
    title: item.title || 'Tarefa',
    context: joinContext(processSearchContext(process), item.client, item.process, item.responsible),
    fields: compactFields([
      field('title', 'Título', item.title, 10),
      field('description', 'Descrição', item.description, 5),
      field('client', 'Cliente', item.client, 6),
      field('process', 'Processo', item.process, 7),
      field('responsible', 'Responsável', item.responsible, 4),
      field('status', 'Estado da tarefa', joinContext(item.status, item.priority, item.deadline), 3)
    ])
    }));
  }

  for (const item of state.agenda || []) {
    const process = relatedProcess(item, processes, processesByNumber);
    entries.push(makeEntry({
      entityType: 'appointment', target: 'agenda', id: item.id, title: item.title || 'Compromisso',
      context: joinContext(processSearchContext(process), item.client, item.date, item.time),
      fields: compactFields([
        field('title', 'Compromisso', item.title, 10), field('process', 'Processo e cliente', processSearchContext(process), 7),
        field('notes', 'Observações', item.notes || item.description, 4), field('date', 'Data e horário', joinContext(item.date, item.time), 3)
      ])
    }));
  }

  for (const process of state.processes || []) {
    (Array.isArray(process.movements) ? process.movements : []).slice(0, 80).forEach((movement, index) => entries.push(makeEntry({
      entityType: 'movement', target: 'process', id: process.id, keyId: `${process.id}:${movement.id || movement.eventNumber || movement.code || index}`,
      title: movement.description || movement.text || movement.name || 'Movimentação processual',
      context: processSearchContext(process),
      fields: compactFields([field('movement', 'Movimentação judicial', joinContext(movement.description || movement.text || movement.name, movement.detail, movement.complement), 8), field('process', 'Processo e cliente', processSearchContext(process), 7)])
    })));
    (Array.isArray(process.expenses) ? process.expenses : []).slice(0, 80).forEach((expense, index) => entries.push(makeEntry({
      entityType: 'financial', target: 'financial', id: process.id, keyId: `${process.id}:expense:${expense.id || index}`,
      title: expense.description || expense.title || 'Despesa processual', context: processSearchContext(process),
      fields: compactFields([field('description', 'Lançamento financeiro', joinContext(expense.description, expense.status, expense.amount, expense.date), 8), field('process', 'Processo e cliente', processSearchContext(process), 7)])
    })));
    (Array.isArray(process.feeInstallments) ? process.feeInstallments : []).slice(0, 120).forEach((installment, index) => entries.push(makeEntry({
      entityType: 'financial', target: 'financial', id: process.id, keyId: `${process.id}:installment:${installment.id || index}`,
      title: installment.description || 'Parcela de honorários', context: processSearchContext(process),
      fields: compactFields([field('installment', 'Parcela de honorários', joinContext(installment.description, installment.status, installment.amount, installment.dueDate), 8), field('process', 'Processo e cliente', processSearchContext(process), 7)])
    })));
    (Array.isArray(process.receipts) ? process.receipts : []).slice(0, 120).forEach((receipt, index) => entries.push(makeEntry({
      entityType: 'financial', target: 'financial', id: process.id, keyId: `${process.id}:receipt:${receipt.id || index}`,
      title: receipt.description || 'Recebimento de honorários', context: processSearchContext(process),
      fields: compactFields([field('receipt', 'Recebimento de honorários', joinContext(receipt.description, receipt.status, receipt.amount, receipt.date), 8), field('process', 'Processo e cliente', processSearchContext(process), 7)])
    })));
    if (hasFinancialTerms(process)) entries.push(makeEntry({
      entityType: 'financial', target: 'financial', id: process.id, keyId: `${process.id}:terms`,
      title: 'Honorários e requisições do processo', context: processSearchContext(process),
      fields: compactFields([field('terms', 'Honorários e financeiro', joinContext(process.feeType, process.feePercentage, process.feeAmount, process.feeMonthly, process.feeStatus, process.requisitionType, process.requisitionAmount, process.requisitionStatus), 6), field('process', 'Processo e cliente', processSearchContext(process), 7)])
    }));
  }

  const documentEntries = await Promise.all((state.documents || []).map(item => documentEntry(item, {
    contacts,
    processes,
    processesByNumber,
    loadOcrText,
    ocrCache
  })));
  entries.push(...documentEntries);

  const prompts = new Map();
  for (const item of defaultPrompts || []) if (item?.id) prompts.set(item.id, item);
  for (const item of state.customPrompts || []) if (item?.id) prompts.set(item.id, item);
  for (const item of prompts.values()) entries.push(makeEntry({
    entityType: 'prompt',
    id: item.id,
    title: item.title || 'Prompt jurídico',
    context: joinContext(item.category, item.type, (item.tags || []).join(', ')),
    fields: compactFields([
      field('title', 'Título', item.title, 10),
      field('description', 'Descrição', item.description, 6),
      field('category', 'Categoria', joinContext(item.category, item.type, (item.tags || []).join(' ')), 4),
      field('prompt', 'Conteúdo do prompt', item.prompt, 2)
    ])
  }));

  for (const item of state.audit || []) entries.push(makeEntry({
    entityType: 'audit',
    id: item.id || `${item.at || ''}-${item.action || ''}`,
    title: item.action || 'Registro de auditoria',
    context: joinContext(item.actor, recordDate(item.at)),
    fields: compactFields([
      field('action', 'Ação auditada', item.action, 10),
      field('actor', 'Responsável', item.actor, 5),
      field('detail', 'Detalhe minimizado', item.detail, 3),
      field('date', 'Data', recordDate(item.at), 2)
    ])
  }));

  return entries.filter(Boolean);
}

function hasFinancialTerms(process) {
  return ['feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionStatus']
    .some(key => process?.[key] !== undefined && process?.[key] !== null && String(process[key]).trim() !== '' && process[key] !== 'none');
}

function healthySnapshot(snapshot) {
  return snapshot
    && snapshot.version === SEARCH_INDEX_VERSION
    && Array.isArray(snapshot.entries)
    && snapshot.entries.every(entry => entry && typeof entry.key === 'string' && Array.isArray(entry.fields));
}

function snippet(value, tokens, maxLength = 190) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const normalized = normalizeSearchText(text);
  const positions = tokens.map(token => normalized.indexOf(token)).filter(position => position >= 0);
  const matchAt = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, matchAt - 55);
  const end = Math.min(text.length, start + maxLength);
  return `${start ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function rankEntry(entry, tokens, normalizedQuery) {
  if (!tokens.every(token => entry.searchable.includes(token))) return null;
  let score = 0;
  let bestField = null;
  let bestFieldScore = -1;
  for (const indexedField of entry.fields) {
    let fieldScore = 0;
    for (const token of tokens) {
      if (!indexedField.normalized.includes(token)) continue;
      fieldScore += indexedField.weight;
      if (indexedField.normalized === token) fieldScore += indexedField.weight * 2;
      else if (indexedField.normalized.startsWith(token)) fieldScore += indexedField.weight;
    }
    score += fieldScore;
    if (fieldScore > bestFieldScore) {
      bestField = indexedField;
      bestFieldScore = fieldScore;
    }
  }
  const normalizedTitle = normalizeSearchText(entry.title);
  if (normalizedTitle === normalizedQuery) score += 120;
  else if (normalizedTitle.startsWith(normalizedQuery)) score += 50;
  else if (normalizedTitle.includes(normalizedQuery)) score += 25;
  return { score, bestField: bestField || entry.fields[0] };
}

export class SearchIndex {
  constructor({ defaultPrompts = [], loadOcrText = async () => '', snapshot = null, now = () => new Date().toISOString() } = {}) {
    this.defaultPrompts = defaultPrompts;
    this.loadOcrText = loadOcrText;
    this.snapshot = snapshot;
    this.ocrCache = new Map();
    this.now = now;
  }

  get status() {
    return healthySnapshot(this.snapshot)
      ? { healthy: true, version: this.snapshot.version, sourceRevision: this.snapshot.sourceRevision, entryCount: this.snapshot.entries.length, generatedAt: this.snapshot.generatedAt }
      : { healthy: false, version: SEARCH_INDEX_VERSION, sourceRevision: null, entryCount: 0, generatedAt: null };
  }

  async ensure({ state = {}, revision = null } = {}) {
    if (!healthySnapshot(this.snapshot)) return this.rebuild({ state, revision, reason: this.snapshot ? 'corrupt' : 'missing' });
    if (this.snapshot.sourceRevision === revision) return { rebuilt: false, synchronized: false, reason: 'current', ...this.status, changes: { added: 0, updated: 0, removed: 0, reused: this.snapshot.entries.length } };
    return this.synchronize({ state, revision });
  }

  async synchronize({ state = {}, revision = null } = {}) {
    const previous = healthySnapshot(this.snapshot) ? new Map(this.snapshot.entries.map(entry => [entry.key, entry])) : new Map();
    const nextEntries = await buildSearchEntries(state, {
      defaultPrompts: this.defaultPrompts,
      loadOcrText: this.loadOcrText,
      ocrCache: this.ocrCache
    });
    pruneOcrCache(this.ocrCache, state);
    const next = new Map();
    const changes = { added: 0, updated: 0, removed: 0, reused: 0 };
    for (const entry of nextEntries) {
      const existing = previous.get(entry.key);
      if (!existing) changes.added += 1;
      else if (existing.fingerprint !== entry.fingerprint) changes.updated += 1;
      else {
        changes.reused += 1;
        next.set(entry.key, existing);
        continue;
      }
      next.set(entry.key, entry);
    }
    for (const key of previous.keys()) if (!next.has(key)) changes.removed += 1;
    this.snapshot = {
      version: SEARCH_INDEX_VERSION,
      sourceRevision: revision,
      generatedAt: this.now(),
      entries: [...next.values()]
    };
    return { rebuilt: false, synchronized: true, reason: 'revision-changed', ...this.status, changes };
  }

  async rebuild({ state = {}, revision = null, reason = 'explicit' } = {}) {
    this.snapshot = null;
    this.ocrCache.clear();
    const entries = await buildSearchEntries(state, {
      defaultPrompts: this.defaultPrompts,
      loadOcrText: this.loadOcrText,
      ocrCache: this.ocrCache
    });
    pruneOcrCache(this.ocrCache, state);
    this.snapshot = {
      version: SEARCH_INDEX_VERSION,
      sourceRevision: revision,
      generatedAt: this.now(),
      entries
    };
    return { rebuilt: true, synchronized: true, reason, ...this.status, changes: { added: entries.length, updated: 0, removed: 0, reused: 0 } };
  }

  search(query, { limit = SEARCH_RESULT_LIMIT } = {}) {
    if (!healthySnapshot(this.snapshot)) return [];
    const normalizedQuery = normalizeSearchText(query).slice(0, 160);
    const tokens = [...new Set(normalizedQuery.split(' ').filter(token => token.length >= 2))];
    if (!tokens.length) return [];
    const safeLimit = Math.max(1, Math.min(30, Number(limit) || SEARCH_RESULT_LIMIT));
    return this.snapshot.entries
      .map(entry => ({ entry, rank: rankEntry(entry, tokens, normalizedQuery) }))
      .filter(item => item.rank)
      .sort((left, right) => right.rank.score - left.rank.score
        || ENTITY_ORDER[left.entry.entityType] - ENTITY_ORDER[right.entry.entityType]
        || left.entry.title.localeCompare(right.entry.title, 'pt-BR'))
      .slice(0, safeLimit)
      .map(({ entry, rank }) => ({
        entityType: entry.entityType,
        target: entry.target,
        id: entry.id,
        title: entry.title,
        context: entry.context,
        snippet: snippet(rank.bestField?.value || entry.context || entry.title, tokens),
        matchedField: rank.bestField?.label || 'Conteúdo',
        relevance: rank.score
      }));
  }
}
