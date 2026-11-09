import assert from 'node:assert/strict';
import { NotificationDatabase, hashRecipient, maskEmail } from '../lib/notifications/db.mjs';

async function testDatabase() {
  console.log('--- Testing NotificationDatabase (in-memory) ---');
  const db = new NotificationDatabase({ inMemory: true });

  // 1. Settings & Master Switches
  assert.equal(db.isGlobalPaused(), false);
  db.setGlobalPaused(true);
  assert.equal(db.isGlobalPaused(), true);
  db.setGlobalPaused(false);
  assert.equal(db.isGlobalPaused(), false);

  assert.equal(db.isWorkspaceEnabled('ws-test-1'), true, 'Default workspace must be enabled');
  db.setWorkspaceEnabled('ws-test-1', false);
  assert.equal(db.isWorkspaceEnabled('ws-test-1'), false, 'Admin must be able to disable the workspace');
  db.setWorkspaceEnabled('ws-test-1', true);
  assert.equal(db.isWorkspaceEnabled('ws-test-1'), true);

  // 2. Events & Deduplication
  const ev1 = db.recordEvent({
    workspaceId: 'ws-test-1',
    eventType: 'PUBLICATION_NEW',
    fingerprint: 'pub-fingerprint-123',
    payload: { process: '5001234-56.2026.8.21.0001', court: 'TJRS' }
  });
  assert.equal(ev1.isNew, true);

  const evDuplicate = db.recordEvent({
    workspaceId: 'ws-test-1',
    eventType: 'PUBLICATION_NEW',
    fingerprint: 'pub-fingerprint-123',
    payload: { process: '5001234-56.2026.8.21.0001', court: 'TJRS' }
  });
  assert.equal(evDuplicate.isNew, false);
  assert.equal(evDuplicate.duplicate, true);

  // 3. Preferences
  db.upsertPreference({
    workspaceId: 'ws-test-1',
    userId: 'user-1',
    eventType: 'PUBLICATION_NEW',
    cadence: 'SYNC_DIGEST',
    enabled: true
  });
  let prefs = db.getUserPreferences('ws-test-1', 'user-1');
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].cadence, 'SYNC_DIGEST');

  // Update preference
  db.upsertPreference({
    workspaceId: 'ws-test-1',
    userId: 'user-1',
    eventType: 'PUBLICATION_NEW',
    cadence: 'IMMEDIATE',
    enabled: true
  });
  prefs = db.getUserPreferences('ws-test-1', 'user-1');
  assert.equal(prefs.length, 1);
  assert.equal(prefs[0].cadence, 'IMMEDIATE');

  // 4. External Recipients
  const rcp = db.addRecipient({
    workspaceId: 'ws-test-1',
    name: 'Contato Externo',
    email: 'externo@advocacia.com'
  });
  assert.equal(rcp.name, 'Contato Externo');
  assert.equal(rcp.email, 'externo@advocacia.com');

  const rcps = db.listRecipients('ws-test-1');
  assert.equal(rcps.length, 1);

  // Workspace isolation check: list from another workspace must be empty
  assert.equal(db.listRecipients('ws-test-2').length, 0);

  // 5. Outbox Enqueue & Idempotency
  const obx1 = db.enqueueOutbox({
    workspaceId: 'ws-test-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'destinatario@teste.com',
    payload: { subject: 'Nova Publicação', html: '<p>Olá</p>' },
    idempotencyKey: 'key-12345'
  });
  assert.equal(obx1.enqueued, true);

  const obxDuplicate = db.enqueueOutbox({
    workspaceId: 'ws-test-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'destinatario@teste.com',
    payload: { subject: 'Nova Publicação', html: '<p>Olá</p>' },
    idempotencyKey: 'key-12345'
  });
  assert.equal(obxDuplicate.enqueued, false);
  assert.equal(obxDuplicate.duplicate, true);

  // 6. Claim Batch
  const batch = db.claimNextOutboxBatch(10);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].id, obx1.id);
  assert.equal(batch[0].status, 'SENDING');
  assert.equal(batch[0].attempts, 1);

  // 7. Mark Sent & Deliveries
  db.markOutboxSent(obx1.id, { providerMessageId: 'resend-msg-999' });
  const stats = db.getStats();
  assert.equal(stats.queue.SENT, 1);
  assert.equal(stats.delivery.SENT, 1);

  // 8. Webhook update & permanent bounce suppression
  const dlv = db.updateDeliveryFromWebhook({
    providerMessageId: 'resend-msg-999',
    status: 'BOUNCED',
    bounce: { type: 'Permanent' }
  });
  assert.ok(dlv);
  assert.equal(db.isSuppressed('destinatario@teste.com'), true);

  db.close();
  console.log('✓ All database tests passed cleanly!');
}

testDatabase().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
