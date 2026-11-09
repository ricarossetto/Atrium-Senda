/**
 * Rotas de administração do escritório (/api/admin/).
 *
 * Movidas de server.mjs sem mudar o comportamento. As dependências entram por parâmetro.
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { handleMailAdminRoute, isMailAdminRoute } from './mail-admin-routes.mjs';

export function isAdminRoute(url) {
  return url.pathname.startsWith('/api/admin/');
}

export async function handleAdminRoute(ctx, req, res, url) {
  const {
    APP_VERSION,
    BUILD_ID,
    BUILT_AT,
    CURRENT_SCHEMA_VERSION,
    GIT_SHA,
    ROOT,
    appStateFile,
    appendServerAudit,
    assertAdmin,
    assertReauthentication,
    buildEprocIntegrationHealth,
    createWorkspaceFactoryResetService,
    currentSearchIndex,
    currentWorkspaceId,
    emptyRuntime,
    enqueueAppStateMutation,
    filterAuditEvents,
    isOfficePrincipalMember,
    judicialOrchestratorForCurrentWorkspace,
    json,
    maskEmail,
    normalizeAuditEvent,
    notificationDbForWorkspace,
    notificationServiceForWorkspace,
    parseKnownIssuesStats,
    principalProtectionError,
    readAiApiKey,
    readAppStateEnvelope,
    readJson,
    resendProvider,
    runtimeFile,
    runtimeHealth,
    saveAppStateDirectUnlocked,
    saveRuntime,
    security,
    stateHealth
  } = ctx;
  const adminSession = assertAdmin(req, req.method !== 'GET', 'Acesso negado: apenas administradores possuem acesso aos serviços administrativos do ATRIUM.');

  // 1. Visão Geral e Saúde dos Subsistemas (System Health KPIs)
  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    const appEnv = await readAppStateEnvelope();
    const state = appEnv.state || {};
    const aiKey = await readAiApiKey();
    const dbFileExists = existsSync(appStateFile());

    let storageSizeBytes = 0;
    if (dbFileExists) {
      try { storageSizeBytes = (await stat(appStateFile())).size; } catch {}
    }

    let eprocIntegration = { status: 'DEGRADED', mode: 'consulta_publica', connectedPortals: 0 };
    try {
      const judicialOrchestrator = await judicialOrchestratorForCurrentWorkspace();
      eprocIntegration = buildEprocIntegrationHealth(
        await judicialOrchestrator.getEprocIntegrationsStatus(currentWorkspaceId())
      );
    } catch {
      // Falha ao ler o orquestrador não pode derrubar o painel; o fallback é honesto.
    }

    // System Health Determinístico
    const health = {
      overall: (stateHealth().status === 'READY' && dbFileExists) ? 'HEALTHY' : (stateHealth().status === 'NEW_INSTALL' ? 'DEGRADED' : 'DOWN'),
      frontend: 'HEALTHY',
      backend: 'HEALTHY',
      database: (dbFileExists && stateHealth().status === 'READY') ? 'HEALTHY' : 'DEGRADED',
      storage: storageSizeBytes > 0 ? 'HEALTHY' : 'DEGRADED',
      auth: 'HEALTHY',
      securityVault: 'HEALTHY',
      integrations: {
        djen: { status: 'HEALTHY', type: 'consulta_publica_sob_demanda' },
        datajud: { status: 'HEALTHY', type: 'consulta_publica_cnj' },
        eproc: eprocIntegration,
        gemini: { status: aiKey ? 'HEALTHY' : 'UNKNOWN', configured: Boolean(aiKey) }
      },
      version: APP_VERSION,
      appVersion: APP_VERSION,
      gitSha: GIT_SHA,
      commitSha: GIT_SHA,
      buildId: BUILD_ID,
      builtAt: BUILT_AT,
      environment: process.env.NODE_ENV || 'production',
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${process.platform} (${process.arch})`
    };

    const counts = {
      processes: Array.isArray(state.processes) ? state.processes.length : 0,
      contacts: Array.isArray(state.contacts) ? state.contacts.length : 0,
      tasks: Array.isArray(state.tasks) ? state.tasks.length : 0,
      intimations: Array.isArray(state.intimations) ? state.intimations.length : 0,
      agenda: Array.isArray(state.agenda) ? state.agenda.length : 0,
      documents: Array.isArray(state.documents) ? state.documents.length : 0,
      auditEvents: Array.isArray(state.audit) ? state.audit.length : 0,
      users: security.listUsers ? security.listUsers(adminSession.workspaceId).length : 1
    };

    let knownIssuesStats = { total: 0, open: 0, needsRevalidation: 0, fixed: 0, risk: 0 };
    try {
      knownIssuesStats = parseKnownIssuesStats(await readFile(path.resolve(ROOT, 'KNOWN_ISSUES.md'), 'utf8'));
    } catch {
      // Catálogo ausente não derruba o painel; a contagem fica zerada e honesta.
    }

    return json(res, 200, { ok: true, health, counts, knownIssuesStats, adminUser: adminSession.username });
  }

  // 2. Gestão de Usuários e RBAC Server-Side (Sanitizado: sem senhas ou segredos)
  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const rawUsers = security.listUsers ? security.listUsers(adminSession.workspaceId) : [];
    const sanitizedUsers = rawUsers.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.username,
      email: u.email || '—',
      role: u.role || 'collaborator',
      status: u.status || 'active',
      createdAt: u.createdAt || null,
      mfaEnabled: Boolean(u.mfaEnabled || u.twoFactorEnabled),
      oab: u.oab || null
    }));
    return json(res, 200, { ok: true, users: sanitizedUsers, currentAdminRole: adminSession.role });
  }

  // 3. Atualização de Role/Status de Usuário (com trava para não remover último admin e audit log)
  if (req.method === 'POST' && url.pathname === '/api/admin/users/role') {
    const body = await readJson(req);
    await assertReauthentication(req, body, adminSession);
    const { userId, role, status } = body;
    if (!userId) throw Object.assign(new Error('ID do usuário é obrigatório.'), { statusCode: 400 });

    const rawUsers = security.listUsers ? security.listUsers(adminSession.workspaceId) : [];
    const targetUser = rawUsers.find(u => u.id === userId);
    if (!targetUser) throw Object.assign(new Error('Usuário não localizado no escritório.'), { statusCode: 404 });

    // Trava de segurança: o titular é identificado pelo papel (mesmo critério de
    // `isOfficePrincipalMember`), não pelo `master_admin` legado. Ele não pode ser
    // rebaixado nem receber status diferente de `active` por esta rota. O caso do
    // único Administrador Mestre preserva o contrato anterior (400) como caminho de
    // compatibilidade; os demais casos usam a recusa de titularidade (409).
    if (isOfficePrincipalMember(targetUser) && ((role && role !== 'master_admin') || (status && status !== 'active'))) {
      const otherActiveMasters = rawUsers.filter(u => u.role === 'master_admin' && u.status === 'active' && u.id !== userId);
      const legacyLastMaster = targetUser.role === 'master_admin' && otherActiveMasters.length === 0 && ((role && role !== 'master_admin') || status === 'inactive');
      if (legacyLastMaster) {
        throw Object.assign(new Error('Operação bloqueada: não é permitido rebaixar ou desativar o único Administrador Mestre do escritório.'), { statusCode: 400 });
      }
      throw principalProtectionError();
    }

    const updated = await security.updateUserStatus(userId, { role, status }, adminSession.workspaceId);

    // Registro de Auditoria Server-Side
    await enqueueAppStateMutation(async () => {
      const env = await readAppStateEnvelope();
      const state = env.state || {};
      if (!Array.isArray(state.audit)) state.audit = [];
      state.audit.unshift({
        id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        user: adminSession.username,
        action: 'ADMIN_USER_RBAC_UPDATE',
        module: 'Admin Control Plane',
        details: `Usuário ${targetUser.username} atualizado para perfil: ${role || targetUser.role}, status: ${status || targetUser.status}`,
        result: 'SUCCESS'
      });
      if (state.audit.length > 500) state.audit = state.audit.slice(0, 500);
      await saveAppStateDirectUnlocked(state, env.revision);
    });

    return json(res, 200, { ok: true, user: updated, message: 'Privilégios e status de acesso atualizados com sucesso.' });
  }

  // 4. Trilha de Auditoria Oficial Filtrada (Audit Log)
  if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
    const appEnv = await readAppStateEnvelope();
    const auditList = Array.isArray(appEnv.state?.audit) ? appEnv.state.audit : [];
    const filterUser = String(url.searchParams.get('user') || '').trim().toLowerCase();
    const filterAction = String(url.searchParams.get('action') || '').trim().toLowerCase();
    const filterModule = String(url.searchParams.get('module') || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

const normalized = auditList.map(normalizeAuditEvent);
const filtered = filterAuditEvents(normalized, {
  user: filterUser,
  action: filterAction,
  module: filterModule
});

const paginated = filtered.slice(offset, offset + limit);
    return json(res, 200, { ok: true, total: filtered.length, limit, offset, events: paginated });
  }

  // 5. Diagnóstico Detalhado do Sistema (sem shell arbitrário)
  if (req.method === 'GET' && url.pathname === '/api/admin/diagnostic') {
    const appEnv = await readAppStateEnvelope();
    const storageStats = {
      stateFileExists: existsSync(appStateFile()),
      sizeBytes: existsSync(appStateFile()) ? (await stat(appStateFile())).size : 0,
      revision: appEnv.revision || 'initial',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      runtimeFileExists: existsSync(runtimeFile()),
      runtimeStatus: runtimeHealth().status
    };

    const securityStats = {
      ciphers: 'AES-256-GCM (Authenticated Encryption)',
      keyDerivation: 'Scrypt N=16384 r=8 p=1',
      sessionCookie: security.secureCookies ? 'Secure, HttpOnly, SameSite=Strict' : 'HttpOnly, SameSite=Strict (Local)',
      secretsStatus: {
        appSecret: process.env.APP_SECRET ? 'configured' : 'missing',
        geminiApiKey: (await readAiApiKey()) ? 'configured' : 'missing',
        bootstrapToken: process.env.SETUP_BOOTSTRAP_TOKEN ? 'configured' : 'missing'
      }
    };

    return json(res, 200, { ok: true, storageStats, securityStats, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  }

  // 6. Catálogo de Known Issues
  if (req.method === 'GET' && url.pathname === '/api/admin/known-issues') {
    const issuesPath = path.resolve(ROOT, 'KNOWN_ISSUES.md');
    let content = '';
    try { if (existsSync(issuesPath)) content = await readFile(issuesPath, 'utf8'); } catch {}
    return json(res, 200, { ok: true, rawMarkdown: content, timestamp: new Date().toISOString() });
  }

  // 7. Ações de Manutenção Segura: Rebuild Runtime
  if (req.method === 'POST' && url.pathname === '/api/admin/actions/rebuild-runtime') {
    await saveRuntime(emptyRuntime());
    await enqueueAppStateMutation(async () => {
      const env = await readAppStateEnvelope();
      const state = env.state || {};
      if (!Array.isArray(state.audit)) state.audit = [];
      state.audit.unshift({
        id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
        timestamp: new Date().toISOString(),
        user: adminSession.username,
        action: 'ADMIN_REBUILD_RUNTIME',
        module: 'Admin Control Plane',
        details: 'Reconstrução de runtime executada pelo Administrador.',
        result: 'SUCCESS'
      });
      await saveAppStateDirectUnlocked(state, env.revision);
    });
    return json(res, 200, { ok: true, message: 'Dados derivados e runtime reconstruídos com sucesso.' });
  }

  // 8. Ações de Manutenção Segura: Rebuild Search Index
  if (req.method === 'POST' && url.pathname === '/api/admin/actions/rebuild-search') {
    const envelope = await readAppStateEnvelope();
    const rebuilt = await currentSearchIndex().rebuild({ state: envelope.state || {}, revision: envelope.revision || null });
    return json(res, 200, { ok: true, index: rebuilt, message: 'Índice de busca global reconstruído com sucesso.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/workspace/factory-reset') {
    if (adminSession.role !== 'master_admin') {
      throw Object.assign(new Error('Somente o administrador principal pode redefinir o escritório.'), { statusCode: 403 });
    }
    const body = await readJson(req, 50_000);
    if (body.workspaceId && body.workspaceId !== adminSession.workspaceId) {
      throw Object.assign(new Error('O escritório informado não corresponde à sessão atual.'), { statusCode: 403 });
    }
    const service = await createWorkspaceFactoryResetService(adminSession, req);
    const result = await service.execute({
      actor: adminSession,
      workspaceId: adminSession.workspaceId,
      confirmationToken: body.confirmationToken,
      reauthenticationProof: { password: body.password, code: body.code },
      request: req
    });
    return json(res, 200, {
      ok: true,
      operationId: result.operationId,
      workspaceId: result.workspaceId,
      onboardingRequired: true,
      message: 'Os dados do escritório foram redefinidos. A identidade do administrador principal foi preservada.'
    });
  }

  // 9. ATRIUM Mail Control Plane (master_admin do workspace autenticado)
  if (isMailAdminRoute(url)) {
    const handled = await handleMailAdminRoute({ json, readJson, maskEmail, appendServerAudit, notificationDbForWorkspace, notificationServiceForWorkspace, resendProvider, assertReauthentication }, req, res, url, adminSession);
    if (handled) return;
  }

  return json(res, 404, { message: 'Rota administrativa não encontrada.' });
}
