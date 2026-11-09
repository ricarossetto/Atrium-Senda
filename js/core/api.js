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
  // Coleções server-authoritative não viajam no flush: o servidor restaura `documents`
  // e `communications` do estado consolidado (`saveClientAppState`) e enviá-las de volta só
  // inflava o corpo — o acervo documental cresce e o flush precisa continuar leve.
  const { documents, communications, ...clientState } = state && typeof state === 'object' ? state : {};
  return authenticatedRequest('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: clientState, revision })
  });
}

export async function searchContent(query, limit = 24) {
  const params = new URLSearchParams({ q: String(query || ''), limit: String(limit) });
  const response = await authenticatedRequest(`/api/search?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'A busca global não pôde ser concluída.');
  return Array.isArray(payload.results) ? payload.results : [];
}
