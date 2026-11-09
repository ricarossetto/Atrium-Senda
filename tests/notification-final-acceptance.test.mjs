import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { processResendWebhook } from '../lib/notifications/webhook-handler.mjs';
import { createOpaqueTag } from '../lib/notifications/routing-tags.mjs';
import { NotificationWorker } from '../lib/notifications/worker.mjs';

const WEBHOOK_SECRET = 'example-webhook-secret-32-bytes-base64'; // valor de teste; NUNCA usar valor de produção

function createSignedWebhookPayload({
  secret = WEBHOOK_SECRET,
  svixId = `msg_${Date.now()}_${randomBytes(4).toString('hex')}`,
  timestamp = Math.floor(Date.now() / 1000),
  bodyObject
}) {
  const rawBody = JSON.stringify(bodyObject);
  const keyBuffer = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const toSign = `${svixId}.${timestamp}.${rawBody}`;
  const sig = createHmac('sha256', keyBuffer).update(toSign).digest('base64');

  const headers = {
    'svix-id': svixId,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${sig}`
  };

  return { rawBody, headers, svixId };
}

describe('Final Acceptance Invariants (Criteria 2 - 10)', () => {
  let dbAlpha, dbBeta;

  before(() => {
    dbAlpha = new NotificationDatabase({ inMemory: true });
    dbBeta = new NotificationDatabase({ inMemory: true });
    dbAlpha.setWorkspaceEnabled('tenant-alpha', true);
    dbBeta.setWorkspaceEnabled('tenant-beta', true);
  });

  after(() => {
    dbAlpha.close();
    dbBeta.close();
  });

  it('Criterion 2: updates ONLY the correct tenant when multiple tenants send concurrently', async () => {
    const secret = WEBHOOK_SECRET;

    // Tenant Alpha enqueues and sends
    const outboxAlpha = dbAlpha.enqueueOutbox({
      id: 'obx-alpha-1',
      workspaceId: 'tenant-alpha',
      eventType: 'PUBLICATION_NEW',
      recipient: 'lawyer@alpha.com',
      payload: { subject: 'Alpha Notification' },
      idempotencyKey: 'idemp-alpha-1'
    });
    dbAlpha.markOutboxSent('obx-alpha-1', { providerMessageId: 'resend-msg-alpha-1' });

    // Tenant Beta enqueues and sends
    const outboxBeta = dbBeta.enqueueOutbox({
      id: 'obx-beta-1',
      workspaceId: 'tenant-beta',
      eventType: 'PUBLICATION_NEW',
      recipient: 'lawyer@beta.com',
      payload: { subject: 'Beta Notification' },
      idempotencyKey: 'idemp-beta-1'
    });
    dbBeta.markOutboxSent('obx-beta-1', { providerMessageId: 'resend-msg-beta-1' });

    // Webhook delivered for Tenant Alpha ONLY
    const webhookData = {
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'resend-msg-alpha-1',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-alpha', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-alpha-1', secret) },
          { name: 'atrium_event', value: 'PUBLICATION_NEW' }
        ]
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    const tenantDbMap = {
      'tenant-alpha': dbAlpha,
      'tenant-beta': dbBeta
    };

    const res = await processResendWebhook({
      rawBody,
      headers,
      secret,
      getTenantDb: (tId) => tenantDbMap[tId]
    });

    assert.equal(res.status, 200);
    assert.equal(res.ok, true);
    assert.equal(res.tenantId, 'tenant-alpha');

    // Verify Tenant Alpha delivery status is now DELIVERED
    const delivAlpha = dbAlpha.db.prepare('SELECT status FROM notification_deliveries WHERE outbox_id = ?').get('obx-alpha-1');
    assert.equal(delivAlpha.status, 'DELIVERED');

    // Verify Tenant Beta delivery status is STILL SENT and completely unaffected
    const delivBeta = dbBeta.db.prepare('SELECT status FROM notification_deliveries WHERE outbox_id = ?').get('obx-beta-1');
    assert.equal(delivBeta.status, 'SENT');
  });

  it('Criterion 3: rejects webhook when atrium_tenant is tampered', async () => {
    const secret = WEBHOOK_SECRET;
    const genuineTag = createOpaqueTag('tenant-alpha', secret);
    // Tamper with tag
    const tamperedTag = genuineTag.slice(0, -4) + 'zzzz';

    const webhookData = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-alpha-1',
        tags: [
          { name: 'atrium_tenant', value: tamperedTag },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-alpha-1', secret) }
        ]
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    let tenantDbCalled = false;
    const res = await processResendWebhook({
      rawBody,
      headers,
      secret,
      getTenantDb: () => {
        tenantDbCalled = true;
        return dbAlpha;
      }
    });

    assert.equal(res.status, 403);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'INVALID_TENANT_TAG');
    assert.equal(tenantDbCalled, false, 'Target database must never be accessed on invalid tenant tag');
  });

  it('Criterion 4: ignores webhook pointing to nonexistent outbox', async () => {
    const secret = WEBHOOK_SECRET;
    const webhookData = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-nonexistent',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-alpha', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-nonexistent-999', secret) }
        ]
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    const res = await processResendWebhook({
      rawBody,
      headers,
      secret,
      getTenantDb: () => dbAlpha
    });

    assert.equal(res.status, 404);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'OUTBOX_NOT_FOUND');
  });

  it('Criterion 5: rejects webhook with incompatible email_id correlation', async () => {
    const secret = WEBHOOK_SECRET;
    // outbox 'obx-alpha-1' is bound to providerMessageId 'resend-msg-alpha-1'
    const webhookData = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-COMPLETELY-WRONG-ID',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-alpha', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-alpha-1', secret) }
        ]
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    const res = await processResendWebhook({
      rawBody,
      headers,
      secret,
      getTenantDb: () => dbAlpha
    });

    assert.equal(res.status, 409);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'PROVIDER_MESSAGE_ID_MISMATCH');
  });

  it('Criterion 6: rejects webhook when routing tags are missing', async () => {
    const secret = WEBHOOK_SECRET;
    const webhookData = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-alpha-1',
        tags: [] // Empty tags
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    const res = await processResendWebhook({
      rawBody,
      headers,
      secret,
      getTenantDb: () => dbAlpha
    });

    assert.equal(res.status, 422);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'ROUTING_TAGS_MISSING');
  });

  it('Criterion 7: rejects webhook when signed body is altered by even 1 byte', async () => {
    const secret = WEBHOOK_SECRET;
    const webhookData = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-alpha-1',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-alpha', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-alpha-1', secret) }
        ]
      }
    };

    const { rawBody, headers } = createSignedWebhookPayload({ bodyObject: webhookData });

    // Tamper with 1 byte in the body: change 'email.delivered' to 'email.bounced'
    const tamperedBody = rawBody.replace('email.delivered', 'email.bounced');

    const res = await processResendWebhook({
      rawBody: tamperedBody,
      headers,
      secret,
      getTenantDb: () => dbAlpha
    });

    assert.equal(res.status, 400);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('inválid'));
  });

  it('Criterion 8: unavailable tenant DB does not affect other tenants', async () => {
    const secret = WEBHOOK_SECRET;

    // Request targeting broken tenant Gamma
    const webhookGamma = {
      type: 'email.delivered',
      data: {
        email_id: 'msg-gamma',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-gamma', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-gamma', secret) }
        ]
      }
    };
    const payloadGamma = createSignedWebhookPayload({ bodyObject: webhookGamma });

    const resGamma = await processResendWebhook({
      rawBody: payloadGamma.rawBody,
      headers: payloadGamma.headers,
      secret,
      getTenantDb: (tId) => {
        if (tId === 'tenant-gamma') throw new Error('Database locked or inaccessible');
        return dbAlpha;
      }
    });
    assert.equal(resGamma.status, 503);

    // Immediate request targeting healthy tenant Beta succeeds
    const webhookBeta = {
      type: 'email.delivered',
      data: {
        email_id: 'resend-msg-beta-1',
        tags: [
          { name: 'atrium_tenant', value: createOpaqueTag('tenant-beta', secret) },
          { name: 'atrium_outbox', value: createOpaqueTag('obx-beta-1', secret) }
        ]
      }
    };
    const payloadBeta = createSignedWebhookPayload({ bodyObject: webhookBeta });

    const resBeta = await processResendWebhook({
      rawBody: payloadBeta.rawBody,
      headers: payloadBeta.headers,
      secret,
      getTenantDb: (tId) => (tId === 'tenant-beta' ? dbBeta : null)
    });
    assert.equal(resBeta.status, 200);
    assert.equal(resBeta.ok, true);
  });

  it('Criteria 9 & 10: processes batch without keeping SQLite transaction open during HTTP calls', async () => {
    const testDb = new NotificationDatabase({ inMemory: true });
    testDb.setWorkspaceEnabled('ws-batch', true);

    // Enqueue 5 items
    for (let i = 1; i <= 5; i++) {
      testDb.enqueueOutbox({
        id: `obx-batch-${i}`,
        workspaceId: 'ws-batch',
        eventType: 'PUBLICATION_NEW',
        recipient: `user${i}@escritorio.adv.br`,
        payload: { subject: `Batch test ${i}` },
        idempotencyKey: `idemp-batch-${i}`
      });
    }

    let concurrentDbOperationsWhileSending = 0;

    const mockProvider = {
      checkBudget: () => ({ allowed: true }),
      sendEmail: async () => {
        // While HTTP call is in flight, SQLite database MUST NOT be in a transaction lock!
        // We should be able to perform read/write queries without SQLITE_BUSY or transaction conflict.
        try {
          testDb.db.prepare('SELECT COUNT(*) as c FROM notification_outbox').get();
          concurrentDbOperationsWhileSending++;
        } catch {
          // If transaction was held open, this would fail or throw
        }
        return { providerMessageId: `msg-${Date.now()}` };
      }
    };

    const worker = new NotificationWorker({
      getDatabases: () => [testDb],
      provider: mockProvider,
      claimBatchSize: 10
    });

    const cycleResult = await worker.processCycle();
    assert.equal(cycleResult.processedCount, 5);
    assert.equal(concurrentDbOperationsWhileSending, 5, 'Concurrent DB read operations succeeded during all HTTP calls');

    testDb.close();
  });
});
