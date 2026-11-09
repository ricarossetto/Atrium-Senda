import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Legacy SMTP Gate (ATRIUM_LEGACY_SMTP_ENABLED)', () => {
  it('returns 410 Gone when ATRIUM_LEGACY_SMTP_ENABLED is false or undefined', () => {
    function checkLegacySmtpGate(pathname, envValue) {
      if (pathname.startsWith('/api/integrations/email/')) {
        const legacyEnabled = String(envValue || '').toLowerCase() === 'true';
        if (!legacyEnabled) {
          return {
            status: 410,
            payload: {
              ok: false,
              error: 'A integração SMTP legada foi descontinuada e desabilitada por padrão.',
              legacySmtpDisabled: true
            }
          };
        }
      }
      return { status: 200, payload: { ok: true } };
    }

    // Default (undefined)
    const resDefault = checkLegacySmtpGate('/api/integrations/email/status', undefined);
    assert.equal(resDefault.status, 410);
    assert.equal(resDefault.payload.legacySmtpDisabled, true);

    // Explicitly 'false'
    const resFalse = checkLegacySmtpGate('/api/integrations/email/configure', 'false');
    assert.equal(resFalse.status, 410);
    assert.equal(resFalse.payload.legacySmtpDisabled, true);

    // Other paths unaffected
    const resOther = checkLegacySmtpGate('/api/admin/mail/status', 'false');
    assert.equal(resOther.status, 200);

    // When explicitly 'true' for rollback
    const resTrue = checkLegacySmtpGate('/api/integrations/email/status', 'true');
    assert.equal(resTrue.status, 200);
  });
});
