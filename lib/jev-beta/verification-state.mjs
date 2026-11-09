export const JEV_VERIFICATION_STATES = Object.freeze({
  LIVE_VERIFIED: 'LIVE_VERIFIED',
  LIVE_PARTIAL: 'LIVE_PARTIAL',
  FIXTURE_VALIDATED: 'FIXTURE_VALIDATED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  UNVERIFIED: 'UNVERIFIED',
  UNAVAILABLE: 'UNAVAILABLE'
});

const CONSERVATIVE_ORDER = Object.freeze({
  UNAVAILABLE: 6,
  HUMAN_REQUIRED: 5,
  UNVERIFIED: 4,
  FIXTURE_VALIDATED: 3,
  LIVE_PARTIAL: 2,
  LIVE_VERIFIED: 1
});

export function isJevVerificationState(value) {
  return Object.values(JEV_VERIFICATION_STATES).includes(value);
}

export function combineJevVerificationStates(states = []) {
  const list = (Array.isArray(states) ? states : [states]).filter(isJevVerificationState);
  if (list.length === 0) return JEV_VERIFICATION_STATES.UNVERIFIED;
  return list.reduce((worst, current) =>
    (CONSERVATIVE_ORDER[current] ?? 0) > (CONSERVATIVE_ORDER[worst] ?? 0) ? current : worst);
}
