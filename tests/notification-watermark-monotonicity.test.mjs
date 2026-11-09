import assert from 'node:assert/strict';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { ResendProvider } from '../lib/notifications/providers/resend-provider.mjs';
import { NotificationService, EVENT_TYPES, CADENCES } from '../lib/notifications/notification-service.mjs';

process.env.RESEND_WEBHOOK_SECRET ||= 'synthetic-notification-test-webhook-secret';

async function testWatermarkMonotonicity() {
  console.log('--- Testing Watermark Monotonicity and Polymorphic Workspace Toggle ---');
  const db = new NotificationDatabase({ inMemory: true });
  const provider = new ResendProvider({ mockMode: true });

  const mockUsers = [
    { id: 'user-admin', username: 'admin', displayName: 'Dr. Administrador', email: 'admin@example.test', role: 'master_admin', status: 'active' }
  ];

  const service = new NotificationService({
    db,
    provider,
    securityManager: { listUsers: () => mockUsers },
    routingSecret: 'synthetic-notification-test-webhook-secret'
  });

  const wsId = 'ws-test-lawyer';

  // 1. Cenário legado "nunca ativado": sem watermark, a ativação não pode liberar eventos anteriores.
  db.setSetting('notifications_enabled', 'false');
  db.db.prepare("DELETE FROM notification_settings WHERE key = 'notifications_enabled_at'").run();
  assert.equal(db.isWorkspaceEnabled(wsId), false);
  assert.equal(db.isWorkspaceEnabled(), false);

  // Preference: IMMEDIATE
  db.upsertPreference({
    workspaceId: wsId,
    userId: 'user-admin',
    eventType: EVENT_TYPES.PUBLICATION_NEW,
    cadence: CADENCES.IMMEDIATE,
    enabled: true
  });

  // Pre-activation event
  const pubPre = {
    id: 'pub-pre-1',
    process: '5001111-00.2026.8.21.0001',
    court: 'TJRS',
    text: 'Intimação pré-ativação'
  };
  const resPre = await service.onNewPublications(wsId, [pubPre]);
  assert.equal(resPre.recorded, 1);
  assert.equal(resPre.enqueued, 0, 'Pre-activation event must never be enqueued');

  // 2. Polymorphic toggle: pass (wsId, true)
  db.setWorkspaceEnabled(wsId, true);
  assert.equal(db.isWorkspaceEnabled(wsId), true);
  assert.equal(db.isWorkspaceEnabled(), true);

  const watermark = db.getActivationWatermark();
  assert.ok(watermark, 'Watermark must be set upon activation');

  // Verify historical digest drops pre-activation event
  const digest = await service.dispatchSyncDigest(wsId, 'job-check');
  assert.equal(digest.sent, 0, 'Pre-activation event must not be sent in digest');

  // 3. Post-activation event created immediately (sub-millisecond)
  const pubPost = {
    id: 'pub-post-1',
    process: '5002222-00.2026.8.21.0001',
    court: 'TRF4',
    text: 'Sentença imediata'
  };
  const resPost = await service.onNewPublications(wsId, [pubPost]);
  assert.equal(resPost.recorded, 1);
  assert.equal(resPost.enqueued, 0, 'Post-activation event waits for a scheduled bulletin');

  // Verify post-activation event timestamp is strictly greater than watermark
  const postFp = NotificationService.publicationFingerprint(wsId, 'TRF4', 'pub-post-1');
  const postRow = db.db.prepare("SELECT created_at FROM notification_events WHERE fingerprint = ?").get(postFp);
  assert.ok(postRow, 'Post-activation event must exist in DB');
  assert.ok(postRow.created_at > watermark, 'Post-activation event timestamp must be strictly greater than watermark');
  const clock = new Date(Date.parse(postRow.created_at) + 86400000);
  clock.setUTCHours(23, 0, 0, 0);
  const bulletin = await service.dispatchScheduledBulletins(wsId, mockUsers, {}, { now: clock });
  assert.equal(bulletin.enqueued, 1, 'Post-activation event must survive until its scheduled bulletin');
  const queued = db.claimNextOutboxBatch(10);
  assert.equal(queued.length, 1);
  assert.deepEqual(queued[0].payload.events.map(event => event.payload.id), ['pub-post-1']);

  // 4. Polymorphic toggle: pass (wsId, false)
  db.setWorkspaceEnabled(wsId, false);
  assert.equal(db.isWorkspaceEnabled(wsId), false);
  assert.equal(db.isWorkspaceEnabled(), false);

  console.log('✓ Watermark monotonicity and polymorphic workspace toggle test passed cleanly!');
}

testWatermarkMonotonicity().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
