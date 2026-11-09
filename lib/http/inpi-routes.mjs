export const MAX_INPI_SCAN_LIMIT = 24;

export function createInpiHttpHandler({
  service,
  assertAuthenticated,
  readStateEnvelope,
  persistStateEnvelope,
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
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const state = envelope?.state || {};
      const reconcile = service.reconcileDashboardToState || service.syncMatchesToState;
      const syncResult = typeof reconcile === 'function'
        ? await reconcile.call(service, state)
        : { added: 0 };
      if (syncResult?.added > 0 && typeof persistStateEnvelope === 'function') {
        await persistStateEnvelope(envelope);
      }
      const data = await service.getDashboardData();
      json(res, 200, {
        ok: true,
        ...data,
        syncedToIntimations: syncResult?.added || 0,
        newIntimations: syncResult?.newIntimations || []
      });
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
      assertAuthenticated(req, true);
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
      assertAuthenticated(req, true);
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
      const scanSession = assertAuthenticated(req, true);
      // Varredura é coleta externa: só quem administra o escritório inicia.
      if (!['master_admin', 'admin'].includes(scanSession.role)) {
        throw Object.assign(new Error('Só quem administra o escritório pode iniciar a coleta nos tribunais. Os ciclos automáticos continuam rodando.'), { statusCode: 403 });
      }
      let body = {};
      if (typeof readJson === 'function') {
        try {
          body = await readJson(req, 10_000);
        } catch {}
      }
      const rawLimit = body?.limit;
      let limit = 1;
      if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
        const parsedLimit = typeof rawLimit === 'string' ? Number(rawLimit.trim()) : rawLimit;
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_INPI_SCAN_LIMIT) {
          json(res, 400, {
            ok: false,
            message: `Parâmetro limit inválido: informe um inteiro entre 1 e ${MAX_INPI_SCAN_LIMIT}.`
          });
          return true;
        }
        limit = parsedLimit;
      }
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const state = envelope?.state || {};
      const result = await service.runScan({
        state,
        limit,
        force: Boolean(body.force)
      });
      if (result?.syncedToIntimations > 0 && typeof persistStateEnvelope === 'function') {
        await persistStateEnvelope(envelope);
      }
      json(res, result.ok ? 200 : (result.busy ? 409 : 500), result);
      return true;
    }

    return false;
  };
}
