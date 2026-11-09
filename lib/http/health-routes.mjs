// ATRIUM — Rotas de saude e versao (extracao strangler de server.mjs).
// Contrato preservado: GET/HEAD de /api/health e /api/version respondem o mesmo
// payload informativo; headers do contrato de API aplicados pelo helper json().

export function isHealthRoute(req, url) {
  return (req.method === 'GET' || req.method === 'HEAD')
    && (url.pathname === '/api/health' || url.pathname === '/api/version');
}

export function createHealthHttpHandler({ json, stateHealth, getMeta }) {
  return async function healthHttpHandler(req, res) {
    const health = stateHealth();
    const meta = getMeta();
    return json(res, 200, {
      ok: true,
      service: 'atrium-api',
      version: meta.appVersion,
      appVersion: meta.appVersion,
      commitSha: meta.gitSha,
      gitSha: meta.gitSha,
      buildId: meta.buildId,
      builtAt: meta.builtAt,
      schemaVersion: meta.schemaVersion,
      runtimeVersion: process.version,
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      uptimeSeconds: Math.floor(process.uptime()),
      storeIntegrity: (health.status === 'READY' || health.status === 'INITIALIZING') ? 'ok' : 'degraded',
      storeStatus: health.status,
      environment: meta.betaStatus.environment,
      betaMode: meta.betaStatus.betaMode,
      featureFlags: meta.betaStatus.featureFlags,
      enabledFeatureFlags: meta.betaStatus.enabledFeatureFlags,
      timestamp: new Date().toISOString()
    });
  };
}