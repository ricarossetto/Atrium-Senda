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
      const result = await service.getAllMonitors(envelope?.state || {});
      json(res, 200, {
        ok: true,
        count: result.all.length,
        monitors: result.all,
        automatic: result.automatic,
        custom: result.custom
      });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/inpi/custom-monitors') {
      assertAuthenticated(req);
      let body = {};
      if (typeof readJson === 'function') {
        try { body = await readJson(req, 10_000); } catch {}
      }
      try {
        const monitor = await service.saveCustomMonitor(body);
        const custom = await service.getCustomMonitors();
        json(res, 200, { ok: true, monitor, custom });
      } catch (err) {
        json(res, 400, { ok: false, message: err.message || 'Erro ao salvar termo de monitoramento.' });
      }
      return true;
    }

    if ((req.method === 'POST' && url.pathname === '/api/integrations/inpi/custom-monitors/delete') ||
        (req.method === 'DELETE' && url.pathname === '/api/integrations/inpi/custom-monitors')) {
      assertAuthenticated(req);
      let body = {};
      if (typeof readJson === 'function') {
        try { body = await readJson(req, 10_000); } catch {}
      }
      const id = body.id || url.searchParams.get('id');
      if (!id) {
        json(res, 400, { ok: false, message: 'ID do termo de monitoramento é obrigatório.' });
        return true;
      }
      const custom = await service.deleteCustomMonitor(id);
      json(res, 200, { ok: true, custom });
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
