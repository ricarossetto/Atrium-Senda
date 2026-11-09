import { createHash, randomBytes } from 'node:crypto';
import { hashRecipient } from './db.mjs';
import { createOpaqueTag } from './routing-tags.mjs';
import { renderTestEmail, renderPasswordReset, renderTaskCompletionDigest } from './templates/email-templates.mjs';
import { EVENT_TYPES, CADENCES, DEFAULT_PREFERENCES, normalizeCadence } from './event-types.mjs';
import { dispatchScheduledBulletins, bulletinPeriod } from './helpers-bulletin-cadence.mjs';

export { EVENT_TYPES, CADENCES, DEFAULT_PREFERENCES };
export const PASSWORD_RESET_EVENT = 'PASSWORD_RESET';
export const TASK_COMPLETED_EVENT = 'TASK_COMPLETED';
export const PASSWORD_RESET_DAILY_LIMIT = 20;
export const SUPERVISED_TRANSACTIONAL_EVENTS = Object.freeze(['SYSTEM_TEST', PASSWORD_RESET_EVENT]);
export const A1_MILESTONES = Object.freeze([30, 15, 7, 1]);

// O escopo privado é pessoal (specs/office-teams-access.md): publicações,
// audiências e prazos privados nunca viram evento do boletim do escritório,
// nem quando o processo vinculado não pode ser resolvido (fallback "todos").
function isPrivateOperationalRecord(record) {
  if (!record || typeof record !== 'object') return false;
  return record.scope === 'private'
    || Boolean(record.privateOwnerUserId)
    || Boolean(record.captureSuppressed);
}

export class NotificationService {
  constructor({ db, provider, securityManager = null, routingSecret = process.env.RESEND_WEBHOOK_SECRET || '', baseUrl = 'https://atrium.adv.br', logger = console, digestContextProvider = null }) {
    Object.assign(this, { db, provider, securityManager, routingSecret, baseUrl, logger, digestContextProvider });
    if (!db.securityManager?.listUsers && securityManager?.listUsers) db.getCurrentUsers = workspaceId => securityManager.listUsers(workspaceId);
  }

  buildRoutingTags(workspaceId, outboxId, eventType) {
    const secret = this.routingSecret;
    if (typeof secret !== 'string' || secret.length < 16) {
      if (SUPERVISED_TRANSACTIONAL_EVENTS.includes(String(eventType))) return [{ name: 'atrium_event', value: String(eventType).slice(0, 32) }];
      throw new Error('RESEND_WEBHOOK_SECRET ausente ou fraco para assinar tags de roteamento.');
    }
    return [
      { name: 'atrium_tenant', value: createOpaqueTag(workspaceId, secret) },
      { name: 'atrium_outbox', value: createOpaqueTag(outboxId, secret) },
      { name: 'atrium_event', value: String(eventType).slice(0, 32) }
    ];
  }

  async getWorkspaceUsers(workspaceId) {
    return this.securityManager?.listUsers ? this.securityManager.listUsers(workspaceId) || [] : [];
  }

  async resolveUserPreference(workspaceId, userId, eventType, userRole = 'collaborator', aliases = []) {
    if ([EVENT_TYPES.SYNC_FAILED, EVENT_TYPES.A1_CERT_EXPIRING].includes(eventType) && !['admin', 'master_admin'].includes(userRole)) {
      return { cadence: CADENCES.DISABLED, enabled: false };
    }
    let pref = this.db.getUserPreferences(workspaceId, userId).find(p => p.event_type === eventType);
    for (const alias of Array.isArray(aliases) ? aliases : []) {
      if (pref) break;
      const key = String(alias || '').trim();
      if (key && key !== String(userId || '').trim()) pref = this.db.getUserPreferences(workspaceId, key).find(p => p.event_type === eventType);
    }
    const cadence = normalizeCadence(pref?.cadence || DEFAULT_PREFERENCES[eventType], pref ? pref.enabled : true);
    return { cadence, enabled: cadence !== CADENCES.DISABLED };
  }

  async getEligibleRecipients(workspaceId, eventType, targetCadence = null) {
    const eligible = [];
    for (const user of await this.getWorkspaceUsers(workspaceId)) {
      if (user.status !== 'active') continue;
      const email = String(user.email || '').trim().toLowerCase();
      if (!email.includes('@') || this.db.isSuppressed(email)) continue;
      const pref = await this.resolveUserPreference(workspaceId, user.id, eventType, user.role, [user.username]);
      if (pref.enabled && (!targetCadence || pref.cadence === targetCadence)) eligible.push({ type: 'user', userId: user.id, name: user.displayName || user.username, email, role: user.role, cadence: pref.cadence });
    }
    for (const ext of this.db.listRecipients(workspaceId)) {
      if (!ext.enabled || [EVENT_TYPES.SYNC_FAILED, EVENT_TYPES.A1_CERT_EXPIRING].includes(eventType)) continue;
      const email = ext.email.trim().toLowerCase();
      const pref = this.db.getRecipientPreference(ext.id, eventType);
      const cadence = normalizeCadence(pref.cadence, pref.enabled);
      if (!this.db.isSuppressed(email) && cadence !== CADENCES.DISABLED && (!targetCadence || cadence === targetCadence) && !eligible.some(r => r.email === email)) {
        eligible.push({ type: 'external', recipientId: ext.id, name: ext.name, email, role: 'external', cadence });
      }
    }
    return eligible;
  }

  static publicationFingerprint(workspaceId, source, pubIdOrText) {
    return createHash('sha256').update(`${workspaceId}:${source || 'DJEN'}:${pubIdOrText}`).digest('hex');
  }

  static hearingFingerprint(workspaceId, processNum, hearingIdOrTime) {
    return createHash('sha256').update(`${workspaceId}:${processNum || 'no-process'}:${hearingIdOrTime}`).digest('hex');
  }

  static movementFingerprint(workspaceId, { processId = '', processNum = '', date = '', description = '', source = '' } = {}) {
    return createHash('sha256').update(`${workspaceId}:movement:${processId || processNum || 'sem-processo'}:${date || 'sem-data'}:${String(description).slice(0, 160)}:${source}`).digest('hex');
  }

  static deadlineFingerprint(workspaceId, taskId, dueAt, threshold) {
    return createHash('sha256').update(`${workspaceId}:${taskId}:${dueAt}:${threshold}`).digest('hex');
  }

  static syncFailedFingerprint(workspaceId, syncJobId, portal) {
    return createHash('sha256').update(`${workspaceId}:${syncJobId || 'job'}:${portal || 'overall'}`).digest('hex');
  }

  static a1CertFingerprint(workspaceId, certificateFingerprint, milestone) {
    return createHash('sha256').update(`${workspaceId}:${certificateFingerprint || 'cert'}:${milestone}`).digest('hex');
  }

  async onNewPublications(workspaceId, publications = []) {
    let recorded = 0;
    for (const pub of Array.isArray(publications) ? publications : []) {
      if (isPrivateOperationalRecord(pub)) continue;
      const id = pub.id || pub.externalId;
      const process = pub.process || pub.number || '';
      const source = pub.source || pub.court || 'DJEN';
      const fingerprint = NotificationService.publicationFingerprint(workspaceId, source, id || `${process}:${pub.publishedAt || ''}:${String(pub.text || '').slice(0, 120)}`);
      const payload = {
        id, process, court: pub.court || pub.tribunal || source, county: pub.county || pub.courtUnit || pub.vara || '',
        publishedAt: pub.publishedAt || '', disponibilizadoEm: pub.disponibilizadoEm || '', actionClass: pub.actionClass || pub.classe || '',
        text: String(pub.text || pub.sourceText || pub.description || '').trim(), fullText: String(pub.fullText || '').trim(),
        scope: pub.scope === 'private' ? 'private' : 'office', privateOwnerUserId: String(pub.privateOwnerUserId || '').trim(), captureSuppressed: Boolean(pub.captureSuppressed),
        client: String(pub.client || pub.clientName || '').trim(), restricted: Boolean(pub.restricted || pub.segredoJustica || pub.isSecret || pub.secrecy)
      };
      for (const [field, value] of [['term', pub.term], ['opposingParty', pub.opposingParty], ['lawyers', pub.lawyers], ['link', pub.link || pub.officialLink], ['description', pub.description]]) {
        if (String(value || '').trim()) payload[field] = String(value).trim();
      }
      if (this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.PUBLICATION_NEW, fingerprint, payload }).isNew) recorded++;
    }
    return { recorded, enqueued: 0, deferred: true };
  }

  async onNewMovements(workspaceId, movements = [], { trigger = 'sync' } = {}) {
    let recorded = 0;
    for (const movement of Array.isArray(movements) ? movements : []) {
      if (isPrivateOperationalRecord(movement)) continue;
      const processNum = String(movement.process || movement.processNumber || '').trim();
      const processId = String(movement.processId || '').trim();
      const date = String(movement.date || '').slice(0, 10);
      const description = String(movement.description || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!description) continue;
      const source = String(movement.source || 'Andamento').trim();
      const fingerprint = NotificationService.movementFingerprint(workspaceId, { processId, processNum, date, description, source });
      const payload = { id: `${processId || processNum}:${date}:${description.slice(0, 60)}`, process: processNum, processId, date, description, source, client: String(movement.client || '').trim(), link: String(movement.link || '').trim() };
      if (this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.MOVEMENT_NEW, fingerprint, payload }).isNew) recorded++;
    }
    return { recorded, trigger, enqueued: 0, deferred: true };
  }

  async checkDeadlines(workspaceId, tasks = [], options = {}) {
    const now = new Date(options.now ?? Date.now());
    let alerts = 0;
    for (const task of Array.isArray(tasks) ? tasks : []) {
      if (isPrivateOperationalRecord(task)) continue;
      if (task.active === false || task.absorbedInto || task.completedAt || task.discardedAt || ['concluida', 'cancelada'].includes(task.status)) continue;
      const rawDeadline = task.fatalDeadline || task.deadline;
      if (!rawDeadline) continue;
      const deadlineDate = new Date(String(rawDeadline).includes('T') ? rawDeadline : `${rawDeadline}T23:59:59-03:00`);
      if (!Number.isFinite(deadlineDate.getTime())) continue;
      const diffHours = Math.round((deadlineDate.getTime() - now.getTime()) / 3600000);
      if (diffHours < -24 || diffHours > 48) continue;
      const milestone = diffHours <= 24 ? '24h' : '48h';
      const taskId = task.id || `task-${createHash('sha256').update(String(task.title)).digest('hex').slice(0, 10)}`;
      const fingerprint = NotificationService.deadlineFingerprint(workspaceId, taskId, rawDeadline, milestone);
      if (this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.DEADLINE_CRITICAL, fingerprint, payload: { taskId, title: task.title, process: task.process || '', fatalDeadline: task.fatalDeadline || null, deadline: task.deadline || null, hoursRemaining: Math.max(0, diffHours) } }).isNew) alerts++;
    }
    return { alerts, enqueued: 0, deferred: true };
  }

  async onNewHearings(workspaceId, hearings = []) {
    let recorded = 0;
    for (const hearing of Array.isArray(hearings) ? hearings : []) {
      if (isPrivateOperationalRecord(hearing)) continue;
      const id = hearing.id || hearing.externalId;
      const process = hearing.process || '';
      const date = hearing.date || hearing.datetime || '';
      const time = hearing.time || '';
      const fingerprint = NotificationService.hearingFingerprint(workspaceId, process, id || `${date}:${time}`);
      if (this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.HEARING_NEW, fingerprint, payload: { id, title: hearing.title || hearing.type || 'Audiência', process, courtUnit: hearing.courtUnit || hearing.court || '', date, time, restricted: Boolean(hearing.restricted || hearing.segredoJustica) } }).isNew) recorded++;
    }
    return { recorded, enqueued: 0, deferred: true };
  }

  async onTasksCompleted(workspaceId, tasks = [], { actor = '', actorUserId = '', processes = [] } = {}) {
    const users = await this.getWorkspaceUsers(workspaceId);
    const usersById = new Map(users.map(user => [String(user.id || ''), user]));
    const processById = new Map((Array.isArray(processes) ? processes : []).map(process => [String(process.id || ''), process]));
    const processByNumber = new Map((Array.isArray(processes) ? processes : [])
      .map(process => [String(process.number || '').replace(/\D/g, ''), process])
      .filter(([key]) => key));
    let recorded = 0;
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const taskId = String(task?.id || '').trim();
      if (!taskId || String(task?.status || '') !== 'concluida') continue;
      const completedAt = String(task.completedAt || new Date().toISOString());
      const process = (task.processId && processById.get(String(task.processId)))
        || processByNumber.get(String(task.process || '').replace(/\D/g, ''))
        || null;
      const audienceUserIds = new Set();
      const add = value => { const id = String(value || '').trim(); if (id) audienceUserIds.add(id); };
      // Escopo privado (specs/office-teams-access.md): uma tarefa privada — ou
      // vinculada a processo privado — nunca vaza para assignees, followers,
      // responsáveis ou ator alheios. A audiência fica restrita ao dono privado,
      // reaproveitando o mesmo predicado dos produtores irmãos.
      if (isPrivateOperationalRecord(task) || isPrivateOperationalRecord(process)) {
        const owner = String(task.privateOwnerUserId || task.ownerUserId
          || process?.privateOwnerUserId || process?.ownerUserId || '').trim();
        const ownerUser = usersById.get(owner) || users.find(user => String(user.username || '') === owner);
        if (ownerUser) add(ownerUser.id);
        else if (owner) add(owner);
      } else {
        add(task.assigneeUserId);
        for (const id of Array.isArray(task.followerUserIds) ? task.followerUserIds : []) add(id);
        for (const id of Array.isArray(process?.responsibleUserIds) ? process.responsibleUserIds : []) add(id);
        if (!audienceUserIds.size) {
          for (const user of users) if (['admin', 'master_admin'].includes(user.role) && user.status === 'active') add(user.id);
        }
      }
      if (!audienceUserIds.size) continue;
      const audienceUsernames = [...audienceUserIds]
        .map(id => usersById.get(id)?.username)
        .filter(Boolean);
      const fingerprint = createHash('sha256').update(`${workspaceId}:task-completed:${taskId}:${completedAt}`).digest('hex');
      const result = this.db.recordEvent({
        workspaceId,
        eventType: TASK_COMPLETED_EVENT,
        fingerprint,
        payload: {
          taskId,
          title: String(task.title || 'Tarefa concluída').slice(0, 160),
          process: String(task.process || process?.number || '').slice(0, 80),
          processId: String(task.processId || process?.id || '').slice(0, 80),
          client: String(task.client || process?.client || '').slice(0, 120),
          actor: String(actor || task.completedBy || 'Usuário').slice(0, 120),
          actorUserId: String(actorUserId || ''),
          completedAt,
          audienceUserIds: [...audienceUserIds],
          audienceUsernames
        }
      });
      if (result.isNew) recorded++;
    }
    return { recorded };
  }

  listTaskCompletionInbox(workspaceId, identity = {}) {
    return this.db.listTaskCompletionInbox(workspaceId, identity);
  }

  markTaskCompletionInboxRead(workspaceId, userId, eventIds = []) {
    return this.db.markTaskCompletionInboxRead(workspaceId, userId, eventIds);
  }

  async dispatchTaskCompletionDigest(workspaceId, users = [], state = {}, options = {}) {
    const now = new Date(options.now ?? Date.now());
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (Number(values.hour) !== 19) return { enqueued: 0, deferred: true, reason: 'OUTSIDE_19H_WINDOW' };
    const day = `${values.year}-${values.month}-${values.day}`;
    const since = new Date(now.getTime() - 86400000).toISOString();
    const events = this.db.getTaskCompletionEvents(workspaceId, { since, until: now.toISOString(), limit: 1000 });
    if (!events.length) return { enqueued: 0, day, reason: 'NO_COMPLETIONS' };
    const byEmail = new Map();
    for (const user of Array.isArray(users) ? users : await this.getWorkspaceUsers(workspaceId)) {
      if (user.status !== 'active') continue;
      const email = String(user.email || '').trim().toLowerCase();
      if (!email.includes('@')) continue;
      const userId = String(user.id || '');
      const matches = events.filter(event => {
        const ids = Array.isArray(event.payload?.audienceUserIds) ? event.payload.audienceUserIds.map(String) : [];
        const usernames = Array.isArray(event.payload?.audienceUsernames) ? event.payload.audienceUsernames.map(String) : [];
        return ids.includes(userId) || usernames.includes(String(user.username || ''));
      });
      if (!matches.length) continue;
      const current = byEmail.get(email) || { email, user, events: [] };
      current.events.push(...matches);
      byEmail.set(email, current);
    }
    let enqueued = 0;
    let failed = 0;
    for (const recipient of byEmail.values()) {
      const unique = [...new Map(recipient.events.map(event => [event.id, event])).values()];
      const template = renderTaskCompletionDigest({
        items: unique.map(event => ({
          taskId: event.payload?.taskId,
          title: event.payload?.title,
          actor: event.payload?.actor,
          completedAt: event.payload?.completedAt,
          process: event.payload?.process,
          client: event.payload?.client
        })),
        date: now,
        baseUrl: this.baseUrl
      });
      const id = `obx-${Date.now()}-${randomBytes(4).toString('hex')}`;
      const key = `task-digest/${workspaceId}/${day}/${hashRecipient(recipient.email)}`;
      try {
        const queued = this.db.enqueueOutbox({
          id,
          workspaceId,
          eventType: 'TASK_COMPLETED_DIGEST',
          recipient: recipient.email,
          payload: { from: this.provider.getFromAddress('general'), subject: template.subject, html: template.html, text: template.text, tags: this.buildRoutingTags(workspaceId, id, 'TASK_COMPLETED_DIGEST') },
          idempotencyKey: key
        });
        if (queued.enqueued) enqueued++;
      } catch {
        failed++;
      }
    }
    return { enqueued, failed, day };
  }

  async onSyncFailed(workspaceId, { syncJobId = null, failures = [] } = {}) {
    const cleanFailures = (Array.isArray(failures) ? failures : []).map(f => ({ portal: String(f.portal || f.name || 'Portal Judicial'), category: String(f.category || f.errorCategory || 'Falha de comunicação') }));
    const fingerprint = NotificationService.syncFailedFingerprint(workspaceId, syncJobId, cleanFailures[0]?.portal || 'all');
    const record = this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.SYNC_FAILED, fingerprint, payload: { syncJobId, failures: cleanFailures, timestamp: new Date().toISOString() } });
    return { recorded: record.isNew ? 1 : 0, enqueued: 0, deferred: true };
  }

  async checkA1Certificates(workspaceId, certSummary = null, options = {}) {
    const expiry = new Date(certSummary?.notAfter || '');
    if (!Number.isFinite(expiry.getTime())) return { alerts: 0 };
    const diffDays = Math.ceil((expiry.getTime() - new Date(options.now ?? Date.now()).getTime()) / 86400000);
    if (diffDays > 30) return { alerts: 0 };
    const milestone = A1_MILESTONES.find(m => diffDays <= m);
    const fingerprint = NotificationService.a1CertFingerprint(workspaceId, certSummary.fingerprintSha256Masked || 'cert-default', milestone);
    const record = this.db.recordEvent({ workspaceId, eventType: EVENT_TYPES.A1_CERT_EXPIRING, fingerprint, payload: { holder: certSummary.holder || 'Advogado Titular', documentMasked: certSummary.documentMasked || '***.***.***-**', notAfter: certSummary.notAfter, milestoneDays: milestone } });
    return { alerts: record.isNew ? 1 : 0, enqueued: 0, deferred: true };
  }

  async dispatchImmediate() {
    return { sent: 0, enqueued: 0, deferred: true, reason: 'SCHEDULED_BULLETINS_ONLY' };
  }

  async dispatchSyncDigest() {
    return this.dispatchImmediate();
  }

  async dispatchSyncDigestUnlocked() {
    return this.dispatchImmediate();
  }

  async dispatchDailyDigest() {
    return this.dispatchImmediate();
  }

  async dispatchScheduledBulletins(workspaceId, users, state, options = {}) {
    bulletinPeriod(options.now ?? Date.now());
    return dispatchScheduledBulletins(this, workspaceId, users, state, options);
  }

  pendingDigestEventCount(workspaceId) {
    return this.db.getPendingEventsForDigest(workspaceId, Object.values(EVENT_TYPES), this.db.getActivationWatermark()).length;
  }

  /** Conta, início de uso, resumo e comercial. A chave impede o reenvio. */
  enqueueLifecycleEmail({ workspaceId, eventType, recipient, from, template, idempotencyKey, headers = {} }) {
    const id = `obx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    return this.db.enqueueOutbox({
      id,
      workspaceId,
      eventType,
      recipient: String(recipient).trim().toLowerCase(),
      payload: { from, subject: template.subject, html: template.html, text: template.text, headers, tags: this.buildRoutingTags(workspaceId, id, eventType) },
      idempotencyKey
    });
  }

  async sendTestEmail({ workspaceId, recipient }) {
    if (!recipient || !recipient.includes('@')) throw Object.assign(new Error('Destinatário inválido para o teste.'), { statusCode: 400 });
    const template = renderTestEmail({ recipient, baseUrl: this.baseUrl });
    const id = `obx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    return this.db.enqueueOutbox({ id, workspaceId, eventType: 'SYSTEM_TEST', recipient, payload: { from: this.provider.getFromAddress('general'), subject: template.subject, html: template.html, text: template.text, tags: this.buildRoutingTags(workspaceId, id, 'SYSTEM_TEST') }, idempotencyKey: `test-email/${workspaceId}/${Date.now()}/${hashRecipient(recipient)}` });
  }

  async sendPasswordResetEmail({ workspaceId, recipient, displayName = '', resetUrl, expiresMinutes = 30 }) {
    const cleanRecipient = String(recipient || '').trim().toLowerCase();
    if (!cleanRecipient.includes('@')) throw Object.assign(new Error('Destinatário inválido para redefinição de senha.'), { statusCode: 400 });
    if (!String(resetUrl || '').trim()) throw Object.assign(new Error('Link de redefinição de senha ausente.'), { statusCode: 400 });
    const template = renderPasswordReset({ displayName, resetUrl, expiresMinutes, baseUrl: this.baseUrl });
    const since = new Date(Date.now() - 86400000).toISOString();
    if (this.db.countOutboxByEventTypeSince(workspaceId, PASSWORD_RESET_EVENT, since) >= PASSWORD_RESET_DAILY_LIMIT) {
      this.logger.warn?.('[NotificationService] Limite diário de e-mails de redefinição de senha atingido para o escritório.');
      return { enqueued: false, throttled: true };
    }
    const id = `obx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    return this.db.enqueueOutbox({ id, workspaceId, eventType: PASSWORD_RESET_EVENT, recipient: cleanRecipient, payload: { from: this.provider.getFromAddress('general'), subject: template.subject, html: template.html, text: template.text, tags: this.buildRoutingTags(workspaceId, id, PASSWORD_RESET_EVENT) }, idempotencyKey: `password-reset/${workspaceId}/${Date.now()}-${randomBytes(6).toString('hex')}` });
  }
}
