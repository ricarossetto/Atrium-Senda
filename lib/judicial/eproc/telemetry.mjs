/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Telemetry & Redaction Engine
 *
 * Enforces structured telemetry contracts and zero-leakage security boundaries.
 * Deeply sanitizes all telemetry payloads, logs, and state objects before persistence or emission.
 */

const SENSITIVE_KEY_REGEX = /(?:password|senha|secret|totp|token|cookie|chave|accessKey|passphrase|pfx|privateKey|^credentials?$)/i;
const SENSITIVE_PARTY_KEY_REGEX = /^(?:plaintiff|autor|defendant|reu|clientName|partyName)$/i;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const TOTP_SECRET_REGEX = /\b[A-Z2-7]{16,32}\b/g;

/**
 * Deeply sanitizes an object, array, or primitive value, stripping or masking
 * all secrets, passwords, tokens, certificates, TOTPs, CPFs, and real party names.
 *
 * @param {any} value
 * @returns {any} Sanitized clone of the input
 */
export function sanitizeTelemetryPayload(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeTelemetryPayload(item));
  }

  if (typeof value === 'object') {
    const cleanObj = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        cleanObj[k] = '[REDACTED_SECRET]';
      } else if (SENSITIVE_PARTY_KEY_REGEX.test(k) && typeof v === 'string') {
        cleanObj[k] = maskPartyName(v);
      } else if (k === 'documentNumber' || k === 'cpf') {
        cleanObj[k] = maskCpf(String(v || ''));
      } else {
        cleanObj[k] = sanitizeTelemetryPayload(v);
      }
    }
    return cleanObj;
  }

  return value;
}

function sanitizeString(str) {
  let s = str;
  // Mask private keys or certificate blocks (PEM)
  if (/BEGIN (?:[A-Z ]*)PRIVATE KEY|BEGIN (?:[A-Z ]*)CERTIFICATE/.test(s)) {
    return '[REDACTED_CERTIFICATE]';
  }
  // Mask CPFs
  s = s.replace(CPF_REGEX, '***.***.***-**');
  // Mask cookies / tokens
  s = s.replace(/(?:ChaAnon_|PHPSESSID=|JSESSIONID=)[a-zA-Z0-9_-]+/gi, '$1[REDACTED_TOKEN]');
  return s;
}

export function maskCpf(cpf) {
  const digits = String(cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function maskPartyName(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/);
  if (parts.length <= 1) return `${clean[0]}***`;
  return `${parts[0]} ${parts.slice(1).map(p => p[0] + '***').join(' ')}`;
}

/**
 * Builds a standardized, sanitized telemetry record for portal synchronization.
 *
 * @param {Object} params
 * @param {string} params.portalId Canonical portal ID
 * @param {string} [params.credentialScope] Resolved regional credential scope
 * @param {'scheduled'|'manual'} [params.trigger='manual']
 * @param {string} [params.scheduledSlot] Canonical slot key (e.g. ISO UTC timestamp)
 * @param {string} params.startedAt ISO 8601 UTC timestamp
 * @param {string} [params.finishedAt] ISO 8601 UTC timestamp
 * @param {'RUNNING'|'COMPLETED'|'ERROR'} params.state
 * @param {Object} [params.counts]
 * @param {string|null} [params.error]
 * @returns {Object} Structured telemetry record
 */
export function buildPortalTelemetry({
  portalId,
  credentialScope = null,
  trigger = 'manual',
  scheduledSlot = null,
  startedAt,
  finishedAt = null,
  state = 'RUNNING',
  phase = 'complete',
  counts = {},
  error = null
} = {}) {
  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
  const endMs = finishedAt ? new Date(finishedAt).getTime() : (state === 'COMPLETED' || state === 'ERROR' ? Date.now() : null);
  const durationMs = (endMs && startMs) ? Math.max(0, endMs - startMs) : null;

  const raw = {
    portalId,
    credentialScope,
    trigger,
    scheduledSlot,
    startedAt,
    finishedAt,
    durationMs,
    state,
    phase,
    counts: {
      processes: counts.processes || 0,
      deadlines: counts.deadlines || 0,
      hearings: counts.hearings || 0,
      documents: counts.documents || 0
    },
    error: error ? String(error) : null
  };

  return sanitizeTelemetryPayload(raw);
}
