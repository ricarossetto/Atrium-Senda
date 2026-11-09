import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Creates an opaque, tamper-evident routing tag for Resend emails.
 * Never leaks legal data, party names, process numbers, or client PII.
 */
export function createOpaqueTag(value, secret = '') {
  if (!value || typeof value !== 'string') return '';
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('RESEND_WEBHOOK_SECRET ausente ou fraco para assinar tags de roteamento.');
  const key = Buffer.from(secret, 'utf8');
  const hmac = createHmac('sha256', key).update(value, 'utf8').digest('hex').slice(0, 16);
  const b64 = Buffer.from(value, 'utf8').toString('base64url');
  return `${b64}_${hmac}`;
}

/**
 * Resolves an opaque tag back to its canonical identifier.
 * Returns null if the tag is missing, corrupted, or has an invalid signature.
 */
export function resolveOpaqueTag(tag, secret = '') {
  if (!tag || typeof tag !== 'string') return null;
  if (typeof secret !== 'string' || secret.length < 16) return null;
  const sepIdx = tag.lastIndexOf('_') !== -1 ? tag.lastIndexOf('_') : tag.indexOf('.');
  if (sepIdx === -1) return null;
  const b64 = tag.slice(0, sepIdx);
  const hmac = tag.slice(sepIdx + 1);

  try {
    const value = Buffer.from(b64, 'base64url').toString('utf8');
    const key = Buffer.from(secret, 'utf8');
    const expectedHmac = createHmac('sha256', key).update(value, 'utf8').digest('hex').slice(0, 16);

    const bufA = Buffer.from(hmac, 'utf8');
    const bufB = Buffer.from(expectedHmac, 'utf8');
    if (bufA.length === bufB.length && timingSafeEqual(bufA, bufB)) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}
