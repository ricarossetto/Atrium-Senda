import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { SecurityManager } from '../lib/security.mjs';

const TEST_DIR = path.resolve('test-tmp-encryption');

describe('Application-Level Encryption at Rest', () => {
  let securityManager;
  const dbPath = path.join(TEST_DIR, 'notifications.sqlite');

  before(async () => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    securityManager = new SecurityManager({
      dataDirectory: TEST_DIR,
      sessionSecret: randomBytes(32).toString('base64url'),
      encryptionKey: randomBytes(32).toString('base64')
    });
    await securityManager.init();
  });

  after(() => {
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      } catch {}
    }
  });

  it('physically protects sensitive legal payload, party names, and recipient emails in SQLite file', () => {
    const db = new NotificationDatabase({
      dbPath,
      securityManager
    });

    const sensitiveLegalText = 'SEGREDO_DE_JUSTICA_DIVORCIO_PARTILHA_BENS_CLIENTE_CONFIDENCIAL';
    const sensitiveRecipient = 'advogado.sigiloso@escritorio.com.br';

    // 1. Record event with sensitive legal payload
    db.recordEvent({
      workspaceId: 'ws-secret',
      eventType: 'PUBLICATION_NEW',
      fingerprint: 'fp-secret-1',
      payload: {
        process: '5009999-00.2026.8.21.0001',
        secretDetails: sensitiveLegalText
      }
    });

    // 2. Enqueue outbox item with sensitive recipient and HTML body
    db.enqueueOutbox({
      workspaceId: 'ws-secret',
      eventType: 'PUBLICATION_NEW',
      recipient: sensitiveRecipient,
      payload: {
        subject: 'Publicação em Processo Sigiloso',
        html: `<p>Conteúdo estritamente sigiloso: ${sensitiveLegalText}</p>`,
        text: `Conteúdo estritamente sigiloso: ${sensitiveLegalText}`
      },
      idempotencyKey: 'idemp-secret-1'
    });

    db.close();

    // 3. Inspect raw SQLite database directly using raw DatabaseSync without decryptor
    const rawDb = new DatabaseSync(dbPath);
    const rawEvent = rawDb.prepare('SELECT payload FROM notification_events WHERE fingerprint = ?').get('fp-secret-1');
    const rawOutbox = rawDb.prepare('SELECT recipient, payload FROM notification_outbox WHERE idempotency_key = ?').get('idemp-secret-1');
    rawDb.close();

    // Verify raw SQLite values are ciphertexts
    assert.ok(rawEvent.payload.startsWith('enc:v1:'), 'Event payload must be encrypted with enc:v1: prefix');
    assert.ok(!rawEvent.payload.includes(sensitiveLegalText), 'Raw SQLite must NOT contain sensitive legal text');

    assert.ok(rawOutbox.recipient.startsWith('enc:v1:'), 'Outbox recipient must be encrypted with enc:v1: prefix');
    assert.ok(!rawOutbox.recipient.includes(sensitiveRecipient), 'Raw SQLite must NOT contain plaintext recipient email');

    assert.ok(rawOutbox.payload.startsWith('enc:v1:'), 'Outbox payload must be encrypted with enc:v1: prefix');
    assert.ok(!rawOutbox.payload.includes(sensitiveLegalText), 'Raw SQLite must NOT contain sensitive legal text');

    // 4. Inspect raw file bytes from disk
    const fileBytes = fs.readFileSync(dbPath, 'utf8');
    assert.ok(!fileBytes.includes(sensitiveLegalText), 'Physical file on disk must NOT contain sensitive legal text');
    assert.ok(!fileBytes.includes(sensitiveRecipient), 'Physical file on disk must NOT contain recipient email');

    // 5. Open with NotificationDatabase + securityManager and verify transparent decryption
    const decryptedDb = new NotificationDatabase({
      dbPath,
      securityManager
    });

    const claimed = decryptedDb.claimNextOutboxBatch(10);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].recipient, sensitiveRecipient);
    assert.equal(claimed[0].payload.subject, 'Publicação em Processo Sigiloso');
    assert.ok(claimed[0].payload.html.includes(sensitiveLegalText));

    decryptedDb.close();
  });
});
