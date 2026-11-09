export const VERIFICATION_STATES = Object.freeze({
  LIVE_VERIFIED: 'LIVE_VERIFIED',
  LIVE_PARTIAL: 'LIVE_PARTIAL',
  FIXTURE_VALIDATED: 'FIXTURE_VALIDATED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  UNVERIFIED: 'UNVERIFIED',
  UNAVAILABLE: 'UNAVAILABLE'
});

export const VERIFICATION_DESCRIPTIONS = Object.freeze({
  LIVE_VERIFIED: 'Comportamento confirmado contra a fonte real, sem ressalvas conhecidas.',
  LIVE_PARTIAL: 'Parte do comportamento foi confirmada ao vivo; a capacidade principal ainda não foi comparada com a fonte oficial.',
  FIXTURE_VALIDATED: 'Contrato e fluxo validados deterministicamente com fixtures; qualidade real não demonstrada.',
  HUMAN_REQUIRED: 'A fonte exige etapa humana explícita; o beta não automatiza login, CAPTCHA ou certificado.',
  UNVERIFIED: 'Implementado, mas nenhuma validação real foi executada.',
  UNAVAILABLE: 'Não habilitado ou indisponível nesta instalação.'
});

const CONSERVATIVE_ORDER = Object.freeze({
  UNAVAILABLE: 6,
  HUMAN_REQUIRED: 5,
  UNVERIFIED: 4,
  FIXTURE_VALIDATED: 3,
  LIVE_PARTIAL: 2,
  LIVE_VERIFIED: 1
});

export function isVerificationState(value) {
  return Object.values(VERIFICATION_STATES).includes(value);
}

export function assertVerificationState(value, { context = 'verification-state' } = {}) {
  if (!isVerificationState(value)) {
    throw new TypeError(`Estado de verificação inválido em ${context}: ${value}`);
  }
  return value;
}

export function describeVerificationState(value) {
  assertVerificationState(value);
  return VERIFICATION_DESCRIPTIONS[value];
}

export function verificationBadge(value) {
  const state = assertVerificationState(value);
  return {
    state,
    label: state.replace(/_/g, ' ').toLowerCase(),
    live: state === VERIFICATION_STATES.LIVE_VERIFIED || state === VERIFICATION_STATES.LIVE_PARTIAL,
    requiresHuman: state === VERIFICATION_STATES.HUMAN_REQUIRED,
    isOfficialClaim: state === VERIFICATION_STATES.LIVE_VERIFIED,
    description: VERIFICATION_DESCRIPTIONS[state]
  };
}

export function combineVerificationStates(states = []) {
  const list = (Array.isArray(states) ? states : [states]).filter(isVerificationState);
  if (list.length === 0) return VERIFICATION_STATES.UNVERIFIED;
  return list.reduce((worst, current) =>
    (CONSERVATIVE_ORDER[current] ?? 0) > (CONSERVATIVE_ORDER[worst] ?? 0) ? current : worst);
}

export function neverOverclaim(value, { floor = VERIFICATION_STATES.FIXTURE_VALIDATED } = {}) {
  assertVerificationState(value);
  assertVerificationState(floor);
  return (CONSERVATIVE_ORDER[value] ?? 0) < (CONSERVATIVE_ORDER[floor] ?? 0) ? floor : value;
}
