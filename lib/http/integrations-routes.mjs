/**
 * Rotas de integração judicial, e-mail e coletor local.
 *
 * Movidas de server.mjs sem mudar o comportamento. As dependências entram por parâmetro.
 */
export const INTEGRATIONS_ROUTE_MISS = Symbol('integrations-route-miss');

const PREFIXES = ['/api/integrations/judicial', '/api/integrations/email', '/api/integrations/collector'];

export function isIntegrationsRoute(url) {
  return PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export async function handleIntegrationsRoute(ctx, req, res, url) {
  const {
    CLOUD_MODE,
    JUDICIAL_ADMIN_FORBIDDEN_MESSAGE,
    appendServerAudit,
    assertAdmin,
    assertAuthenticated,
    buildPjeManagedCoverage,
    buildPjePortalsStatus,
    currentWorkspaceId,
    emailService,
    extractTotpSecret,
    getCredentialScopeForPortal,
    json,
    judicialIntegrationStatus,
    judicialOrchestratorForCurrentWorkspace,
    maskEmail,
    normalizePortalId,
    notificationServiceForWorkspace,
    parseTotpUri,
    path,
    pjeSyncServiceForCurrentWorkspace,
    readJson,
    readPjeWorkspaceConfig,
    readPortalConfiguration,
    readRuntime,
    reconcileManagedEprocCoverage,
    resetJudicialConnections,
    runTotpSandbox,
    sanitizeArray,
    security,
    startInteractiveCollector,
    startManagedPortfolioCollector,
    updatePortalCoverage,
    verifyTotp
  } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/sync') {
    assertAuthenticated(req, true);
    if (CLOUD_MODE) {
      return json(res, 503, { ok: false, cloud: true, state: 'NOT_AVAILABLE', message: 'Esta rota legada não inicia coleta na nuvem; consulte a sincronização judicial gerenciada ou use o comando manual disponível na interface.' });
    }
    const waitForCompletion = url.searchParams.get('wait') === '1';
    const result = await startManagedPortfolioCollector({ waitForCompletion });
    return json(res, result.completed || result.skipped ? 200 : 202, result);
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/integrations/judicial/portals/') && url.pathname.endsWith('/clear-session')) {
    const session = assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const parts = url.pathname.split('/');
    const portalId = parts[parts.length - 2];
    if (!portalId) throw Object.assign(new Error('ID do portal inválido.'), { statusCode: 400 });
    const result = await (await judicialOrchestratorForCurrentWorkspace()).sessionManager.clearPortalSession(session.username, portalId);
    return json(res, 200, {
      ok: true,
      portalId,
      message: `Sessão do tribunal ${portalId} limpa com sucesso. Certificado A1, senhas e processos foram preservados.`
    });
  }

  if (url.pathname.startsWith('/api/integrations/email/')) {
    assertAuthenticated(req);
    const legacyEnabled = String(process.env.ATRIUM_LEGACY_SMTP_ENABLED || '').toLowerCase() === 'true'
      || String(process.env.ATRIUM_MOCK_SMTP || '').toLowerCase() === 'true';
    if (!legacyEnabled) {
      return json(res, 410, {
        ok: false,
        error: 'A integração SMTP legada foi descontinuada e desabilitada por padrão. Utilize o ATRIUM Mail ou defina ATRIUM_LEGACY_SMTP_ENABLED=true para modo de rollback.',
        legacySmtpDisabled: true
      });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/email/status') {
    assertAuthenticated(req);
    const status = await emailService.getStatus();
    return json(res, 200, { ok: true, status });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/email/configure') {
    const session = assertAdmin(req, true, 'Você não possui permissão para administrar a integração de e-mail.');
    const body = await readJson(req, 100_000);
    const status = await emailService.configure(body);
    await appendServerAudit('Configuração de e-mail atualizada', `Host: ${status.host}:${status.port} (${status.userMasked})`, session.displayName || session.username);
    return json(res, 200, { ok: true, message: 'Configuração SMTP validada e salva com sucesso!', status });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/email/test') {
    const session = assertAdmin(req, true, 'Você não possui permissão para administrar a integração de e-mail.');
    const body = await readJson(req, 100_000);
    try {
      const result = await emailService.sendTestEmail(body);
      await appendServerAudit('Teste de e-mail enviado', `Destinatário: ${maskEmail(result.recipient)}`, session.displayName || session.username);
      return json(res, 200, result);
    } catch (testErr) {
      await appendServerAudit('Teste de e-mail falhou', `Destinatário: ${body?.recipient ? maskEmail(body.recipient) : 'não informado'} — ${testErr.message}`, session.displayName || session.username);
      throw testErr;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/email/receivers') {
    assertAdmin(req, false, 'Você não possui permissão para consultar os destinatários de e-mail.');
    const receivers = await emailService.getReceivers();
    return json(res, 200, { ok: true, receivers });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/email/receivers') {
    const session = assertAdmin(req, true, 'Você não possui permissão para cadastrar destinatários de e-mail.');
    const body = await readJson(req, 100_000);
    const receiver = await emailService.addReceiver(body);
    const masked = maskEmail(receiver.email);
    await appendServerAudit(
      'Destinatário de publicações adicionado',
      `${receiver.name} — ${masked} — ${receiver.type === 'internal' ? 'interno' : 'externo'}`,
      session.displayName || session.username
    );
    return json(res, 201, { ok: true, receiver, message: 'Destinatário cadastrado com sucesso!' });
  }

  if ((req.method === 'PATCH' || req.method === 'POST') && (url.pathname.startsWith('/api/integrations/email/receivers/') || url.pathname === '/api/integrations/email/receivers/update')) {
    const session = assertAdmin(req, true, 'Você não possui permissão para editar destinatários de e-mail.');
    const body = await readJson(req, 100_000);
    const id = url.pathname.startsWith('/api/integrations/email/receivers/')
      ? url.pathname.slice('/api/integrations/email/receivers/'.length).trim()
      : String(body.id || '').trim();

    const receiver = await emailService.updateReceiver(id, body);
    const masked = maskEmail(receiver.email);
    const actionName = (body.enabled !== undefined && Object.keys(body).length === 1)
      ? `Destinatário ${receiver.enabled ? 'ativado' : 'desativado'}`
      : 'Destinatário de publicações atualizado';

    await appendServerAudit(
      actionName,
      `${receiver.name} — ${masked} — ${receiver.type === 'internal' ? 'interno' : 'externo'}`,
      session.displayName || session.username
    );
    return json(res, 200, { ok: true, receiver, message: 'Destinatário atualizado com sucesso!' });
  }

  if ((req.method === 'DELETE' || req.method === 'POST') && (url.pathname.startsWith('/api/integrations/email/receivers/') || url.pathname === '/api/integrations/email/receivers/delete' || (req.method === 'DELETE' && url.pathname === '/api/integrations/email/receivers'))) {
    const session = assertAdmin(req, true, 'Você não possui permissão para remover destinatários de e-mail.');
    let body = {};
    if (req.method === 'POST') {
      body = await readJson(req, 100_000);
    }
    const id = url.pathname.startsWith('/api/integrations/email/receivers/')
      ? url.pathname.slice('/api/integrations/email/receivers/'.length).trim()
      : String(url.searchParams.get('id') || body.id || '').trim();

    const result = await emailService.deleteReceiver(id);
    const removed = result.removed;
    const masked = maskEmail(removed?.email);
    await appendServerAudit(
      'Destinatário de publicações removido',
      `${removed?.name || id} — ${masked} — ${removed?.type === 'internal' ? 'interno' : 'externo'}`,
      session.displayName || session.username
    );
    return json(res, 200, { ok: true, message: 'Destinatário removido com sucesso!', ...result });
  }

  if (CLOUD_MODE) {
    if (['/api/integrations/judicial/certificate', '/api/integrations/judicial/reset', '/api/integrations/judicial/connect', '/api/integrations/judicial/a1/sandbox'].includes(url.pathname)) {
      assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
      return json(res, 503, { ok: false, message: 'Operações com certificado digital local e sessões de desktop não estão disponíveis em ambiente de nuvem.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/sync') {
      assertAuthenticated(req, true);
      return json(res, 503, { ok: false, state: 'NOT_AVAILABLE', message: 'Esta rota legada não inicia sincronização com certificado na nuvem; consulte a integração judicial gerenciada.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/judicial') {
    const session = assertAuthenticated(req);
    const diagnostics = await (await judicialOrchestratorForCurrentWorkspace()).getDiagnostics(session.username);
    const legacyStatus = await judicialIntegrationStatus();
    const runtime = await readRuntime();
    const runtimeSources = new Map(sanitizeArray(runtime.sources).map(source => [source.id, source]));
    const managedCoverage = (diagnostics.coverage || []).map(item => {
      if (item.authStrategy !== 'public') return item;
      const aliases = item.id === 'djen-cnj' ? ['djen-cnj', 'djen'] : item.id === 'datajud-cnj' ? ['datajud-cnj', 'datajud'] : [item.id];
      const source = aliases.map(id => runtimeSources.get(id)).find(Boolean);
      if (!source) return item;
      return {
        ...item,
        connectivityState: source.status === 'error' ? 'error' : source.status === 'attention' ? 'attention' : 'connected',
        lastSuccessfulSyncAt: source.lastCheck || item.lastSuccessfulSyncAt,
        lastAttemptAt: source.lastCheck || item.lastAttemptAt,
        publicDetail: String(source.detail || '').slice(0, 280)
      };
    });
    const eprocStatus = await (await judicialOrchestratorForCurrentWorkspace()).getEprocIntegrationsStatus(currentWorkspaceId());
    const eprocByPortal = new Map((eprocStatus.portals || []).map(item => [item.id, item]));
    const reconciledManagedCoverage = reconcileManagedEprocCoverage(
      managedCoverage,
      eprocStatus.portals,
      { normalizePortalId: value => normalizePortalId(value) || String(value || '').trim() }
    );
    const pjePortalsStatus = buildPjePortalsStatus({
      service: await pjeSyncServiceForCurrentWorkspace(),
      workspaceId: currentWorkspaceId(),
      config: await readPjeWorkspaceConfig()
    });
    const pjeManagedCoverage = buildPjeManagedCoverage(pjePortalsStatus);
    // Portais PJe já listados pela conectividade gerenciada são enriquecidos com o estado
    // real do pipeline read-only (config, job e verificação), sem duplicar a linha.
    const combinedManagedCoverage = reconciledManagedCoverage.map(item => {
      const pjeEntry = pjeManagedCoverage.find(entry => entry.id === item.id);
      if (!pjeEntry) return item;
      return { ...item, ...pjeEntry, name: item.name || pjeEntry.name };
    });
    for (const pjeEntry of pjeManagedCoverage) {
      if (!combinedManagedCoverage.some(item => item.id === pjeEntry.id)) combinedManagedCoverage.push(pjeEntry);
    }
    const managedByPortal = new Map(combinedManagedCoverage.map(item => [item.id, item]));
    const reconciledDiagnostics = { ...diagnostics, coverage: combinedManagedCoverage };
    return json(res, 200, {
      ok: true,
      ...legacyStatus,
      portals: legacyStatus.portals.map(portal => {
        const managed = managedByPortal.get(portal.id) || null;
        const canonicalId = normalizePortalId(portal.id) || portal.id;
        const eproc = eprocByPortal.get(canonicalId);
        return {
          ...portal,
          canonicalId,
          ...(eproc ? { requiresA1: eproc.requiresA1, requiresTotp: eproc.requiresTotp, credentialConfigured: eproc.credentialConfigured } : {}),
          totpConfigured: Boolean(portal.totpConfigured || managed?.totpConfigured),
          managed
        };
      }),
      managedCoverage: combinedManagedCoverage,
      managedPolicy: {
        readOnly: true,
        cadence: 'conservative-with-backoff',
        humanSupervision: true,
        forbiddenAutomaticActions: reconciledDiagnostics.forbiddenAutomaticActions
      },
      diagnostics: reconciledDiagnostics,
      certificate: {
        ...legacyStatus.certificate,
        summary: reconciledDiagnostics.a1.summary,
        status: reconciledDiagnostics.a1.status
      }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/judicial/diagnostics') {
    const session = assertAuthenticated(req);
    const diagnostics = await (await judicialOrchestratorForCurrentWorkspace()).getDiagnostics(session.username);
    return json(res, 200, { ok: true, diagnostics });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/a1/sandbox') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const result = await (await judicialOrchestratorForCurrentWorkspace()).runA1Test();
    return json(res, 200, { ok: true, sandbox: result });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/totp/sandbox') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const body = await readJson(req);
    let result;
    if (body.portalId) {
      result = await (await judicialOrchestratorForCurrentWorkspace()).runTotpTest(body.portalId);
    } else if (body.secret) {
      result = runTotpSandbox({ secret: body.secret });
    } else {
      throw Object.assign(new Error('Informe o portalId ou o segredo TOTP para teste.'), { statusCode: 400 });
    }
    return json(res, 200, { ok: true, sandbox: result });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/totp/parse') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const body = await readJson(req);
    const raw = body.qrData || body.secret;
    if (!raw) throw Object.assign(new Error('Nenhum dado de QR ou segredo recebido.'), { statusCode: 400 });
    const parsed = parseTotpUri(raw);
    return json(res, 200, { ok: true, ...parsed });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/certificate') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE);
    const body = await readJson(req, 7_500_000);
    const fileName = path.basename(String(body.fileName || 'certificado.pfx'));
    if (!/\.(pfx|p12)$/i.test(fileName)) throw Object.assign(new Error('Selecione um certificado .pfx ou .p12.'), { statusCode: 400 });
    const encoded = String(body.pfxBase64 || '').replace(/^data:[^,]+,/, '');
    if (!encoded) throw Object.assign(new Error('Arquivo de certificado vazio.'), { statusCode: 400 });
    const passphrase = String(body.passphrase || '');
    const pfxBuffer = Buffer.from(encoded, 'base64');

    const saved = await (await judicialOrchestratorForCurrentWorkspace()).credentialManager.saveCertificate({
      fileName,
      pfxBuffer,
      passphrase
    });

    // Disparar checagem A1_CERT_EXPIRING
    const targetWorkspaceId = currentWorkspaceId();
    if (saved.summary) {
      notificationServiceForWorkspace(targetWorkspaceId).checkA1Certificates(targetWorkspaceId, saved.summary).catch(err => {
        console.warn('[NotificationEngine] Erro ao verificar A1:', err.message);
      });
    }

    // [eproc auto-sweep] Desativado por decisão de isolamento de credenciais.
    // A varredura automática pós-upload só será reintroduzida após o desenho da
    // arquitetura RPA judicial (follow-up registrado no relatório da missão).
    // Nenhum sweep é disparado aqui: o cofre/perfil pertencem ao workspace do chamador
    // e a operação dedicada é o job oficial /api/integrations/eproc/sync.

    return json(res, 200, {
      ok: true,
      certificate: {
        valid: true,
        fileName,
        summary: saved.summary
      },
      sandbox: saved.sandboxResult
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/2fa') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE); const body = await readJson(req); const config = await readPortalConfiguration();
    const orchestrator = await judicialOrchestratorForCurrentWorkspace();
    let portal = config.portals.find(item => item.id === String(body.portalId || ''));
    if (!portal) {
      const portalId = String(body.portalId || 'pje-custom');
      portal = { id: portalId, name: String(body.portalName || portalId || 'Portal Judicial'), usesCertificate: true };
    }
    const judicialSystem = String(portal.system || portal.strategy || '').trim().toLowerCase();
    const usesSharedJudicialScope = judicialSystem === 'eproc' || judicialSystem.startsWith('pje') || portal.strategy === 'pje';
    const credentialKey = usesSharedJudicialScope
      ? getCredentialScopeForPortal(portal.id)
      : portal.id;
    const canonicalPortalId = normalizePortalId(portal.id) || portal.id;
    if (body.remove === true) {
      for (const key of new Set([credentialKey, portal.id, canonicalPortalId])) {
        await orchestrator.credentialManager.removePortalTotp(key);
      }
      await orchestrator.sessionManager.updateSessionStatus('agent-local', portal.id, 'not_configured', {
        humanAction: null, error: null, nextRefreshAt: null
      }, 'office-primary');
      return json(res, 200, { ok: true, removed: true });
    }
    const secret = extractTotpSecret(body.secret);
    if (!verifyTotp(secret, body.code)) throw Object.assign(new Error('O código de seis dígitos não confere com esse QR ou chave manual. Gere um código atual e tente novamente.'), { statusCode: 400 });
    const saved = await orchestrator.credentialManager.savePortalTotp(credentialKey, {
      secret,
      label: portal.name,
      replacePortalIds: [portal.id, canonicalPortalId]
    });
    await orchestrator.sessionManager.updateSessionStatus('agent-local', portal.id, 'not_configured', {
      humanAction: null, error: null, nextRefreshAt: null
    }, 'office-primary');
    return json(res, 200, { ok: true, portalId: portal.id, credentialScope: credentialKey, credentialReady: true, verification: 'pending', validation: saved.validation?.summary || null });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/credentials') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE); const body = await readJson(req); const config = await readPortalConfiguration();
    const orchestrator = await judicialOrchestratorForCurrentWorkspace();
    // Multi-seleção: a mesma credencial pode ser guardada para vários tribunais
    // (ex.: eproc TJRS 1G/2G). `portalId` segue aceito para compatibilidade.
    const requestedIds = [...new Set([
      ...(Array.isArray(body.portalIds) ? body.portalIds : []),
      ...(body.portalId ? [body.portalId] : [])
    ].map(value => String(value || '').trim()).filter(Boolean))].slice(0, 20);
    if (requestedIds.length === 0) {
      throw Object.assign(new Error('Informe ao menos um tribunal para a conta.'), { statusCode: 400 });
    }
    const resolvePortal = portalId => {
      const known = config.portals.find(item => item.id === portalId);
      if (known) return known;
      return { id: portalId, name: String(body.portalName || portalId || 'Portal Judicial'), usesCertificate: true };
    };
    const credentialKeyFor = portal => {
      const judicialSystem = String(portal.system || portal.strategy || '').trim().toLowerCase();
      const usesSharedJudicialScope = judicialSystem === 'eproc' || judicialSystem.startsWith('pje') || portal.strategy === 'pje';
      return usesSharedJudicialScope ? getCredentialScopeForPortal(portal.id) : portal.id;
    };

    if (body.remove === true) {
      const removedIds = [];
      for (const portalId of requestedIds) {
        const portal = resolvePortal(portalId);
        const credentialKey = credentialKeyFor(portal);
        const canonicalPortalId = normalizePortalId(portal.id) || portal.id;
        for (const key of new Set([credentialKey, portal.id, canonicalPortalId])) {
          await orchestrator.credentialManager.removePortalCredentials(key);
        }
        await orchestrator.sessionManager.updateSessionStatus('agent-local', portal.id, 'not_configured', {
          humanAction: null, error: null, nextRefreshAt: null
        }, 'office-primary');
        removedIds.push(portal.id);
      }
      return json(res, 200, { ok: true, removed: true, removedIds, portalIds: removedIds });
    }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      throw Object.assign(new Error('Informe usuário e senha da conta do tribunal.'), { statusCode: 400 });
    }
    const savedIds = [];
    const savedScopes = [];
    for (const portalId of requestedIds) {
      const portal = resolvePortal(portalId);
      const credentialKey = credentialKeyFor(portal);
      await orchestrator.credentialManager.savePortalCredentials(credentialKey, {
        username,
        password,
        oab: body.oab,
        uf: body.uf
      });
      await orchestrator.sessionManager.updateSessionStatus('agent-local', portal.id, 'not_configured', {
        humanAction: null, error: null, nextRefreshAt: null
      }, 'office-primary');
      savedIds.push(portal.id);
      savedScopes.push(credentialKey);
    }
    return json(res, 200, {
      ok: true,
      portalId: savedIds[0] || null,
      portalIds: savedIds,
      credentialScopes: [...new Set(savedScopes)],
      credentialScope: savedScopes[0] || null,
      credentialReady: true,
      verification: 'pending'
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/portals') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE); const body = await readJson(req); const result = await updatePortalCoverage(body.enabledIds);
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/reset') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE); const body = await readJson(req);
    if (body.confirm !== 'ZERAR_ACESSOS_JUDICIAIS') throw Object.assign(new Error('Confirmação de segurança inválida.'), { statusCode: 400 });
    return json(res, 200, { ok: true, ...(await resetJudicialConnections()) });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/connect') {
    assertAdmin(req, true, JUDICIAL_ADMIN_FORBIDDEN_MESSAGE); const body = await readJson(req); return json(res, 202, await startInteractiveCollector(body.portalIds));
  }

  if (req.method === 'GET' && url.pathname === '/api/integrations/collector/pair') {
    const session = assertAdmin(req, false, 'Apenas administradores podem consultar o pareamento do coletor local.');
    return json(res, 200, { ok: true, workspaceId: session.workspaceId, ...security.collectorTokenStatus(session.workspaceId) });
  }

  if (req.method === 'POST' && url.pathname === '/api/integrations/collector/pair') {
    const session = assertAdmin(req, true, 'Apenas administradores podem parear o coletor local.');
    const pairing = await security.issueCollectorToken(session.workspaceId);
    await appendServerAudit('Coletor local pareado', 'Um novo token substituiu o pareamento anterior deste escritório.', session.displayName || session.username);
    return json(res, 201, { ok: true, ...pairing, message: 'Pareamento criado. Copie o token agora; ele não será exibido novamente.' });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/integrations/collector/pair') {
    const session = assertAdmin(req, true, 'Apenas administradores podem remover o pareamento do coletor local.');
    const result = await security.revokeCollectorToken(session.workspaceId);
    return json(res, 200, { ok: true, ...result, message: 'Pareamento do coletor removido.' });
  }

  return INTEGRATIONS_ROUTE_MISS;
}
