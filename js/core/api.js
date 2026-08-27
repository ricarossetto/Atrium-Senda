function authenticatedRequest(path, options) {
  const auth = globalThis.KellerAuth;
  if (!auth?.secureFetch) throw new Error('Authenticated API is not ready.');
  return auth.secureFetch(path, options);
}

export function fetchState() {
  return authenticatedRequest('/api/state', { headers: { Accept: 'application/json' } });
}

export function importLegacyState(legacyState) {
  return authenticatedRequest('/api/state/import-legacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ legacyState })
  });
}

export function persistState(state, revision) {
  return authenticatedRequest('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, revision }),
    keepalive: true
  });
}
