import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { ResendProvider } from '../lib/notifications/providers/resend-provider.mjs';
import { NotificationService, EVENT_TYPES, CADENCES } from '../lib/notifications/notification-service.mjs';
import { EmailBulletinScheduler } from '../lib/notifications/bulletin-scheduler.mjs';

const at = hour => `2026-10-10T${String(hour).padStart(2, '0')}:00:00-03:00`;
const users = [
  { id: 'admin-test', email: 'admin@example.test', role: 'master_admin', status: 'active' },
  { id: 'adv-test', email: 'adv@example.test', role: 'advogado', status: 'active' },
  { id: 'inactive-test', email: 'inactive@example.test', role: 'admin', status: 'disabled' }
];
const outboxes = db => db.db.prepare('SELECT id FROM notification_outbox ORDER BY rowid').all().map(row => db.getOutboxItemById(row.id));

function fixture(t) {
  const db = new NotificationDatabase({ inMemory: true });
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  const service = new NotificationService({ db, provider: new ResendProvider({ mockMode: true }), routingSecret: 'synthetic-notification-test-webhook-secret' });
  t.after(() => db.close());
  return { db, service };
}

test('deferred A1 and sync failures enter only the admin bulletin; external opt-in cannot bypass RBAC', async t => {
  const { db, service } = fixture(t);
  const workspaceId = 'ws-test';
  const external = db.addRecipient({ workspaceId, name: 'Cliente Teste', email: 'external@example.test' });
  for (const type of [EVENT_TYPES.SYNC_FAILED, EVENT_TYPES.A1_CERT_EXPIRING]) {
    db.upsertPreference({ workspaceId, userId: users[1].id, eventType: type, cadence: 'IMMEDIATE', enabled: true });
    db.updateRecipient(workspaceId, external.id, { preferences: [{ eventType: type, cadence: 'IMMEDIATE', enabled: true }] });
  }
  const a1 = await service.checkA1Certificates(workspaceId, { holder: 'Advogada Teste', documentMasked: '***.***.***-**', notAfter: '2026-10-25T08:00:00-03:00', fingerprintSha256Masked: 'synthetic-cert' }, { now: at(8) });
  assert.equal(a1.alerts, 1);
  assert.equal(a1.enqueued, 0);
  const sync = await service.onSyncFailed(workspaceId, { syncJobId: 'job-test', failures: [{ portal: 'Portal Teste', category: 'Conexão rejeitada' }] });
  assert.equal(sync.recorded, 1);
  assert.equal(sync.enqueued, 0);
  assert.equal(outboxes(db).length, 0);
  db.db.prepare('UPDATE notification_events SET created_at = ?').run(new Date(at(7)).toISOString());
  const scheduler = new EmailBulletinScheduler({ listWorkspaces: () => [{ id: workspaceId, status: 'active' }], getUsers: () => users, getState: () => ({}), getService: () => service, now: () => at(8) });
  assert.equal((await scheduler.processCycle()).enqueued, 1);
  const bulletin = outboxes(db)[0];
  assert.equal(bulletin.recipient, 'admin@example.test');
  assert.equal(bulletin.event_type, 'OPERATIONAL_BULLETIN');
  assert.deepEqual(bulletin.payload.events.map(event => event.event_type).sort(), ['A1_CERT_EXPIRING', 'SYNC_FAILED']);
  assert(!outboxes(db).some(item => ['external@example.test', 'adv@example.test', 'inactive@example.test'].includes(item.recipient)));
  assert.equal((await scheduler.processCycle()).enqueued, 0);
  assert.equal((await service.onSyncFailed(workspaceId, { syncJobId: 'job-test', failures: [{ portal: 'Portal Teste', category: 'Conexão rejeitada' }] })).recorded, 0);
  scheduler.now = () => at(14);
  assert.equal((await scheduler.processCycle()).enqueued, 0, 'Already included failures must not repeat in a later slot');
});

test('per-tenant canonical users/state never route events or recipients into a foreign database', async t => {
  const alpha = fixture(t);
  const beta = fixture(t);
  alpha.db.recordEvent({ workspaceId: 'ws-alpha', eventType: 'PUBLICATION_NEW', fingerprint: 'pub-alpha', payload: { id: 'alpha', text: 'Conteúdo Alpha Teste' } });
  beta.db.recordEvent({ workspaceId: 'ws-beta', eventType: 'PUBLICATION_NEW', fingerprint: 'pub-beta', payload: { id: 'beta', text: 'Conteúdo Beta Teste' } });
  for (const { db } of [alpha, beta]) db.db.prepare('UPDATE notification_events SET created_at = ?').run(new Date(at(7)).toISOString());
  const scheduler = new EmailBulletinScheduler({
    listWorkspaces: () => [{ id: 'ws-alpha', status: 'active' }, { id: 'ws-beta', status: 'active' }],
    getUsers: workspaceId => [{ ...users[0], workspaceId, email: `${workspaceId}@example.test` }, { ...users[0], id: 'foreign', workspaceId: workspaceId === 'ws-alpha' ? 'ws-beta' : 'ws-alpha', email: 'foreign@example.test' }],
    getState: workspaceId => ({ agenda: [{ id: workspaceId, title: workspaceId, date: '2026-10-10' }] }),
    getService: id => id === 'ws-alpha' ? alpha.service : beta.service, now: () => at(8)
  });
  assert.equal((await scheduler.processCycle()).enqueued, 2);
  for (const [id, fixture] of [['ws-alpha', alpha], ['ws-beta', beta]]) {
    const items = outboxes(fixture.db);
    assert.equal(items.length, 1);
    assert.equal(items[0].workspace_id, id);
    assert.equal(items[0].recipient, `${id}@example.test`);
    assert.equal(items[0].payload.events[0].workspace_id, id);
    assert.equal(items[0].payload.digestContext.agendaToday[0].title, id);
    const foreign = id === 'ws-alpha' ? 'ws-beta' : 'ws-alpha';
    await assert.rejects(fixture.service.dispatchScheduledBulletins(foreign, users, {}, { now: at(14) }), /NOTIFICATION_WORKSPACE_MISMATCH/);
    assert.equal(outboxes(fixture.db).length, 1);
  }
});

test('all legacy operational preferences normalize to BULLETINS or DISABLED without immediate output', async t => {
  const { db, service } = fixture(t);
  const workspaceId = 'ws-cadence';
  for (const eventType of Object.values(EVENT_TYPES)) {
    for (const cadence of ['IMMEDIATE', 'DAILY', 'SYNC_DIGEST']) {
      db.upsertPreference({ workspaceId, userId: users[0].id, eventType, cadence, enabled: true });
      const preference = await service.resolveUserPreference(workspaceId, users[0].id, eventType, 'master_admin');
      assert.equal(preference.cadence, CADENCES.BULLETINS);
      assert.equal(preference.enabled, true);
    }
    db.upsertPreference({ workspaceId, userId: users[0].id, eventType, cadence: 'DISABLED', enabled: false });
    assert.equal((await service.resolveUserPreference(workspaceId, users[0].id, eventType, 'master_admin')).enabled, false);
  }
  for (const method of ['dispatchImmediate', 'dispatchSyncDigest', 'dispatchDailyDigest']) {
    const result = await service[method](workspaceId);
    assert.equal(result.enqueued, 0);
    assert.equal(result.deferred, true);
  }
  assert.equal(outboxes(db).length, 0);
});
