import { activeIntimations } from './publication-scope.js?v=3.4.0';

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

export function buildLegalTimeline(state, process, { limit = 120, order = 'desc' } = {}) {
  if (!state || !process) return [];
  const processId = String(process.id || '');
  const processNumber = normalizeProcessNumber(process.number || process.protocol);
  const linked = record => Boolean(processId && String(record?.processId || '') === processId)
    || Boolean(processId && record?.ownerType === 'process' && String(record?.ownerId || '') === processId)
    || Boolean(processNumber && normalizeProcessNumber(record?.process || record?.processNumber) === processNumber);
  const events = [];
  const sortMeta = new Map();
  const add = event => {
    if (!event?.title) return;
    const dateStr = firstValidDate(event.date);
    const id = String(event.id || `${event.type}:${events.length}`);
    const entry = Object.freeze({
      id,
      type: String(event.type || 'process'),
      date: dateStr,
      title: String(event.title),
      detail: String(event.detail || ''),
      source: compactSourceLabel(event.source),
      target: String(event.target || ''),
      entityId: String(event.entityId || ''),
      eventNumber: event.eventNumber != null && Number.isFinite(Number(event.eventNumber)) ? Number(event.eventNumber) : null
    });
    const time = Number.isFinite(event.sortTime) ? event.sortTime : eventTimestamp(dateStr);
    sortMeta.set(entry, {
      time,
      hasTime: Number.isFinite(time),
      evNum: entry.eventNumber,
      hasNum: entry.eventNumber != null,
      typeOrder: EVENT_ORDER[entry.type] || 99
    });
    events.push(entry);
  };

  if (process.registeredAt || process.createdAt) add({
    id: `process:${processId}:registered`, type: 'process', date: firstValidDate(process.registeredAt, process.createdAt),
    title: 'Processo cadastrado', detail: process.actionType || process.subject || '', source: process.source || 'Cadastro',
    eventNumber: 0
  });

  const movements = Array.isArray(process.movements) && process.movements.length
    ? process.movements
    : process.lastMovement ? [{ description: process.lastMovement, date: process.lastMovementAt }] : [];
  movements.forEach((movement, index) => {
    const evNum = extractEventNumber(movement.eventNumber)
      ?? extractEventNumber(movement.sequence)
      ?? extractEventNumber(movement.sequenceNumber)
      ?? extractEventNumber(movement.id)
      ?? extractLeadingEventNumber(movement.description)
      ?? extractLeadingEventNumber(movement.text)
      ?? null;
    const displayDate = firstValidDate(
      movement.date,
      movement.occurredAt,
      movement.at,
      movement.movementDate,
      movement.dateTime,
      movement.dataHora,
      movement.rawDate,
      movement.timestamp,
      movement.createdAt
    );
    add({
      id: `movement:${processId}:${movement.id || movement.eventNumber || movement.sequence || movement.code || index}`,
      type: 'movement',
      date: displayDate,
      sortTime: resolveMovementSortTime(displayDate, movement),
      title: movement.description || movement.text || movement.name || 'Movimentação processual',
      detail: movement.complement || movement.detail || '',
      source: movement.source || process.source || 'Processo',
      eventNumber: evNum
    });
  });

  activeIntimations(state.intimations || []).filter(linked).forEach(publication => {
    add({
      id: `publication:${publication.id}`, type: 'publication', date: publication.publishedAt || publication.createdAt,
      title: publication.title || 'Publicação recebida',
      detail: treatmentLabel(publication.treatmentStatus), source: publication.source || publication.court || 'Publicação',
      target: 'publication', entityId: publication.id
    });
    const treatmentAt = publication.treatedAt || publication.discardedAt || publication.treatmentStartedAt;
    if (treatmentAt && String(treatmentAt) !== String(publication.publishedAt || publication.createdAt || '')) add({
      id: `publication:${publication.id}:treatment:${publication.treatmentStatus || 'in_review'}`,
      type: 'publication', date: treatmentAt, title: publicationTreatmentTitle(publication.treatmentStatus),
      detail: publication.treatmentNote || '', source: 'Fluxo de publicações', target: 'publication', entityId: publication.id
    });
    (Array.isArray(publication.workNotes) ? publication.workNotes : []).forEach((note, index) => add({
      id: `publication:${publication.id}:note:${note.id || index}`, type: 'publication', date: note.createdAt,
      title: 'Nota interna registrada', detail: note.text || '', source: note.source || 'Publicação',
      target: 'publication', entityId: publication.id
    }));
  });

  (state.tasks || []).filter(task => task && task.active !== false && !task.absorbedInto).filter(linked).forEach(task => {
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
    (Array.isArray(task.history) ? task.history : []).forEach((entry, index) => add({
      id: `task:${task.id}:history:${entry.id || index}`, type: 'task', date: entry.at || entry.createdAt,
      title: entry.action || 'Tarefa atualizada', detail: entry.actor || '', source: 'Histórico da tarefa',
      target: 'task', entityId: task.id
    }));
    if (task.completedAt) add({
      id: `task:${task.id}:completed`, type: 'task', date: task.completedAt,
      title: 'Tarefa concluída', detail: task.completedBy || task.responsible || '', source: 'Tarefa',
      target: 'task', entityId: task.id
    });
  });

  (state.agenda || []).filter(linked).forEach(appointment => add({
    id: `appointment:${appointment.id}`, type: 'appointment', date: appointment.date || appointment.createdAt,
    title: appointment.title || 'Compromisso agendado', detail: appointment.time || '',
    source: appointment.source || 'Agenda', target: 'agenda', entityId: appointment.id
  }));

  (state.documents || []).filter(linked).forEach(document => {
    const evNum = extractEventNumber(document.name) ?? extractEventNumber(document.metadata?.event) ?? null;
    add({
      id: `document:${document.id}`, type: 'document', date: document.createdAt || document.updatedAt,
      title: document.name || document.fileName || document.title || 'Documento vinculado',
      detail: document.documentType || document.type || document.mimeType || '', source: document.source || 'Documentos',
      target: 'document', entityId: document.id,
      eventNumber: evNum
    });
  });

  (Array.isArray(process.expenses) ? process.expenses : []).forEach((expense, index) => add({
    id: `financial:${processId}:expense:${expense.id || index}`, type: 'financial', date: expense.date || expense.createdAt,
    title: expense.description || expense.title || 'Despesa processual', detail: financialAmount(expense.amount),
    source: 'Financeiro', target: 'financial', entityId: expense.id || processId
  }));
  (Array.isArray(process.feeInstallments) ? process.feeInstallments : []).forEach((installment, index) => add({
    id: `financial:${processId}:installment:${installment.id || index}`, type: 'financial', date: installment.dueDate || installment.createdAt,
    title: installment.description || 'Parcela de honorários', detail: [financialAmount(installment.amount), financialStatus(installment.status)].filter(Boolean).join(' · '),
    source: 'Financeiro', target: 'financial', entityId: installment.id || processId
  }));
  (Array.isArray(process.receipts) ? process.receipts : []).forEach((receipt, index) => add({
    id: `financial:${processId}:receipt:${receipt.id || index}`, type: 'financial', date: receipt.date || receipt.createdAt,
    title: receipt.description || 'Recebimento de honorários', detail: [financialAmount(receipt.amount), financialStatus(receipt.status || 'recebido')].filter(Boolean).join(' · '),
    source: 'Financeiro', target: 'financial', entityId: receipt.id || processId
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

  const maxItems = Math.max(1, Math.min(Number(limit) || 120, 500));

  if (order === 'autos' || order === 'asc') {
    return events
      .sort((left, right) => {
        const a = sortMeta.get(left);
        const b = sortMeta.get(right);
        const aInit = order === 'autos' && a.evNum === 0 ? 0 : 1;
        const bInit = order === 'autos' && b.evNum === 0 ? 0 : 1;
        if (aInit !== bInit) return aInit - bInit;
        if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
        if (a.hasTime && a.time !== b.time) return a.time - b.time;
        if (a.hasNum !== b.hasNum) return a.hasNum ? -1 : 1;
        if (a.hasNum && a.evNum !== b.evNum) return a.evNum - b.evNum;
        if (a.typeOrder !== b.typeOrder) return a.typeOrder - b.typeOrder;
        return left.id.localeCompare(right.id);
      })
      .slice(0, maxItems);
  }

  return events
    .sort((left, right) => {
      const a = sortMeta.get(left);
      const b = sortMeta.get(right);
      // Ordem decrescente estrita: mais recente primeiro, mais antigo por último;
      // itens sem data ficam sempre ao final (ordenados por nº de evento decrescente).
      if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
      if (a.hasTime) {
        if (a.time !== b.time) return b.time - a.time;
        if (a.typeOrder !== b.typeOrder) return a.typeOrder - b.typeOrder;
        if (a.hasNum !== b.hasNum) return a.hasNum ? -1 : 1;
        if (a.hasNum && a.evNum !== b.evNum) return b.evNum - a.evNum;
        return left.id.localeCompare(right.id);
      }
      if (a.hasNum !== b.hasNum) return a.hasNum ? -1 : 1;
      if (a.hasNum && a.evNum !== b.evNum) return b.evNum - a.evNum;
      if (a.typeOrder !== b.typeOrder) return a.typeOrder - b.typeOrder;
      return left.id.localeCompare(right.id);
    })
    .slice(0, maxItems);
}

export function extractEventNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim();
  const match = str.match(/(?:evento|ev\.?)\s*#?(\d{1,6})/i) || str.match(/^(\d{1,6})\s*[-_.]/);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractLeadingEventNumber(value) {
  if (value == null) return null;
  const str = String(value).trim();
  const match = str.match(/^(?:evento|ev\.?)\s*#?(\d{1,6})\b/i);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeProcessNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildLocalTimestamp(year, month, day, hours = 12, minutes = 0, seconds = 0) {
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return -Infinity;
  }
  return date.getTime();
}

function eventTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '—' || raw === '-') return -Infinity;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return buildLocalTimestamp(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }
  const sqlDate = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (sqlDate) {
    return buildLocalTimestamp(
      Number(sqlDate[1]), Number(sqlDate[2]), Number(sqlDate[3]),
      Number(sqlDate[4]), Number(sqlDate[5]), Number(sqlDate[6] || 0)
    );
  }
  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})(?:[\sT]+(?:às\s+)?(\d{2}):(\d{2})(?::(\d{2}))?)?$/i.exec(raw);
  if (brDate) {
    return buildLocalTimestamp(
      Number(brDate[3]), Number(brDate[2]), Number(brDate[1]),
      brDate[4] != null ? Number(brDate[4]) : 12,
      brDate[5] != null ? Number(brDate[5]) : 0,
      brDate[6] != null ? Number(brDate[6]) : 0
    );
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function firstValidDate(...candidates) {
  let fallback = '';
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (!raw || raw === '—' || raw === '-') continue;
    if (Number.isFinite(eventTimestamp(raw))) return raw;
    if (!fallback) fallback = raw;
  }
  return fallback;
}

function resolveMovementSortTime(displayDate, movement) {
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(displayDate);
  if (isoDay) {
    const timed = String(movement?.occurredAt || movement?.dateTime || movement?.dataHora || movement?.at || '').trim();
    const sameDayTime = /^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timed);
    if (sameDayTime && sameDayTime[1] === isoDay[1] && sameDayTime[2] === isoDay[2] && sameDayTime[3] === isoDay[3]) {
      return buildLocalTimestamp(
        Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]),
        Number(sameDayTime[4]), Number(sameDayTime[5]), Number(sameDayTime[6] || 0)
      );
    }
  }
  return eventTimestamp(displayDate);
}

function treatmentLabel(value) {
  return ({ untreated: 'Aguardando triagem', in_review: 'Em análise', treated: 'Tratada', discarded: 'Descartada' })[value || 'untreated'] || String(value || '');
}

function publicationTreatmentTitle(value) {
  return ({ in_review: 'Análise da publicação iniciada', treated: 'Publicação tratada', discarded: 'Publicação descartada' })[value] || 'Tratamento da publicação atualizado';
}

function auditMatches(entry, processId, processNumber) {
  if (processId && String(entry?.processId || '') === processId) return true;
  return Boolean(processNumber && processNumber.length >= 10 && normalizeProcessNumber(entry?.detail).includes(processNumber));
}

function hasFinancialData(process) {
  return ['feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionStatus', 'feeInstallments', 'receipts']
    .some(key => Array.isArray(process[key]) ? process[key].length > 0 : process[key] !== undefined && process[key] !== null && String(process[key]).trim() !== '' && process[key] !== 'none');
}

function financialSummary(process) {
  return [process.feeStatus, process.requisitionType, process.requisitionStatus].map(value => String(value || '').replaceAll('_', ' ').trim()).filter(Boolean).join(' · ');
}

function financialAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
}

function financialStatus(value) {
  return String(value || '').replaceAll('_', ' ').trim();
}

// Identificadores internos de portal ("eproc-trf4-eproc-2g") viram rótulo legível ("eproc TRF4 · 2º grau").
function readablePortalSource(source) {
  const match = /^(eproc|pje)-([a-z0-9]+)(?:-(?:eproc|pje))?(?:-([0-9])g)?$/i.exec(source);
  if (!match) return source;
  const [, system, court, degree] = match;
  return `${system.toLowerCase() === 'pje' ? 'PJe' : 'eproc'} ${court.toUpperCase()}${degree ? ` · ${degree}º grau` : ''}`;
}

export function compactSourceLabel(value) {
  const unique = new Map();
  for (const source of String(value || '').split(' + ').map(item => readablePortalSource(item.trim())).filter(Boolean)) {
    const key = source.toLocaleLowerCase('pt-BR');
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].join(' + ');
}
