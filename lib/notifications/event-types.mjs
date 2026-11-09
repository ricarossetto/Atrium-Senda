export const EVENT_TYPES = Object.freeze({
  PUBLICATION_NEW: 'PUBLICATION_NEW',
  DEADLINE_CRITICAL: 'DEADLINE_CRITICAL',
  HEARING_NEW: 'HEARING_NEW',
  MOVEMENT_NEW: 'MOVEMENT_NEW',
  SYNC_FAILED: 'SYNC_FAILED',
  A1_CERT_EXPIRING: 'A1_CERT_EXPIRING'
});

export const CADENCES = Object.freeze({
  BULLETINS: 'BULLETINS',
  IMMEDIATE: 'IMMEDIATE',
  SYNC_DIGEST: 'SYNC_DIGEST',
  DAILY: 'DAILY',
  DISABLED: 'DISABLED'
});

export function normalizeCadence(cadence, enabled = true) {
  if (!enabled || cadence === CADENCES.DISABLED) return CADENCES.DISABLED;
  return ['BULLETINS', 'IMMEDIATE', 'SYNC_DIGEST', 'DAILY'].includes(cadence)
    ? CADENCES.BULLETINS : CADENCES.DISABLED;
}

export const DEFAULT_PREFERENCES = Object.freeze(Object.fromEntries(
  Object.values(EVENT_TYPES).map(type => [type, CADENCES.BULLETINS])
));
