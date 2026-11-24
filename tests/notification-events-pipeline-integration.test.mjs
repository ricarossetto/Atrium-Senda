import assert from 'node:assert/strict';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService } from '../lib/notifications/notification-service.mjs';
import path from 'node:path';

const server = await startTestServer({
  env: {
    ATRIUM_MOCK_RESEND: 'true',
    ATRIUM_MOCK_SMTP: 'true',
    RESEND_API_KEY: '',
    RESEND_WEBHOOK_SECRET: 'synthetic-notification-test-webhook-secret',
    ATRIUM_EMAIL_FROM_NOTIFICATIONS: 'teste@example.test',
    ATRIUM_EMAIL_FROM_PUBLICATIONS: 'teste@example.test'
  }
});
const adminPassword = 'Synthetic-Admin-Password-2026!';
let db;

try {
  const setupRes = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin', displayName: 'Admin Teste', email: 'admin@example.test', password: adminPassword
  });
  const setupData = await setupRes.json();
  const verifyRes = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken, code: generateTotp(setupData.manualSecret)
  });
  assert.equal(verifyRes.status, 200);
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];
  const csrf = (await verifyRes.json()).csrfToken;
  const headers = { Cookie: cookie, 'X-CSRF-Token': csrf };
  const auth = await (await fetch(`${server.baseUrl}/api/auth/status`, { headers })).json();
  const workspaceId = auth.workspace.id;
  const admin = (await (await fetch(`${server.baseUrl}/api/auth/users`, { headers })).json()).users.find(user => user.username === 'admin');
  assert(admin?.id);
  const toggle = await postJson(`${server.baseUrl}/api/admin/mail/toggle`, {
    enabled: true, password: adminPassword, code: generateTotp(setupData.manualSecret, Math.floor(Date.now() / 30_000) + 1)
  }, headers);
  assert.equal(toggle.status, 200);

  const security = new SecurityManager({ dataDirectory: server.dataDirectory, sessionSecret: server.sessionSecret, encryptionKey: server.encryptionKey });
  db = new NotificationDatabase({ dbPath: path.join(server.dataDirectory, 'notifications.sqlite'), securityManager: security });
  db.bindWorkspace(workspaceId);
  db.setWorkspaceEnabled(workspaceId, true);
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  const outboxes = () => db.db.prepare('SELECT id FROM notification_outbox WHERE workspace_id = ? ORDER BY rowid').all(workspaceId).map(row => db.getOutboxItemById(row.id));
  const events = () => db.db.prepare('SELECT * FROM notification_events WHERE workspace_id = ?').all(workspaceId).map(row => ({ ...row, payload: JSON.parse(db.decryptField(row.payload)) }));
  const ingest = async body => {
    const response = await postJson(`${server.baseUrl}/api/ingest`, body, { Authorization: `Bearer ${server.collectorToken}`, 'x-atrium-workspace-id': workspaceId });
    assert.equal(response.status, 200);
    return response.json();
  };

  for (const [eventType, cadence] of [
    ['PUBLICATION_NEW', 'IMMEDIATE'],
    ['HEARING_NEW', 'DAILY'],
    ['MOVEMENT_NEW', 'SYNC_DIGEST'],
    ['DEADLINE_CRITICAL', 'BULLETINS'],
    ['SYNC_FAILED', 'BULLETINS'],
    ['A1_CERT_EXPIRING', 'BULLETINS']
  ]) {
    db.upsertPreference({ workspaceId, userId: admin.id, eventType, cadence, enabled: true });
  }
  const publication = { id: 'pub-pipeline-test', process: '0000000-00.2026.8.21.0000', court: 'TJRS', publishedAt: '2026-10-10', text: 'Publicação sintética para conferência humana.' };
  await ingest({ intimations: [publication] });
  const secondPublication = { ...publication, id: 'pub-digest-test' };
  db.upsertPreference({ workspaceId, userId: admin.id, eventType: 'PUBLICATION_NEW', cadence: 'SYNC_DIGEST', enabled: true });
  await ingest({ intimations: [secondPublication] });
  const hearing = { id: 'hearing-pipeline-test', title: 'Audiência Teste', process: publication.process, court: 'TJRS', date: '2026-10-10', time: '15:00' };
  await ingest({ events: [hearing] });

  const task = { id: 'task-critical-test', title: 'Prazo Teste', process: publication.process, deadline: new Date(Date.now() + 20 * 3600000).toISOString(), status: 'pendente' };
  const stateRes = await postJson(`${server.baseUrl}/api/state`, { state: { tasks: [task], events: [hearing], intimations: [publication, secondPublication] } }, headers);
  assert.equal(stateRes.status, 200);
  await stateRes.json();
  const service = new NotificationService({ db, provider: { getFromAddress: () => 'teste@example.test' }, routingSecret: 'synthetic-notification-test-webhook-secret' });
  const failed = await service.onSyncFailed(workspaceId, { syncJobId: 'sync-job-test', failures: [{ portal: 'Portal Teste', category: 'Certificado indisponível' }] });
  assert.equal(failed.recorded, 1);
  assert.equal(failed.deferred, true);
  const certificate = { fingerprintSha256Masked: 'synthetic-fingerprint', notAfter: new Date(Date.now() + 14 * 86400000).toISOString(), holder: 'Advogada Teste' };
  const a1 = await service.checkA1Certificates(workspaceId, certificate);
  assert.equal(a1.alerts, 1);
  assert.equal(a1.deferred, true);

  assert.equal(events().filter(event => event.event_type === 'PUBLICATION_NEW').length, 2);
  assert.equal(events().find(event => event.event_type === 'PUBLICATION_NEW').payload.process, publication.process);
  for (const type of ['HEARING_NEW', 'DEADLINE_CRITICAL', 'SYNC_FAILED', 'A1_CERT_EXPIRING']) {
    assert(events().some(event => event.event_type === type), `${type} must remain durably recorded`);
  }
  assert.equal(outboxes().length, 0, 'Operational hooks must defer even with legacy immediate/daily preferences');
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE workspace_id = ?').run('2026-10-10T10:00:00.000Z', workspaceId);
  const users = [admin];
  let canonical = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  const morning = await service.dispatchScheduledBulletins(workspaceId, users, canonical.state, { now: '2026-10-10T08:00:00-03:00' });
  assert.equal(morning.failed, 0, JSON.stringify(morning));
  assert.equal(morning.enqueued, 1, JSON.stringify(morning));
  assert.equal(outboxes().length, 1);
  const first = outboxes()[0];
  assert.equal(first.event_type, 'OPERATIONAL_BULLETIN');
  assert.equal(first.recipient, 'admin@example.test');
  assert.equal(first.payload.bulletin.slot, 8);
  for (const type of ['PUBLICATION_NEW', 'HEARING_NEW', 'DEADLINE_CRITICAL', 'SYNC_FAILED', 'A1_CERT_EXPIRING']) {
    assert(first.payload.events.some(event => event.event_type === type), `${type} must be included in the admin bulletin`);
  }
  assert.equal(first.payload.digestContext.agendaToday[0].title, hearing.title);
  assert.equal((await service.dispatchScheduledBulletins(workspaceId, users, canonical.state, { now: '2026-10-10T08:30:00-03:00' })).enqueued, 0);
  const afterMorningPublication = { ...publication, id: 'pub-after-morning-test' };
  await ingest({ intimations: [afterMorningPublication] });
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE workspace_id = ?').run('2026-10-10T16:00:00.000Z', workspaceId);
  canonical = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  if (!canonical.state.intimations.some(item => item.id === afterMorningPublication.id)) {
    canonical.state.intimations.push(afterMorningPublication);
  }
  assert.equal((await service.dispatchScheduledBulletins(workspaceId, users, canonical.state, { now: '2026-10-10T14:00:00-03:00' })).enqueued, 1);
  assert.equal(outboxes().length, 2);
  assert.equal(outboxes()[1].payload.events.filter(event => event.event_type === 'PUBLICATION_NEW').length, 1);
  assert(!outboxes()[1].payload.events.some(event => ['SYNC_FAILED', 'A1_CERT_EXPIRING'].includes(event.event_type)));
  const contextChange = await postJson(`${server.baseUrl}/api/state`, {
    revision: canonical.revision,
    state: { ...canonical.state, events: [{ ...hearing, title: 'Audiência Teste alterada', time: '18:00' }] }
  }, headers);
  assert.equal(contextChange.status, 200);
  await contextChange.json();
  canonical = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  const eventCount = events().length;
  assert.equal((await service.dispatchScheduledBulletins(workspaceId, users, canonical.state, { now: '2026-10-10T20:00:00-03:00' })).enqueued, 1);
  assert.equal(events().length, eventCount, 'O envio manual não pode fabricar eventos a partir do estado canônico');
  assert.equal(outboxes()[2].payload.digestContext.agendaToday[0].title, 'Audiência Teste alterada');
  assert.equal((await service.dispatchScheduledBulletins(workspaceId, users, canonical.state, { now: '2026-10-10T21:00:00-03:00' })).enqueued, 0);
  assert.deepEqual(outboxes().map(item => item.payload.bulletin.slot), [8, 14, 20]);
  console.log('PASS: edição manual + cinco eventos duráveis + hooks diferidos + boletins sob demanda + contexto canônico sem sync');
} finally {
  db?.close();
  await server.stop();
}
