export const API_CONTRACT_VERSION = '2026-09-01';
export const API_STABILITY = 'internal';

export function apiContractHeaders() {
  return {
    'X-Atrium-API-Version': API_CONTRACT_VERSION,
    'X-Atrium-API-Stability': API_STABILITY
  };
}

export function buildApiMetadata({ applicationVersion = 'unknown' } = {}) {
  return {
    product: 'ATRIUM',
    applicationVersion: String(applicationVersion || 'unknown'),
    contractVersion: API_CONTRACT_VERSION,
    stability: API_STABILITY,
    routeVersioning: 'unversioned-internal',
    publicApi: false,
    supportedVersionPrefixes: []
  };
}

export function isUnknownVersionedApiPath(pathname = '') {
  return /^\/api\/v\d+(?:\/|$)/i.test(String(pathname));
}
