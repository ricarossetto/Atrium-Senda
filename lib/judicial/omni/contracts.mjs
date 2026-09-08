/**
 * ATRIUM Sovereign Omni-Collector — Canonical Contracts & CNJ Utilities
 *
 * Defines core provenance constants, fact classification, court resolution,
 * and canonical interfaces for multi-court judicial data collection.
 */

export const FACT_TYPE = Object.freeze({
  FACT: 'FACT',             // Directly witnessed from official tribunal response
  INFERRED: 'INFERRED',     // Derived from related data (e.g. publication party linking)
  UNVERIFIED: 'UNVERIFIED'  // User input or unconfirmed reference
});

export const SOURCE_TYPE = Object.freeze({
  TJRS_PUBLIC: 'TJRS_PUBLIC',
  TJDFT_REST_API: 'TJDFT_REST_API',
  TJSP_ESAJ_PUBLIC: 'TJSP_ESAJ_PUBLIC',
  DATAJUD: 'DATAJUD',
  DJEN: 'DJEN',
  MANUAL: 'MANUAL'
});

export const CHALLENGE_STATUS = Object.freeze({
  NONE: 'NONE',
  HUMAN_ACTION_REQUIRED: 'HUMAN_ACTION_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED'
});

export const QUEUE_PRIORITY = Object.freeze({
  P0: 0, // Interactive UI sync
  P1: 1, // Manual registration preview
  P2: 2, // OAB discovery batch
  P3: 3, // Daily watchlist monitoring
  P4: 4  // Background publication linking
});

/**
 * Cleans a CNJ string, retaining only digits.
 */
export function cleanCnj(cnj) {
  return String(cnj || '').replace(/\D/g, '');
}

/**
 * Formats a 20-digit CNJ into NNNNNNN-DD.YYYY.J.TR.OOOO
 */
export function formatCnj(cnj) {
  const digits = cleanCnj(cnj);
  if (digits.length !== 20) return String(cnj || '');
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

/**
 * Validates whether string is a valid 20-digit CNJ.
 */
export function isValidCnj(cnj) {
  const digits = cleanCnj(cnj);
  if (!/^\d{20}$/.test(digits) || /^0+$/.test(digits)) return false;
  const base = digits.slice(0, 7) + digits.slice(9);
  const expected = String(98n - BigInt(base + '00') % 97n).padStart(2, '0');
  return digits.slice(7, 9) === expected;
}

/**
 * Asserts valid 20-digit CNJ and returns digits.
 */
export function assertCnj(cnj) {
  const digits = cleanCnj(cnj);
  if (!isValidCnj(digits)) {
    const error = new Error('Número de processo CNJ inválido. Confira os 20 dígitos e o dígito verificador.');
    error.code = 'INVALID_CNJ';
    error.statusCode = 400;
    throw error;
  }
  return digits;
}

/**
 * Parses CNJ segments into constituent fields.
 */
export function parseCnjSegments(cnj) {
  const digits = cleanCnj(cnj);
  if (digits.length !== 20) return null;

  const sequential = digits.slice(0, 7);
  const digit = digits.slice(7, 9);
  const year = digits.slice(9, 13);
  const justice = digits.slice(13, 14);
  const tribunal = digits.slice(14, 16);
  const origin = digits.slice(16, 20);

  return {
    sequential,
    digit,
    year,
    justice,
    tribunal,
    origin,
    segment: `${justice}.${tribunal}`,
    formatted: `${sequential}-${digit}.${year}.${justice}.${tribunal}.${origin}`,
    unmasked: digits
  };
}

/**
 * Resolves tribunal code from CNJ justice.tribunal (J.TR) segment.
 */
export function resolveCourtFromCnj(cnj) {
  const parsed = parseCnjSegments(cnj);
  if (!parsed) return null;

  switch (parsed.segment) {
    case '8.21': return 'TJRS';
    case '8.07': return 'TJDFT';
    case '8.26': return 'TJSP';
    case '4.04': return 'TRF4';
    case '8.24': return 'TJSC';
    case '8.16': return 'TJPR';
    case '8.13': return 'TJMG';
    case '8.19': return 'TJRJ';
    case '5.04': return 'TRT4';
    case '5.02': return 'TRT2';
    default: return null;
  }
}
