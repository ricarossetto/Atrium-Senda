/**
 * Snapshot público de índices e limites — validação e proveniência.
 *
 * O snapshot é a fonte de índices, piso e teto do perfil. Ele NÃO é assinatura
 * do TRF3 nem garantia contra cliente adulterado: é proveniência declarada
 * (URL fixa, instante, hash SHA-256 e corte de competência).
 *
 * Regras espelhadas do motor de referência:
 *  - URL precisa começar no prefixo HTTPS oficial e caber no limite;
 *  - hash de 64 dígitos hexadecimais e instante RFC3339 válido;
 *  - taxas e limites não vazios, no máximo 3.000 competências cada;
 *  - competência posterior ao corte é inválida; duplicata é inválida;
 *  - taxa precisa ficar em (-1, 10]; valor ausente é ausência, nunca zero;
 *  - piso > 0 e teto >= piso.
 *
 * Nenhum valor monetário passa por `Number`. Toda comparação usa o decimal
 * escalado de 18 casas de `decimal.mjs`.
 */

import {
  add,
  cmp,
  isZero,
  mul,
  parseDec,
  roundTo,
  sub,
  toFixedString
} from './decimal.mjs';
import { isValidCompetence } from './calendar-30360.mjs';
import { LC142_LIMITS, LC142_SNAPSHOT_URL_PREFIX } from './lc142-profile.mjs';

export class Lc142SnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Lc142SnapshotError';
  }
}

const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ONZE_CASAS = parseDec('10');
const MENOS_UM = parseDec('-1');
// Passo da 6ª casa decimal na escala de 18 casas do ATRIUM (10^(18-6) = 10^12).
const DECIMAL_SCALE_FACTOR_6 = 10n ** 12n;

function texto(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Normaliza um decimal público que pode vir em notação científica do provedor.
 * Não usa `Number`: converte a mantissa/expoente em string decimal oficial.
 *
 * Exemplo: `"1.5e-3"` -> `"0.0015"`.
 */
export function canonicalSnapshotDecimal(raw) {
  if (typeof raw !== 'string') throw new Lc142SnapshotError('Decimal público inválido.');
  if (raw.length > LC142_LIMITS.maxDecimalPublico) {
    throw new Lc142SnapshotError('Decimal público fora do limite.');
  }
  const trimmed = raw.trim();
  if (!trimmed) throw new Lc142SnapshotError('Decimal público inválido.');
  if (!/[eE]/.test(trimmed)) {
    // Sem expoente: valida a sintaxe aceita e devolve a forma oficial.
    let normalized;
    try {
      normalized = parseDec(trimmed);
    } catch {
      throw new Lc142SnapshotError('Decimal público inválido.');
    }
    return canonicForm(normalized);
  }
  const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) throw new Lc142SnapshotError('Decimal público inválido.');
  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 400) {
    throw new Lc142SnapshotError('Decimal público inválido.');
  }
  const digits = `${whole}${fraction}`;
  const pointPosition = whole.length + exponent;
  let integerPart;
  let fractionPart;
  if (pointPosition <= 0) {
    integerPart = '0';
    fractionPart = `${'0'.repeat(-pointPosition)}${digits}`;
  } else if (pointPosition >= digits.length) {
    integerPart = `${digits}${'0'.repeat(pointPosition - digits.length)}`;
    fractionPart = '';
  } else {
    integerPart = digits.slice(0, pointPosition);
    fractionPart = digits.slice(pointPosition);
  }
  const combined = `${sign}${integerPart}${fractionPart ? `.${fractionPart}` : ''}`;
  let parsed;
  try {
    parsed = parseDec(combined);
  } catch {
    throw new Lc142SnapshotError('Decimal público inválido.');
  }
  return canonicForm(parsed);
}

/** Forma oficial sem zeros à direita, preservando o inteiro. */
function canonicForm(scaled) {
  const fixed = toFixedString(scaled, 18).replace(/0+$/, '');
  const semPonto = fixed.endsWith('.') ? fixed.slice(0, -1) : fixed;
  return semPonto === '-0' ? '0' : semPonto;
}

/**
 * Lê um decimal do snapshot ou da hipótese.
 * Aceita ponto decimal, sem vírgula, sem notação científica e dentro do limite
 * de 40 caracteres — a mesma faixa do motor de origem.
 */
export function parseHipoteseDecimal(raw) {
  if (typeof raw !== 'string') {
    throw new Lc142SnapshotError('Valor decimal inválido no snapshot ou na hipótese.');
  }
  if (raw.length > LC142_LIMITS.maxDecimalHipotese || /[eE,]/.test(raw)) {
    throw new Lc142SnapshotError('Valor decimal inválido no snapshot ou na hipótese.');
  }
  try {
    return parseDec(raw);
  } catch {
    throw new Lc142SnapshotError('Valor decimal inválido no snapshot.');
  }
}

/**
 * Valida a estrutura do snapshot. Lança erro determinístico na primeira falha,
 * na mesma ordem do motor de origem.
 */
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Lc142SnapshotError('Proveniência do snapshot ausente ou inválida.');
  }
  if (!isValidCompetence(texto(snapshot.through))) {
    throw new Lc142SnapshotError('Competência AAAA-MM inválida.');
  }
  const rates = Array.isArray(snapshot.rates) ? snapshot.rates : [];
  const limits = Array.isArray(snapshot.limits) ? snapshot.limits : [];
  if (
    rates.length === 0 ||
    rates.length > LC142_LIMITS.maxSnapshotCompetencias ||
    limits.length === 0 ||
    limits.length > LC142_LIMITS.maxSnapshotCompetencias
  ) {
    throw new Lc142SnapshotError('Snapshot vazio ou fora do limite de competências.');
  }
  const url = texto(snapshot.source_url);
  const sha = texto(snapshot.response_sha256);
  const retrievedAt = texto(snapshot.retrieved_at);
  if (
    !url.startsWith(LC142_SNAPSHOT_URL_PREFIX) ||
    url.length > LC142_LIMITS.maxUrlSnapshot ||
    sha.length !== 64 ||
    !SHA256_PATTERN.test(sha) ||
    !RFC3339_PATTERN.test(retrievedAt) ||
    !isValidRfc3339(retrievedAt)
  ) {
    throw new Lc142SnapshotError('Proveniência do snapshot ausente ou inválida.');
  }
  const vistosCodigos = new Set();
  for (const rate of rates) {
    const month = texto(rate?.month);
    if (!isValidCompetence(month)) throw new Lc142SnapshotError('Competência AAAA-MM inválida.');
    if (month > snapshot.through || vistosCodigos.has(month)) {
      throw new Lc142SnapshotError('Taxa duplicada ou posterior ao corte do snapshot.');
    }
    vistosCodigos.add(month);
    for (const campo of ['inpc', 'igpdi', 'ipcr', 'inpc_inss']) {
      const raw = rate?.[campo];
      if (raw === undefined || raw === null) continue;
      const valor = parseHipoteseDecimal(raw);
      if (cmp(valor, MENOS_UM) <= 0 || cmp(valor, ONZE_CASAS) > 0) {
        throw new Lc142SnapshotError('Taxa fora dos limites do snapshot.');
      }
    }
  }
  const vistosLimites = new Set();
  for (const limit of limits) {
    const month = texto(limit?.month);
    if (!isValidCompetence(month)) throw new Lc142SnapshotError('Competência AAAA-MM inválida.');
    const minimo = parseHipoteseDecimal(limit?.minimum);
    const teto = parseHipoteseDecimal(limit?.ceiling);
    const fonteMinimo = texto(limit?.minimum_source);
    const fonteTeto = texto(limit?.ceiling_source);
    if (
      month > snapshot.through ||
      vistosLimites.has(month) ||
      cmp(minimo, parseDec('0')) <= 0 ||
      cmp(teto, minimo) < 0 ||
      fonteMinimo.length > LC142_LIMITS.maxFundamento ||
      fonteTeto.length > LC142_LIMITS.maxFundamento
    ) {
      throw new Lc142SnapshotError('Limites mensais inconsistentes ou fundamento fora do limite.');
    }
    vistosLimites.add(month);
  }
  return true;
}

function isValidRfc3339(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  return hour <= 23 && minute <= 59 && second <= 60;
}

/**
 * Indexa taxas e limites por competência. A validação prévia garante unicidade.
 */
export function indexSnapshot(snapshot) {
  const rates = new Map();
  for (const rate of snapshot.rates) rates.set(rate.month, rate);
  const limits = new Map();
  for (const limit of snapshot.limits) limits.set(limit.month, limit);
  return { rates, limits };
}

/**
 * Resolve a taxa bruta de correção de uma competência, conforme os cortes
 * históricos do perfil. Lança erro quando a série exigida está ausente:
 * ausência nunca vira zero.
 */
export function taxaDeCorrecao(rate, competence, policy) {
  if (!rate) throw new Lc142SnapshotError('Snapshot não cobre todas as taxas da correção.');
  let raw;
  if (competence <= '1995-06') {
    raw = rate.ipcr;
    if (raw === undefined || raw === null) throw new Lc142SnapshotError('IPC-r histórico ausente.');
  } else if (competence < '1996-04') {
    raw = rate.inpc;
  } else if (competence <= '2004-01') {
    raw = rate.igpdi;
    if (raw === undefined || raw === null) throw new Lc142SnapshotError('IGP-DI histórico ausente.');
  } else if (policy.applyInssOverrides) {
    raw = rate.inpc_inss ?? rate.inpc;
  } else {
    raw = rate.inpc;
  }
  const parsed = parseHipoteseDecimal(raw);
  if (
    policy.historicalNegativePolicy === 'floor_before_1999_12' &&
    competence < '1999-12' &&
    cmp(parsed, parseDec('0')) < 0
  ) {
    return parseDec('0');
  }
  return parsed;
}

/**
 * Fator de correção composto da competência até o mês de referência (exclusivo).
 * Cada passo multiplica por (1 + taxa) sem arredondamento intermediário.
 */
export function fatorDeCorrecao(competence, referenceMonth, rates, policy, nextCompetence) {
  let fator = parseDec('1');
  let cursor = competence;
  while (cursor < referenceMonth) {
    const rate = rates.get(cursor);
    const taxa = taxaDeCorrecao(rate, cursor, policy);
    fator = mul(fator, add(parseDec('1'), taxa));
    cursor = nextCompetence(cursor);
  }
  return fator;
}

/**
 * Formata um fator truncado em 6 casas, exatamente como o motor de origem
 * exibe (`{:.6}` sobre `trunc_with_scale(6)`). O valor devolvido é só para
 * apresentação; a multiplicação usa o fator integral.
 */
export function fatorTruncado6(fator) {
  // Truncar em direção a zero = divisão inteira de BigInt (que trunca), e
  // remultiplicação para voltar à escala de 18 casas. Nada de arredondar.
  const passo = DECIMAL_SCALE_FACTOR_6;
  const truncado = (fator / passo) * passo;
  return toFixedString(truncado, 6);
}

/** Converte para a forma monetária de 2 casas do perfil (meio afastado de zero). */
export function money2(scaled) {
  return toFixedString(scaled, 2, 'half-up');
}

/** Helpers usados pelos testes e pelo apresentador. */
export { isZero };
