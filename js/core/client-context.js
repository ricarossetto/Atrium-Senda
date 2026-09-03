import { buildLegalTimeline } from './legal-timeline.js';
import { normalizeProcessNumber } from './client-reconciliation.js';

const TERMINAL_TASK_STATUSES = new Set(['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada']);

export function buildClientContext(state, contact, { timelineLimit = 80 } = {}) {
  if (!state || !contact?.id) return emptyContext();
  const contactId = String(contact.id);
  const registeredNumbers = new Set((contact.relatedProcessNumbers || []).map(normalizeProcessNumber).filter(Boolean));
  const processes = uniqueById((state.processes || []).filter(process => {
    if (String(process?.contactId || '') === contactId) return true;
    const number = normalizeProcessNumber(process?.number || process?.protocol);
    return Boolean(number && registeredNumbers.has(number));
  })).map(process => Object.freeze({
    ...process,
    contextRelationship: String(process.contactId || '') === contactId && contact.contactRole === 'cliente'
      ? 'canonical-client'
      : 'registered-contact'
  }));

  const processIds = new Set(processes.map(process => String(process.id || '')).filter(Boolean));
  const processNumbers = new Set(processes.map(process => normalizeProcessNumber(process.number || process.protocol)).filter(Boolean));
  const linked = record => isDirectContactRecord(record, contactId)
    || processIds.has(String(record?.processId || ''))
    || (record?.ownerType === 'process' && processIds.has(String(record.ownerId || '')))
    || processNumbers.has(normalizeProcessNumber(record?.process || record?.processNumber || record?.number));

  const tasks = uniqueById((state.tasks || []).filter(linked));
  const publications = uniqueById((state.intimations || []).filter(linked));
  const appointments = uniqueById([...(state.agenda || []), ...(state.events || [])].filter(linked));
  const documents = uniqueById((state.documents || []).filter(document => linked(document)
    || (document?.ownerType === 'contact' && String(document.ownerId || '') === contactId)));
  const financialRecords = uniqueById((state.financial || []).filter(linked));
  const financialProcesses = processes.filter(hasFinancialData);
  const timeline = processes.flatMap(process => buildLegalTimeline(state, process, { limit: timelineLimit }).map(event => Object.freeze({
    ...event,
    contextId: `${process.id || normalizeProcessNumber(process.number)}:${event.id}`,
    processId: String(process.id || ''),
    processNumber: String(process.number || process.protocol || '')
  })))
    .sort((left, right) => eventTimestamp(right.date) - eventTimestamp(left.date) || left.contextId.localeCompare(right.contextId))
    .slice(0, Math.max(1, Math.min(Number(timelineLimit) || 80, 300)));

  const openTasks = tasks.filter(task => !TERMINAL_TASK_STATUSES.has(String(task.status || '').toLowerCase()));
  const nextDeadline = openTasks.map(task => task.fatalDeadline || task.deadline).filter(Boolean).sort()[0] || '';

  return Object.freeze({
    contactId,
    role: String(contact.contactRole || ''),
    processes: Object.freeze(processes),
    tasks: Object.freeze(tasks),
    publications: Object.freeze(publications),
    appointments: Object.freeze(appointments),
    documents: Object.freeze(documents),
    financialRecords: Object.freeze(financialRecords),
    financialProcesses: Object.freeze(financialProcesses),
    timeline: Object.freeze(timeline),
    metrics: Object.freeze({
      processes: processes.length,
      openTasks: openTasks.length,
      publications: publications.length,
      appointments: appointments.length,
      documents: documents.length,
      financial: financialRecords.length + financialProcesses.length
    }),
    nextDeadline
  });
}

function isDirectContactRecord(record, contactId) {
  return [record?.contactId, record?.clientContactId].some(value => String(value || '') === contactId);
}

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record, index) => {
    if (!record) return false;
    const key = String(record.id || `${record.number || record.process || ''}:${record.title || record.name || ''}:${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasFinancialData(process) {
  return ['feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionStatus', 'expenses']
    .some(key => Array.isArray(process?.[key]) ? process[key].length > 0 : process?.[key] !== undefined && process[key] !== null && String(process[key]).trim() !== '' && process[key] !== 'none');
}

function eventTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function emptyContext() {
  return Object.freeze({
    contactId: '', role: '', processes: Object.freeze([]), tasks: Object.freeze([]), publications: Object.freeze([]),
    appointments: Object.freeze([]), documents: Object.freeze([]), financialRecords: Object.freeze([]),
    financialProcesses: Object.freeze([]), timeline: Object.freeze([]),
    metrics: Object.freeze({ processes: 0, openTasks: 0, publications: 0, appointments: 0, documents: 0, financial: 0 }),
    nextDeadline: ''
  });
}
