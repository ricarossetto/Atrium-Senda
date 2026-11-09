import { createHash } from 'node:crypto';
import { computeProductivityReport } from '../../js/core/task-performance.js';
import { cleanCnj, isValidCnj } from '../../js/core/cnj.js';
import { saoPauloDateOnly } from '../publications/publication-funnel-weekly.mjs';
import { suggestTaskAssignments } from '../tasks/task-insights.mjs';

const DAY = 86_400_000;
const TERMINAL = new Set(['concluida', 'cancelada']);
const TREATMENTS = new Set(['untreated', 'in_review', 'treated', 'discarded']);
const PRIORITY_POINTS = Object.freeze({ urgente: 20, importante: 10, normal: 0 });
const text = value => typeof value === 'string' ? value.trim() : '';
const present = value => value !== undefined && value !== null && value !== '';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const ratio = (numerator, denominator) => ({ value: denominator ? numerator / denominator : null, numerator, denominator });
const ids = rows => rows.map(row => row.id).sort(compare);

function timestamp(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) return null;
  const day = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  if (raw.length > 10 && (Number(raw.slice(11, 13)) > 23 || Number(raw.slice(14, 16)) > 59 || Number(raw.slice(17, 19)) > 59)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function civilDay(ctx, instant) {
  if (ctx.timeZone === 'America/Sao_Paulo') return saoPauloDateOnly(new Date(instant).toISOString());
  const parts = Object.fromEntries(ctx.formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDay(day, offset) {
  return new Date(timestamp(day) + offset * DAY).toISOString().slice(0, 10);
}

function midnight(ctx, day) {
  const target = timestamp(day);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(ctx.formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const local = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const adjustment = target - local;
    if (adjustment === 0) return instant;
    instant += adjustment;
  }
  return null;
}

function dateValue(ctx, value, endOfDay = false) {
  const parsed = timestamp(value);
  if (parsed === null) return null;
  if (text(value).length !== 10) return parsed;
  const start = midnight(ctx, endOfDay ? shiftDay(value, 1) : value);
  return start === null ? null : start - (endOfDay ? 1 : 0);
}

function issue(ctx, collection, record, field, reason) {
  const entry = { collection, id: record.id ?? null, field, reason };
  if (!ctx.coverage.issues.some(item => item.collection === collection && item.id === entry.id && item.field === field && item.reason === reason)) ctx.coverage.issues.push(entry);
}

function coverage(ctx) {
  ctx.coverage.status = ctx.coverage.issues.length || ctx.coverage.excluded.length ? 'insufficient_data' : 'observed_data';
  return ctx.coverage;
}

function context(state, options) {
  if (!object(state) || !object(options)) throw new TypeError('É necessário informar estado e opções válidos.');
  const timeZone = options.timeZone ?? 'America/Sao_Paulo';
  if (!text(timeZone)) throw new TypeError('Informe um fuso IANA válido.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const ctx = { state, timeZone, formatter, coverage: { issues: [], excluded: [], outsideWindow: 0 } };
  const now = dateValue(ctx, options.evaluatedAt ?? state.evaluatedAt);
  if (now === null) throw new TypeError('Informe evaluatedAt confiável em formato ISO com fuso ou data civil.');
  const windowDays = options.windowDays ?? 90;
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90) throw new RangeError('A janela deve ter entre 1 e 90 dias.');
  Object.assign(ctx, { now, evaluatedAt: new Date(now).toISOString(), today: civilDay(ctx, now), windowDays });
  ctx.start = midnight(ctx, shiftDay(ctx.today, 1 - windowDays));
  ctx.duplicatePublicationIds = new Set();
  for (const name of ['tasks', 'intimations', 'processes']) {
    const source = state[name];
    if (!Array.isArray(source)) issue(ctx, name, {}, null, 'missing_or_invalid_collection');
    const counts = new Map();
    for (const record of Array.isArray(source) ? source : []) {
      const id = text(record?.id);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    ctx[name] = [];
    for (const [index, record] of (Array.isArray(source) ? source : []).entries()) {
      const id = text(record?.id);
      if (!object(record) || !id || counts.get(id) > 1) {
        ctx.coverage.excluded.push({ collection: name, id: id || null, index, reason: !object(record) ? 'invalid_record' : !id ? 'missing_id' : 'duplicate_id' });
        if (name === 'intimations' && id && counts.get(id) > 1) ctx.duplicatePublicationIds.add(id);
        continue;
      }
      ctx[name].push(record);
    }
    ctx[name].sort((left, right) => compare(left.id, right.id));
  }
  return ctx;
}

function provenance(ctx, fields) {
  return { source: 'canonical_workspace_state', engine: 'backend_local_deterministic', externalModelUsed: false, evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, dateSemantics: { civil: 'office_calendar_inclusive', instant: 'explicit_offset_exact', detailWindow: 'today_and_previous_89_days_default', duration: 'elapsed_instants' }, fields };
}

function readDate(ctx, record, field, collection, required = false) {
  const raw = record[field];
  if (!present(raw) || text(raw) === '' && typeof raw === 'string') {
    if (required) issue(ctx, collection, record, field, 'missing_date');
    return null;
  }
  if (typeof raw !== 'string') {
    issue(ctx, collection, record, field, 'invalid_type');
    return null;
  }
  const value = dateValue(ctx, text(raw));
  if (value === null) issue(ctx, collection, record, field, 'invalid_date');
  return value;
}

function occurred(ctx, record, field, collection) {
  const value = readDate(ctx, record, field, collection, true);
  if (value !== null && value > ctx.now) {
    issue(ctx, collection, record, field, 'future_date');
    return null;
  }
  return value;
}

function openTasks(ctx) {
  return ctx.tasks.filter(task => {
    if (task.active === false || task.absorbedInto || TERMINAL.has(text(task.status))) return false;
    const created = occurred(ctx, task, 'createdAt', 'tasks');
    if (created === null && dateValue(ctx, task.createdAt) > ctx.now) return false;
    if (present(task.completedAt)) {
      issue(ctx, 'tasks', task, 'completedAt', 'completion_status_conflict');
      return false;
    }
    return true;
  });
}

function dateReading(ctx, record, collection) {
  let deadlineAt = readDate(ctx, record, 'deadline', collection);
  const fatalAt = record.fatalDeadline === true || record.fatalDeadline === false ? null : readDate(ctx, record, 'fatalDeadline', collection);
  const sourceAt = readDate(ctx, record, 'sourceReportedDeadlineAt', collection);
  if (record.fatalDeadline !== true && text(record.deadlineSource) === 'domicilio' && present(record.deadline) && record.deadline === record.sourceReportedDeadlineAt) {
    issue(ctx, collection, record, 'deadline', 'source_reference_not_operational');
    deadlineAt = null;
  }
  if (record.fatalDeadline === true && deadlineAt === null) issue(ctx, collection, record, 'fatalDeadline', 'fatal_without_valid_date');
  const field = fatalAt !== null ? 'fatalDeadline' : 'deadline';
  const at = fatalAt ?? deadlineAt;
  const value = at === null ? null : text(record[field]);
  return {
    deadline: value,
    fatal: fatalAt !== null || record.fatalDeadline === true && deadlineAt !== null,
    daysUntil: at === null ? null : (timestamp(civilDay(ctx, at)) - timestamp(ctx.today)) / DAY,
    overdue: at === null ? null : (value.length === 10 ? dateValue(ctx, value, true) : at) < ctx.now,
    dateReference: at === null ? null : { value, field, source: text(record.deadlineSource) || 'human_or_legacy', evidenceId: record.id },
    sourceReference: present(record.sourceReportedDeadlineAt) ? { value: text(record.sourceReportedDeadlineAt) || null, field: 'sourceReportedDeadlineAt', source: text(record.sourceReportedDeadlineSource) || text(record.source) || 'unknown', evidenceId: record.id, valid: sourceAt !== null, operational: false } : null
  };
}

function processLink(ctx, record) {
  const direct = text(record.processId);
  const number = text(record.process || record.processNumber || record.number);
  if (direct) {
    const matches = ctx.processes.filter(process => process.id === direct);
    return { processId: matches.length === 1 ? direct : null, reference: direct, reason: matches.length === 1 ? 'exact_process_id' : 'missing_process_id' };
  }
  if (!number) return { processId: null, reference: null, reason: 'missing_process_reference' };
  if (!isValidCnj(number)) return { processId: null, reference: number, reason: 'invalid_cnj' };
  const matches = ctx.processes.filter(process => isValidCnj(process.number) && cleanCnj(process.number) === cleanCnj(number));
  return { processId: matches.length === 1 ? matches[0].id : null, reference: number, reason: matches.length === 1 ? 'unique_valid_cnj' : matches.length ? 'ambiguous_cnj' : 'missing_cnj' };
}

function resolvePublication(ctx, reference) {
  const pending = [{ reference: text(reference), visited: new Set() }];
  const destinations = new Map();
  let failure = null;
  while (pending.length) {
    const node = pending.pop();
    if (!node.reference || node.visited.has(node.reference)) { failure = 'missing_or_cyclic_alias'; continue; }
    if (ctx.duplicatePublicationIds.has(node.reference)) { failure = 'ambiguous_publication_reference'; continue; }
    const direct = ctx.intimations.filter(row => row.id === node.reference);
    const candidates = direct.length ? direct : ctx.intimations.filter(row => text(row.externalId) === node.reference);
    if (!candidates.length) { failure = 'missing_or_cyclic_alias'; continue; }
    const visited = new Set([...node.visited, node.reference]);
    for (const record of candidates) {
      if (present(record.mergedInto)) pending.push({ reference: text(record.mergedInto), visited });
      else destinations.set(record.id, record);
    }
  }
  const reason = failure || (destinations.size > 1 ? 'ambiguous_publication_reference' : 'resolved');
  return { record: reason === 'resolved' ? [...destinations.values()][0] : null, reason };
}

function publicationLinks(ctx, task) {
  return ['intimationId', 'sourceIntimationId', 'publicationId'].filter(field => present(task[field])).map(field => {
    const reference = text(task[field]);
    const resolved = resolvePublication(ctx, reference);
    if (!resolved.record) issue(ctx, 'tasks', task, field, resolved.reason);
    return { field, reference, publicationId: resolved.record?.id || null, reason: resolved.reason };
  });
}

function linkedTasks(ctx, publication, tasks) {
  const references = [publication.taskId, ...(Array.isArray(publication.linkedTaskIds) ? publication.linkedTaskIds : [])].map(text).filter(Boolean);
  const linked = tasks.filter(task => {
    const links = publicationLinks(ctx, task);
    const destinations = new Set(links.map(link => link.publicationId));
    if (links.length && (destinations.size !== 1 || destinations.has(null))) return false;
    if (references.includes(task.id) && links.length && !destinations.has(publication.id)) {
      issue(ctx, 'intimations', publication, 'linkedTaskIds', 'conflicting_publication_link');
      return false;
    }
    if (references.includes(task.id) && !links.length) {
      const owners = ctx.intimations.filter(row => !present(row.mergedInto)
        && [row.taskId, ...(Array.isArray(row.linkedTaskIds) ? row.linkedTaskIds : [])].includes(task.id));
      if (owners.length !== 1) {
        issue(ctx, 'intimations', publication, 'linkedTaskIds', 'ambiguous_act_task_reference');
        return false;
      }
    }
    return references.includes(task.id) || destinations.has(publication.id);
  });
  return { taskIds: ids(linked), missingTaskIds: references.filter(id => !ctx.tasks.some(task => task.id === id)).sort(compare), process: processLink(ctx, publication) };
}

function pendingPublications(ctx) {
  return ctx.intimations.filter(publication => {
    if (present(publication.mergedInto)) {
      const resolved = resolvePublication(ctx, publication.id);
      if (!resolved.record) issue(ctx, 'intimations', publication, 'mergedInto', resolved.reason);
      return false;
    }
    const status = text(publication.treatmentStatus) || 'untreated';
    if (!TREATMENTS.has(status)) issue(ctx, 'intimations', publication, 'treatmentStatus', 'unknown_status');
    if (!['untreated', 'in_review'].includes(status)) return false;
    const field = present(publication.publishedAt) ? 'publishedAt' : 'disponibilizadoEm';
    const at = readDate(ctx, publication, field, 'intimations', true);
    if (at !== null && at > ctx.now) { issue(ctx, 'intimations', publication, field, 'future_date'); return false; }
    return true;
  });
}

export function analyzePendingPublications(state, options = {}) {
  const ctx = context(state, options);
  const tasks = openTasks(ctx);
  const pending = pendingPublications(ctx);
  const details = [];
  for (const publication of pending) {
    const field = present(publication.publishedAt) ? 'publishedAt' : 'disponibilizadoEm';
    const at = occurred(ctx, publication, field, 'intimations');
    if (at === null) continue;
    if (at < ctx.start) { ctx.coverage.outsideWindow += 1; continue; }
    const links = linkedTasks(ctx, publication, tasks);
    details.push({ publicationId: publication.id, treatmentStatus: text(publication.treatmentStatus) || 'untreated', ageDays: (timestamp(ctx.today) - timestamp(civilDay(ctx, at))) / DAY, ...links, ...dateReading(ctx, publication, 'intimations'), evidenceIds: [publication.id, ...links.taskIds], confidence: null });
  }
  details.sort((left, right) => right.ageDays - left.ageDays || compare(left.publicationId, right.publicationId));
  return { evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, windowDays: ctx.windowDays, pendingCount: pending.length, details, evidenceIds: ids(pending), coverage: coverage(ctx), confidence: null, provenance: provenance(ctx, ['intimations.treatmentStatus', 'intimations.publishedAt', 'intimations.disponibilizadoEm', 'tasks.intimationId']) };
}

export function prioritizeTasks(state, options = {}) {
  const ctx = context(state, options);
  const rows = openTasks(ctx).map(task => {
    const date = dateReading(ctx, task, 'tasks');
    const urgencyComponents = {
      overdue: date.overdue === true ? 40 : 0,
      dueSoon: date.overdue === false && date.daysUntil <= 7 ? 20 : 0,
      fatal: date.fatal ? 30 : 0,
      priority: Object.hasOwn(PRIORITY_POINTS, text(task.priority)) ? PRIORITY_POINTS[text(task.priority)] : 0,
      unassigned: text(task.responsible) ? 0 : 5
    };
    return { taskId: task.id, score: Object.values(urgencyComponents).reduce((total, value) => total + value, 0), urgencyComponents, scorePolicy: { kind: 'operational_only', weights: { overdue: 40, dueSoonWithin7Days: 20, fatalExplicit: 30, urgente: 20, importante: 10, unassigned: 5 }, tieBreak: 'deadline_ascending_then_task_id', dailyTimeZone: ctx.timeZone }, ...date, process: processLink(ctx, task), publicationLinks: publicationLinks(ctx, task), responsible: text(task.responsible) || null, evidenceIds: [task.id], confidence: null, provenance: provenance(ctx, ['tasks.deadline', 'tasks.fatalDeadline', 'tasks.priority', 'tasks.responsible']), coverage: ctx.coverage };
  });
  coverage(ctx);
  return rows.sort((left, right) => right.score - left.score || compare(dateValue(ctx, left.deadline) ?? Infinity, dateValue(ctx, right.deadline) ?? Infinity) || compare(left.taskId, right.taskId));
}

function reportRange(ctx, period) {
  const start = period.dateFrom === undefined ? ctx.start : dateValue(ctx, period.dateFrom);
  const endValue = period.dateTo === undefined ? ctx.now : dateValue(ctx, period.dateTo, true);
  const civilEnd = text(period.dateTo).length === 10 && timestamp(period.dateTo) !== null;
  const end = civilEnd && text(period.dateTo) === ctx.today ? Math.min(endValue, ctx.now) : endValue;
  const earliest = midnight(ctx, shiftDay(ctx.today, -89));
  if (start === null || end === null || start < earliest || start > end || end > ctx.now) throw new RangeError('Período inválido: dentro dos últimos 90 dias civis, sem datas futuras.');
  return { start, end };
}

function numeric(ctx, record, field, collection) {
  const value = record[field];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  issue(ctx, collection, record, field, present(value) ? 'invalid_number' : 'missing_number');
  return null;
}

function sum(ctx, values, id, field) {
  const valid = values.filter(value => value !== null);
  if (values.length && !valid.length) return null;
  const total = valid.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(total)) { issue(ctx, 'metrics', { id }, field, 'numeric_overflow'); return null; }
  return total;
}

function finiteMetric(ctx, value, id, field) {
  if (value === null || Number.isFinite(value)) return value;
  issue(ctx, 'metrics', { id }, field, 'numeric_overflow');
  return null;
}

function taskType(ctx, task) {
  for (const field of ['actionType', 'taskDefinition', 'category', 'type']) {
    if (!present(task[field])) continue;
    if (text(task[field])) return text(task[field]).toLowerCase();
    issue(ctx, 'tasks', task, field, 'invalid_task_type');
    return null;
  }
  issue(ctx, 'tasks', task, 'actionType', 'missing_task_type');
  return null;
}

function assignmentData(ctx, finished, live) {
  const rawUsers = Array.isArray(ctx.state.users) ? ctx.state.users : ctx.state.configuration?.users;
  const groups = new Map();
  for (const user of (Array.isArray(rawUsers) ? rawUsers : []).filter(object)) {
    const name = text(user.name || user.displayName);
    if (!name) continue;
    const key = name.toLowerCase();
    groups.set(key, [...(groups.get(key) || []), name]);
  }
  const users = [...groups.entries()].filter(([key, names]) => {
    if (names.length === 1) return true;
    issue(ctx, 'configuration', { id: key }, 'users', 'ambiguous_team_member_name');
    return false;
  }).map(([, names]) => ({ name: names[0] })).sort((left, right) => compare(left.name, right.name));
  if (!users.length) issue(ctx, 'configuration', {}, 'users', 'missing_team_members');
  const memberByKey = new Map(users.map(user => [user.name.toLowerCase(), user.name]));
  const responsibleName = task => memberByKey.get(text(task.responsible).toLowerCase()) || text(task.responsible) || 'Sem responsável';
  const names = [...new Set([...users.map(user => user.name), ...[...live, ...finished].map(responsibleName)])].sort(compare);
  const workload = names.map(name => {
    const tasks = live.filter(task => responsibleName(task) === name);
    const overdue = tasks.filter(task => dateReading(ctx, task, 'tasks').overdue === true);
    const awaiting = tasks.filter(task => ['aguardando', 'aguardando-terceiros'].includes(text(task.status)));
    return { name, authority: 'operational_name_only', pending: tasks.length, overdue: overdue.length, awaiting: awaiting.length, evidenceIds: ids(tasks), overdueEvidenceIds: ids(overdue), awaitingEvidenceIds: ids(awaiting) };
  });
  const types = new Map([...finished, ...live].map(task => [task.id, taskType(ctx, task)]));
  const typedHistory = finished.filter(task => types.get(task.id));
  const projected = new Map(workload.map(row => [row.name, row.pending]));
  const assignmentSuggestions = [];
  for (const task of [...live].sort((left, right) => Number(Boolean(text(left.responsible))) - Number(Boolean(text(right.responsible))) || compare(left.id, right.id))) {
    if (assignmentSuggestions.length >= 10) break;
    const type = types.get(task.id);
    if (!type || !users.length) continue;
    const current = text(task.responsible) ? responsibleName(task) : null;
    if (current && !memberByKey.has(current.toLowerCase())) {
      issue(ctx, 'tasks', task, 'responsible', 'unknown_or_ambiguous_team_member');
      continue;
    }
    const sameType = typedHistory.filter(row => types.get(row.id) === type);
    const candidates = users.filter(user => user.name !== current).map(user => {
      const history = sameType.filter(row => memberByKey.get(text(row.completedBy).toLowerCase()) === user.name);
      const historical = suggestTaskAssignments({ tasks: [...history.map(row => ({ ...row, actionType: type, completedBy: user.name })), { ...task, responsible: '', actionType: type }], users: [user], maxSuggestions: 1 }).suggestions[0];
      return { name: user.name, history, historical, pending: projected.get(user.name) };
    });
    if (!current && !candidates.some(candidate => candidate.historical)) continue;
    const candidate = candidates.filter(row => !current || row.pending + 1 < projected.get(current)).sort((left, right) => left.pending - right.pending || Number(Boolean(right.historical)) - Number(Boolean(left.historical)) || right.history.length - left.history.length || compare(left.name, right.name))[0];
    if (!candidate) continue;
    const currentLoad = current ? workload.find(row => row.name === current) : null;
    const targetLoad = workload.find(row => row.name === candidate.name);
    assignmentSuggestions.push({ taskId: task.id, kind: current ? 'redistribution' : 'assignment', currentResponsible: current, name: candidate.name, authority: 'operational_name_only', confidence: null, historicalShare: sameType.length ? candidate.history.length / sameType.length : null, basis: `${candidate.history.length} de ${sameType.length} conclusões do tipo registrado; carga aberta observada ${targetLoad.pending}${currentLoad ? ` contra ${currentLoad.pending}` : ''}. Comparação operacional, sem avaliação de qualidade ou capacidade.`, quantitativeBasis: { taskType: type, historicalCompleted: candidate.history.length, sameTypeCompleted: sameType.length, targetPending: targetLoad.pending, currentPending: currentLoad?.pending ?? null, projectedTargetPending: candidate.pending, projectedCurrentPending: current ? projected.get(current) : null, selectionPolicy: 'projected_open_count_then_typed_history_then_name', capacity: null, qualityJudgment: false }, evidenceIds: ids(candidate.history), workloadEvidenceIds: [...new Set([...targetLoad.evidenceIds, ...(currentLoad?.evidenceIds || [])])].sort(compare), workload: targetLoad, requiresHumanReview: true });
    projected.set(candidate.name, candidate.pending + 1);
    if (current) projected.set(current, projected.get(current) - 1);
  }
  assignmentSuggestions.sort((left, right) => compare(left.taskId, right.taskId));
  return { workload, assignmentSuggestions, assignmentCoverage: { status: users.length && assignmentSuggestions.length ? 'observed_data' : 'insufficient_data', reason: !users.length ? 'missing_team_members' : assignmentSuggestions.length ? null : 'insufficient_same_type_completion_history', suggestionLimit: 10, projectedLoadsAreHypothetical: true } };
}

export function analyzeTeamProductivity(state, period = {}) {
  const ctx = context(state, period);
  const { start, end } = reportRange(ctx, period);
  const live = openTasks(ctx);
  const finished = [];
  for (const task of ctx.tasks) {
    if (task.active === false || task.absorbedInto || text(task.status) !== 'concluida') continue;
    const completed = occurred(ctx, task, 'completedAt', 'tasks');
    if (completed === null) continue;
    const created = occurred(ctx, task, 'createdAt', 'tasks');
    if (created === null && dateValue(ctx, task.createdAt) > ctx.now) continue;
    if (created !== null && created > completed) { issue(ctx, 'tasks', task, 'createdAt', 'creation_after_completion'); continue; }
    if (completed < start || completed > end) { ctx.coverage.outsideWindow += 1; continue; }
    finished.push({ ...task, createdAt: created === null ? '' : new Date(created).toISOString(), completedAt: new Date(completed).toISOString() });
  }
  const scalars = new Map();
  const dates = new Map();
  const prepared = [...finished, ...live].map(task => {
    const date = dateReading(ctx, task, 'tasks');
    dates.set(task.id, date);
    const points = task.points === undefined ? 0 : numeric(ctx, task, 'points', 'tasks');
    const minutes = [];
    if (present(task.timeLogs) && !Array.isArray(task.timeLogs)) issue(ctx, 'tasks', task, 'timeLogs', 'invalid_type');
    for (const log of Array.isArray(task.timeLogs) ? task.timeLogs : []) {
      if (!object(log)) { issue(ctx, 'tasks', task, 'timeLogs', 'invalid_minutes'); minutes.push(null); continue; }
      const value = numeric(ctx, { id: task.id, minutes: log.minutes }, 'minutes', 'tasks');
      const at = occurred(ctx, { id: task.id, date: log.date }, 'date', 'tasks');
      minutes.push(at === null ? null : value);
    }
    const logged = present(task.timeLogs) && !Array.isArray(task.timeLogs) ? null : sum(ctx, minutes, task.id, 'timeLoggedMinutes');
    scalars.set(task.id, { points, timeLoggedMinutes: logged });
    const deadlineAt = dateValue(ctx, date.deadline);
    const operativeAt = date.deadline?.length === 10 && text(task.status) !== 'concluida' ? dateValue(ctx, date.deadline, true) : deadlineAt;
    return { ...task, taskDefinition: taskType(ctx, task) || 'histórico não tipificado', deadline: operativeAt === null ? '' : new Date(operativeAt).toISOString(), sourceReportedDeadlineAt: '', points: points ?? 0, timeLogs: logged === null ? [] : [{ minutes: logged }] };
  });
  const users = (Array.isArray(state.configuration?.users) ? state.configuration.users : []).filter(object).map(user => {
    const goal = present(user.pointsGoal) ? numeric(ctx, { id: text(user.name), pointsGoal: user.pointsGoal }, 'pointsGoal', 'configuration') : null;
    return { name: text(user.name), pointsGoal: goal ?? 0 };
  });
  const report = computeProductivityReport(prepared, { configuration: { users }, now: new Date(ctx.now), period: 'custom', dateFrom: new Date(start).toISOString(), dateTo: new Date(end).toISOString() });
  const originalById = new Map(ctx.tasks.map(task => [task.id, task]));
  const completions = report.completions.map(row => {
    const original = originalById.get(row.id);
    const deadline = dates.get(row.id).deadline;
    const delayDays = deadline && deadline.length === 10
      ? (timestamp(civilDay(ctx, timestamp(row.completedAt))) - timestamp(deadline)) / DAY
      : row.delayDays;
    return { ...row, ...scalars.get(row.id), completedAt: original.completedAt, delayDays };
  });
  const dated = completions.filter(row => dates.get(row.id).deadline !== null);
  const onTime = dated.filter(row => {
    const deadline = dates.get(row.id).deadline;
    return deadline.length === 10 ? civilDay(ctx, dateValue(ctx, row.completedAt)) <= deadline : dateValue(ctx, row.completedAt) <= dateValue(ctx, deadline);
  });
  const averageDelay = completed => {
    const values = completed.map(row => row.delayDays).filter(value => value !== null);
    return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length * 10) / 10 : null;
  };
  const rows = report.rows.map(row => {
    const completed = completions.filter(item => item.responsible === row.responsible);
    const points = sum(ctx, completed.map(item => item.points), row.responsible, 'points');
    return { ...row, points, avgDelayDays: averageDelay(completed), reach: row.goal && points !== null ? finiteMetric(ctx, points / row.goal, row.responsible, 'reach') : null, timeLoggedMinutes: sum(ctx, completed.map(item => item.timeLoggedMinutes), row.responsible, 'timeLoggedMinutes'), evidenceIds: completed.map(item => item.id).sort(compare) };
  }).sort((left, right) => compare(left.responsible, right.responsible));
  const totals = { ...report.totals, avgDelayDays: averageDelay(completions), points: sum(ctx, completions.map(row => row.points), 'team', 'points'), timeLoggedMinutes: sum(ctx, completions.map(row => row.timeLoggedMinutes), 'team', 'timeLoggedMinutes') };
  const assignments = assignmentData(ctx, finished, live);
  const factors = assignments.workload.map(row => ({ type: 'observed_factor', name: row.name, label: 'Carga aberta e espera registradas por responsável', pending: row.pending, overdue: row.overdue, awaiting: row.awaiting, evidenceIds: row.evidenceIds, causalClaim: false }));
  return { evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, range: { start: new Date(start).toISOString(), end: new Date(end).toISOString() }, totals, rows, completions, byType: report.byType, rates: { onTime: ratio(onTime.length, dated.length), overdueBacklog: ratio(totals.late, live.length) }, coverage: { ...coverage(ctx), durationDenominator: completions.filter(row => row.durationMinutes !== null).length, deadlineDenominator: dated.length }, factors, ...assignments, evidenceIds: ids(prepared), confidence: null, provenance: provenance(ctx, ['tasks.completedAt', 'tasks.createdAt', 'tasks.completedBy', 'tasks.points', 'tasks.timeLogs', 'configuration.users.pointsGoal']) };
}

function movementAssessment(ctx, process, tasks, publications) {
  const reliable = [];
  const datajudProcess = /\bdatajud\b/i.test(text(process.source)) && /^api_publica_[a-z0-9_]+$/.test(text(process.datajudAlias));
  for (const [index, movement] of (Array.isArray(process.movements) ? process.movements : []).entries()) {
    if (!object(movement)) continue;
    const ownSource = text(movement.source).toLowerCase();
    const processOrigin = !present(movement.source) && datajudProcess && present(movement.at);
    const source = processOrigin ? 'datajud' : ownSource;
    if (!['tjrs_public', 'datajud', 'eproc', 'pje', 'djen'].includes(source)) continue;
    const field = present(movement.at) ? 'at' : 'date';
    const at = occurred(ctx, { id: process.id, [field]: movement[field] }, field, 'processes');
    if (at === null) continue;
    const code = text(movement.code) || (typeof movement.code === 'number' && Number.isFinite(movement.code) ? String(movement.code) : null);
    const explicitIdentity = text(movement.id || movement.fingerprint);
    const identity = explicitIdentity || `movement:${createHash('sha256').update(JSON.stringify([process.id, source, code, new Date(at).toISOString(), code ? null : index])).digest('hex')}`;
    reliable.push({ id: identity, at, source, evidence: { fieldPath: `movements[${index}]`, code, at: new Date(at).toISOString(), dateField: field, identityKind: explicitIdentity ? 'explicit' : 'derived_opaque_local_reference', provenanceScope: processOrigin ? 'process' : 'movement', source, processSource: processOrigin ? text(process.source) : null, datajudAlias: processOrigin ? text(process.datajudAlias) : null, officialMovementId: explicitIdentity || null } });
  }
  reliable.sort((left, right) => right.at - left.at || compare(left.id, right.id));
  if (!reliable.length) return { status: 'not_evaluable', reason: 'missing_reliable_movement_origin', evidenceIds: [process.id] };
  const latest = reliable[0];
  const ageDays = (timestamp(ctx.today) - timestamp(civilDay(ctx, latest.at))) / DAY;
  const shortDeadlines = [...tasks, ...publications].filter(record => processLink(ctx, record).processId === process.id).map(record => ({ record, date: dateReading(ctx, record, tasks.includes(record) ? 'tasks' : 'intimations') })).filter(row => row.date.overdue === false && row.date.daysUntil <= 7);
  return { status: 'evaluated', recent: ageDays <= 7, ageDays, movementId: latest.id, source: latest.source, movementEvidence: latest.evidence, shortDeadlines: shortDeadlines.map(row => ({ evidenceId: row.record.id, dateReference: row.date.dateReference })), evidenceIds: [process.id, latest.id, ...shortDeadlines.map(row => row.record.id)] };
}

export function identifyProcessRisks(state, options = {}) {
  const ctx = context(state, options);
  const tasks = openTasks(ctx);
  const publications = pendingPublications(ctx);
  const risks = [];
  const unresolvedReferences = [];
  for (const record of [...publications, ...tasks]) {
    const collection = ctx.tasks.includes(record) ? 'tasks' : 'intimations';
    const date = dateReading(ctx, record, collection);
    const link = processLink(ctx, record);
    if (!link.processId) unresolvedReferences.push({ collection, evidenceId: record.id, ...link });
    if (!date.fatal || collection === 'tasks') continue;
    const linked = linkedTasks(ctx, record, tasks);
    if (linked.taskIds.length) continue;
    const processOnlyTaskIds = link.processId ? ids(tasks.filter(task => processLink(ctx, task).processId === link.processId)) : [];
    const uncertain = processOnlyTaskIds.length > 0 || linked.missingTaskIds.length > 0 || !link.processId;
    if (uncertain) issue(ctx, 'intimations', record, 'taskId', 'uncertain_act_task_coverage');
    risks.push({ riskId: `fatal:${record.id}`, type: link.processId ? 'fatal_without_open_task' : 'fatal_link_not_evaluable', label: link.processId ? 'Prazo fatal registrado sem tarefa aberta vinculada ao ato' : 'Conferir vínculo do prazo fatal registrado', publicationId: record.id, processId: link.processId, linkReason: link.reason, taskCoverage: { status: uncertain ? 'uncertain' : 'no_linked_open_task', processOnlyTaskIds }, missingTaskIds: linked.missingTaskIds, dateReference: date.dateReference, evidenceIds: [record.id], confidence: null, requiresHumanReview: true });
  }
  const processes = ctx.processes.map(process => {
    const movement = movementAssessment(ctx, process, tasks, publications);
    if (movement.status === 'not_evaluable') issue(ctx, 'processes', process, 'movements', movement.reason);
    if (movement.recent && movement.shortDeadlines.length) risks.push({ riskId: `movement:${process.id}`, type: 'recent_movement_short_deadline', label: 'Andamento recente e prazo explícito próximo: conferir', processId: process.id, publicationId: null, dateReference: movement.shortDeadlines[0].dateReference, evidenceIds: movement.evidenceIds, confidence: null, requiresHumanReview: true });
    return { processId: process.id, prescription: { status: 'not_evaluable', reason: 'missing_canonical_structured_prescription_field', confidence: null }, movement, evidenceIds: [process.id] };
  });
  return { evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, processes, risks: risks.sort((left, right) => compare(left.riskId, right.riskId)), unresolvedReferences, coverage: coverage(ctx), confidence: null, provenance: provenance(ctx, ['processes.id', 'processes.number', 'processes.movements', 'intimations.fatalDeadline', 'tasks.processId', 'tasks.process']) };
}

export function generateActionPlan(state, analysis, options = {}) {
  if (!object(analysis)) throw new TypeError('Informe uma análise local válida.');
  const ctx = context(state, options);
  const trusted = { evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, windowDays: ctx.windowDays, dateFrom: options.dateFrom, dateTo: options.dateTo };
  const canonicalTasks = prioritizeTasks(state, trusted);
  const risks = identifyProcessRisks(state, trusted);
  const productivity = analyzeTeamProductivity(state, trusted);
  const suggestions = [];
  const missingReferences = [];
  const add = (kind, referenceId, taskId, publicationId, processId, dateReference, evidenceIds) => {
    const resolution = resolvePublication(ctx, publicationId);
    const record = taskId ? ctx.tasks.find(task => task.id === taskId) : processId && kind === 'review_process' ? ctx.processes.find(process => process.id === processId) : resolution.record;
    if (!record) { missingReferences.push({ kind, referenceId, reason: resolution.reason === 'ambiguous_publication_reference' ? resolution.reason : 'missing_canonical_record' }); return; }
    if (publicationId && !pendingPublications(ctx).some(publication => publication.id === record.id)) { missingReferences.push({ kind, referenceId, reason: 'ineligible_publication' }); return; }
    if (taskId) {
      for (const link of publicationLinks(ctx, record).filter(link => !link.publicationId)) missingReferences.push({ kind, referenceId: link.reference, reason: link.reason });
    } else if (publicationId) {
      for (const id of linkedTasks(ctx, record, openTasks(ctx)).missingTaskIds) missingReferences.push({ kind, referenceId: id, reason: 'missing_linked_task' });
    }
    const process = processLink(ctx, record);
    if (!process.processId && process.reference) missingReferences.push({ kind, referenceId: process.reference, reason: process.reason });
    const assignee = taskId ? productivity.assignmentSuggestions.find(row => row.taskId === taskId) : null;
    suggestions.push({ proposalId: `proposal:${kind}:${record.id}`, taskId, publicationId: publicationId ? record.id : null, processId: processId || process.processId, kind, label: taskId ? 'Revisar prioridade operacional da tarefa existente' : 'Conferir contexto e avaliar providência', requiresHumanReview: true, deadline: null, fatalDeadline: false, dateReference, assigneeSuggestion: assignee || (text(record.responsible) ? { name: text(record.responsible), authority: 'operational_name_only', confidence: null } : null), evidenceIds: [...new Set(evidenceIds)].sort(compare), confidence: null, provenance: provenance(ctx, ['tasks.id', 'intimations.id', 'processes.id']) });
  };
  for (const row of Array.isArray(analysis.tasks) ? analysis.tasks : []) {
    const id = text(row?.taskId);
    const canonical = canonicalTasks.find(task => task.taskId === id);
    if (!canonical) { missingReferences.push({ kind: 'review_task', referenceId: id || null, reason: 'missing_or_ineligible_task' }); continue; }
    add('review_task', id, id, null, null, canonical.dateReference, [id]);
  }
  for (const row of Array.isArray(analysis.processRisks?.risks) ? analysis.processRisks.risks : []) {
    const canonical = risks.risks.find(risk => risk.riskId === row?.riskId);
    if (!canonical) { missingReferences.push({ kind: 'review_fatal', referenceId: text(row?.riskId) || null, reason: 'missing_or_stale_risk' }); continue; }
    add(canonical.publicationId ? 'review_fatal' : 'review_process', canonical.riskId, null, canonical.publicationId, canonical.processId, canonical.dateReference, canonical.evidenceIds);
  }
  for (const row of Array.isArray(analysis.publications?.details) ? analysis.publications.details : []) {
    const id = text(row?.publicationId);
    const resolved = resolvePublication(ctx, id);
    const date = resolved.record ? dateReading(ctx, resolved.record, 'intimations') : null;
    add('review_publication', id, null, id, null, date?.dateReference || date?.sourceReference || null, resolved.record ? [resolved.record.id] : []);
  }
  const unique = new Map(suggestions.map(row => [row.proposalId, row]));
  return { evaluatedAt: ctx.evaluatedAt, timeZone: ctx.timeZone, suggestions: [...unique.values()].sort((left, right) => compare(left.proposalId, right.proposalId)), missingReferences, automaticActions: [], confidence: null, provenance: provenance(ctx, ['tasks.id', 'intimations.id', 'intimations.mergedInto']), coverage: coverage(ctx) };
}
