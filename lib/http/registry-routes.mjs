export function createRegistryHttpHandler({ service, assertAuthenticated, json } = {}) {
  if (!service || typeof assertAuthenticated !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências das rotas de inteligência cadastral são obrigatórias.');
  }
  const requestWindows = new Map();
  return async function handleRegistryRequest(req, res, url) {
    if (req.method !== 'GET' || !url.pathname.startsWith('/api/registry/')) return false;
    assertAuthenticated(req);
    enforceRateLimit(requestWindows, req);
    if (url.pathname === '/api/registry/status') {
      json(res, 200, service.status());
      return true;
    }
    if (url.pathname === '/api/registry/document/validate') {
      json(res, 200, service.validateDocument(url.searchParams.get('value')));
      return true;
    }
    if (url.pathname === '/api/registry/cnpj') {
      json(res, 200, await service.lookupCnpj(url.searchParams.get('value')));
      return true;
    }
    if (url.pathname === '/api/registry/cep') {
      json(res, 200, await service.lookupCep(url.searchParams.get('value')));
      return true;
    }
    if (url.pathname === '/api/registry/banks') {
      json(res, 200, await service.searchBanks(url.searchParams.get('query') || ''));
      return true;
    }
    const providerMatch = url.pathname.match(/^\/api\/registry\/providers\/([a-z0-9-]+)\/test$/);
    if (providerMatch) {
      json(res, 200, await service.testProvider(providerMatch[1]));
      return true;
    }
    json(res, 404, { message: 'Recurso de inteligência cadastral não encontrado.' });
    return true;
  };
}

function enforceRateLimit(windows, req) {
  const key = String(req.socket?.remoteAddress || 'local');
  const now = Date.now();
  const current = windows.get(key);
  const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > 60) throw Object.assign(new Error('Limite temporário de consultas cadastrais atingido.'), { statusCode: 429 });
}
