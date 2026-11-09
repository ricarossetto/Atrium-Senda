import assert from 'node:assert/strict';
import test from 'node:test';
import { EmailBulletinScheduler } from '../lib/notifications/bulletin-scheduler.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService } from '../lib/notifications/notification-service.mjs';
import { NotificationWorker } from '../lib/notifications/worker.mjs';

const at = hour => `2026-10-10T${String(hour).padStart(2, '0')}:00:00-03:00`;
const user = { id: 'admin-test', username: 'admin-test', email: 'admin@example.test', role: 'admin', status: 'active' };
const quiet = { warn() {} };

function fixture(t) {
  const db = new NotificationDatabase({ inMemory: true });
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  const service = new NotificationService({ db, provider: { getFromAddress: () => 'teste@example.test' }, routingSecret: 'synthetic-routing-secret-test', logger: quiet });
  t.after(() => db.close());
  return { db, service };
}

function record(db, id, hour = 7) {
  const event = db.recordEvent({ workspaceId: 'ws-test', eventType: 'PUBLICATION_NEW', fingerprint: id, payload: { id, text: 'Publicação Teste' } });
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE id = ?').run(new Date(at(hour)).toISOString(), event.id);
}

function outboxes(db) {
  return db.db.prepare('SELECT id FROM notification_outbox ORDER BY rowid').all().map(row => db.getOutboxItemById(row.id));
}

test('independent cycles respect 08/14/20 BRT, carry late events and never create boot events', async t => {
  const { db, service } = fixture(t);
  let now = at(7);
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: () => [{ id: 'ws-test', status: 'active' }],
    getUsers: async () => [user], getState: async () => ({}), getService: () => service,
    now: () => now, logger: quiet
  });
  record(db, 'morning');
  assert.equal((await scheduler.processCycle()).enqueued, 0);
  for (const [hour, id] of [[8, 'late-morning'], [14, 'late-afternoon'], [20, 'late-night']]) {
    now = at(hour);
    assert.equal((await scheduler.processCycle()).enqueued, 1);
    record(db, id, hour + 1);
    now = at(hour + 1);
    assert.equal((await scheduler.processCycle()).enqueued, 0);
  }
  assert.deepEqual(outboxes(db).map(item => item.payload.bulletin.slot), [8, 14, 20]);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM notification_events').get().n, 4);
});

test('awaits canonical state and users independently per active workspace; failure is sanitized and isolated', async () => {
  const calls = [];
  const warnings = [];
  const states = new Map([['ws-good', { agenda: [{ title: 'Agenda Teste' }] }]]);
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: async () => [{ id: 'ws-bad', status: 'active' }, { id: 'ws-inactive', status: 'disabled' }, { id: 'ws-good', status: 'active' }, { id: 'ws-good', status: 'active' }],
    withWorkspace: async (id, operation) => { calls.push(['context', id]); return operation(); },
    getState: async id => { if (id === 'ws-bad') throw new Error('private@example.test encrypted-state-secret'); return states.get(id); },
    getUsers: async id => [{ ...user, workspaceId: id }],
    getService: id => ({ dispatchScheduledBulletins: async (workspaceId, users, state, options) => { calls.push([workspaceId, users, state, options]); return { enqueued: 1 }; } }),
    now: () => at(8), logger: { warn: (...args) => warnings.push(args) }
  });
  const result = await scheduler.processCycle();
  assert.equal(result.failed, 1);
  assert.equal(result.enqueued, 1);
  assert.equal(result.processed, 1);
  const dispatched = calls.find(call => call[0] === 'ws-good');
  assert.equal(dispatched[2], states.get('ws-good'));
  assert.equal(dispatched[1][0].workspaceId, 'ws-good');
  assert.equal(dispatched[3].limit, 100);
  assert.equal(new Date(dispatched[3].now).toISOString(), new Date(at(8)).toISOString());
  assert.equal(warnings.length, 1);
  assert(!JSON.stringify(warnings).includes('private@example.test'));
  assert(!JSON.stringify(warnings).includes('encrypted-state-secret'));
  assert(!calls.some(call => call.includes('ws-inactive')));
});

test('start once, unref timer, bound overlapping ticks and stop drains current tenant without another dispatch', async () => {
  let tick;
  let starts = 0;
  let clears = 0;
  let unrefs = 0;
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const sends = [];
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: () => [{ id: 'ws-one', status: 'active' }, { id: 'ws-two', status: 'active' }],
    getUsers: async () => [user], getState: async () => ({}),
    getService: id => ({ dispatchScheduledBulletins: async () => { sends.push(id); entered(); await pending; return { enqueued: 1 }; } }),
    now: () => at(8), logger: quiet,
    setIntervalFn: (callback, ms) => { starts++; tick = callback; assert.equal(ms, 30_000); return { unref: () => unrefs++ }; },
    clearIntervalFn: () => { clears++; }
  });
  scheduler.start();
  scheduler.start();
  await ready;
  assert.equal(starts, 1);
  assert.equal(unrefs, 1);
  assert.equal((await tick()).reason, 'ALREADY_PROCESSING');
  assert.equal((await scheduler.processWorkspace('ws-one')).reason, 'ALREADY_PROCESSING');
  const stopped = scheduler.stop();
  assert.equal(clears, 1);
  assert.equal((await tick()).reason, 'STOPPED');
  release();
  await stopped;
  assert.equal(scheduler.isProcessing, false);
  assert.equal(scheduler.timer, null);
  assert.deepEqual(sends, ['ws-one']);
  await scheduler.stop();
  assert.equal(clears, 1);
});

test('reset/inactive tenant after canonical read is skipped before service access', async () => {
  let active = true;
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: () => [{ id: 'ws-reset', status: 'active' }],
    isWorkspaceActive: () => active,
    getUsers: () => [user], getState: async () => { active = false; return {}; },
    getService: () => { throw new Error('Must not open reset tenant database'); }, now: () => at(8), logger: quiet
  });
  assert.equal((await scheduler.processCycle()).enqueued, 0);
});

test('workspace master switch is honored and context-only bulletins need no judicial integration or new events', async t => {
  const { db, service } = fixture(t);
  const state = { agenda: [{ id: 'agenda-test', date: '2026-10-10', title: 'Agenda Teste' }], tasks: [{ id: 'task-test', deadline: '2026-10-11', title: 'Prazo Teste' }] };
  const scheduler = new EmailBulletinScheduler({ listWorkspaces: () => [{ id: 'ws-test', status: 'active' }], getUsers: () => [user], getState: () => state, getService: () => service, now: () => at(8), logger: quiet });
  db.setWorkspaceEnabled(false);
  assert.equal((await scheduler.processCycle()).enqueued, 0);
  assert.equal(outboxes(db).length, 0);
  db.setWorkspaceEnabled(true);
  assert.equal((await scheduler.processCycle()).enqueued, 1);
  assert.equal((await scheduler.processCycle()).enqueued, 0);
  assert.equal(outboxes(db)[0].payload.digestContext.agendaToday[0].title, 'Agenda Teste');
  assert.equal(outboxes(db)[0].payload.digestContext.deadlines[0].title, 'Prazo Teste');
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM notification_events').get().n, 0);
});

test('failed listing and partial reservation report failure without leaking exception details; guard always releases', async () => {
  let broken = true;
  const warnings = [];
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: () => { if (broken) throw new Error('user@example.test secret'); return [{ id: 'ws-test', status: 'active' }]; },
    getUsers: () => [user], getState: () => ({}), getService: () => ({ dispatchScheduledBulletins: async () => ({ enqueued: 1, failed: 1 }) }),
    now: () => at(8), logger: { warn: (...args) => warnings.push(args) }
  });
  assert.equal((await scheduler.processCycle()).failed, 1);
  assert.equal(scheduler.isProcessing, false);
  broken = false;
  const result = await scheduler.processCycle();
  assert.equal(result.enqueued, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.reason, 'PARTIAL_FAILURE');
  assert(!JSON.stringify(warnings).includes('user@example.test'));
});

test('master switch off blocks bulletins but supervised test/password reset still enqueue and deliver immediately', async t => {
  const { db, service } = fixture(t);
  const sent = [];
  const provider = { getFromAddress: () => 'teste@example.test', checkBudget: () => ({ allowed: true }), sendEmail: async payload => { sent.push(payload); return { providerMessageId: `synthetic-${sent.length}` }; } };
  service.provider = provider;
  db.setWorkspaceEnabled(false);
  record(db, 'pending-disabled');
  const scheduler = new EmailBulletinScheduler({ listWorkspaces: () => [{ id: 'ws-test', status: 'active' }], getUsers: () => [user], getState: () => ({}), getService: () => service, now: () => at(8), logger: quiet });
  assert.equal((await scheduler.processCycle()).enqueued, 0);
  await service.sendTestEmail({ workspaceId: 'ws-test', recipient: 'test@example.test' });
  await service.sendPasswordResetEmail({ workspaceId: 'ws-test', recipient: 'reset@example.test', resetUrl: 'https://example.test/#reset=synthetic-only' });
  assert.deepEqual(outboxes(db).map(item => item.event_type), ['SYSTEM_TEST', 'PASSWORD_RESET']);
  const worker = new NotificationWorker({ getDatabases: () => [db], provider, logger: quiet });
  assert.equal((await worker.processCycle()).processedCount, 2);
  assert.equal(sent.length, 2);
  assert(outboxes(db).every(item => item.status === 'SENT'));
  assert.equal((await scheduler.processCycle()).enqueued, 0);
});
