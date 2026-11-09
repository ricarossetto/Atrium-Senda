import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NotificationDatabase } from '../lib/notifications/db.mjs';

const TEST_DIR = path.resolve('test-tmp-tenant-isolation');

describe('Physical Tenant DB Isolation', () => {
  before(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('maintains strict physical file separation per tenant', () => {
    const tenantADir = path.join(TEST_DIR, 'tenants', 'tenant-alpha');
    const tenantBDir = path.join(TEST_DIR, 'tenants', 'tenant-beta');

    fs.mkdirSync(tenantADir, { recursive: true });
    fs.mkdirSync(tenantBDir, { recursive: true });

    let dbA, dbB;
    try {
      dbA = new NotificationDatabase({ tenantDir: tenantADir });
      dbB = new NotificationDatabase({ tenantDir: tenantBDir });

      assert.equal(fs.existsSync(path.join(tenantADir, 'notifications.sqlite')), true);
      assert.equal(fs.existsSync(path.join(tenantBDir, 'notifications.sqlite')), true);

      // Tenant A sets state
      dbA.setSetting('atrium_mail_enabled', 'true');
      dbA.addRecipient({
        workspaceId: 'tenant-alpha',
        email: 'lawyer.a@escritorio-a.com.br',
        name: 'Advogado Alpha'
      });

      // Tenant B sets different state
      dbB.setSetting('atrium_mail_enabled', 'false');
      dbB.addRecipient({
        workspaceId: 'tenant-beta',
        email: 'lawyer.b@escritorio-b.com.br',
        name: 'Advogado Beta'
      });

      // Verify Tenant A data does not exist in Tenant B
      assert.equal(dbA.getSetting('atrium_mail_enabled'), 'true');
      assert.equal(dbB.getSetting('atrium_mail_enabled'), 'false');

      const recipientsA = dbA.listRecipients('tenant-alpha');
      const recipientsB = dbB.listRecipients('tenant-beta');

      assert.equal(recipientsA.length, 1);
      assert.equal(recipientsA[0].email, 'lawyer.a@escritorio-a.com.br');

      assert.equal(recipientsB.length, 1);
      assert.equal(recipientsB[0].email, 'lawyer.b@escritorio-b.com.br');

      // Cross-tenant query attempt on dbA looking for Tenant B records should return empty
      const stmtCross = dbA.db.prepare('SELECT * FROM notification_recipients WHERE email = ?');
      const foundCross = stmtCross.get('lawyer.b@escritorio-b.com.br');
      assert.equal(foundCross, undefined, 'Tenant A DB must not contain Tenant B email');
    } finally {
      if (dbA) dbA.close();
      if (dbB) dbB.close();
    }
  });
});
