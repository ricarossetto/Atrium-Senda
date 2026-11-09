export const JI_ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  NOT_FOUND: 'NOT_FOUND',
  UNAVAILABLE: 'UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  DISABLED: 'DISABLED',
  CONFLICT: 'CONFLICT',
  PARSE_ERROR: 'PARSE_ERROR',
  TOO_LARGE: 'TOO_LARGE',
  INTERNAL: 'INTERNAL'
});

export const RETRYABLE_ERROR_CODES = Object.freeze([
  JI_ERROR_CODES.UNAVAILABLE,
  JI_ERROR_CODES.TIMEOUT,
  JI_ERROR_CODES.RATE_LIMITED,
  JI_ERROR_CODES.INTERNAL
]);

const RETRYABLE = new Set(RETRYABLE_ERROR_CODES);

export class JudicialIntelligenceError extends Error {
  constructor(code, message, meta = {}) {
    if (!Object.values(JI_ERROR_CODES).includes(code)) {
      throw new TypeError(`Código de erro judicial-intelligence inválido: ${code}`);
    }
    super(String(message || code));
    this.name = 'JudicialIntelligenceError';
    this.code = code;
    this.provider = meta.provider ?? null;
    this.operation = meta.operation ?? null;
    this.status = Number.isInteger(meta.status) ? meta.status : null;
    this.retryable = meta.retryable ?? RETRYABLE.has(code);
    this.humanAction = meta.humanAction ?? null;
    this.details = meta.details ?? null;
    this.cause = meta.cause ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      operation: this.operation,
      status: this.status,
      retryable: this.retryable,
      humanAction: this.humanAction
    };
  }
}

export function isJudicialIntelligenceError(error) {
  return error instanceof JudicialIntelligenceError;
}

export function isRetryableError(error) {
  if (!error) return false;
  if (isJudicialIntelligenceError(error)) return error.retryable === true;
  const code = error.cause?.code || error.code;
  return code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' || code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error.name === 'TimeoutError' || error.name === 'AbortError';
}

export function assertJi(condition, code, message, meta = {}) {
  if (!condition) throw new JudicialIntelligenceError(code, message, meta);
  return condition;
}

export function toPublicError(error, { provider = null, operation = null } = {}) {
  if (isJudicialIntelligenceError(error)) {
    return {
      code: error.code,
      message: error.message,
      provider: error.provider ?? provider,
      operation: error.operation ?? operation,
      status: error.status,
      retryable: error.retryable,
      humanAction: error.humanAction
    };
  }
  return {
    code: JI_ERROR_CODES.INTERNAL,
    message: 'Falha interna isolada no módulo de inteligência judicial.',
    provider,
    operation,
    status: null,
    retryable: false,
    humanAction: null
  };
}

export function disabledError(provider, operation, flagId) {
  return new JudicialIntelligenceError(
    JI_ERROR_CODES.DISABLED,
    `Provider ${provider} desativado pela flag ${flagId}.`,
    { provider, operation, humanAction: `Defina ${flagId}=true para habilitar experimentalmente.` }
  );
}

export function humanRequiredError(provider, operation, humanAction) {
  return new JudicialIntelligenceError(
    JI_ERROR_CODES.HUMAN_REQUIRED,
    'Esta fonte exige etapa humana explícita e não será automatizada.',
    { provider, operation, humanAction }
  );
}
