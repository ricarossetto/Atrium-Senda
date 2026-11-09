const DECIMAL_SCALE = 18;
const SCALE_FACTOR = 10n ** BigInt(DECIMAL_SCALE);
const MAX_INPUT_CHARACTERS = 48;
const ROUNDING_MODES = new Set(['half-up', 'half-even']);

export class DecimalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecimalError';
  }
}

function pow10(exponent) {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new DecimalError(`Expoente decimal inválido: ${exponent}.`);
  }
  return 10n ** BigInt(exponent);
}

function assertMode(mode) {
  if (!ROUNDING_MODES.has(mode)) {
    throw new DecimalError(`Modo de arredondamento inválido: ${mode}. Use half-up ou half-even.`);
  }
}

function roundDiv(dividend, divisor, mode) {
  assertMode(mode);
  if (divisor === 0n) throw new DecimalError('Divisão por zero.');
  const negative = (dividend < 0n) !== (divisor < 0n);
  const absoluteDividend = dividend < 0n ? -dividend : dividend;
  const absoluteDivisor = divisor < 0n ? -divisor : divisor;
  let quotient = absoluteDividend / absoluteDivisor;
  const remainder = absoluteDividend % absoluteDivisor;
  const doubled = remainder * 2n;
  if (doubled > absoluteDivisor) {
    quotient += 1n;
  } else if (doubled === absoluteDivisor) {
    if (mode === 'half-up') quotient += 1n;
    else if (quotient % 2n === 1n) quotient += 1n;
  }
  return negative ? -quotient : quotient;
}

export function isDecimal(value) {
  return typeof value === 'bigint';
}

export function parseDec(input) {
  if (typeof input === 'bigint') return input;
  let text;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new DecimalError(`Número não finito não é decimal válido: ${input}.`);
    text = String(input);
  } else if (typeof input === 'string') {
    text = input.trim();
  } else {
    throw new DecimalError('Valor decimal deve ser string, number finito ou BigInt escalado.');
  }
  if (!text) throw new DecimalError('Valor decimal vazio.');
  if (text.length > MAX_INPUT_CHARACTERS) {
    throw new DecimalError(`Valor decimal excede ${MAX_INPUT_CHARACTERS} caracteres.`);
  }
  const normalized = text.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    throw new DecimalError(`Valor decimal inválido: ${text}.`);
  }
  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [integerPart, fractionPart = ''] = unsigned.split('.');
  const raw = BigInt(`${integerPart}${fractionPart}`);
  let scaled;
  if (fractionPart.length === DECIMAL_SCALE) scaled = raw;
  else if (fractionPart.length < DECIMAL_SCALE) scaled = raw * pow10(DECIMAL_SCALE - fractionPart.length);
  else scaled = roundDiv(raw, pow10(fractionPart.length - DECIMAL_SCALE), 'half-up');
  return negative ? -scaled : scaled;
}

function scalar(value) {
  return typeof value === 'bigint' ? value : parseDec(value);
}

export function add(a, b) {
  return scalar(a) + scalar(b);
}

export function sub(a, b) {
  return scalar(a) - scalar(b);
}

export function mul(a, b) {
  return roundDiv(scalar(a) * scalar(b), SCALE_FACTOR, 'half-up');
}

export function div(a, b) {
  const divisor = scalar(b);
  if (divisor === 0n) throw new DecimalError('Divisão por zero.');
  return roundDiv(scalar(a) * SCALE_FACTOR, divisor, 'half-up');
}

export function neg(value) {
  return -scalar(value);
}

export function abs(value) {
  const resolved = scalar(value);
  return resolved < 0n ? -resolved : resolved;
}

export function cmp(a, b) {
  const left = scalar(a);
  const right = scalar(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function eq(a, b) {
  return cmp(a, b) === 0;
}

export function lt(a, b) {
  return cmp(a, b) < 0;
}

export function lte(a, b) {
  return cmp(a, b) <= 0;
}

export function gt(a, b) {
  return cmp(a, b) > 0;
}

export function gte(a, b) {
  return cmp(a, b) >= 0;
}

export function isZero(value) {
  return scalar(value) === 0n;
}

export function isNegative(value) {
  return scalar(value) < 0n;
}

export function isPositive(value) {
  return scalar(value) > 0n;
}

export function min(a, b) {
  return cmp(a, b) <= 0 ? scalar(a) : scalar(b);
}

export function max(a, b) {
  return cmp(a, b) >= 0 ? scalar(a) : scalar(b);
}

export function sum(values) {
  if (!Array.isArray(values)) throw new DecimalError('Soma decimal exige um array de valores.');
  let total = 0n;
  for (const value of values) total += scalar(value);
  return total;
}

export function roundTo(value, decimals, mode = 'half-up') {
  assertMode(mode);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > DECIMAL_SCALE) {
    throw new DecimalError(`Casas decimais inválidas: ${decimals}.`);
  }
  const drop = DECIMAL_SCALE - decimals;
  if (drop === 0) return scalar(value);
  const divisor = pow10(drop);
  return roundDiv(scalar(value), divisor, mode) * divisor;
}

export function toFixedString(value, decimals = 2, mode = 'half-up') {
  const rounded = roundTo(value, decimals, mode);
  const negative = rounded < 0n;
  const magnitude = negative ? -rounded : rounded;
  const digits = (magnitude / pow10(DECIMAL_SCALE - decimals)).toString().padStart(decimals + 1, '0');
  const integerPart = digits.slice(0, digits.length - decimals);
  const fractionPart = decimals > 0 ? `.${digits.slice(digits.length - decimals)}` : '';
  return `${negative && rounded !== 0n ? '-' : ''}${integerPart}${fractionPart}`;
}

export function formatBR(value, decimals = 2, mode = 'half-up') {
  const plain = toFixedString(value, decimals, mode);
  const negative = plain.startsWith('-');
  const unsigned = negative ? plain.slice(1) : plain;
  const [integerPart, fractionPart] = unsigned.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${fractionPart ? `,${fractionPart}` : ''}`;
}

export function toCents(value, mode = 'half-up') {
  return roundTo(value, 2, mode) / pow10(DECIMAL_SCALE - 2);
}

export function fromCents(cents) {
  let resolved;
  if (typeof cents === 'bigint') resolved = cents;
  else if (typeof cents === 'number' && Number.isInteger(cents)) resolved = BigInt(cents);
  else throw new DecimalError('Centavos devem ser BigInt inteiro ou number inteiro seguro.');
  return resolved * pow10(DECIMAL_SCALE - 2);
}

export function toNumber(value) {
  const resolved = scalar(value);
  const integerPart = resolved / SCALE_FACTOR;
  const fractionPart = resolved % SCALE_FACTOR;
  return Number(integerPart) + Number(fractionPart) / Number(SCALE_FACTOR);
}

export function factorFromPercent(percent) {
  return SCALE_FACTOR + roundDiv(scalar(percent), 100n, 'half-up');
}

export function percentOf(value, percent) {
  return roundDiv(scalar(value) * scalar(percent), 100n * SCALE_FACTOR, 'half-up');
}

export const decimalScale = DECIMAL_SCALE;
