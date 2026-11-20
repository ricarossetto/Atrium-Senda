import { randomBytes } from 'node:crypto';
import { hashRecipient } from './db.mjs';
import { EVENT_TYPES, CADENCES, normalizeCadence } from './event-types.mjs';
import { renderPublicationDigest } from './templates/email-templates.mjs';
import {
  buildProcessIndex,
  canAccessAgenda,
  canAccessProcess,
  canAccessPublication,
  canAccessTask
} from '../office/access-control.mjs';

const types = Object.values(EVENT_TYPES);
const adminOnly = new Set([EVENT_TYPES.SYNC_FAILED, EVENT_TYPES.A1_CERT_EXPIRING]);
const contextKeys = ['agendaToday', 'agendaTomorrow', 'deadlines'];

export function bulletinPeriod(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('INVALID_BULLETIN_CLOCK');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const hour = Number(values.hour);
  const slot = hour >= 20 ? 20 : hour >= 14 ? 14 : hour >= 8 ? 8 : null;
  return { day: `${values.year}-${values.month}-${values.day}`, slot, periodLabel: slot === 8 ? 'Manhã' : slot === 14 ? 'Tarde' : 'Noite' };
}

function dayOffset(day, offset) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

function civilDate(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) return '';
  return bulletinPeriod(text).day;
}

function privateScopeIndex(state) {
  const processIds = new Set();
  const processNumbers = new Set();
  for (const proc of Array.isArray(state?.processes) ? state.processes : []) {
    if (!proc || (proc.scope !== 'private' && !proc.privateOwnerUserId)) continue;
    if (proc.id) processIds.add(String(proc.id));
    const digits = normalizeProcessDigits(proc.number || proc.protocol);
    if (digits) processNumbers.add(digits);
  }
  const termIds = new Set();
  for (const term of Array.isArray(state?.terms) ? state.terms : []) {
    if (term && (term.scope === 'private' || term.privateOwnerUserId) && (term.id || term.termId)) {
      termIds.add(String(term.id || term.termId));
    }
  }
  return { processIds, processNumbers, termIds };
}

function isPrivateRecord(item, index) {
  if (!item) return false;
  if (item.scope === 'private' || item.privateOwnerUserId) return true;
  if (item.processId && index.processIds.has(String(item.processId))) return true;
  const digits = normalizeProcessDigits(item.process || item.processNumber);
  if (digits && index.processNumbers.has(digits)) return true;
  for (const id of Array.isArray(item.monitoredTermIds) ? item.monitoredTermIds : []) {
    if (index.termIds.has(String(id))) return true;
  }
  return false;
}

function isRestrictedRecord(item, proc = null) {
  return Boolean(
    item?.restricted || item?.segredoJustica || item?.isSecret || item?.secrecy
    || /segredo-de-justica/i.test(String(item?.tags || ''))
    || proc?.secrecy || proc?.restricted || proc?.segredoJustica || proc?.isSecret
    || /segredo-de-justica/i.test(String(proc?.tags || ''))
  );
}

function privacyProjection(item, proc = null) {
  const restricted = isRestrictedRecord(item, proc);
  return {
    restricted,
    segredoJustica: Boolean(item?.segredoJustica || proc?.segredoJustica || proc?.secrecy),
    isSecret: Boolean(item?.isSecret || proc?.isSecret || proc?.secrecy),
    ...(restricted ? { title: 'Registro restrito', type: 'Registro restrito', process: '', client: '', court: '' } : {})
  };
}

export function buildBulletinContext(state, day) {
  const privateIndex = privateScopeIndex(state);
  const audienceIndex = buildAudienceIndex(state || {});
  const resolveProc = item => (item?.processId && audienceIndex.processesById.get(String(item.processId)))
    || audienceIndex.processesByNumber.get(normalizeProcessDigits(item?.process || item?.processNumber))
    || null;
  const agenda = Array.isArray(state?.agenda) ? state.agenda : Array.isArray(state?.events) ? state.events : [];
  const agendaFor = date => agenda.filter(item => item && !isPrivateRecord(item, privateIndex) && item.active !== false && !item.completed && !item.completedAt && civilDate(item.date || item.datetime) === date)
    .map(item => ({ id: item.id || '', title: item.title || item.type || 'Compromisso', time: item.time || '', type: item.hearingType || item.type || 'Compromisso', process: item.process || item.processNumber || '', processId: item.processId || '', client: item.client || '', court: item.court || item.courtUnit || '', ...privacyProjection(item, resolveProc(item)) }))
    .sort((a, b) => `${a.time}:${a.id}:${a.title}`.localeCompare(`${b.time}:${b.id}:${b.title}`));
  const deadlines = (Array.isArray(state?.tasks) ? state.tasks : [])
    .filter(task => task && !isPrivateRecord(task, privateIndex) && task.active !== false && !task.absorbedInto && !task.completedAt && !task.discardedAt && !['concluida', 'cancelada'].includes(task.status))
    .map(task => ({ task, date: civilDate(task.fatalDeadline || task.deadline) }))
    .filter(({ date }) => date && date >= day && date <= dayOffset(day, 3))
    .map(({ task, date }) => ({ id: task.id || '', taskId: task.id || '', title: task.title || 'Prazo', date, fatal: Boolean(task.fatalDeadline), process: task.process || '', processId: task.processId || '', client: task.client || '', ...privacyProjection(task, resolveProc(task)) }))
    .sort((a, b) => `${a.date}:${a.id}:${a.title}`.localeCompare(`${b.date}:${b.id}:${b.title}`));
  return { agendaToday: agendaFor(day), agendaTomorrow: agendaFor(dayOffset(day, 1)), deadlines };
}

function normalizeProcessDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits : '';
}

function grantExpiryMs(value) {
  if (!value) return Infinity;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(value).trim();
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59-03:00` : text);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function isPrivateEntity(record) {
  return Boolean(record && (record.scope === 'private' || record.privateOwnerUserId || record.captureSuppressed));
}

function buildAudienceIndex(state, { teams = [], nowMs = Date.now() } = {}) {
  const processesById = new Map();
  const processesByNumber = new Map();
  for (const proc of Array.isArray(state?.processes) ? state.processes : []) {
    if (!proc || typeof proc !== 'object') continue;
    if (proc.id) processesById.set(String(proc.id), proc);
    for (const candidate of [proc.number, proc.protocol]) {
      const digits = normalizeProcessDigits(candidate);
      if (digits && !processesByNumber.has(digits)) processesByNumber.set(digits, proc);
    }
  }
  const tasksById = new Map();
  for (const task of Array.isArray(state?.tasks) ? state.tasks : []) {
    if (task && typeof task === 'object' && task.id) tasksById.set(String(task.id), task);
  }
  const intimationsById = new Map();
  const intimationsByExternalId = new Map();
  for (const item of Array.isArray(state?.intimations) ? state.intimations : []) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim();
    if (id && !intimationsById.has(id)) intimationsById.set(id, item);
    const externalId = String(item.externalId || '').trim();
    if (externalId && !intimationsByExternalId.has(externalId)) intimationsByExternalId.set(externalId, item);
  }
  const agendaById = new Map();
  const agendaList = Array.isArray(state?.agenda) ? state.agenda : Array.isArray(state?.events) ? state.events : [];
  for (const entry of agendaList) {
    if (entry && typeof entry === 'object' && entry.id) agendaById.set(String(entry.id), entry);
  }
  const teamMembersById = new Map();
  const normalizedTeams = Array.isArray(teams) ? teams : [];
  for (const team of normalizedTeams) {
    if (!team?.id) continue;
    const members = new Set();
    for (const memberId of Array.isArray(team.memberIds) ? team.memberIds : []) {
      const clean = String(memberId || '').trim();
      if (clean) members.add(clean);
    }
    teamMembersById.set(String(team.id), members);
  }
  return {
    processesById,
    processesByNumber,
    tasksById,
    hasTasksCollection: Array.isArray(state?.tasks),
    intimationsById,
    intimationsByExternalId,
    agendaById,
    teamMembersById,
    teams: normalizedTeams,
    processIndex: buildProcessIndex(state?.processes || []),
    nowMs
  };
}

function processAudienceIds(proc, index = null) {
  if (!proc) return null;
  if (isPrivateEntity(proc)) return new Set();
  const ids = new Set();
  let hasExplicitAssignments = false;
  for (const id of Array.isArray(proc.responsibleUserIds) ? proc.responsibleUserIds : []) {
    hasExplicitAssignments = true;
    const clean = String(id || '').trim();
    if (clean) ids.add(clean);
  }
  for (const teamId of Array.isArray(proc.assignedTeamIds) ? proc.assignedTeamIds : []) {
    hasExplicitAssignments = true;
    const members = index?.teamMembersById?.get(String(teamId || '').trim());
    if (members) for (const memberId of members) ids.add(memberId);
  }
  const grants = Array.isArray(proc.accessGrants) ? proc.accessGrants : [];
  if (grants.length) hasExplicitAssignments = true;
  const nowMs = index?.nowMs ?? Date.now();
  for (const grant of grants) {
    const uid = String(grant?.userId || '').trim();
    if (uid && grantExpiryMs(grant?.expiresAt) > nowMs) ids.add(uid);
  }
  return hasExplicitAssignments ? ids : null;
}

function inAudience(audience, recipientIds) {
  if (!audience) return true;
  for (const id of audience) if (recipientIds.has(id)) return true;
  return false;
}

function recipientCanSeeDeadlineTask(task, index, recipient, { enforced = false } = {}) {
  if (!task || isPrivateEntity(task)) return false;
  const proc = (task.processId && index.processesById.get(String(task.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(task.process));
  if (isPrivateEntity(proc)) return false;
  if (enforced) {
    if (recipient.isExternal) return false;
    return recipient.users.some(user => canAccessTask(user, task, index.processIndex, index.teams));
  }
  const ids = new Set();
  if (String(task.assigneeUserId || '').trim()) ids.add(String(task.assigneeUserId).trim());
  for (const id of Array.isArray(task.followerUserIds) ? task.followerUserIds : []) {
    if (String(id || '').trim()) ids.add(String(id).trim());
  }
  const procAudience = processAudienceIds(proc, index);
  if (procAudience) {
    for (const id of procAudience) ids.add(id);
  }
  if (ids.size > 0) return inAudience(ids, recipient.userIds);
  if (procAudience instanceof Set) return false;
  return true;
}

function recipientCanSeeEvent(event, index, recipient, { enforced = false } = {}) {
  const payload = event?.payload || {};
  const type = event?.event_type;
  if (isPrivateEntity(payload)) return false;
  if (type === EVENT_TYPES.DEADLINE_CRITICAL) {
    const task = index.tasksById.get(String(payload.taskId || ''));
    if (task) return recipientCanSeeDeadlineTask(task, index, recipient, { enforced });
    if (index.hasTasksCollection) return false;
    const proc = (payload.processId && index.processesById.get(String(payload.processId)))
      || index.processesByNumber.get(normalizeProcessDigits(payload.process));
    if (isPrivateEntity(proc)) return false;
    if (enforced) {
      if (recipient.isExternal) return false;
      if (proc) return recipient.users.some(user => canAccessProcess(user, proc, index.teams));
      return recipient.users.some(user => hasPermission(user, 'office.manage') || hasPermission(user, 'tasks.read_all'));
    }
    return inAudience(processAudienceIds(proc, index), recipient.userIds);
  }
  if (type === EVENT_TYPES.MOVEMENT_NEW) {
    const proc = (payload.processId && index.processesById.get(String(payload.processId)))
      || index.processesByNumber.get(normalizeProcessDigits(payload.process));
    if (isPrivateEntity(proc)) return false;
    if (enforced) {
      if (recipient.isExternal) return false;
      if (proc) return recipient.users.some(user => canAccessProcess(user, proc, index.teams));
      return recipient.users.some(user => hasPermission(user, 'office.manage') || hasPermission(user, 'processes.read_all'));
    }
    return inAudience(processAudienceIds(proc, index), recipient.userIds);
  }
  if (type === EVENT_TYPES.PUBLICATION_NEW) {
    const current = currentPublicationForEvent(payload, index);
    if (!current) return false;
    const proc = publicationProcess(current, index);
    if (isPrivateEntity(proc)) return false;
    if (isRestrictedRecord(current, proc)) return confirmedRestrictedAudience(current, proc, index, recipient, enforced);
    if (enforced) {
      if (recipient.isExternal) return false;
      return recipient.users.some(user => canAccessPublication(user, current, index.processIndex, index.teams));
    }
    return inAudience(processAudienceIds(proc, index), recipient.userIds);
  }
  if (type === EVENT_TYPES.HEARING_NEW) {
    const agendaItem = payload.id ? index.agendaById.get(String(payload.id)) : null;
    if (isPrivateEntity(agendaItem)) return false;
    const proc = (payload.processId && index.processesById.get(String(payload.processId)))
      || (agendaItem?.processId && index.processesById.get(String(agendaItem.processId)))
      || index.processesByNumber.get(normalizeProcessDigits(payload.process || agendaItem?.process || agendaItem?.processNumber));
    if (isPrivateEntity(proc)) return false;
    if (enforced) {
      if (recipient.isExternal) return false;
      if (agendaItem) return recipient.users.some(user => canAccessAgenda(user, agendaItem, index.processIndex, index.teams));
      if (proc) return recipient.users.some(user => canAccessProcess(user, proc, index.teams));
      return recipient.users.some(user => hasPermission(user, 'agenda.read_all') || hasPermission(user, 'office.manage'));
    }
    return inAudience(processAudienceIds(proc, index), recipient.userIds);
  }
  return true;
}

function recipientCanSeeContextItem(item, index, recipient, { enforced = false } = {}) {
  if (!item || isPrivateEntity(item)) return false;
  const rawAgenda = !item.taskId && item.id ? index.agendaById.get(String(item.id)) : null;
  if (isPrivateEntity(rawAgenda)) return false;
  const source = rawAgenda || item;
  if (source.taskId || item.taskId) {
    const task = index.tasksById.get(String(source.taskId || item.taskId));
    return recipientCanSeeDeadlineTask(task, index, recipient, { enforced });
  }
  const proc = (source.processId && index.processesById.get(String(source.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(source.process || source.processNumber))
    || (item.processId && index.processesById.get(String(item.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(item.process || item.processNumber));
  if (isPrivateEntity(proc)) return false;
  if (enforced) {
    if (recipient.isExternal) return false;
    return recipient.users.some(user => canAccessAgenda(user, source, index.processIndex, index.teams));
  }
  return inAudience(processAudienceIds(proc, index), recipient.userIds);
}

function publicationProcess(record, index) {
  if (!record) return null;
  return (record.processId && index?.processesById?.get(String(record.processId)))
    || index?.processesByNumber?.get(normalizeProcessDigits(record.process || record.processNumber))
    || null;
}

function publicationLinkKey(record) {
  const processId = String(record?.processId || '').trim();
  if (processId) return `id:${processId}`;
  const digits = normalizeProcessDigits(record?.process || record?.processNumber);
  return digits ? `number:${digits}` : '';
}

/**
 * O evento PUBLICATION_NEW é um snapshot antigo: privacidade, supressão, fusão e
 * vínculo podem ter mudado depois que ele foi gravado. Só o registro persistido
 * atual decide se a publicação entra no boletim e com quais referências.
 */
export function currentPublicationForEvent(payload, index) {
  const id = String(payload?.id || '').trim();
  const externalId = String(payload?.externalId || '').trim();
  const record = (id && index?.intimationsById?.get(id))
    || (externalId && index?.intimationsByExternalId?.get(externalId))
    || (id && index?.intimationsByExternalId?.get(id))
    || null;
  if (!record || typeof record !== 'object') return null;
  if (String(record.mergedInto || '').trim()) return null;
  if (record.scope === 'private' || record.privateOwnerUserId || record.captureSuppressed) return null;
  return record;
}

// Restrito continua gerando o aviso mínimo de sempre, mas sem o fallback
// "sem vínculo → todos": a audiência precisa estar confirmada no estado atual.
function confirmedRestrictedAudience(current, proc, index, recipient, enforced) {
  if (enforced) {
    if (recipient.isExternal) return false;
    return recipient.users.some(user => canAccessPublication(user, current, index.processIndex, index.teams));
  }
  const audience = processAudienceIds(proc, index);
  if (!(audience instanceof Set) || audience.size === 0) return false;
  return inAudience(audience, recipient.userIds);
}

function hydratePublication(payload, index) {
  const current = currentPublicationForEvent(payload, index);
  if (!current) return null;
  // Vínculo mudado: o evento pode trazer trecho e referências do processo anterior.
  // Nada do snapshot antigo entra no boletim nesse caso.
  const sameLink = publicationLinkKey(current) === publicationLinkKey(payload);
  const base = sameLink ? { ...payload, ...current } : { ...current };
  const hydrated = {
    ...base,
    id: String(current.id || payload.id || '').trim(),
    scope: current.scope || payload.scope,
    privateOwnerUserId: current.privateOwnerUserId || payload.privateOwnerUserId,
    captureSuppressed: Boolean(current.captureSuppressed || payload.captureSuppressed),
    restricted: isRestrictedRecord(current, publicationProcess(current, index))
  };
  // Texto vem apenas do registro vivo. Se ele foi removido, o snapshot antigo
  // não volta, mesmo quando o vínculo é o mesmo.
  for (const field of ['text', 'sourceText', 'fullText', 'fullTextSource', 'description', 'ln', 'rawHtml', 'excerpt']) {
    hydrated[field] = String(current[field] ?? '');
  }
  return hydrated;
}

// O outbox guarda só o necessário para identidade/cobertura e referência atual.
// A íntegra e os campos internos do registro ficam apenas no objeto enviado ao
// template, para o destinatário autorizado.
const outboxPublicationFields = ['externalId', 'process', 'processId'];

function projectOutboxPublication(event, current, restricted) {
  const record = current || {};
  const payload = { id: String(record.id || event.payload?.id || '').trim() };
  for (const field of outboxPublicationFields) {
    const value = String(record[field] ?? '').trim();
    if (value) payload[field] = value;
  }
  if (restricted) payload.restricted = true;
  return { ...event, payload };
}

export function publicationForRecipient(payload, index, recipientIds, { isManager = false } = {}) {
  const proc = (payload.processId && index.processesById.get(String(payload.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(payload.process));
  const restricted = isRestrictedRecord(payload, proc);
  const privateRecord = payload.scope === 'private' || Boolean(payload.privateOwnerUserId) || Boolean(payload.captureSuppressed);
  const audience = processAudienceIds(proc, index);
  // Mesma regra de acesso do produto: gestor (admin/master) enxerga o escritório; os demais
  // precisam estar entre os responsáveis do processo. Registro privado ou sigiloso nunca leva
  // a íntegra para o e-mail.
  const allowFullText = !restricted && !privateRecord
    && (isManager || Boolean(audience && [...audience].some(id => recipientIds.has(String(id)))));
  return { ...payload, restricted, allowFullText };
}

function contextDelta(context, previous) {
  const changed = {};
  const removed = {};
  for (const key of contextKeys) {
    const old = previous?.[key] || [];
    changed[key] = context[key].filter(item => !old.some(value => JSON.stringify(value) === JSON.stringify(item)));
    removed[key] = old.filter(item => !context[key].some(value => JSON.stringify(value) === JSON.stringify(item)));
  }
  return { changed, removed, useful: contextKeys.some(key => changed[key].length || removed[key].length) };
}

export async function dispatchScheduledBulletins(service, workspaceId, users, state, options = {}) {
  const db = service.db;
  db.bindWorkspace(workspaceId);
  if (!db.isWorkspaceEnabled()) return { sent: 0, enqueued: 0, deferred: true, reason: 'WORKSPACE_DISABLED' };
  if (db.isGlobalPaused()) return { sent: 0, enqueued: 0, deferred: true, reason: 'GLOBAL_PAUSED' };
  const now = new Date(options.now ?? Date.now());
  const period = bulletinPeriod(now);
  if (!period.slot) return { sent: 0, enqueued: 0, deferred: true, reason: 'BEFORE_FIRST_SLOT' };
  const until = now.toISOString();
  const limit = Math.max(1, Math.min(500, Number.isInteger(options.limit) ? options.limit : 100));
  const teams = options.teams !== undefined
    ? options.teams
    : (typeof service.securityManager?.listTeams === 'function' ? service.securityManager.listTeams(workspaceId) : []);
  const accessMode = options.accessMode
    ?? service.securityManager?.officeProfile?.(workspaceId)?.accessMode
    ?? state?.officeProfile?.accessMode
    ?? 'open';
  const enforced = accessMode === 'enforced';
  const context = buildBulletinContext(state || {}, period.day);
  const recipients = new Map();
  for (const user of Array.isArray(users) ? users : await service.getWorkspaceUsers(workspaceId)) {
    if (user.status !== 'active' || (user.workspaceId && user.workspaceId !== workspaceId)) continue;
    const email = String(user.email || '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    const policies = {};
    for (const type of types) {
      const pref = await service.resolveUserPreference(workspaceId, user.id, type, user.role, [user.username]);
      policies[type] = pref.enabled && pref.cadence === CADENCES.BULLETINS;
    }
    const principal = `user:${user.id}`;
    const since = Object.fromEntries(types.map(type => [type, [db.getPreferenceCutoff(workspaceId, principal, type), db.getPreferenceCutoff(workspaceId, `user:${user.username}`, type)].sort().at(-1)]));
    const normalizedUser = { ...user, id: user.id || user.userId, userId: user.id || user.userId, workspaceId: user.workspaceId || workspaceId };
    const current = recipients.get(email);
    if (current) {
      for (const type of types) {
        current.policies[type] ||= policies[type];
        current.since[type] = [current.since[type], since[type]].sort()[0];
      }
      current.principals.push(principal, `user:${user.username}`);
      current.roles.push(String(user.role || ''));
      current.users.push(normalizedUser);
    } else recipients.set(email, { email, policies, since, roles: [String(user.role || '')], principals: [principal, `user:${user.username}`], users: [normalizedUser], isExternal: false });
  }
  for (const external of db.listRecipients(workspaceId)) {
    const email = String(external.email || '').trim().toLowerCase();
    if (!email.includes('@') || recipients.has(email)) continue;
    const policies = Object.fromEntries(types.map(type => {
      const pref = db.getRecipientPreference(external.id, type);
      return [type, external.enabled && !adminOnly.has(type) && normalizeCadence(pref.cadence, pref.enabled) === CADENCES.BULLETINS];
    }));
    const since = Object.fromEntries(types.map(type => [type, db.getPreferenceCutoff(workspaceId, `external:${external.id}`, type)]));
    recipients.set(email, { email, policies, since, principals: [`external:${external.id}`], users: [], isExternal: true });
  }
  let enqueued = 0;
  let failed = 0;
  let unresolvedLegacyCoverage = 0;
  let heldLegacyEvents = 0;
  for (const recipient of recipients.values()) {
    const recipientHash = hashRecipient(recipient.email);
    const allowed = types.filter(type => recipient.policies[type]);
    try {
      const diagnostic = db.getLegacyCoverageDiagnostics(workspaceId, recipientHash);
      unresolvedLegacyCoverage += diagnostic.holds;
      heldLegacyEvents += diagnostic.blockedEvents;
      const suppressed = db.isSuppressed(recipient.email);
      db.cancelIneligibleBulletins(workspaceId, recipientHash, suppressed ? [] : allowed);
      db.skipBulletinEvents(workspaceId, recipientHash, suppressed ? types : types.filter(type => !recipient.policies[type]), until);
      for (const type of allowed) {
        if (recipient.since[type]) db.skipBulletinEvents(workspaceId, recipientHash, [type], recipient.since[type]);
      }
      if (suppressed || !allowed.length) continue;
      const result = db.reserveBulletin({ workspaceId, recipientHash, principals: recipient.principals, ...period, now: until, build: previous => {
        const audienceIndex = buildAudienceIndex(state || {}, { teams, nowMs: now.getTime() });
        const recipientIds = new Set((recipient.principals || [])
          .filter(principal => String(principal).startsWith('user:'))
          .map(principal => String(principal).slice(5)));
        const recipientScope = { userIds: recipientIds, users: recipient.users || [], isExternal: Boolean(recipient.isExternal) };
        const events = db.getPendingBulletinEvents(workspaceId, recipientHash, allowed, db.getActivationWatermark(), until, limit)
          .filter(event => recipientCanSeeEvent(event, audienceIndex, recipientScope, { enforced }));
        const audienceContext = items => (items || []).filter(item => recipientCanSeeContextItem(item, audienceIndex, recipientScope, { enforced }));
        const permittedContext = {
          agendaToday: recipient.policies.HEARING_NEW ? audienceContext(context.agendaToday) : [],
          agendaTomorrow: recipient.policies.HEARING_NEW ? audienceContext(context.agendaTomorrow) : [],
          deadlines: recipient.policies.DEADLINE_CRITICAL ? audienceContext(context.deadlines) : []
        };
        const previousAudience = previous ? {
          agendaToday: audienceContext(previous.agendaToday),
          agendaTomorrow: audienceContext(previous.agendaTomorrow),
          deadlines: audienceContext(previous.deadlines)
        } : previous;
        const delta = contextDelta(permittedContext, previousAudience);
        const includeFullContext = !previous;
        const noticeChanges = previous && delta.useful ? delta : null;
        const bulletin = { ...period, includeFullContext, noticeChanges };
        const digestContext = includeFullContext ? permittedContext : delta.changed;
        const recipientIsManager = (recipient.roles || []).some(role => ['admin', 'master_admin'].includes(String(role || '').toLowerCase()));
        const withRestricted = payload => {
          const task = payload?.taskId ? audienceIndex.tasksById.get(String(payload.taskId)) : null;
          const proc = (payload?.processId && audienceIndex.processesById.get(String(payload.processId)))
            || audienceIndex.processesByNumber.get(normalizeProcessDigits(payload?.process))
            || (task?.processId && audienceIndex.processesById.get(String(task.processId)))
            || (task?.process && audienceIndex.processesByNumber.get(normalizeProcessDigits(task.process)))
            || null;
          const restricted = isRestrictedRecord(payload, proc) || isRestrictedRecord(task, proc);
          return restricted === Boolean(payload?.restricted) ? payload : { ...payload, restricted };
        };
        const publicationsByEventId = new Map();
        const hydratedEvents = events.map(event => {
          if (event.event_type === EVENT_TYPES.PUBLICATION_NEW) {
            const hydrated = hydratePublication(event.payload || {}, audienceIndex);
            if (!hydrated) return null;
            publicationsByEventId.set(event.id, publicationForRecipient(hydrated, audienceIndex, recipientIds, { isManager: recipientIsManager }));
            return projectOutboxPublication(event, hydrated, Boolean(hydrated.restricted));
          }
          if (event.event_type === EVENT_TYPES.MOVEMENT_NEW || event.event_type === EVENT_TYPES.DEADLINE_CRITICAL || event.event_type === EVENT_TYPES.HEARING_NEW) {
            return { ...event, payload: withRestricted(event.payload || {}) };
          }
          return event;
        }).filter(Boolean);
        if (!hydratedEvents.length && !delta.useful) return null;
        const publications = [...publicationsByEventId.values()];
        const movements = hydratedEvents.filter(event => event.event_type === EVENT_TYPES.MOVEMENT_NEW).map(event => event.payload);
        const hearings = hydratedEvents.filter(event => event.event_type === EVENT_TYPES.HEARING_NEW).map(event => event.payload);
        const template = renderPublicationDigest({ publications, movements, hearings, events: hydratedEvents, bulletin, digestContext, syncCompletedAt: now, baseUrl: service.baseUrl });
        const id = `obx-${randomBytes(16).toString('hex')}`;
        return {
          events: hydratedEvents, context: permittedContext, policies: {
            eventTypes: Object.fromEntries(types.map(type => [type, hydratedEvents.some(event => event.event_type === type)
              || (type === EVENT_TYPES.HEARING_NEW && (digestContext.agendaToday.length > 0 || digestContext.agendaTomorrow.length > 0 || delta.removed.agendaToday.length > 0 || delta.removed.agendaTomorrow.length > 0))
              || (type === EVENT_TYPES.DEADLINE_CRITICAL && (digestContext.deadlines.length > 0 || delta.removed.deadlines.length > 0))])),
            principals: recipient.principals
          },
          outbox: {
            id, workspaceId, eventType: 'OPERATIONAL_BULLETIN', recipient: recipient.email,
            idempotencyKey: `bulletin/${workspaceId}/${recipientHash}/${period.day}/${period.slot}`,
            payload: { from: service.provider.getFromAddress('publications'), subject: template.subject, html: template.html, text: template.text, tags: service.buildRoutingTags(workspaceId, id, 'OPERATIONAL_BULLETIN'), bulletin, digestContext, events: hydratedEvents }
          }
        };
      } });
      if (result.enqueued) enqueued++;
    } catch {
      failed++;
      service.logger.warn?.('[NotificationService] Falha ao reservar boletim; eventos preservados para nova tentativa.');
    }
  }
  return { sent: enqueued, enqueued, failed, unresolvedLegacyCoverage, heldLegacyEvents, deferred: enqueued === 0, reason: failed ? 'PARTIAL_FAILURE' : unresolvedLegacyCoverage ? 'UNRESOLVED_LEGACY_COVERAGE' : enqueued ? 'QUEUED' : 'NO_USEFUL_CHANGES', ...period };
}
