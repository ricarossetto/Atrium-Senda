const DAY_MS = 86_400_000;
const TERMINAL_STATUSES = new Set(['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada', 'descartada']);
const SOURCE_PROBLEMS = new Set(['error', 'erro', 'attention', 'atencao', 'unavailable', 'indisponivel', 'stale']);

export const ACTIVITY_PRIORITY = Object.freeze({ CRITICAL: 3, ATTENTION: 2, ROUTINE: 1 });

export function buildActivityInbox(state = {}, { now = new Date(), maxItems = 80 } = {}) {
  const today = startOfDay(now);
  const horizon = today + (7 * DAY_MS);
  const processById = new Map((state.processes || []).map(item => [String(item?.id || ''), item]));
  const processByNumber = new Map((state.processes || []).map(item => [digits(item?.number), item]).filter(([key]) => key));
  const acknowledgements = state.settings?.activityInboxAcknowledged || {};
  const items = [];

  for (const publication of state.intimations || []) {
    if (!publication?.id || isTreatedPublication(publication)) continue;
    const process = linkedProcess(publication, processById, processByNumber);
    const unread = publication.unread !== false;
    items.push(activity({
      key: `publication:${publication.id}`, type: 'publication', priority: unread ? 2 : 1,
      title: unread ? 'Nova publicação aguardando triagem' : 'Publicação ainda não tratada',
      context: join(publication.title, publication.process || process?.number, publication.client || process?.client),
      origin: publication.source || publication.court || 'Publicações', date: publication.publishedAt || publication.createdAt,
      entityType: 'intimation', entityId: publication.id, processId: process?.id,
      processNumber: publication.process || process?.number, actionLabel: 'Revisar publicação', target: 'intimation'
    }));
  }

  for (const task of state.tasks || []) {
    if (!task?.id || TERMINAL_STATUSES.has(normalized(task.status))) continue;
    const due = parseDate(task.fatalDeadline || task.deadline);
    if (!due || due > horizon) continue;
    const process = linkedProcess(task, processById, processByNumber);
    const overdue = due < today;
    items.push(activity({
      key: `task:${task.id}`, type: overdue ? 'overdue-task' : 'upcoming-task', priority: overdue ? 3 : 2,
      title: overdue ? 'Tarefa com data cadastrada vencida' : 'Tarefa com data próxima',
      context: join(task.title, task.process || process?.number, task.client || process?.client),
      origin: task.intimationId || task.sourceIntimationId ? 'Publicação vinculada' : 'Tarefas',
      date: task.fatalDeadline || task.deadline, entityType: 'task', entityId: task.id, processId: process?.id,
      processNumber: task.process || process?.number, actionLabel: 'Abrir tarefa', target: 'task'
    }));
  }

  for (const appointment of state.agenda || []) {
    if (!appointment?.id || TERMINAL_STATUSES.has(normalized(appointment.status))) continue;
    const date = parseDate(appointment.date || appointment.startAt);
    if (!date || date < today || date > horizon) continue;
    const process = linkedProcess(appointment, processById, processByNumber);
    items.push(activity({
      key: `agenda:${appointment.id}`, type: 'appointment', priority: 1, title: 'Compromisso nos próximos 7 dias',
      context: join(appointment.title, appointment.process || process?.number, appointment.client || process?.client),
      origin: appointment.source || 'Agenda', date: appointment.date || appointment.startAt,
      entityType: 'agenda', entityId: appointment.id, processId: process?.id,
      processNumber: appointment.process || process?.number, actionLabel: 'Abrir compromisso', target: 'agenda'
    }));
  }

  for (const document of state.documents || []) {
    if (!document?.id || document.deletedAt || !needsDocumentReview(document)) continue;
    const process = document.ownerType === 'process' ? processById.get(String(document.ownerId || '')) : null;
    items.push(activity({
      key: `document:${document.id}`, type: 'document-review', priority: 1, title: 'Documento pendente de classificação',
      context: join(document.name || document.originalName, process?.number, process?.client),
      origin: document.source || 'Documentos', date: document.createdAt || document.updatedAt || document.documentDate,
      entityType: 'document', entityId: document.id, processId: process?.id, processNumber: process?.number,
      actionLabel: 'Revisar documento', target: 'document'
    }));
  }

  for (const suggestion of reconciliationSuggestions(state)) {
    if (!suggestion?.id || ['dismissed', 'accepted'].includes(suggestion.status)) continue;
    const process = processById.get(String(suggestion.processId || '')) || processByNumber.get(digits(suggestion.processNumber));
    items.push(activity({
      key: `reconciliation:${suggestion.id}`, type: 'reconciliation', priority: 1,
      title: 'Sugestão de vínculo aguarda confirmação humana',
      context: join(process?.number || suggestion.processNumber, suggestion.clientName, confidenceLabel(suggestion.confidence)),
      origin: suggestion.source || 'Reconciliação', date: suggestion.createdAt || suggestion.updatedAt,
      entityType: 'process', entityId: process?.id || suggestion.processId, processId: process?.id,
      processNumber: process?.number || suggestion.processNumber, actionLabel: 'Revisar processo', target: 'process'
    }));
  }

  for (const process of state.processes || []) {
    const collector = process?.tjrsCollector;
    const diff = collector?.diff;
    if (!process?.id || collector?.status !== 'AVAILABLE' || !diff?.hasChanges) continue;
    const total = Number(diff.newMovements || 0) + Number(diff.changedMovements || 0);
    if (total <= 0 && Number(diff.possiblyMissingMovements || 0) <= 0) continue;
    const signature = collector.payloadHash || diff.currentSnapshotTimestamp || collector.syncedAt;
    const item = activity({
      key: `collector:${process.id}`, type: 'judicial-event', priority: 2,
      title: total > 0 ? `${total} alteração${total === 1 ? '' : 'ões'} judicial${total === 1 ? '' : 'is'} detectada${total === 1 ? '' : 's'}` : 'Movimentação possivelmente ausente no snapshot atual',
      context: join(process.number, process.client, process.lastMovement), origin: 'Coletor TJRS local',
      date: collector.syncedAt || diff.currentSnapshotTimestamp, entityType: 'process', entityId: process.id,
      processId: process.id, processNumber: process.number, actionLabel: 'Abrir processo', target: 'process',
      acknowledgeable: true, signature
    });
    if (!isAcknowledged(item, acknowledgements)) items.push(item);
  }

  for (const source of state.sources || []) {
    if (!source?.id || !SOURCE_PROBLEMS.has(normalized(source.status))) continue;
    const signature = `${normalized(source.status)}:${String(source.lastCheck || '')}`;
    const item = activity({
      key: `source:${source.id}`, type: 'sync-problem', priority: normalized(source.status) === 'error' ? 2 : 1,
      title: 'Fonte requer verificação', context: join(source.name, source.detail), origin: source.method || 'Integrações',
      date: source.lastCheck, entityType: 'source', entityId: source.id, actionLabel: 'Ver fonte', target: 'source',
      acknowledgeable: true, signature
    });
    if (!isAcknowledged(item, acknowledgements)) items.push(item);
  }

  const unique = new Map();
  for (const item of items) if (item?.key && !unique.has(item.key)) unique.set(item.key, item);
  return [...unique.values()]
    .sort((left, right) => right.priority - left.priority || sortableDate(left.date) - sortableDate(right.date) || left.key.localeCompare(right.key))
    .slice(0, Math.max(1, Math.min(Number(maxItems) || 80, 250)));
}

export function acknowledgeActivity(state, item) {
  if (!item?.acknowledgeable || !item.key || !item.signature) return false;
  state.settings ||= {};
  const current = state.settings.activityInboxAcknowledged;
  state.settings.activityInboxAcknowledged = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  if (state.settings.activityInboxAcknowledged[item.key] === item.signature) return false;
  state.settings.activityInboxAcknowledged[item.key] = item.signature;
  const keys = Object.keys(state.settings.activityInboxAcknowledged);
  for (const staleKey of keys.slice(0, Math.max(0, keys.length - 500))) delete state.settings.activityInboxAcknowledged[staleKey];
  return true;
}

function activity(value) {
  return Object.freeze({ ...value, origin: value.origin || 'ATRIUM', context: value.context || 'Sem contexto adicional', date: value.date || '', acknowledgeable: Boolean(value.acknowledgeable), signature: String(value.signature || '') });
}
function linkedProcess(record, byId, byNumber) {
  if (record?.processId && byId.has(String(record.processId))) return byId.get(String(record.processId));
  return byNumber.get(digits(record?.process)) || null;
}
function isTreatedPublication(item) { return ['treated', 'tratada', 'discarded', 'descartada'].includes(normalized(item?.treatmentStatus)); }
function needsDocumentReview(item) {
  const classification = normalized(item.classificationStatus || item.reviewStatus);
  return classification === 'pending' || classification === 'pendente' || !String(item.documentType || '').trim();
}
function reconciliationSuggestions(state) {
  if (Array.isArray(state.clientReconciliationSuggestions)) return state.clientReconciliationSuggestions;
  if (Array.isArray(state.settings?.clientReconciliationSuggestions)) return state.settings.clientReconciliationSuggestions;
  return [];
}
function isAcknowledged(item, acknowledgements) { return Boolean(item.signature && acknowledgements?.[item.key] === item.signature); }
function confidenceLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `Confiança informada: ${Math.round(number * 100)}%` : '';
}
function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function join(...values) { return [...new Set(values.map(value => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' · '); }
function startOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const local = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (local) return new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3])).getTime();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? startOfDay(new Date(parsed)) : null;
}
function sortableDate(value) { return parseDate(value) ?? Number.MAX_SAFE_INTEGER; }
