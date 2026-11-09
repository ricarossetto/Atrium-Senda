/**
 * Rotas judiciais: eproc, PJe, Domicílio Eletrônico, consulta TJRS e erros de captura do DJEN.
 *
 * Movidas de server.mjs sem mudar o comportamento. As dependências entram por parâmetro.
 */
export const JUDICIAL_ROUTE_MISS = Symbol('judicial-route-miss');

// Iniciar coleta e destravar o eproc é de quem administra. Os ciclos automáticos não passam por aqui.
export const COLLECTION_ADMIN_MESSAGE = 'Só quem administra o escritório pode iniciar a coleta nos tribunais. Os ciclos automáticos continuam rodando.';

const PREFIXES = ['/api/integrations/eproc/', '/api/integrations/judicial/pje', '/api/judicial/', '/api/djen/capture-errors'];
const EXACT = ['/api/eproc/sync/status', '/api/tjrs/consult'];

export function isJudicialRoute(url) {
  return EXACT.includes(url.pathname) || PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

export async function handleJudicialRoute(ctx, req, res, url) {
  const {
    CLOUD_MODE,
    JUDICIAL_ADMIN_FORBIDDEN_MESSAGE,
    PUBLIC_ERROR_CODES,
    acquireEprocLock,
    assertAdmin,
    assertAuthenticated,
    asyncCommands,
    buildLegacyEprocJobView,
    buildPjePortalsStatus,
    canClearEprocJob,
    collectAndPersistDjenTerms,
    collectorWorkspace,
    computeDomicilioWindow,
    currentWorkspaceId,
    djenRetryWorkspaces,
    documentStorage,
    downloadProcessWithA1,
    emptyEprocSweepJob,
    eprocSweepJobFor,
    eprocSweepJobs,
    factoryResetWorkspaces,
    filterCaptureErrorsForSession,
    getPjePortalById,
    json,
    judicialOrchestratorForCurrentWorkspace,
    listPjeCommunicationsFromState,
    listPjePortals,
    markDomicilioCaptured,
    mergeDjenCounters,
    monitoredTermsByScope,
    monitoredTermsByWorkspacePolicy,
    monitoredTermsFromState,
    normalizeDomicilioBatch,
    persistExternalCollectionsToCanonical,
    pjeSyncServiceForCurrentWorkspace,
    readAppState,
    readAppStateEnvelope,
    readDjenCaptureErrors,
    readDjenSyncMarker,
    readDomicilioSyncState,
    readJson,
    readPjeWorkspaceConfig,
    redactEprocSecrets,
    releaseEprocLock,
    resolveEprocPortalForProcess,
    runDomicilioCaptureForWorkspace,
    sanitizeArray,
    saveAppStateDirect,
    security,
    summarizeDjenCaptureErrors,
    syncState,
    termKeyForCaptureErrors,
    trackWorkspaceMutation,
    waitForActiveEprocSync,
    workspaceDataDirectory,
    workspaceRequestContext,
    writePjeWorkspaceConfig
  } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/integrations/eproc/sweep') {
    const session = assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    const workspaceId = session.workspaceId;
    const allowSweep = !CLOUD_MODE || process.env.ALLOW_SHARED_SIDECAR === 'true' || workspaceId === security.state.defaultWorkspaceId;
    if (!allowSweep) {
      return json(res, 503, { ok: false, state: 'LOCAL_AGENT_REQUIRED', message: 'A varredura eproc via esta rota não está disponível para este escritório no servidor.' });
    }

    const body = await readJson(req).catch(() => ({}));
    const maxProcesses = Math.min(Math.max(Number(body.maxProcesses) || 4, 1), 10);
    const targetCnj = body.processNumber || body.cnj || null;
    const resolvedPortalId = resolveEprocPortalForProcess(targetCnj, body.portalId || body.portal);
    const portalId = resolvedPortalId || (targetCnj ? null : 'tjrs-eproc-1g');
    if (!portalId) {
      return json(res, 422, {
        ok: false,
        code: 'EPROC_PORTAL_UNRESOLVED',
        message: 'Não foi possível determinar um portal eproc compatível com o processo informado. Nenhuma sincronização foi iniciada.'
      });
    }

    const orch = await judicialOrchestratorForCurrentWorkspace();
    const result = await orch.requestEprocSync({
      workspaceId,
      trigger: 'manual',
      portals: [portalId],
      targetProcessNumber: targetCnj,
      maxProcesses
    });
    if (result?.joinedScopeMismatch) {
      throw Object.assign(
        new Error('Já existe uma sincronização eproc deste escritório em andamento para outro escopo. Aguarde a conclusão antes de iniciar este alvo.'),
        { statusCode: 409, code: 'EPROC_BUSY' }
      );
    }

    const view = {
      ...buildLegacyEprocJobView({
        workspaceId,
        canonical: orch.getEprocSyncJobStatus(workspaceId),
        previous: eprocSweepJobFor(workspaceId)
      }),
      id: result?.jobId || null,
      jobId: result?.jobId || null,
      status: 'running',
      startedAt: Date.now(),
      logs: ['Iniciando comunicação com o tribunal TJRS (eproc 1G)...', 'Conectando canal seguro mTLS (porta 443)...']
    };
    eprocSweepJobs.set(workspaceId, view);

    return json(res, 202, {
      ok: true,
      jobId: view.id,
      status: 'running',
      determinate: false,
      progress: null,
      completed: null,
      total: null,
      phase: 'queued',
      step: 1,
      action: 'Sincronização eproc iniciada em segundo plano.',
      joinedExisting: result?.joinedExisting === true,
      message: result?.joinedExisting ? 'Sincronização eproc já em andamento.' : 'Sincronização eproc iniciada em segundo plano.'
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/eproc/sweep/status') {
    assertAuthenticated(req);
    const workspaceId = currentWorkspaceId();
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const view = buildLegacyEprocJobView({
      workspaceId,
      canonical: orch.getEprocSyncJobStatus(workspaceId),
      previous: eprocSweepJobFor(workspaceId)
    });
    eprocSweepJobs.set(workspaceId, view);
    return json(res, 200, view);
  }

  if (req.method === 'POST' && (url.pathname === '/api/integrations/eproc/reset-lock' || url.pathname === '/api/integrations/eproc/sweep/reset')) {
    const session = assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    // O reset nunca interage com o lease: nenhum workspace libera trava, própria ou
    // alheia. Limpa apenas o acompanhamento do próprio workspace e somente quando o
    // pipeline oficial não está executando.
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const canonical = orch.getEprocSyncJobStatus(session.workspaceId);
    const job = eprocSweepJobFor(session.workspaceId);
    if (canonical?.active === true || (!canClearEprocJob(job) && canonical == null)) {
      throw Object.assign(
        new Error('A varredura eproc deste escritório está em andamento. Aguarde a conclusão antes de limpar o acompanhamento.'),
        { statusCode: 409, code: 'EPROC_BUSY' }
      );
    }
    eprocSweepJobs.set(session.workspaceId, emptyEprocSweepJob(session.workspaceId));
    return json(res, 200, { ok: true, message: 'Estado do acompanhamento eproc liberado para este escritório.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/eproc/processes/enrich-single') {
    assertAuthenticated(req, true);
    const allowSweep = !CLOUD_MODE || process.env.ALLOW_SHARED_SIDECAR === 'true' || currentWorkspaceId() === security.state.defaultWorkspaceId;
    if (!allowSweep) {
      return json(res, 503, { ok: false, state: 'LOCAL_AGENT_REQUIRED', message: 'A consulta via A1 não está disponível por esta rota para este escritório no servidor.' });
    }
    const body = await readJson(req).catch(() => ({}));
    let targetCnj = String(body.processNumber || body.cnj || '').trim();
    if (!targetCnj && body.processId) {
      const envelope = await readAppStateEnvelope().catch(() => null);
      const proc = (envelope?.state?.processes || []).find(p => p.id === body.processId);
      if (proc?.number) targetCnj = String(proc.number).trim();
    }
    if (!targetCnj) throw Object.assign(new Error('Número de processo CNJ obrigatório.'), { statusCode: 400 });

    const portalId = resolveEprocPortalForProcess(targetCnj, body.portalId || body.portal);
    if (!portalId) {
      return json(res, 422, {
        ok: false,
        code: 'EPROC_PORTAL_UNRESOLVED',
        message: 'Não foi possível determinar um portal eproc compatível com o processo informado. Nenhuma consulta foi executada.'
      });
    }
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const result = await orch.requestEprocSync({
      workspaceId: currentWorkspaceId(),
      trigger: 'manual',
      portals: [portalId],
      targetProcessNumber: targetCnj,
      maxProcesses: 1,
      waitForCompletion: true
    });
    const portalJob = result?.job?.portals?.find(portal => portal.portalId === portalId) || null;
    const envelope = await readAppStateEnvelope().catch(() => null);
    const norm = targetCnj.replace(/\D/g, '');
    const updated = (envelope?.state?.processes || []).find(p => (p.number || '').replace(/\D/g, '').includes(norm));
    const failed = !result?.completed
      || result?.joinedScopeMismatch === true
      || result?.status === 'ERROR'
      || portalJob?.state === 'ERROR'
      || !portalJob;

    if (failed) {
      const publicCode = typeof portalJob?.errorCode === 'string' && PUBLIC_ERROR_CODES.has(portalJob.errorCode) ? portalJob.errorCode : null;
      if (publicCode) {
        return json(res, portalJob.errorStatus || 412, {
          code: publicCode,
          message: portalJob.error || 'Credencial eproc indisponível para este escritório.'
        });
      }
      return json(res, 200, {
        ok: false,
        state: 'ERROR',
        process: updated ? redactEprocSecrets(updated) : null,
        revision: envelope?.revision || null,
        errors: Array.isArray(portalJob?.errors) ? portalJob.errors : [],
        message: 'A sincronização eproc não confirmou sucesso. Consulte o histórico de sincronização.'
      });
    }

    return json(res, 200, {
      ok: true,
      process: updated ? redactEprocSecrets(updated) : null,
      revision: envelope?.revision || null,
      counts: portalJob?.counts || null,
      discoverySource: portalJob?.discoverySource || null,
      message: `Processo ${targetCnj} atualizado via Certificado A1!`
    });
  }

  if (req.method === 'POST' && (url.pathname === '/api/integrations/eproc/processes/download-autos' || url.pathname === '/api/integrations/eproc/download-autos' || url.pathname === '/api/integrations/tjrs-sidecar/processes/download-autos')) {
    assertAuthenticated(req, true);
    const allowDownload = !CLOUD_MODE || process.env.ALLOW_SHARED_SIDECAR === 'true' || currentWorkspaceId() === security.state.defaultWorkspaceId;
    if (!allowDownload) {
      return json(res, 503, { ok: false, state: 'LOCAL_AGENT_REQUIRED', message: 'O download de autos via esta rota não está disponível para este escritório no servidor.' });
    }
    const body = await readJson(req).catch(() => ({}));
    let targetCnj = String(body.processNumber || body.cnj || '').trim();

    if (!targetCnj && body.processId) {
      const envelope = await readAppStateEnvelope().catch(() => null);
      const proc = (envelope?.state?.processes || []).find(p => p.id === body.processId);
      if (proc?.number) targetCnj = String(proc.number).trim();
    }

    if (!targetCnj) throw Object.assign(new Error('Número de processo CNJ obrigatório.'), { statusCode: 400 });

    const downloadPortalId = resolveEprocPortalForProcess(targetCnj, body.portalId || body.portal);
    if (!downloadPortalId) {
      return json(res, 422, {
        ok: false,
        code: 'EPROC_PORTAL_UNRESOLVED',
        message: 'Não foi possível determinar um portal eproc compatível com o processo informado. Nenhum download foi iniciado.'
      });
    }

    const orch = await judicialOrchestratorForCurrentWorkspace();
    if (orch.getEprocSyncJobStatus(currentWorkspaceId())?.active === true) {
      // Fila honesta: espera o ciclo em andamento liberar o navegador A1 em vez de
      // recusar o download. Se o ciclo não terminar no teto, devolve EPROC_BUSY.
      const freed = await waitForActiveEprocSync(orch, currentWorkspaceId());
      if (!freed) {
        throw Object.assign(
          new Error('A sincronização eproc deste escritório ainda está em andamento. Tente novamente em alguns minutos.'),
          { statusCode: 409, code: 'EPROC_BUSY' }
        );
      }
    }

    const downloadLock = acquireEprocLock('Download de autos integrais', targetCnj, currentWorkspaceId());
    if (!downloadLock.acquired) {
      throw Object.assign(new Error(downloadLock.message), { statusCode: 409, code: downloadLock.code });
    }
    const downloadLeaseToken = downloadLock.token;

    try {
      const downloadResult = await downloadProcessWithA1({
        cnj: targetCnj,
        portalId: downloadPortalId,
        securityManager: security,
        credentialManager: orch.credentialManager,
        documentStorage,
        readStateEnvelope: readAppStateEnvelope,
        saveState: saveAppStateDirect,
        maxPieces: Math.min(Number(body.maxPieces) || 15, 30)
      });

      return json(res, 200, {
        ok: true,
        piecesCount: downloadResult.piecesCount,
        totalFiles: downloadResult.totalFiles,
        client: downloadResult.client,
        court: downloadResult.court,
        cnj: downloadResult.cnj,
        revision: downloadResult.revision,
        documents: downloadResult.documents,
        hasAccessKey: Boolean(downloadResult.hasAccessKey),
        process: downloadResult.process ? redactEprocSecrets(downloadResult.process) : null,
        message: downloadResult.message || `${downloadResult.piecesCount || 0} peça(s) oficial(is) baixada(s) do eproc via Certificado A1!`
      });
    } finally {
      releaseEprocLock(downloadLeaseToken);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/tjrs/consult') {
    assertAuthenticated(req);
    const body = await readJson(req);
    const rawNumber = String(body.processNumber || '').trim();
    const cleanNumber = rawNumber.replace(/\D/g, '');
    if (cleanNumber.length < 15) throw Object.assign(new Error('Número de processo CNJ inválido.'), { statusCode: 400 });

    const isTrf4 = rawNumber.includes('.4.04.') || cleanNumber.includes('404');

    const portalUrl = isTrf4
      ? `https://eproc.trf4.jus.br/eproc2trf4/controlador.php?acao=processo_consulta_publica`
      : `https://www.tjrs.jus.br/novo/busca/?return=proc&client=wp_index&q=${cleanNumber}`;

    return json(res, 200, {
      ok: true,
      directUrl: portalUrl,
      processNumber: rawNumber,
      courtName: isTrf4 ? 'TRF4 (eproc)' : 'TJRS (Portal Oficial)',
      message: `Número copiado e consulta oficial aberta no ${isTrf4 ? 'TRF4' : 'TJRS'}.`
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/judicial/domicilio/window') {
    const workspace = collectorWorkspace(req);
    if (!workspace) return json(res, 401, { message: 'Coletor não autorizado para este escritório.' });
     
    return await workspaceRequestContext.run({ workspaceId: workspace.id }, async () => {
      const dataDirectory = workspaceDataDirectory(workspace.id);
      const state = await readDomicilioSyncState(dataDirectory);
      return json(res, 200, { ok: true, window: computeDomicilioWindow(state), state });
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/judicial/domicilio/status') {
    assertAdmin(req, false, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const dataDirectory = workspaceDataDirectory(currentWorkspaceId());
    const state = await readDomicilioSyncState(dataDirectory);
    return json(res, 200, { ok: true, window: computeDomicilioWindow(state), state });
  }

  if (req.method === 'POST' && url.pathname === '/api/judicial/domicilio/sync') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const workspaceId = currentWorkspaceId();
    if (factoryResetWorkspaces.has(workspaceId)) {
      return json(res, 423, { message: 'O escritório está sendo redefinido; captura temporariamente bloqueada.' });
    }
    const result = await runDomicilioCaptureForWorkspace(workspaceId);
    return json(res, 200, { ok: result.status === 'COMPLETED' || result.status === 'PARTIAL', ...result });
  }

  if (req.method === 'POST' && url.pathname === '/api/judicial/domicilio/ingest') {
    const workspace = collectorWorkspace(req);
    if (!workspace) return json(res, 401, { message: 'Coletor não autorizado para este escritório.' });
     
    if (factoryResetWorkspaces.has(workspace.id)) return json(res, 423, { message: 'O escritório está sendo redefinido; ingestão temporariamente bloqueada.' });
    trackWorkspaceMutation(req, workspace.id);
    return await workspaceRequestContext.run({ workspaceId: workspace.id }, async () => {
      const body = await readJson(req, 4_000_000);
      const comunicacoes = sanitizeArray(body?.comunicacoes);
      if (comunicacoes.length === 0) {
        throw Object.assign(new Error('Envie as comunicações capturadas do Domicílio Eletrônico.'), { statusCode: 400 });
      }
      if (comunicacoes.length > 2_000) {
        throw Object.assign(new Error('Lote do Domicílio Eletrônico acima do teto por execução (2000).'), { statusCode: 400 });
      }
      // Normalização é autoridade do servidor: o coletor envia o DTO oficial e o
      // registro oficial nasce aqui (nunca do shape do cliente).
      const batch = normalizeDomicilioBatch(comunicacoes, { collectedAt: new Date().toISOString() });
      const persisted = await persistExternalCollectionsToCanonical({ intimations: batch.intimations }, { trigger: 'domicilio' });
      const dataDirectory = workspaceDataDirectory(workspace.id);
      const window = computeDomicilioWindow(await readDomicilioSyncState(dataDirectory));
      const marked = await markDomicilioCaptured(dataDirectory, {
        window,
        recebidas: batch.resumo.recebidas,
        normalizadas: batch.resumo.normalizadas
      });
      return json(res, 200, {
        ok: true,
        resumo: batch.resumo,
        persisted,
        window,
        state: marked
      });
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/djen/capture-errors') {
    const session = assertAuthenticated(req);
    const queue = await readDjenCaptureErrors();
    const envelope = await readAppStateEnvelope();
    const visible = filterCaptureErrorsForSession(queue, { session, terms: envelope.state?.terms || [] });
    return json(res, 200, { ok: true, ...visible, summary: summarizeDjenCaptureErrors(visible) });
  }

  if (req.method === 'POST' && url.pathname === '/api/djen/capture-errors/retry') {
    assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    const wsId = currentWorkspaceId();
    if (factoryResetWorkspaces.has(wsId)) throw Object.assign(new Error('O escritório está sendo redefinido.'), { statusCode: 423 });
    if (syncState().requestActive || djenRetryWorkspaces.has(wsId)) {
      throw Object.assign(new Error('Uma sincronização já está em andamento. Aguarde a conclusão para tentar novamente.'), { statusCode: 409 });
    }
    let body = {};
    try { body = await readJson(req, 20_000); } catch { body = {}; }
    const queue = await readDjenCaptureErrors();
    if (!queue.terms.length) {
      return json(res, 200, { ok: true, retried: [], records: 0, inboxAdded: 0, inboxUpdated: 0, failures: [], queue });
    }
    const appState = (await readAppStateEnvelope()).state;
    const allMonitoredTerms = monitoredTermsByWorkspacePolicy(monitoredTermsFromState(appState || {}), currentWorkspaceId());
    const queueKeys = new Set(queue.terms.map(entry => entry.termId));
    const requestedIds = Array.isArray(body.termIds)
      ? body.termIds.map(value => String(value || '').trim()).filter(Boolean)
      : (String(body.termId || '').trim() ? [String(body.termId).trim()] : []);
    const retryAll = body.all === true;
    if (!retryAll && !requestedIds.length) {
      throw Object.assign(new Error('Informe o termo pendente ou solicite a tentativa de todos.'), { statusCode: 400 });
    }
    const selectedKeys = retryAll ? queueKeys : new Set(requestedIds);
    const monitoredTerms = allMonitoredTerms.filter(term => {
      const key = termKeyForCaptureErrors(term);
      return key && selectedKeys.has(key) && queueKeys.has(key);
    });
    if (!monitoredTerms.length) {
      throw Object.assign(new Error('Nenhum termo pendente corresponde à tentativa solicitada.'), { statusCode: 404 });
    }
    djenRetryWorkspaces.add(wsId);
    const runDjenRetry = async () => {
      try {
        const counterList = [];
        let reconciled = queue;
      for (const [scope, terms] of monitoredTermsByScope(monitoredTerms)) {
        const marker = await readDjenSyncMarker(scope);
        const result = await collectAndPersistDjenTerms({
          appState: appState || {},
          monitoredTerms: terms,
          marker,
          trigger: 'retry'
        });
        counterList.push(result.counters);
        reconciled = result.queue;
      }
      const counters = mergeDjenCounters(counterList);
      console.log(`[DjenRetry] ${monitoredTerms.length} termo(s) reconsultado(s): ${counters.records} lida(s) · +${counters.inboxAdded} nova(s) · ${counters.failures.length} falha(s) remanescente(s).`);
      return {
        ok: true,
        retried: monitoredTerms.map(term => ({ termId: term.id, registration: term.registration, oabUf: term.oabUf, oabNumber: term.oabNumber })),
        records: counters.records,
        inboxAdded: counters.inboxAdded,
        inboxUpdated: counters.inboxUpdated,
        failures: counters.failures,
        queue: reconciled
      };
    } finally {
      djenRetryWorkspaces.delete(wsId);
    }
  };
  if (body.async === true || url.searchParams.get('async') === '1') {
    const command = asyncCommands.start({ kind: 'djen-capture-retry', workspaceId: wsId, run: runDjenRetry });
    return json(res, 202, {
      ok: true,
      idCommand: command.id,
      status: 'running',
      statusUrl: `/api/commands/${command.id}`,
      message: 'Reconsulta DJEN iniciada em segundo plano.'
    });
  }
  return json(res, 200, await runDjenRetry());
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/judicial/pje') {
    assertAuthenticated(req);
    const wsId = currentWorkspaceId();
    const service = await pjeSyncServiceForCurrentWorkspace();
    const config = await readPjeWorkspaceConfig();
    const portals = buildPjePortalsStatus({ service, workspaceId: wsId, config });
    return json(res, 200, { ok: true, workspaceId: wsId, config, portals });
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/judicial/pje/portals') {
    assertAuthenticated(req);
    const config = await readPjeWorkspaceConfig();
    return json(res, 200, {
      ok: true,
      portals: listPjePortals().map(portal => ({
        id: portal.id,
        name: portal.name,
        court: portal.court,
        grau: portal.grau,
        layoutFamily: portal.layoutFamily,
        routeStatus: portal.routeStatus,
        enabled: config.enabledPortals.includes(portal.id)
      }))
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/pje/config') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const body = await readJson(req, 100_000);
    const patch = {};
    if (typeof body.pjeEnabled === 'boolean') patch.pjeEnabled = body.pjeEnabled;
    if (typeof body.automaticSyncEnabled === 'boolean') patch.automaticSyncEnabled = body.automaticSyncEnabled;
     if (body.runtimePreference === 'local_sidecar') throw Object.assign(new Error('O runtime local PJe não está disponível. Selecione Automático ou Servidor.'), { statusCode: 400 });
     if (['auto', 'server'].includes(body.runtimePreference)) patch.runtimePreference = body.runtimePreference;
    if (Number.isFinite(Number(body.syncIntervalMinutes))) patch.syncIntervalMinutes = Math.max(60, Math.min(1440, Number(body.syncIntervalMinutes)));
    if (Array.isArray(body.enabledPortals)) {
      patch.enabledPortals = [...new Set(body.enabledPortals.map(id => String(id || '')))].filter(id => Boolean(getPjePortalById(id)));
    }
    const config = await writePjeWorkspaceConfig(patch);
    return json(res, 200, { ok: true, config });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/pje/sync') {
    assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    const wsId = currentWorkspaceId();
    if (factoryResetWorkspaces.has(wsId)) throw Object.assign(new Error('O escritório está sendo redefinido.'), { statusCode: 423 });
    let body = {};
    try { body = await readJson(req, 20_000); } catch { body = {}; }
    const portal = getPjePortalById(String(body.portalId || ''));
    if (!portal) throw Object.assign(new Error('Portal PJe desconhecido.'), { statusCode: 400 });
    const service = await pjeSyncServiceForCurrentWorkspace();
     const runtime = ['auto', 'server', 'local_sidecar'].includes(body.runtime) ? body.runtime : 'auto';
     if (runtime === 'local_sidecar') throw Object.assign(new Error('O runtime local PJe não está disponível. Selecione Automático ou Servidor.'), { statusCode: 503 });
     const result = service.requestSync({ workspaceId: wsId, portalId: portal.id, portal, runtime, trigger: 'manual' });
    return json(res, 200, {
      ok: true,
      ...result,
      message: result.joinedExisting ? 'Sincronização PJe em andamento conectada.' : 'Job de sincronização PJe iniciado.'
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/pje/sync-all') {
    assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    const wsId = currentWorkspaceId();
    if (factoryResetWorkspaces.has(wsId)) throw Object.assign(new Error('O escritório está sendo redefinido.'), { statusCode: 423 });
    const config = await readPjeWorkspaceConfig();
    if (!config.pjeEnabled) {
      return json(res, 200, { ok: true, started: 0, jobs: [], message: 'PJe desabilitado para este escritório.' });
    }
    const service = await pjeSyncServiceForCurrentWorkspace();
    const jobs = [];
    for (const portalId of config.enabledPortals) {
      const portal = getPjePortalById(portalId);
      if (!portal) continue;
      try {
        const result = service.requestSync({
          workspaceId: wsId,
          portalId,
          portal,
          runtime: config.runtimePreference || 'auto',
          trigger: 'manual'
        });
        jobs.push({ portalId, jobId: result.jobId, joinedExisting: Boolean(result.joinedExisting) });
      } catch (error) {
        jobs.push({ portalId, error: String(error?.message || error).slice(0, 160) });
      }
    }
    return json(res, 200, {
      ok: true,
      started: jobs.filter(job => job.jobId).length,
      jobs,
      message: jobs.length ? 'Sincronização PJe iniciada em segundo plano.' : 'Nenhum portal PJe habilitado.'
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/integrations/judicial/pje/jobs/')) {
    assertAuthenticated(req);
    const jobId = decodeURIComponent(url.pathname.split('/').pop() || '');
    const service = await pjeSyncServiceForCurrentWorkspace();
    const job = service.getJob(jobId);
    if (!job || job.workspaceId !== currentWorkspaceId()) return json(res, 404, { ok: false, error: 'Job não encontrado.' });
    return json(res, 200, { ok: true, job });
  }

  if (req.method === 'GET' && url.pathname === '/api/judicial/communications') {
    assertAuthenticated(req);
    const state = await readAppState();
    const result = listPjeCommunicationsFromState(state, {
      workspaceId: currentWorkspaceId(),
      portalId: String(url.searchParams.get('portalId') || ''),
      status: String(url.searchParams.get('status') || ''),
      processNumber: String(url.searchParams.get('processNumber') || ''),
      situation: String(url.searchParams.get('situation') || ''),
      hasSourceDeadline: url.searchParams.get('hasSourceDeadline') === 'true' ? true : (url.searchParams.get('hasSourceDeadline') === 'false' ? false : null),
      includeDeleted: url.searchParams.get('includeDeleted') === 'true',
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 25)
    });
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/judicial/communications/')) {
    assertAuthenticated(req);
    const id = decodeURIComponent(url.pathname.split('/').pop() || '');
    const state = await readAppState();
    const item = (state?.communications || []).find(entry => entry.id === id && entry.workspaceId === currentWorkspaceId());
    if (!item) return json(res, 404, { ok: false, error: 'Comunicação não encontrada.' });
    const { provenance, ...safe } = item;
    return json(res, 200, { ok: true, communication: safe });
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/eproc/status') {
    assertAuthenticated(req);
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const status = await orch.getEprocIntegrationsStatus(currentWorkspaceId());
    return json(res, 200, status);
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/eproc/sync') {
    assertAdmin(req, true, COLLECTION_ADMIN_MESSAGE);
    const wsId = currentWorkspaceId();
    if (factoryResetWorkspaces.has(wsId)) throw Object.assign(new Error('O escritório está sendo redefinido.'), { statusCode: 423 });
    let body = {};
    try { body = await readJson(req, 20_000); } catch { body = {}; }
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const result = await orch.requestEprocSync({
      workspaceId: wsId,
      trigger: 'manual',
      portals: Array.isArray(body.portals) ? body.portals : undefined
    });
    return json(res, 200, {
      ok: true,
      ...result,
      message: result.joinedExisting ? 'Sincronização em andamento conectada.' : 'Job de sincronização eproc iniciado.'
    });
  }

  if (req.method === 'GET' && (url.pathname === '/api/judicial/sync-status' || url.pathname === '/api/eproc/sync/status' || url.pathname === '/api/integrations/eproc/sync/status')) {
    assertAuthenticated(req);
    const orch = await judicialOrchestratorForCurrentWorkspace();
    const wsId = currentWorkspaceId();
    const jobStatus = orch.getEprocSyncJobStatus(wsId);
    return json(res, 200, { ok: true, workspaceId: wsId, ...jobStatus, jobStatus });
  }

  return JUDICIAL_ROUTE_MISS;
}
