import { randomBytes } from 'node:crypto';
import { hashRecipient } from './db.mjs';
import { EVENT_TYPES, CADENCES, normalizeCadence } from './event-types.mjs';
import { renderPublicationDigest } from './templates/email-templates.mjs';

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

function privacyProjection(item) {
  const restricted = Boolean(item.restricted || item.segredoJustica || item.isSecret);
  return {
    restricted, segredoJustica: Boolean(item.segredoJustica), isSecret: Boolean(item.isSecret),
    ...(restricted ? { title: 'Registro restrito', type: 'Registro restrito', process: '', client: '', court: '' } : {})
  };
}

export function buildBulletinContext(state, day) {
  const privateIndex = privateScopeIndex(state);
  const agenda = Array.isArray(state?.agenda) ? state.agenda : Array.isArray(state?.events) ? state.events : [];
  const agendaFor = date => agenda.filter(item => item && !isPrivateRecord(item, privateIndex) && item.active !== false && !item.completed && !item.completedAt && civilDate(item.date || item.datetime) === date)
    .map(item => ({ id: item.id || '', title: item.title || item.type || 'Compromisso', time: item.time || '', type: item.hearingType || item.type || 'Compromisso', process: item.process || item.processNumber || '', processId: item.processId || '', client: item.client || '', court: item.court || item.courtUnit || '', ...privacyProjection(item) }))
    .sort((a, b) => `${a.time}:${a.id}:${a.title}`.localeCompare(`${b.time}:${b.id}:${b.title}`));
  const deadlines = (Array.isArray(state?.tasks) ? state.tasks : [])
    .filter(task => task && !isPrivateRecord(task, privateIndex) && task.active !== false && !task.absorbedInto && !task.completedAt && !task.discardedAt && !['concluida', 'cancelada'].includes(task.status))
    .map(task => ({ task, date: civilDate(task.fatalDeadline || task.deadline) }))
    .filter(({ date }) => date && date >= day && date <= dayOffset(day, 3))
    .map(({ task, date }) => ({ id: task.id || '', taskId: task.id || '', title: task.title || 'Prazo', date, fatal: Boolean(task.fatalDeadline), process: task.process || '', processId: task.processId || '', client: task.client || '', ...privacyProjection(task) }))
    .sort((a, b) => `${a.date}:${a.id}:${a.title}`.localeCompare(`${b.date}:${b.id}:${b.title}`));
  return { agendaToday: agendaFor(day), agendaTomorrow: agendaFor(dayOffset(day, 1)), deadlines };
}

function normalizeProcessDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits : '';
}

function buildAudienceIndex(state) {
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
  return { processesById, processesByNumber, tasksById };
}

function processAudienceIds(proc) {
  if (!proc) return null;
  if (proc.scope === 'private' || proc.privateOwnerUserId) return new Set();
  const ids = [...(Array.isArray(proc.responsibleUserIds) ? proc.responsibleUserIds : [])]
    .map(id => String(id || '').trim()).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

function eventAudienceIds(event, index) {
  const payload = event?.payload || {};
  const type = event?.event_type;
  if (type === EVENT_TYPES.DEADLINE_CRITICAL) {
    const task = index.tasksById.get(String(payload.taskId || ''));
    if (!task) return null;
    if (task.scope === 'private' || task.privateOwnerUserId) return new Set();
    const ids = new Set();
    if (String(task.assigneeUserId || '').trim()) ids.add(String(task.assigneeUserId).trim());
    for (const id of Array.isArray(task.followerUserIds) ? task.followerUserIds : []) {
      if (String(id || '').trim()) ids.add(String(id).trim());
    }
    const proc = (task.processId && index.processesById.get(String(task.processId)))
      || index.processesByNumber.get(normalizeProcessDigits(task.process));
    for (const id of processAudienceIds(proc) || []) ids.add(id);
    return ids.size ? ids : null;
  }
  if (type === EVENT_TYPES.MOVEMENT_NEW) {
    const proc = (payload.processId && index.processesById.get(String(payload.processId)))
      || index.processesByNumber.get(normalizeProcessDigits(payload.process));
    return processAudienceIds(proc);
  }
  if (type === EVENT_TYPES.PUBLICATION_NEW || type === EVENT_TYPES.HEARING_NEW) {
    return processAudienceIds(index.processesByNumber.get(normalizeProcessDigits(payload.process)));
  }
  return null;
}

function hydratePublication(payload, state) {
  const id = String(payload.id || '').trim();
  if (!id) return payload;
  const current = (Array.isArray(state?.intimations) ? state.intimations : [])
    .find(item => String(item?.id || '') === id || String(item?.externalId || '') === id);
  if (!current) return payload;
  return {
    ...payload,
    text: String(current.text || payload.text || '').trim(),
    fullText: String(current.fullText || payload.fullText || '').trim(),
    // O registro oficial pode ter a íntegra do Domicílio e a origem do texto; sem
    // esses campos o e-mail exibia só o recorte do evento, mesmo com a íntegra no estado.
    fullTextSource: String(current.fullTextSource || payload.fullTextSource || '').trim(),
    ln: String(current.ln || payload.ln || '').trim(),
    rawHtml: String(current.rawHtml || payload.rawHtml || '').trim(),
    description: String(current.description || payload.description || '').trim(),
    title: String(current.title || payload.title || '').trim(),
    publishedAt: current.publishedAt || payload.publishedAt,
    disponibilizadoEm: current.disponibilizadoEm || payload.disponibilizadoEm,
    court: current.court || payload.court,
    actionClass: current.actionClass || payload.actionClass,
    term: current.term || payload.term,
    lawyers: current.lawyers || payload.lawyers,
    client: current.client || payload.client,
    clientName: current.clientName || payload.clientName,
    opposingParty: current.opposingParty || payload.opposingParty,
    scope: current.scope || payload.scope,
    privateOwnerUserId: current.privateOwnerUserId || payload.privateOwnerUserId,
    captureSuppressed: Boolean(current.captureSuppressed || payload.captureSuppressed),
    restricted: Boolean(payload.restricted || current.restricted || current.segredoJustica || current.isSecret || current.secrecy)
  };
}

export function publicationForRecipient(payload, index, recipientIds, { isManager = false } = {}) {
  const proc = (payload.processId && index.processesById.get(String(payload.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(payload.process));
  const restricted = Boolean(payload.restricted || payload.segredoJustica || payload.isSecret || payload.secrecy
    || proc?.secrecy || /segredo-de-justica/i.test(String(proc?.tags || '')));
  const privateRecord = payload.scope === 'private' || Boolean(payload.privateOwnerUserId) || Boolean(payload.captureSuppressed);
  const audience = processAudienceIds(proc);
  // Mesma regra de acesso do produto: gestor (admin/master) enxerga o escritório; os demais
  // precisam estar entre os responsáveis do processo. Registro privado ou sigiloso nunca leva
  // a íntegra para o e-mail.
  const allowFullText = !restricted && !privateRecord
    && (isManager || Boolean(audience && [...audience].some(id => recipientIds.has(String(id)))));
  return { ...payload, restricted, allowFullText };
}

function contextAudienceIds(item, index) {
  if (item.taskId && index.tasksById.has(String(item.taskId))) {
    return eventAudienceIds({ event_type: EVENT_TYPES.DEADLINE_CRITICAL, payload: { taskId: item.taskId } }, index);
  }
  const proc = (item.processId && index.processesById.get(String(item.processId)))
    || index.processesByNumber.get(normalizeProcessDigits(item.process));
  return processAudienceIds(proc);
}

function inAudience(audience, recipientIds) {
  if (!audience) return true;
  for (const id of audience) if (recipientIds.has(id)) return true;
  return false;
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
    const current = recipients.get(email);
    if (current) {
      for (const type of types) {
        current.policies[type] ||= policies[type];
        current.since[type] = [current.since[type], since[type]].sort()[0];
      }
      current.principals.push(principal, `user:${user.username}`);
      current.roles.push(String(user.role || ''));
    } else recipients.set(email, { email, policies, since, roles: [String(user.role || '')], principals: [principal, `user:${user.username}`] });
  }
  for (const external of db.listRecipients(workspaceId)) {
    const email = String(external.email || '').trim().toLowerCase();
    if (!email.includes('@') || recipients.has(email)) continue;
    const policies = Object.fromEntries(types.map(type => {
      const pref = db.getRecipientPreference(external.id, type);
      return [type, external.enabled && !adminOnly.has(type) && normalizeCadence(pref.cadence, pref.enabled) === CADENCES.BULLETINS];
    }));
    const since = Object.fromEntries(types.map(type => [type, db.getPreferenceCutoff(workspaceId, `external:${external.id}`, type)]));
    recipients.set(email, { email, policies, since, principals: [`external:${external.id}`] });
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
        const audienceIndex = buildAudienceIndex(state || {});
        const recipientIds = new Set((recipient.principals || [])
          .filter(principal => String(principal).startsWith('user:'))
          .map(principal => String(principal).slice(5)));
        const events = db.getPendingBulletinEvents(workspaceId, recipientHash, allowed, db.getActivationWatermark(), until, limit)
          .filter(event => inAudience(eventAudienceIds(event, audienceIndex), recipientIds));
        const audienceContext = items => (items || []).filter(item => inAudience(contextAudienceIds(item, audienceIndex), recipientIds));
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
        if (!events.length && !delta.useful) return null;
        const includeFullContext = !previous;
        const noticeChanges = previous && delta.useful ? delta : null;
        const bulletin = { ...period, includeFullContext, noticeChanges };
        const digestContext = includeFullContext ? permittedContext : delta.changed;
        const recipientIsManager = (recipient.roles || []).some(role => ['admin', 'master_admin'].includes(String(role || '').toLowerCase()));
        const publications = events.filter(event => event.event_type === EVENT_TYPES.PUBLICATION_NEW)
          .map(event => publicationForRecipient(hydratePublication(event.payload || {}, state), audienceIndex, recipientIds, { isManager: recipientIsManager }));
        const movements = events.filter(event => event.event_type === EVENT_TYPES.MOVEMENT_NEW).map(event => event.payload);
        const hearings = events.filter(event => event.event_type === EVENT_TYPES.HEARING_NEW).map(event => event.payload);
        const template = renderPublicationDigest({ publications, movements, hearings, events, bulletin, digestContext, syncCompletedAt: now, baseUrl: service.baseUrl });
        const id = `obx-${randomBytes(16).toString('hex')}`;
        return {
          events, context: permittedContext, policies: {
            eventTypes: Object.fromEntries(types.map(type => [type, events.some(event => event.event_type === type)
              || (type === EVENT_TYPES.HEARING_NEW && (digestContext.agendaToday.length > 0 || digestContext.agendaTomorrow.length > 0 || delta.removed.agendaToday.length > 0 || delta.removed.agendaTomorrow.length > 0))
              || (type === EVENT_TYPES.DEADLINE_CRITICAL && (digestContext.deadlines.length > 0 || delta.removed.deadlines.length > 0))])),
            principals: recipient.principals
          },
          outbox: {
            id, workspaceId, eventType: 'OPERATIONAL_BULLETIN', recipient: recipient.email,
            idempotencyKey: `bulletin/${workspaceId}/${recipientHash}/${period.day}/${period.slot}`,
            payload: { from: service.provider.getFromAddress('publications'), subject: template.subject, html: template.html, text: template.text, tags: service.buildRoutingTags(workspaceId, id, 'OPERATIONAL_BULLETIN'), bulletin, digestContext, events }
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
