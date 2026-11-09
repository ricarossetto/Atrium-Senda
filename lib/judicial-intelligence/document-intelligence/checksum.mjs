import { createHash } from 'node:crypto';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../core/errors.mjs';

export function sha256Hex(binary) {
  return createHash('sha256').update(binary).digest('hex');
}

export function verifyChecksum(binary, expected) {
  const actual = sha256Hex(binary);
  if (String(expected).toLowerCase() !== actual) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.CONFLICT, 'Checksum divergente para o documento baixado.', {
      details: { expected, actual }
    });
  }
  return actual;
}

export function isChecksum(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ''));
}
