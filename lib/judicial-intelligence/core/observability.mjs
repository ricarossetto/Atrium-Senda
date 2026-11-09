const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|senha|password|passphrase|cookie|api[-_]?key|otp|totp|csrf|pfx|private[-_]?key)/i;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_PATTERN = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const MAX_TEXT_LENGTH = 160;

export const OPERATION_STATUS = Object.freeze({
  OK: 'ok',
  DEGRADED: 'degraded',
  FAILED: 'failed',
  DISABLED: 'disabled',
  HUMAN_REQUIRED: 'human_required'
});

export function redactText(text) {
  return String(text)
    .replace(CNPJ_PATTERN, '[CNPJ]')
    .replace(CPF_PATTERN, '[CPF]')
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .slice(0, MAX_TEXT_LENGTH);
}

export function redactForLog(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[DEPTH]';
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redactForLog(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactForLog(item, depth + 1);
    }
    return output;
  }
  return '[UNKNOWN]';
}

export function sanitizeOperationRecord(record) {
  return {
    provider: record.provider,
    operation: record.operation,
    status: record.status,
    durationMs: record.durationMs,
    items: record.items,
    cacheHit: record.cacheHit,
    errorClass: record.errorClass,
    startedAt: record.startedAt
  };
}

export class OperationRecorder {
  #records = [];
  #limit;
  #now;

  constructor({ limit = 200, now = () => Date.now() } = {}) {
    this.#limit = Math.max(1, Number(limit) || 200);
    this.#now = now;
  }

  start(provider, operation) {
    const startedAt = this.#now();
    const startedIso = new Date(startedAt).toISOString();
    return {
      finish: ({ status = OPERATION_STATUS.OK, items = 0, cacheHit = false, errorClass = null } = {}) => {
        const record = sanitizeOperationRecord({
          provider,
          operation,
          status,
          durationMs: Math.max(0, this.#now() - startedAt),
          items: Number(items) || 0,
          cacheHit: cacheHit === true,
          errorClass,
          startedAt: startedIso
        });
        this.#records.push(record);
        if (this.#records.length > this.#limit) this.#records.splice(0, this.#records.length - this.#limit);
        return record;
      }
    };
  }

  records() {
    return this.#records.map(record => ({ ...record }));
  }

  summary() {
    const byProvider = {};
    for (const record of this.#records) {
      const entry = byProvider[record.provider] ?? { operations: 0, failures: 0, items: 0, durationMs: 0 };
      entry.operations += 1;
      if (record.status === OPERATION_STATUS.FAILED) entry.failures += 1;
      entry.items += record.items;
      entry.durationMs += record.durationMs;
      byProvider[record.provider] = entry;
    }
    return { total: this.#records.length, byProvider };
  }

  clear() {
    this.#records = [];
  }
}
