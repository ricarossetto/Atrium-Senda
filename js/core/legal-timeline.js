const EVENT_ORDER = Object.freeze({
  publication: 1,
  movement: 2,
  deadline: 3,
  appointment: 4,
  task: 5,
  document: 6,
  financial: 7,
  audit: 8,
  process: 9
});

export function buildLegalTimeline(state, process, { limit = 120 } = {}) {
  if (!state || !process) return [];
  const processId = String(process.id || '');
  const processNumber = normalizeProcessNumber(process.number || process.protocol);
  const linked = record => Boolean(processId && String(record?.processId || '') === processId)
    || Boolean(processId && record?.ownerType === 'process' && String(record?.ownerId || '') === processId)
    || Boolean(processNumber && normalizeProcessNumber(record?.process || record?.processNumber) === processNumber);
  const events = [];
  const add = event => {
    if (!event?.title) return;
    events.push(Object.freeze({
      id: String(event.id || `${event.type}:${events.length}`),
      type: String(event.type || 'process'),
      date: String(event.date || ''),
      title: String(event.title),
      detail: String(event.detail || ''),
      source: String(event.source || ''),
      target: String(event.target || ''),
      entityId: String(event.entityId || '')
    }));
  };

  if (process.registeredAt || process.createdAt) add({
    id: `process:${processId}:registered`, type: 'process', date: process.registeredAt || process.createdAt,
    title: 'Processo cadastrado', detail: process.actionType || process.subject || '', source: process.source || 'Cadastro'
  });

  const movements = Array.isArray(process.movements) && process.movements.length
    ? process.movements
    : process.lastMovement ? [{ description: process.lastMovement, date: process.lastMovementAt }] : [];
  movements.forEach((movement, index) => add({
    id: `movement:${processId}:${movement.id || movement.eventNumber || movement.code || index}`,
    type: 'movement',
    date: movement.date || movement.at || movement.occurredAt || movement.createdAt,
    title: movement.description || movement.text || movement.name || 'Movimentação processual',
    detail: movement.complement || movement.detail || '',
    source: movement.source || process.source || 'Processo'
  }));

  (state.intimations || []).filter(linked).forEach(publication => add({
    id: `publication:${publication.id}`, type: 'publication', date: publication.publishedAt || publication.createdAt,
    title: publication.title || 'Publicação recebida',
    detail: treatmentLabel(publication.treatmentStatus), source: publication.source || publication.court || 'Publicação',
    target: 'publication', entityId: publication.id
  }));

  (state.tasks || []).filter(linked).forEach(task => {
    add({
      id: `task:${task.id}:created`, type: 'task', date: task.createdAt || task.updatedAt,
      title: task.title || 'Tarefa criada', detail: task.status || '', source: task.source || 'Tarefa',
      target: 'task', entityId: task.id
    });
    const deadline = task.fatalDeadline || task.deadline;
    if (deadline) add({
      id: `deadline:${task.id}`, type: 'deadline', date: deadline,
      title: task.fatalDeadline ? 'Prazo fatal confirmado' : 'Prazo informado',
      detail: task.title || '', source: 'Tarefa', target: 'task', entityId: task.id
    });
  });

  (state.agenda || []).filter(linked).forEach(appointment => add({
    id: `appointment:${appointment.id}`, type: 'appointment', date: appointment.date || appointment.createdAt,
    title: appointment.title || 'Compromisso agendado', detail: appointment.time || '',
    source: appointment.source || 'Agenda', target: 'agenda', entityId: appointment.id
  }));

  (state.documents || []).filter(linked).forEach(document => add({
    id: `document:${document.id}`, type: 'document', date: document.createdAt || document.updatedAt,
    title: document.name || document.fileName || document.title || 'Documento vinculado',
    detail: document.documentType || document.type || document.mimeType || '', source: document.source || 'Documentos',
    target: 'document', entityId: document.id
  }));

  (Array.isArray(process.expenses) ? process.expenses : []).forEach((expense, index) => add({
    id: `financial:${processId}:expense:${expense.id || index}`, type: 'financial', date: expense.date || expense.createdAt,
    title: expense.description || expense.title || 'Despesa processual', detail: financialAmount(expense.amount),
    source: 'Financeiro', target: 'financial', entityId: expense.id || processId
  }));
  if (hasFinancialData(process) && (process.financialUpdatedAt || process.feeUpdatedAt || process.requisitionUpdatedAt || process.createdAt || process.registeredAt)) add({
    id: `financial:${processId}:terms`, type: 'financial', date: process.financialUpdatedAt || process.feeUpdatedAt || process.requisitionUpdatedAt || process.createdAt || process.registeredAt,
    title: 'Dados financeiros registrados', detail: financialSummary(process), source: 'Financeiro',
    target: 'financial', entityId: processId
  });

  (state.audit || []).filter(entry => auditMatches(entry, processId, processNumber)).forEach(entry => add({
    id: `audit:${entry.id}`, type: 'audit', date: entry.at || entry.createdAt,
    title: entry.action || 'Registro de auditoria', detail: entry.actor || '', source: 'Auditoria'
  }));

  return events
    .sort((left, right) => eventTimestamp(right.date) - eventTimestamp(left.date)
      || (EVENT_ORDER[left.type] || 99) - (EVENT_ORDER[right.type] || 99)
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(Number(limit) || 120, 500)));
}

function normalizeProcessNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function eventTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function treatmentLabel(value) {
  return ({ untreated: 'Aguardando triagem', in_review: 'Em análise', treated: 'Tratada', discarded: 'Descartada' })[value || 'untreated'] || String(value || '');
}

function auditMatches(entry, processId, processNumber) {
  if (processId && String(entry?.processId || '') === processId) return true;
  return Boolean(processNumber && normalizeProcessNumber(entry?.detail).includes(processNumber));
}

function hasFinancialData(process) {
  return ['feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionStatus']
    .some(key => process[key] !== undefined && process[key] !== null && String(process[key]).trim() !== '' && process[key] !== 'none');
}

function financialSummary(process) {
  return [process.feeStatus, process.requisitionType, process.requisitionStatus].map(value => String(value || '').replaceAll('_', ' ').trim()).filter(Boolean).join(' · ');
}

function financialAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
}
