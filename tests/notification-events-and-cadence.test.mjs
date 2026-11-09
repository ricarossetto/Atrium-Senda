import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { NotificationDatabase, hashRecipient } from '../lib/notifications/db.mjs';
import { NotificationWorker } from '../lib/notifications/worker.mjs';
import { NotificationService, EVENT_TYPES, CADENCES } from '../lib/notifications/notification-service.mjs';
import { bulletinPeriod, buildBulletinContext } from '../lib/notifications/helpers-bulletin-cadence.mjs';
import { SecurityManager } from '../lib/security.mjs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ResendProvider } from '../lib/notifications/providers/resend-provider.mjs';

 test('provider acceptance lost on the network keeps a durable first request window across restart', async t => {
  for (const hours of [23, 25]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-delivery-window-'));
    const dbPath = path.join(dir, 'notifications.sqlite');
    let db = new NotificationDatabase({ dbPath });
    t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    let clock = Date.parse('2026-10-10T11:00:00.000Z');
    let fetches = 0;
    let acceptances = 0;
    const accepted = new Map();
    const provider = new ResendProvider({ apiKey: 'synthetic-api-key', fetchFn: async (_url, request) => {
      fetches++;
      const boundary = db.db.prepare('SELECT first_provider_attempt_at FROM notification_outbox WHERE idempotency_key = ?').get(request.headers['Idempotency-Key']);
      assert.equal(boundary.first_provider_attempt_at, new Date(Date.parse('2026-10-10T11:00:00.000Z')).toISOString());
      const other = new DatabaseSync(dbPath);
      other.exec('BEGIN IMMEDIATE; ROLLBACK;');
      other.close();
      const key = request.headers['Idempotency-Key'];
      const previous = accepted.get(key);
      if (previous === undefined || clock - previous >= 86400000) { accepted.set(key, clock); acceptances++; }
      if (fetches === 1) throw new Error('synthetic-api-key secret recipient@example.test');
      return new Response(JSON.stringify({ id: 'synthetic-accepted' }), { status: 200 });
    } });
    db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
    record(db, 'window-publication');
    const service = new NotificationService({ db, provider, securityManager: { listUsers: () => users }, routingSecret: 'synthetic-routing-secret-test' });
    assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8) })).enqueued, 1);
    const item = outboxes(db)[0];
    const worker = () => new NotificationWorker({ getDatabases: () => [db], provider, now: () => clock, logger: { warn() {}, error() {} } });
    await worker().processCycle();
    assert.equal(db.getOutboxItemById(item.id).status, 'RETRYABLE_ERROR');
    assert.equal(db.getOutboxItemById(item.id).first_provider_attempt_at, new Date(clock).toISOString());
    assert.equal(db.getOutboxItemById(item.id).last_error, 'DELIVERY_UNCONFIRMED');
    db.close();
    db = new NotificationDatabase({ dbPath });
    new NotificationService({ db, provider, securityManager: { listUsers: () => users }, routingSecret: 'synthetic-routing-secret-test' });
    clock += hours * 3600000;
    db.db.prepare("UPDATE notification_outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(item.id);
    await worker().processCycle();
    const result = db.getOutboxItemById(item.id);
    assert.equal(fetches, hours === 23 ? 2 : 1);
    assert.equal(acceptances, 1);
    assert.equal(result.status, hours === 23 ? 'SENT' : 'FAILED');
    if (hours === 25) assert.equal(result.last_error, 'DELIVERY_WINDOW_EXPIRED');
    assert(!JSON.stringify(db.getStats()).includes('recipient@example.test'));
    assert(!JSON.stringify(db.getStats()).includes('synthetic-api-key'));
  }
});

test('crash after the durable boundary and confirmed 429 both expire without another HTTP request', async t => {
  for (const rejected of [false, true]) {
    const { db } = fixture(t, { inMemory: true });
    let clock = Date.now();
    let fetches = 0;
    const provider = new ResendProvider({ apiKey: 'synthetic-key', fetchFn: async () => {
      fetches++;
      return new Response(JSON.stringify({ message: 'Synthetic rejection' }), { status: 429, headers: { 'Retry-After': '1' } });
    } });
    const item = db.enqueueOutbox({ workspaceId: ws, eventType: 'SYSTEM_TEST', recipient: users[0].email, payload: { subject: 'Sintético' }, idempotencyKey: `synthetic-crash-${rejected}` });
    if (rejected) await new NotificationWorker({ getDatabases: () => [db], provider, now: () => clock, logger: { warn() {} } }).processCycle();
    else {
      const claim = db.claimNextOutboxBatch()[0];
      assert.equal(db.beginProviderAttempt(item.id, claim, clock).allowed, true);
    }
    const first = db.getOutboxItemById(item.id).first_provider_attempt_at;
    clock += 25 * 3600000;
    db.db.prepare("UPDATE notification_outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z', claim_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(item.id);
    await new NotificationWorker({ getDatabases: () => [db], provider, now: () => clock }).processCycle();
    assert.equal(fetches, rejected ? 1 : 0);
    assert.equal(db.getOutboxItemById(item.id).status, 'FAILED');
    assert.equal(db.getOutboxItemById(item.id).last_error, 'DELIVERY_WINDOW_EXPIRED');
    assert.equal(db.getOutboxItemById(item.id).first_provider_attempt_at, first);
  }
});

test('stale claims without a durable provider boundary never acquire a new request window', async t => {
  const { db, provider, calls } = fixture(t, { inMemory: true });
  const item = db.enqueueOutbox({ workspaceId: ws, eventType: 'SYSTEM_TEST', recipient: users[0].email, payload: { subject: 'Teste' }, idempotencyKey: 'synthetic-stale-unknown' });
  db.db.prepare("UPDATE notification_outbox SET status = 'SENDING', attempts = 1, claim_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(item.id);
  await new NotificationWorker({ getDatabases: () => [db], provider }).processCycle();
  assert.equal(calls.length, 0);
  assert.equal(db.getOutboxItemById(item.id).status, 'FAILED');
  assert.equal(db.getOutboxItemById(item.id).last_error, 'DELIVERY_UNCONFIRMED');
});

test('unknown legacy scopes hold old events durably while fresh events and other recipients keep their cadence', async t => {
  for (const status of ['SENT', 'SENDING']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-legacy-hold-'));
    const dbPath = path.join(dir, 'notifications.sqlite');
    let db = new NotificationDatabase({ dbPath });
    t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
    const old = record(db, 'old-held');
    const source = db.enqueueOutbox({ workspaceId: ws, eventType: 'DAILY_DIGEST', recipient: users[0].email, payload: { html: '<p>Sintético sem IDs</p>' }, idempotencyKey: `daily-digest/${ws}/2026-10-10/${hashRecipient(users[0].email)}` });
    db.db.prepare('UPDATE notification_outbox SET status = ?, created_at = ? WHERE id = ?').run(status, new Date(at(7)).toISOString(), source.id);
    db.db.exec('DROP TABLE notification_bulletins; DROP TABLE notification_event_coverage; DROP TABLE notification_preference_cutoffs; DROP TABLE IF EXISTS notification_legacy_coverage_holds;');
    db._ensureBulletinTables();
    assert.equal(db.getPendingBulletinEvents(ws, hashRecipient(users[0].email), [EVENT_TYPES.PUBLICATION_NEW], '', new Date(at(8)).toISOString()).length, 0);
    assert(db.db.prepare('SELECT id FROM notification_events WHERE id = ?').get(old));
    assert.equal(db.db.prepare('SELECT count(*) AS n FROM notification_event_coverage WHERE event_id = ?').get(old).n, 0);
    db.close();
    db = new NotificationDatabase({ dbPath });
    const provider = { getFromAddress: () => 'teste@example.test', checkBudget: () => ({ allowed: true }), sendEmail: async () => ({ providerMessageId: 'synthetic-fresh' }) };
    const service = new NotificationService({ db, provider, securityManager: { listUsers: () => users }, routingSecret: 'synthetic-routing-secret-test' });
    const blocked = await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8) });
    assert.equal(blocked.enqueued, 0);
    assert.equal(blocked.reason, 'UNRESOLVED_LEGACY_COVERAGE');
    assert.equal(blocked.unresolvedLegacyCoverage, 1);
    const fresh = record(db, 'fresh-after-cutoff', undefined, undefined, at(9));
    const result = await service.dispatchScheduledBulletins(ws, users, {}, { now: at(14) });
    assert.equal(result.enqueued, 2);
    assert.equal(result.unresolvedLegacyCoverage, 1);
    const bulletins = outboxes(db).filter(item => item.event_type === 'OPERATIONAL_BULLETIN');
    assert.deepEqual(bulletins.find(item => item.recipient === users[0].email).payload.events.map(event => event.id), [fresh]);
    assert.deepEqual(bulletins.find(item => item.recipient === users[1].email).payload.events.map(event => event.id).sort(), [old, fresh].sort());
    assert.equal(db.getLegacyCoverageDiagnostics('ws-other', hashRecipient(users[0].email)).holds, 0);
    assert.equal((await new NotificationWorker({ getDatabases: () => [db], provider }).processCycle()).processedCount, 2);
    assert.equal(db.getOutboxItemById(source.id).status, status === 'SENT' ? 'SENT' : 'FAILED');
  }
});

const ws = 'ws-synthetic';
const users = [
  { id: 'admin-test', username: 'admin-test', email: 'admin@example.test', role: 'admin', status: 'active' },
  { id: 'collab-test', username: 'collab-test', email: 'collab@example.test', role: 'collaborator', status: 'active' }
];
const at = (hour, day = '2026-10-10') => `${day}T${String(hour).padStart(2, '0')}:00:00-03:00`;
function fixture(t, options = {}) {
  const db = new NotificationDatabase(options);
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  const calls = [];
  const provider = {
    getFromAddress: () => 'teste@example.test', checkBudget: () => ({ allowed: true }),
    sendEmail: async payload => { calls.push(payload); return { providerMessageId: 'synthetic-message' }; }
  };
  const service = new NotificationService({ db, provider, routingSecret: 'synthetic-routing-secret-test', securityManager: { listUsers: () => users }, logger: { warn() {} } });
  t.after(() => db.close());
  return { db, provider, service, calls };
}
function record(db, id, type = EVENT_TYPES.PUBLICATION_NEW, payload = { id, text: `Texto ${id}` }, time = at(7), workspaceId = ws) {
  const result = db.recordEvent({ workspaceId, eventType: type, fingerprint: `${type}:${id}`, payload });
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE id = ?').run(new Date(time).toISOString(), result.id);
  return result.id;
}
function outboxes(db) {
  return db.db.prepare('SELECT id FROM notification_outbox ORDER BY rowid').all().map(row => db.getOutboxItemById(row.id));
}

 test('sync, daily and legacy immediate defer all operational types; canonical legacy preferences normalize safely', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  for (const cadence of [CADENCES.IMMEDIATE, CADENCES.SYNC_DIGEST, CADENCES.DAILY]) {
    db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence });
    assert.equal((await service.resolveUserPreference(ws, users[0].id, EVENT_TYPES.PUBLICATION_NEW, 'admin')).cadence, CADENCES.BULLETINS);
    assert.equal(db.getUserPreferences(ws, users[0].id)[0].cadence, cadence);
  }
  const pub = { id: 'pub-test', sourceText: 'Conteúdo sintético <b>escapado</b>', client: 'Cliente Teste', opposingParty: 'Parte Teste', term: 'Advogada Teste · OAB/RS 000000', description: 'Descrição Teste' };
  assert.equal((await service.onNewPublications(ws, [pub])).enqueued, 0);
  assert.equal((await service.onNewPublications(ws, [pub])).recorded, 0);
  assert.equal((await service.onNewHearings(ws, [{ id: 'hearing-test', date: '2026-10-10' }])).enqueued, 0);
  assert.equal((await service.onNewHearings(ws, [{ id: 'hearing-test', date: '2026-10-10' }])).recorded, 0);
  const movements = [{ processId: 'process-test', date: '2026-10-10', description: 'Andamento Teste', source: 'DataJud' }];
  assert.equal((await service.onNewMovements(ws, movements)).recorded, 1);
  assert.equal((await service.onNewMovements(ws, movements)).recorded, 0);
  const tasks = [{ id: 'task-test', title: 'Prazo Teste', fatalDeadline: at(20) }];
  assert.equal((await service.checkDeadlines(ws, tasks, { now: at(8) })).alerts, 1);
  assert.equal((await service.checkDeadlines(ws, tasks, { now: at(8) })).alerts, 0);
  assert.equal((await service.onSyncFailed(ws, { syncJobId: 'job-test', failures: [{ portal: 'Portal Teste', category: 'Timeout' }] })).enqueued, 0);
  const cert = { notAfter: at(8, '2026-10-20'), fingerprintSha256Masked: 'synthetic-cert' };
  assert.equal((await service.checkA1Certificates(ws, cert, { now: at(8) })).alerts, 1);
  assert.equal((await service.checkA1Certificates(ws, cert, { now: at(8) })).alerts, 0);
  for (const method of ['dispatchSyncDigest', 'dispatchDailyDigest', 'dispatchImmediate', 'dispatchSyncDigestUnlocked']) {
    const result = await service[method](ws);
    assert.equal(result.sent, 0);
    assert.equal(result.deferred, true);
  }
  assert.equal(outboxes(db).length, 0);
  db.db.prepare('UPDATE notification_events SET created_at = ?').run(new Date(at(7)).toISOString());
  assert.equal((await service.dispatchScheduledBulletins(ws, users, {}, { now: at(8) })).enqueued, 2);
  const admin = outboxes(db).find(item => item.recipient === users[0].email);
  const collab = outboxes(db).find(item => item.recipient === users[1].email);
  assert.equal(admin.payload.events.length, 6);
  assert.equal(collab.payload.events.length, 4);
  assert.equal(admin.payload.events.find(event => event.event_type === EVENT_TYPES.PUBLICATION_NEW).payload.opposingParty, pub.opposingParty);
  assert(admin.payload.text.includes(pub.sourceText));
  assert(admin.payload.html.includes('&lt;b&gt;escapado&lt;/b&gt;'));
  assert(!admin.payload.html.includes('<b>escapado</b>'));
  assert(admin.payload.text.includes(pub.client));
  db.upsertPreference({ workspaceId: ws, userId: 'legacy-name', eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DISABLED, enabled: false });
  assert.equal((await service.resolveUserPreference(ws, 'canonical-test', EVENT_TYPES.PUBLICATION_NEW, 'admin', ['legacy-name'])).enabled, false);
  db.upsertPreference({ workspaceId: ws, userId: 'canonical-test', eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DAILY });
  assert.equal((await service.resolveUserPreference(ws, 'canonical-test', EVENT_TYPES.PUBLICATION_NEW, 'admin', ['legacy-name'])).cadence, CADENCES.BULLETINS);
  db.upsertPreference({ workspaceId: ws, userId: users[1].id, eventType: EVENT_TYPES.SYNC_FAILED, cadence: CADENCES.IMMEDIATE });
  assert.equal((await service.resolveUserPreference(ws, users[1].id, EVENT_TYPES.SYNC_FAILED, 'collaborator')).enabled, false);
});

test('first boot preserves explicit disable and activation watermark excludes historical events', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const historical = record(db, 'historical');
  db.setSetting('notifications_enabled_at', new Date(at(7, '2026-10-11')).toISOString());
  assert.equal(db.ensureDefaultWorkspaceState(), false);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8, '2026-10-11') })).enqueued, 0);
  assert(db.db.prepare('SELECT id FROM notification_events WHERE id = ?').get(historical));
  db.setWorkspaceEnabled(false);
  assert.equal(db.ensureDefaultWorkspaceState(), false);
  assert.equal(db.isWorkspaceEnabled(), false);
});

test('BRT turns bound maximum three messages per recipient, late events carry, and empty turns reserve nothing', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  record(db, 'morning');
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(7) })).enqueued, 0);
  for (const [hour, id] of [[8, 'late-morning'], [14, 'late-afternoon'], [20, 'late-night']]) {
    assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(hour) })).enqueued, 1);
    record(db, id, undefined, undefined, at(hour + 1));
    assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(hour + 1) })).enqueued, 0);
  }
  assert.deepEqual(outboxes(db).map(item => item.payload.bulletin.slot), [8, 14, 20]);
  assert.equal(outboxes(db).length, 3);
  const nightPending = db.getPendingBulletinEvents(ws, hashRecipient(users[0].email), [EVENT_TYPES.PUBLICATION_NEW], '', '9999', 100);
  assert.deepEqual(nightPending.map(event => event.payload.id), ['late-night']);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(0, '2026-10-11') })).enqueued, 0);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8, '2026-10-11') })).enqueued, 1);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(14, '2026-10-11') })).enqueued, 0);
  assert.equal(outboxes(db).length, 4);
  assert.equal(bulletinPeriod('2026-10-11T02:59:00Z').day, '2026-10-10');
  assert.equal(bulletinPeriod('2026-10-11T03:00:00Z').slot, null);
  assert.equal(bulletinPeriod('2026-10-10T16:59:00Z').slot, 8);
  assert.equal(bulletinPeriod('2026-10-10T17:00:00Z').slot, 14);
});

 test('first useful bulletin has both contexts once; later includes only actual changes and canonical deadlines', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const state = {
    agenda: [{ id: 'today', title: 'Hoje Teste', date: '2026-10-10' }, { id: 'tomorrow', title: 'Amanhã Teste', date: '2026-10-11' }],
    tasks: [{ id: 'deadline', title: 'Prazo Teste', deadline: '2026-10-13' }, { id: 'reference-only', sourceReportedDeadlineAt: '2026-10-10' }, { id: 'absorbed', deadline: '2026-10-10', absorbedInto: 'deadline' }, { id: 'disabled', deadline: '2026-10-10', active: false }, { id: 'inferred', title: 'Recurso 15 dias' }]
  };
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(8) })).enqueued, 1);
  const first = outboxes(db)[0].payload;
  assert.equal(first.bulletin.includeFullContext, true);
  assert.equal(first.digestContext.agendaToday.length, 1);
  assert.equal(first.digestContext.agendaTomorrow.length, 1);
  assert.equal(first.digestContext.deadlines.length, 1);
  const worker = new NotificationWorker({ getDatabases: () => [db], provider: service.provider });
  assert.equal((await worker.processCycle()).processedCount, 1);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(14) })).enqueued, 0);
  record(db, 'new-event', undefined, undefined, at(13));
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(14) })).enqueued, 1);
  assert.deepEqual(outboxes(db)[1].payload.digestContext, { agendaToday: [], agendaTomorrow: [], deadlines: [] });
  assert.equal(outboxes(db)[1].payload.bulletin.includeFullContext, false);
  state.agenda[0].time = '18:30';
  state.agenda[1].title = 'Amanhã alterada Teste';
  state.tasks.push({ id: 'fatal', fatalDeadline: '2026-10-11', title: 'Fatal Teste' });
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(20) })).enqueued, 1);
  const changed = outboxes(db)[2].payload;
  assert.equal(changed.digestContext.agendaToday.length, 1);
  assert.equal(changed.digestContext.agendaTomorrow.length, 1);
  assert.equal(changed.digestContext.deadlines.length, 1);
  assert.equal(changed.bulletin.noticeChanges.removed.agendaToday.length, 1);
});

 test('concurrent service instances, per-recipient pending SQL and partial pages isolate coverage', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const second = new NotificationService({ db, provider: service.provider, routingSecret: service.routingSecret });
  for (let index = 0; index < 5; index++) record(db, `page-${index}`);
  record(db, 'other-tenant', undefined, undefined, at(7), 'ws-other');
  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 ? second : service).dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8), limit: 2 })));
  assert.equal(results.reduce((total, result) => total + result.enqueued, 0), 1);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).length, 3);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[1].email)).length, 5);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[1]], {}, { now: at(8), limit: 2 })).enqueued, 1);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(14), limit: 2 })).enqueued, 1);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(20), limit: 2 })).enqueued, 1);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).length, 0);
  assert.equal(db.getPendingEventsForDigest('ws-other', [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).length, 1);
  await assert.rejects(service.dispatchScheduledBulletins('ws-other', users, {}, { now: at(8) }), /WORKSPACE_MISMATCH/);
});

 test('queue failure rolls back quota and event coverage for A without losing recipient B', async t => {
  const { db, service, provider } = fixture(t, { inMemory: true });
  record(db, 'failure-test');
  const enqueue = db.enqueueOutbox.bind(db);
  let fail = true;
  db.enqueueOutbox = args => { if (fail && args.recipient === users[0].email) throw new Error('Synthetic queue failure'); return enqueue(args); };
  const result = await service.dispatchScheduledBulletins(ws, users, {}, { now: at(8) });
  assert.equal(result.failed, 1);
  assert.equal(result.enqueued, 1);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).length, 1);
  fail = false;
  assert.equal((await service.dispatchScheduledBulletins(ws, users, {}, { now: at(8) })).enqueued, 1);
  provider.sendEmail = async payload => {
    assert.equal(db.db.isTransaction, false);
    if (payload.to === users[0].email) throw Object.assign(new Error('Synthetic network failure'), { retryable: true });
    return { providerMessageId: 'synthetic-b' };
  };
  const worker = new NotificationWorker({ getDatabases: () => [db], provider, logger: { warn() {} } });
  assert.equal((await worker.processCycle()).processedCount, 1);
  assert.equal(outboxes(db).find(item => item.recipient === users[0].email).status, 'RETRYABLE_ERROR');
  assert.equal(outboxes(db).find(item => item.recipient === users[1].email).status, 'SENT');
  const retry = outboxes(db).find(item => item.recipient === users[0].email);
  assert.equal((await service.dispatchScheduledBulletins(ws, users, {}, { now: at(9) })).enqueued, 0);
  db.db.prepare('UPDATE notification_outbox SET next_attempt_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', retry.id);
  provider.sendEmail = async payload => {
    assert.equal(payload.idempotencyKey, retry.idempotency_key);
    assert.equal(payload.html, retry.payload.html);
    return { providerMessageId: 'synthetic-a' };
  };
  assert.equal((await worker.processCycle()).processedCount, 1);
  assert.equal(db.getOutboxItemById(retry.id).status, 'SENT');
});

 test('master disable cancels unsent operational quota, opt-outs skip backlog, transactional mail remains immediate', async t => {
  const { db, service, provider, calls } = fixture(t, { inMemory: true });
  record(db, 'queued-test');
  await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8) });
  db.setWorkspaceEnabled(false);
  assert.equal(outboxes(db)[0].status, 'CANCELLED');
  await service.sendPasswordResetEmail({ workspaceId: ws, recipient: users[0].email, resetUrl: 'https://example.test/reset/synthetic' });
  await service.sendTestEmail({ workspaceId: ws, recipient: users[0].email });
  const worker = new NotificationWorker({ getDatabases: () => [db], provider });
  assert.equal((await worker.processCycle()).processedCount, 2);
  assert.equal(calls.length, 2);
  const old = record(db, 'disabled-test');
  db.setWorkspaceEnabled(true);
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', old);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(14) })).enqueued, 0);
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  record(db, 'optout-test');
  db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DISABLED, enabled: false });
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(14) })).enqueued, 0);
  db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DAILY, enabled: true });
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(20) })).enqueued, 0);
  const external = db.addRecipient({ workspaceId: ws, name: 'Destinatário Teste', email: 'external@example.test' });
  db.updateRecipient(ws, external.id, { enabled: false });
  record(db, 'suppressed-test');
  db.addSuppression(users[1].email, 'synthetic');
  await service.dispatchScheduledBulletins(ws, [users[1]], {}, { now: at(20) });
  db.removeSuppression(users[1].email);
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[1]], {}, { now: at(20) })).enqueued, 0);
});

test('personal and external opt-outs cancel unsent reservations before worker claim without retroactive reactivation', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const external = db.addRecipient({ workspaceId: ws, name: 'Externo Teste', email: 'external@example.test' });
  record(db, 'optout-reservation');
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(8) })).enqueued, 2);
  db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DISABLED, enabled: false });
  db.updateRecipient(ws, external.id, { enabled: false });
  assert.equal(db.claimNextOutboxBatch(10).length, 0);
  assert(outboxes(db).every(item => item.status === 'CANCELLED'));
  db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DAILY });
  db.updateRecipient(ws, external.id, { enabled: true });
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(14) })).enqueued, 0);
});

test('sensitive events and saved context use existing encryption; large canonical bodies are never truncated by cadence', async t => {
  const key = randomBytes(32);
  const securityManager = {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex');
      return { iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext };
    },
    decrypt({ iv, tag, ciphertext }) {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
      cipher.setAuthTag(Buffer.from(tag, 'hex'));
      return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'hex')), cipher.final()]).toString('utf8');
    }
  };
  const { db, service } = fixture(t, { inMemory: true, securityManager });
  const text = 'Conteúdo sintético '.repeat(4000);
  record(db, 'large-canonical', EVENT_TYPES.PUBLICATION_NEW, { id: 'large-canonical', text });
  const state = { agenda: [{ id: 'private-context', title: 'Compromisso Teste', date: '2026-10-10' }] };
  assert.equal((await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(8) })).enqueued, 1);
  const stored = db.db.prepare('SELECT recipient, payload FROM notification_outbox').get();
  assert(stored.recipient.startsWith('enc:v1:'));
  assert(stored.payload.startsWith('enc:v1:'));
  assert(db.db.prepare('SELECT context FROM notification_bulletins').get().context.startsWith('enc:v1:'));
  assert.equal(outboxes(db)[0].payload.events[0].payload.text, text);
  assert(!stored.payload.includes('Compromisso Teste'));
});

test('migration preserves per-recipient sent coverage and cancels queued avulsos without losing their pending events', async t => {
  const { db } = fixture(t, { inMemory: true });
  const eventId = record(db, 'legacy-covered');
  const queuedId = record(db, 'legacy-queued');
  const sent = db.enqueueOutbox({ workspaceId: ws, eventType: EVENT_TYPES.PUBLICATION_NEW, recipient: users[0].email, payload: { text: 'Sintético' }, idempotencyKey: `event/${eventId}/${hashRecipient(users[0].email)}` });
  db.markOutboxSent(sent.id, { providerMessageId: 'synthetic-legacy' });
  const queued = db.enqueueOutbox({ workspaceId: ws, eventType: EVENT_TYPES.PUBLICATION_NEW, recipient: users[0].email, payload: { text: 'Sintético' }, idempotencyKey: `event/${queuedId}/${hashRecipient(users[0].email)}` });
  db.db.exec('DROP TABLE notification_bulletins; DROP TABLE notification_event_coverage; DROP TABLE notification_preference_cutoffs;');
  db._ensureBulletinTables();
  assert.equal(db.getOutboxItemById(sent.id).status, 'SENT');
  assert.equal(db.getOutboxItemById(queued.id).status, 'CANCELLED');
  assert.deepEqual(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).map(event => event.id), [queuedId]);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[1].email)).length, 2);
});

test('each provider request rechecks canonical role, preferences, address, master and current status within the claimed batch', async t => {
  for (const change of ['role', 'preference', 'email', 'master', 'status', 'external']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-delivery-policy-'));
    const security = new SecurityManager({ dataDirectory: dir, sessionSecret: randomBytes(32).toString('base64url'), encryptionKey: randomBytes(32).toString('base64') });
    security.state = { defaultWorkspaceId: ws, users: [
      { ...users[0], workspaceId: ws },
      { id: 'second-test', username: 'second-test', email: 'second@example.test', role: 'admin', status: 'active', workspaceId: ws },
      { id: 'third-test', username: 'third-test', email: 'third@example.test', role: 'admin', status: 'active', workspaceId: ws }
    ] };
    const { db, service, provider } = fixture(t, { inMemory: true, securityManager: security });
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const external = change === 'external' ? db.addRecipient({ workspaceId: ws, name: 'Externo Teste', email: 'external@example.test' }) : null;
    record(db, 'delivery-publication');
    if (change === 'role') record(db, 'delivery-failure', EVENT_TYPES.SYNC_FAILED, { failures: [{ portal: 'Teste', category: 'Teste' }] });
    await service.dispatchScheduledBulletins(ws, security.listUsers(ws), {}, { now: at(8) });
    if (change === 'master' || change === 'role') {
      await service.sendPasswordResetEmail({ workspaceId: ws, recipient: 'second@example.test', resetUrl: 'https://example.test/reset/synthetic' });
      await service.sendTestEmail({ workspaceId: ws, recipient: 'second@example.test' });
    }
    const queued = outboxes(db);
    const target = queued.find(item => item.recipient === (external ? external.email : 'second@example.test'));
    const calls = [];
    const operationalCalls = [];
    provider.sendEmail = async payload => {
      calls.push(payload.to);
      if (payload.tags.some(tag => tag.name === 'atrium_event' && tag.value === 'OPERATIONAL_BULLETIN')) operationalCalls.push(payload.to);
      assert.equal(db.db.isTransaction, false);
      if (calls.length === 1) {
        if (change === 'role') await security.updateUserStatus('second-test', { role: 'collaborator' }, ws);
        if (change === 'preference') db.upsertPreference({ workspaceId: ws, userId: 'second-test', eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: 'DISABLED', enabled: false });
        if (change === 'email') security.state.users[1].email = 'changed@example.test';
        if (change === 'master') db.setWorkspaceEnabled(false);
        if (change === 'status') db.markOutboxCancelled(target.id);
        if (change === 'external') db.updateRecipient(ws, external.id, { email: 'changed-external@example.test' });
      }
      return { providerMessageId: `synthetic-${calls.length}` };
    };
    const worker = new NotificationWorker({ getDatabases: () => [db], provider });
    await worker.processCycle();
    assert(!operationalCalls.includes(target.recipient), change);
    assert.equal(db.getOutboxItemById(target.id).status, 'CANCELLED', change);
    if (change !== 'master') assert(operationalCalls.includes('third@example.test'), change);
    if (change === 'master' || change === 'role') {
      assert.equal(calls.filter(email => email === 'second@example.test').length, 2);
      assert(outboxes(db).filter(item => ['PASSWORD_RESET', 'SYSTEM_TEST'].includes(item.event_type)).every(item => item.status === 'SENT'));
    }
    const count = outboxes(db).length;
    assert.equal((await service.dispatchScheduledBulletins(ws, security.listUsers(ws), {}, { now: at(9) })).enqueued, 0);
    assert.equal(outboxes(db).length, count);
  }
});

test('first actually sent context survives a failed morning reservation and later differences retain privacy flags', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const state = {
    agenda: [{ id: 'today', title: 'Título Privado Teste', client: 'Cliente Privado Teste', date: '2026-10-10', restricted: true }, { id: 'tomorrow', title: 'Amanhã Privada Teste', date: '2026-10-11', segredoJustica: true }],
    tasks: [{ id: 'deadline', title: 'Prazo Privado Teste', deadline: '2026-10-11', isSecret: true }]
  };
  const context = buildBulletinContext(state, '2026-10-10');
  assert.equal(context.agendaToday[0].restricted, true);
  assert.equal(context.agendaTomorrow[0].segredoJustica, true);
  assert.equal(context.deadlines[0].isSecret, true);
  await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(8) });
  db.markOutboxFailed(outboxes(db)[0].id, 'Synthetic permanent failure');
  await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(14) });
  const afternoon = outboxes(db)[1];
  assert.equal(afternoon.payload.bulletin.includeFullContext, true);
  assert.equal(afternoon.payload.digestContext.agendaToday.length, 1);
  assert.equal(afternoon.payload.digestContext.agendaTomorrow.length, 1);
  assert(!afternoon.payload.text.includes('Título Privado Teste'));
  assert(!afternoon.payload.html.includes('Cliente Privado Teste'));
  db.markOutboxSent(afternoon.id, { providerMessageId: 'synthetic', sentAt: new Date(at(14)).toISOString() });
  state.agenda[0].time = '18:00';
  await service.dispatchScheduledBulletins(ws, [users[0]], state, { now: at(20) });
  const evening = outboxes(db)[2];
  assert.equal(evening.payload.bulletin.includeFullContext, false);
  assert.equal(evening.payload.bulletin.noticeChanges.removed.agendaToday[0].restricted, true);
  assert(!evening.payload.html.includes('Título Privado Teste'));
});

test('legacy FAILED and CANCELLED events stay pending; ambiguous SENDING is held under its original outbox', async t => {
  const { db } = fixture(t, { inMemory: true });
  const ids = {};
  for (const status of ['SENT', 'FAILED', 'CANCELLED', 'QUEUED', 'RETRYABLE_ERROR', 'SENDING']) {
    const eventId = record(db, status);
    const item = db.enqueueOutbox({ workspaceId: ws, eventType: EVENT_TYPES.PUBLICATION_NEW, recipient: users[0].email, payload: { text: 'Sintético' }, idempotencyKey: `event/${eventId}/${hashRecipient(users[0].email)}` });
    db.db.prepare('UPDATE notification_outbox SET status = ?, claim_expires_at = ? WHERE id = ?').run(status, '2000-01-01T00:00:00Z', item.id);
    ids[status] = item.id;
  }
  db.db.exec('DROP TABLE notification_bulletins; DROP TABLE notification_event_coverage; DROP TABLE notification_preference_cutoffs;');
  db._ensureBulletinTables();
  const pending = db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email));
  assert.deepEqual(pending.map(event => event.payload.id).sort(), ['CANCELLED', 'FAILED', 'QUEUED', 'RETRYABLE_ERROR']);
  assert.equal(db.getOutboxItemById(ids.SENDING).status, 'FAILED');
  assert.equal(db.getOutboxItemById(ids.SENDING).last_error, 'LEGACY_DELIVERY_AMBIGUOUS');
  assert.equal(db.getSetting('bulletin_migration_ambiguous_count'), '1');
});

test('HEAD daily digest without stable event identities remains conservatively pending with an explicit migration diagnostic', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  const source = execFileSync('git', ['show', '67cd7667:lib/notifications/notification-service.mjs'], { encoding: 'utf8' });
  const body = source.slice(source.indexOf('  async dispatchDailyDigest('), source.indexOf('  // --- TEST EMAIL ---'));
  const { createHash } = await import('node:crypto');
  const { renderPublicationDigest } = await import('../lib/notifications/templates/email-templates.mjs');
  const LegacyDaily = Function('hashRecipient', 'createHash', 'randomBytes', 'CADENCES', 'EVENT_TYPES', 'renderPublicationDigest', `return class { ${body} }`)(hashRecipient, createHash, randomBytes, CADENCES, EVENT_TYPES, renderPublicationDigest);
  const legacy = new LegacyDaily();
  Object.assign(legacy, { db, provider: service.provider, baseUrl: service.baseUrl, buildRoutingTags: service.buildRoutingTags.bind(service), getEligibleRecipients: async () => [users[0]] });
  record(db, 'legacy-daily');
  assert.equal((await legacy.dispatchDailyDigest(ws, '2026-10-10')).sent, 1);
  const item = outboxes(db)[0];
  assert.equal(item.event_type, 'DAILY_DIGEST');
  assert.equal(item.payload.events, undefined);
  assert.equal(item.idempotency_key, `daily-digest/${ws}/2026-10-10/${hashRecipient(users[0].email)}`);
  db.markOutboxSent(item.id, { providerMessageId: 'synthetic-legacy-daily' });
  db.db.prepare('UPDATE notification_outbox SET created_at = ? WHERE id = ?').run(new Date(at(7)).toISOString(), item.id);
  db.db.exec('DROP TABLE notification_bulletins; DROP TABLE notification_event_coverage; DROP TABLE notification_preference_cutoffs;');
  db._ensureBulletinTables();
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW]).length, 1);
  assert.equal(db.getPendingEventsForDigest(ws, [EVENT_TYPES.PUBLICATION_NEW], '', hashRecipient(users[0].email)).length, 0);
  assert.equal(db.getLegacyCoverageDiagnostics(ws, hashRecipient(users[0].email)).blockedEvents, 1);
  assert.equal(db.getSetting('bulletin_migration_unknown_coverage_count'), '1');
  assert.equal(db.getOutboxItemById(item.id).status, 'SENT');
});

test('unbound legacy metadata holds the workspace conservatively without affecting transationals or other workspaces', async t => {
  const { db, service } = fixture(t, { inMemory: true });
  record(db, 'historical-unbound');
  const source = db.enqueueOutbox({ workspaceId: ws, eventType: 'UNKNOWN_FORMAT', recipient: 'invalid-recipient', payload: {}, idempotencyKey: 'synthetic-unbound' });
  db.db.prepare("UPDATE notification_outbox SET status = 'SENT', created_at = 'invalid-clock', payload = 'invalid-json' WHERE id = ?").run(source.id);
  db.db.exec('DROP TABLE notification_legacy_coverage_holds;');
  db._ensureBulletinTables();
  const fresh = record(db, 'fresh-unbound', undefined, undefined, at(9));
  assert.equal(db.getPendingBulletinEvents(ws, hashRecipient(users[1].email), [EVENT_TYPES.PUBLICATION_NEW], '', new Date(at(14)).toISOString()).length, 0);
  assert.equal(db.getLegacyCoverageDiagnostics(ws, hashRecipient(users[1].email)).blockedEvents, 2);
  const hold = db.db.prepare('SELECT * FROM notification_legacy_coverage_holds WHERE source_outbox_id = ?').get(source.id);
  assert.equal(hold.recipient_hash, '*');
  assert.equal(hold.event_type, '*');
  assert.equal(hold.through_at, '9999-12-31T23:59:59.999Z');
  assert.equal(db.getLegacyCoverageDiagnostics('ws-unaffected', hashRecipient(users[1].email)).holds, 0);
  assert(db.db.prepare('SELECT id FROM notification_events WHERE id = ?').get(fresh));
  assert.equal((await service.sendTestEmail({ workspaceId: ws, recipient: users[1].email })).enqueued, true);
  assert.equal((await new NotificationWorker({ getDatabases: () => [db], provider: service.provider }).processCycle()).processedCount, 1);
});

test('additive window migration rolls back interrupted DDL and protects encrypted legacy scopes', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-migration-holds-'));
  const dbPath = path.join(dir, 'notifications.sqlite');
  let db;
  t.after(() => { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const security = new SecurityManager({ dataDirectory: dir, sessionSecret: randomBytes(48).toString('base64url'), encryptionKey: randomBytes(32).toString('base64') });
  await security.init();
  db = new NotificationDatabase({ dbPath, securityManager: security });
  const old = record(db, 'encrypted-legacy');
  const source = db.enqueueOutbox({ workspaceId: ws, eventType: 'UNKNOWN_LEGACY_LAYOUT', recipient: users[0].email, payload: { html: 'Sintético privado' }, idempotencyKey: 'synthetic-unknown-layout' });
  db.db.prepare("UPDATE notification_outbox SET status = 'SENDING', attempts = 1, created_at = ? WHERE id = ?").run(new Date(at(7)).toISOString(), source.id);
  const transactional = db.enqueueOutbox({ workspaceId: ws, eventType: 'PASSWORD_RESET', recipient: users[0].email, payload: { subject: 'Sintético' }, idempotencyKey: 'synthetic-password-migration' });
  db.db.exec('DROP TABLE notification_legacy_coverage_holds; ALTER TABLE notification_outbox DROP COLUMN first_provider_attempt_at; PRAGMA user_version = 17;');
  const original = db.encryptField.bind(db);
  db.encryptField = () => { throw new Error('Synthetic interruption'); };
  assert.throws(() => db._ensureBulletinTables(), /Synthetic interruption/);
  assert(!db.db.prepare('PRAGMA table_info(notification_outbox)').all().some(column => column.name === 'first_provider_attempt_at'));
  assert.equal(db.getOutboxItemById(source.id).status, 'SENDING');
  const interruptedBackup = db.migrationBackupPath;
  const backup = new DatabaseSync(interruptedBackup);
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert(!backup.prepare('PRAGMA table_info(notification_outbox)').all().some(column => column.name === 'first_provider_attempt_at'));
  backup.close();
  db.encryptField = original;
  db.close();
  db = new NotificationDatabase({ dbPath, securityManager: security });
  assert.equal(db.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.db.prepare('PRAGMA user_version').get().user_version, 17);
  assert.equal(db.getOutboxItemById(source.id).status, 'FAILED');
  assert.equal(db.getOutboxItemById(source.id).last_error, 'LEGACY_DELIVERY_AMBIGUOUS');
  assert.equal(db.getOutboxItemById(transactional.id).status, 'QUEUED');
  assert.equal(db.getLegacyCoverageDiagnostics(ws, hashRecipient(users[0].email)).blockedEvents, 1);
  assert.equal(db.getStats().unresolvedLegacyCoverage, 1);
  assert.equal(db.getPendingBulletinEvents(ws, hashRecipient(users[0].email), [EVENT_TYPES.PUBLICATION_NEW], '', new Date(at(8)).toISOString()).length, 0);
  assert.equal(db.getPendingBulletinEvents(ws, hashRecipient(users[1].email), [EVENT_TYPES.PUBLICATION_NEW], '', new Date(at(8)).toISOString())[0].id, old);
  const raw = db.db.prepare('SELECT recipient, payload FROM notification_outbox WHERE id = ?').get(source.id);
  assert(raw.recipient.startsWith('enc:v1:'));
  assert(raw.payload.startsWith('enc:v1:'));
  assert(!JSON.stringify(db.db.prepare('SELECT * FROM notification_legacy_coverage_holds').all()).includes(users[0].email));
});

test('persistent SQLite restart recovers crash-before-queue and missed latest slot, backup restores legacy preferences', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-bulletin-test-'));
  const opened = [];
  t.after(() => {
    for (const database of opened) database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const dbPath = path.join(dir, 'notifications.sqlite');
  const { db, service } = fixture(t, { dbPath });
  db.upsertPreference({ workspaceId: ws, userId: users[0].id, eventType: EVENT_TYPES.PUBLICATION_NEW, cadence: CADENCES.DAILY });
  db.addRecipient({ workspaceId: ws, name: 'Externo Teste', email: 'external@example.test' });
  record(db, 'crash-before-queue');
  db.close();
  const moduleUrl = new URL('../lib/notifications/db.mjs', import.meta.url).href;
  const serviceUrl = new URL('../lib/notifications/notification-service.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { NotificationDatabase } from ${JSON.stringify(moduleUrl)};
    import { NotificationService } from ${JSON.stringify(serviceUrl)};
    const db = new NotificationDatabase({ dbPath: ${JSON.stringify(dbPath)} });
    const service = new NotificationService({ db, provider: { getFromAddress: () => 'teste@example.test' }, routingSecret: 'synthetic-routing-secret-test' });
    const result = await service.dispatchScheduledBulletins(${JSON.stringify(ws)}, ${JSON.stringify([users[0]])}, {}, { now: ${JSON.stringify(at(21))} });
    if (result.enqueued !== 2) process.exitCode = 2;
    db.close();
  `], { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_ENV: 'test' } });
  assert.equal(child.status, 0, child.stderr);
  const restarted = new NotificationDatabase({ dbPath });
  opened.push(restarted);
  assert.equal(outboxes(restarted).length, 2);
  assert.equal(outboxes(restarted)[0].payload.bulletin.slot, 20);
  const restartedService = new NotificationService({ db: restarted, provider: service.provider, routingSecret: service.routingSecret });
  assert.equal((await restartedService.dispatchScheduledBulletins(ws, [users[0]], {}, { now: at(22) })).enqueued, 0);
  restarted.db.exec('DROP TABLE notification_bulletins; DROP TABLE notification_event_coverage; DROP TABLE notification_preference_cutoffs; DROP TABLE notification_legacy_coverage_holds; ALTER TABLE notification_outbox DROP COLUMN first_provider_attempt_at; PRAGMA user_version = 17;');
  restarted.close();
  const migrated = new NotificationDatabase({ dbPath });
  opened.push(migrated);
  assert(migrated.migrationBackupPath);
  assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version, 17);
  assert.equal(migrated.getUserPreferences(ws, users[0].id)[0].cadence, CADENCES.DAILY);
  assert.equal(migrated.listRecipients(ws).length, 1);
  const backup = new DatabaseSync(migrated.migrationBackupPath);
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(migrated.migrationBackupPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(dbPath).mode & 0o777, 0o600);
  }
  assert.equal(backup.prepare("SELECT count(*) AS n FROM notification_preferences").get().n, 1);
  assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name = 'notification_bulletins'").get(), undefined);
  assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name = 'notification_legacy_coverage_holds'").get(), undefined);
  assert(!backup.prepare('PRAGMA table_info(notification_outbox)').all().some(column => column.name === 'first_provider_attempt_at'));
  backup.close();
  const restorePath = path.join(dir, 'restored.sqlite');
  fs.copyFileSync(migrated.migrationBackupPath, restorePath);
  const legacySource = execFileSync('git', ['show', '67cd7667:lib/notifications/db.mjs'], { encoding: 'utf8' });
  const legacyPath = path.join(dir, 'legacy-db.mjs');
  fs.writeFileSync(legacyPath, legacySource, { mode: 0o600 });
  const restore = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { NotificationDatabase } = await import(${JSON.stringify(pathToFileURL(legacyPath).href)});
    const db = new NotificationDatabase({ dbPath: ${JSON.stringify(restorePath)} });
    if (db.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') process.exitCode = 2;
    if (db.getActivationWatermark() !== ${JSON.stringify(migrated.getActivationWatermark())}) process.exitCode = 3;
    if (db.listRecipients(${JSON.stringify(ws)}).length !== 1) process.exitCode = 4;
    if (db.getUserPreferences(${JSON.stringify(ws)}, ${JSON.stringify(users[0].id)})[0].cadence !== 'DAILY') process.exitCode = 5;
    if (db.db.prepare('SELECT count(*) AS n FROM notification_outbox').get().n !== 2) process.exitCode = 6;
    if (db.db.prepare("SELECT name FROM sqlite_master WHERE name = 'notification_bulletins'").get()) process.exitCode = 7;
    if (db.db.prepare('PRAGMA user_version').get().user_version !== 17) process.exitCode = 8;
    db.close();
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(restore.status, 0, restore.stderr);
});
