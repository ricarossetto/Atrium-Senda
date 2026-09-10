export function createInpiHttpHandler({
  service,
  assertAuthenticated,
  readStateEnvelope,
  readJson,
  json
} = {}) {
  if (!service || typeof assertAuthenticated !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências do handler HTTP do INPI são obrigatórias.');
  }

  return async function handleInpiRequest(req, res, url) {
    if (!url.pathname.startsWith('/api/integrations/inpi/')) return false;

    if (req.method === 'GET' && url.pathname === '/api/integrations/inpi/status') {
      assertAuthenticated(req);
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const status = await service.getStatus(envelope?.state || {});
      json(res, 200, status);
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/integrations/inpi/data') {
      assertAuthenticated(req);
      const data = await service.getDashboardData();
      json(res, 200, { ok: true, ...data });
      return true;
    }

    if (req.method === 'GET' && url.pathname === '/api/integrations/inpi/monitors') {
      assertAuthenticated(req);
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const monitors = service.extractLawyerMonitors(envelope?.state || {});
      json(res, 200, { ok: true, count: monitors.length, monitors });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/inpi/scan') {
      assertAuthenticated(req, true);
      let body = {};
      if (typeof readJson === 'function') {
        try {
          body = await readJson(req, 10_000);
        } catch {}
      }
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const result = await service.runScan({
        state: envelope?.state || {},
        limit: body.limit || 1,
        force: Boolean(body.force)
      });
      json(res, result.ok ? 200 : (result.busy ? 409 : 500), result);
      return true;
    }

    return false;
  };
}
