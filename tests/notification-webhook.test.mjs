import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { WebhookVerifier } from '../lib/notifications/webhook-verifier.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { createOpaqueTag, resolveOpaqueTag } from '../lib/notifications/routing-tags.mjs';

function signSvixPayload(secret, id, timestamp, payload) {
  const secretKey = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8');
  const signedContent = `${id}.${timestamp}.${payload}`;
  const sig = createHmac('sha256', secretKey).update(signedContent).digest('base64');
  return `v1,${sig}`;
}

async function testWebhook() {
  console.log('--- Testing WebhookVerifier & Ingestion ---');
  const testSecret = 'example-test-webhook-secret-local-only';
  const verifier = new WebhookVerifier({ secret: testSecret });

  const payloadStr = JSON.stringify({
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: {
      email_id: 'msg-resend-test-001',
      to: ['advogado@atrium.adv.br'],
      from: 'ATRIUM Publicações <publicacoes@atrium.adv.br>',
      subject: 'Publicação Judicial'
    }
  });

  const svixId = 'msg_test_event_123';
  const svixTimestamp = Math.floor(Date.now() / 1000).toString();
  const validSignature = signSvixPayload(testSecret, svixId, svixTimestamp, payloadStr);

  // 1. Valid signature passes
  const verification = verifier.verify({
    payload: payloadStr,
    headers: {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': validSignature
    }
  });
  assert.equal(verification.verified, true);
  assert.equal(verification.svixId, svixId);

  // 2. Invalid signature is rejected
  assert.throws(() => {
    verifier.verify({
      payload: payloadStr,
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': 'v1,invalidBase64Signature=='
      }
    });
  }, /Assinatura do webhook inválida/);

  // 3. Replay attack with expired timestamp is rejected (> 300s)
  const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
  const oldSignature = signSvixPayload(testSecret, svixId, oldTimestamp, payloadStr);
  assert.throws(() => {
    verifier.verify({
      payload: payloadStr,
      headers: {
        'svix-id': svixId,
        'svix-timestamp': oldTimestamp,
        'svix-signature': oldSignature
      }
    });
  }, /fora da tolerância permitida/);

  // 4. Missing secret fails closed
  const emptyVerifier = new WebhookVerifier({ secret: '' });
  assert.throws(() => {
    emptyVerifier.verify({
      payload: payloadStr,
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': validSignature
      }
    });
  }, /RESEND_WEBHOOK_SECRET não configurado/);
  assert.throws(() => createOpaqueTag('tenant-test'), /RESEND_WEBHOOK_SECRET ausente/);
  assert.equal(resolveOpaqueTag(createOpaqueTag('tenant-test', testSecret)), null, 'Missing routing secret must never resolve a tag');

  // 5. Database replay deduplication and delivery update
  const db = new NotificationDatabase({ inMemory: true });
  const obx = db.enqueueOutbox({
    workspaceId: 'ws-test',
    eventType: 'PUBLICATION_NEW',
    recipient: 'advogado@atrium.adv.br',
    payload: {},
    idempotencyKey: 'key-test-webhook'
  });
  db.markOutboxSent(obx.id, { providerMessageId: 'msg-resend-test-001' });

  // Record webhook first time
  const rec1 = db.recordWebhookEvent({
    eventId: svixId,
    eventType: 'email.delivered',
    payload: payloadStr
  });
  assert.equal(rec1.isNew, true);

  // Duplicate webhook replay
  const recDuplicate = db.recordWebhookEvent({
    eventId: svixId,
    eventType: 'email.delivered',
    payload: payloadStr
  });
  assert.equal(recDuplicate.isNew, false);
  assert.equal(recDuplicate.duplicate, true);

  // Update delivery
  const updatedDelivery = db.updateDeliveryFromWebhook({
    providerMessageId: 'msg-resend-test-001',
    status: 'DELIVERED',
    timestamp: new Date().toISOString()
  });
  assert.ok(updatedDelivery);

  // Test Bounce suppression
  db.updateDeliveryFromWebhook({
    providerMessageId: 'msg-resend-test-001',
    status: 'BOUNCED',
    bounce: { type: 'Permanent' }
  });
  assert.equal(db.isSuppressed('advogado@atrium.adv.br'), true);

  db.close();
  console.log('✓ All Webhook tests passed cleanly!');
}

testWebhook().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
