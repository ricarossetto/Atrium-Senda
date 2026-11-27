import { existsSync } from 'node:fs';
import { filterPrivateScopeState } from '../office/access-control.mjs';

export const MAX_INPI_SCAN_LIMIT = 24;

function cloneStateSafe(state) {
  if (!state || typeof state !== 'object') return {};
  try {
    return structuredClone(state);
  } catch {
    return state;
  }
}

export function createInpiHttpHandler({
  service,
  assertAuthenticated,
  assertAdmin = null,
  readStateEnvelope,
  persistStateEnvelope,
  readJson,
  json
} = {}) {
  if (!service || typeof assertAuthenticated !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências do handler HTTP do INPI são obrigatórias.');
  }

  const requireAdmin = (req, requireCsrf = true, message = 'Apenas administradores podem gerenciar monitores do INPI.') => {
    if (typeof assertAdmin === 'function') {
      return assertAdmin(req, requireCsrf, message);
    }
    const session = assertAuthenticated(req, requireCsrf);
    if (!['master_admin', 'admin'].includes(session?.role)) {
      throw Object.assign(new Error(message), { statusCode: 403 });
    }
    return session;
  };

  const reconcileAndPersistMatches = async ({ result = null, fallbackEnvelope = null, requireSyncedFlag = false } = {}) => {
    const reconcile = service.reconcileDashboardToState || service.syncMatchesToState;
    const maxAttempts = 3;
    let lastSyncResult = { added: 0, newIntimations: [] };
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const freshEnvelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : null;
      if (freshEnvelope?.state && typeof reconcile === 'function') {
        const syncResult = await reconcile.call(service, freshEnvelope.state);
        lastSyncResult = syncResult || lastSyncResult;
        let shouldPersist = Boolean(syncResult?.added > 0);
        if (!shouldPersist && !syncResult?.skipped && Array.isArray(result?.newIntimations) && result.newIntimations.length > 0 && (!service.dataPath || !existsSync(service.dataPath))) {
          freshEnvelope.state.intimations = Array.isArray(freshEnvelope.state.intimations) ? freshEnvelope.state.intimations : [];
          let added = 0;
          for (const item of result.newIntimations) {
            if (!item?.id) continue;
            if (!freshEnvelope.state.intimations.some(existing => Boolean(existing && ((item.id && existing.id === item.id) || (item.externalId && existing.externalId === item.externalId))))) {
              freshEnvelope.state.intimations.unshift(item);
              added += 1;
            }
          }
          shouldPersist = added > 0;
        }
        if (!shouldPersist || typeof persistStateEnvelope !== 'function') {
          return lastSyncResult;
        }
        try {
          await persistStateEnvelope(freshEnvelope);
          return lastSyncResult;
        } catch (error) {
          if (error?.statusCode === 409 && attempt < maxAttempts - 1) {
            continue;
          }
          throw error;
        }
      }
      if (!requireSyncedFlag && fallbackEnvelope?.state && typeof reconcile === 'function') {
        lastSyncResult = (await reconcile.call(service, fallbackEnvelope.state)) || lastSyncResult;
        if (lastSyncResult?.added > 0 && typeof persistStateEnvelope === 'function') {
          await persistStateEnvelope(fallbackEnvelope);
        }
        return lastSyncResult;
      }
      if (typeof persistStateEnvelope === 'function' && fallbackEnvelope?.state && typeof readStateEnvelope !== 'function') {
        await persistStateEnvelope(fallbackEnvelope);
      }
      return lastSyncResult;
    }
    return lastSyncResult;
  };

  return async function handleInpiRequest(req, res, url) {
    if (!url.pathname.startsWith('/api/integrations/inpi/')) return false;

    if (req.method === 'GET' && url.pathname === '/api/integrations/inpi/status') {
      const session = assertAuthenticated(req);
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const scopedState = filterPrivateScopeState(envelope?.state || {}, session);
      const status = await service.getStatus(scopedState);
      json(res, 200, status);
      return true;
    }

    // Leitura do painel: nenhuma reconciliação ou persistência acontece aqui.
    // A sincronização com o estado oficial foi movida para POST com CSRF.
    if (req.method === 'GET' && url.pathname === '/api/integrations/inpi/data') {
      assertAuthenticated(req);
      const data = await service.getDashboardData();
      json(res, 200, {
        ok: true,
        ...data,
        syncedToIntimations: 0,
        newIntimations: []
      });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/inpi/data') {
      assertAuthenticated(req, true);
      const syncResult = await reconcileAndPersistMatches({ fallbackEnvelope: { state: {} } });
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
      const session = assertAuthenticated(req);
      const envelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const scopedState = filterPrivateScopeState(envelope?.state || {}, session);
      const result = await service.getAllMonitors(scopedState);
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
      requireAdmin(req, true, 'Apenas administradores podem gerenciar monitores do INPI.');
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
      requireAdmin(req, true, 'Apenas administradores podem gerenciar monitores do INPI.');
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
      const initialEnvelope = typeof readStateEnvelope === 'function' ? await readStateEnvelope() : { state: {} };
      const scanState = cloneStateSafe(initialEnvelope?.state);
      const result = await service.runScan({
        state: scanState,
        limit,
        force: Boolean(body.force)
      });
      if (result?.syncedToIntimations > 0 && typeof persistStateEnvelope === 'function') {
        await reconcileAndPersistMatches({ result, fallbackEnvelope: initialEnvelope, requireSyncedFlag: true });
      }
      json(res, result.ok ? 200 : (result.busy ? 409 : 500), result);
      return true;
    }

    return false;
  };
}
