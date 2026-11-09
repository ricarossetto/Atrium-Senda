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

import {
  cleanCnj,
  formatCnj,
  isValidCnj,
  parseCnjSegments,
  resolveCourtFromCnj,
  describeCnj,
  suggestCnjCorrection,
  computeCnjCheckDigits,
  CNJ_SEGMENTS,
  CNJ_TRIBUNALS
} from '../../../js/core/cnj.js';

export {
  cleanCnj,
  formatCnj,
  isValidCnj,
  parseCnjSegments,
  resolveCourtFromCnj,
  describeCnj,
  suggestCnjCorrection,
  computeCnjCheckDigits,
  CNJ_SEGMENTS,
  CNJ_TRIBUNALS
};

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
