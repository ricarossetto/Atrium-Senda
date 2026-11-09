import assert from 'node:assert/strict';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationWorker } from '../lib/notifications/worker.mjs';

async function testWorker() {
  console.log('--- Testing NotificationWorker & Retry/Recovery ---');

  const db = new NotificationDatabase({ inMemory: true });
  db.setWorkspaceEnabled(true);

  let sentCalls = [];
  let shouldFailWith = null;

  const mockProvider = {
    checkBudget: () => ({ allowed: true }),
    sendEmail: async (opts) => {
      sentCalls.push(opts);
      if (shouldFailWith) {
        throw shouldFailWith;
      }
      return { ok: true, providerMessageId: `msg-${Date.now()}` };
    }
  };

  const worker = new NotificationWorker({
    getDatabases: () => [db],
    provider: mockProvider,
    pollIntervalMs: 1000
  });

  // 1. Enqueue and successfully process item
  const enq1 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'destinatario@teste.com',
    payload: {
      from: 'ATRIUM <publicacoes@atrium.adv.br>',
      subject: 'Publicação 1',
      html: '<p>1</p>',
      text: '1'
    },
    idempotencyKey: 'key-1'
  });

  const cycle1 = await worker.processCycle();
  assert.equal(cycle1.processedCount, 1);
  assert.equal(sentCalls.length, 1);
  assert.equal(sentCalls[0].subject, 'Publicação 1');
  assert.equal(sentCalls[0].idempotencyKey, 'key-1');

  const stats1 = db.getStats();
  assert.equal(stats1.queue.SENT, 1);
  assert.equal(stats1.delivery.SENT, 1);

  // 2. Retryable failure with 429 and Retry-After
  const retryableErr = Object.assign(new Error('Rate limit exceeded'), {
    statusCode: 429,
    retryable: true,
    retryAfterSeconds: 60
  });
  shouldFailWith = retryableErr;

  const enq2 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'destinatario2@teste.com',
    payload: {
      from: 'ATRIUM <publicacoes@atrium.adv.br>',
      subject: 'Publicação 2',
      html: '<p>2</p>',
      text: '2'
    },
    idempotencyKey: 'key-2'
  });

  await worker.processCycle();
  const rawItem2 = db.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(enq2.id);
  assert.equal(rawItem2.status, 'RETRYABLE_ERROR');
  assert.equal(rawItem2.attempts, 1);
  assert.equal(rawItem2.last_error, 'DELIVERY_RETRYABLE_REJECTION');

  // Verify that Retry-After (60s) pushed next_attempt_at into future
  const nextAttempt = new Date(rawItem2.next_attempt_at).getTime();
  assert.ok(nextAttempt > Date.now() + 30 * 1000);

  // 3. Stale SENDING recovery
  // Simulate an item stuck in SENDING with expired claim
  const pastClaim = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.db.prepare(`
    INSERT INTO notification_outbox (
      id, workspace_id, event_type, recipient, recipient_hash,
      payload, idempotency_key, status, attempts, max_attempts,
      next_attempt_at, claim_expires_at, created_at, updated_at
    ) VALUES (
      'obx-stale-1', 'ws-1', 'PUBLICATION_NEW', 'stale@teste.com', 'hash-stale',
      '{"subject":"Stale Recovered","from":"ATRIUM"}', 'key-stale', 'SENDING', 1, 5,
      ?, ?, ?, ?
    )
  `).run(pastClaim, pastClaim, pastClaim, pastClaim);

  db.db.prepare('UPDATE notification_outbox SET first_provider_attempt_at = ? WHERE id = ?')
    .run(pastClaim, 'obx-stale-1');
  shouldFailWith = null;
  const cycleRecover = await worker.processCycle();
  assert.equal(cycleRecover.processedCount, 1);

  const staleItem = db.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get('obx-stale-1');
  assert.equal(staleItem.status, 'SENT');
  assert.equal(staleItem.attempts, 2);

  // 4. Non-retryable error moves immediately to FAILED
  shouldFailWith = Object.assign(new Error('Invalid recipient domain'), {
    statusCode: 400,
    retryable: false
  });

  const enq3 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'invalido@dominio-inexistente.xyz',
    payload: { subject: 'Erro terminal' },
    idempotencyKey: 'key-3'
  });

  await worker.processCycle();
  const rawItem3 = db.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(enq3.id);
  assert.equal(rawItem3.status, 'FAILED');
  assert.equal(rawItem3.attempts, 1);

  // 5. Suppressed recipient moves to CANCELLED
  db.addSuppression('suprimido@teste.com', 'permanent_bounce', 'test');
  const enq4 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'PUBLICATION_NEW',
    recipient: 'suprimido@teste.com',
    payload: { subject: 'Não deve enviar' },
    idempotencyKey: 'key-4'
  });

  await worker.processCycle();
  const rawItem4 = db.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(enq4.id);
  assert.equal(rawItem4.status, 'CANCELLED');

  db.close();
  console.log('✓ All NotificationWorker tests passed cleanly!');
}

testWorker().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
