import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';

export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

export function inspectPdpjToken(token, { now = () => Date.now() } = {}) {
  if (!token) return { present: false, valid: false, expiresAt: null, expired: null, subject: null };
  const payload = decodeJwtPayload(token);
  const expSeconds = Number(payload?.exp);
  const expiresAt = Number.isFinite(expSeconds) ? new Date(expSeconds * 1000).toISOString() : null;
  const expired = Number.isFinite(expSeconds) ? expSeconds * 1000 <= now() : null;
  const subject = typeof payload?.sub === 'string' ? payload.sub.slice(0, 24) : null;
  return {
    present: true,
    valid: payload !== null,
    expiresAt,
    expired,
    subject
  };
}

export function createPdpjTokenProvider({ env = process.env, token = null, now = () => Date.now() } = {}) {
  let inMemory = token || null;
  const resolve = () => inMemory || env?.PDPJ_ACCESS_TOKEN || null;
  return {
    set(nextToken) {
      if (nextToken !== null && typeof nextToken !== 'string') {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Token PDPJ deve ser string.');
      }
      inMemory = nextToken;
    },
    clear() {
      inMemory = null;
    },
    describe() {
      const resolved = resolve();
      return {
        ...inspectPdpjToken(resolved, { now }),
        source: inMemory ? 'memory' : (env?.PDPJ_ACCESS_TOKEN ? 'environment' : 'absent')
      };
    },
    async get() {
      const resolved = resolve();
      if (!resolved) return null;
      const state = inspectPdpjToken(resolved, { now });
      if (state.expired === true) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAUTHORIZED, 'Token PDPJ expirado.', {
          provider: 'pdpj',
          operation: 'auth',
          humanAction: 'Capture um novo token na sua sessão autenticada do portal PDPJ.'
        });
      }
      return resolved;
    }
  };
}
