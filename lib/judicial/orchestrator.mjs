import { JudicialCredentialManager } from './credential-manager.mjs';
import { JudicialSessionManager, SESSION_STATUS } from './session-manager.mjs';
import { runA1Sandbox } from './a1-sandbox.mjs';
import { runTotpSandbox, parseTotpUri } from './totp-sandbox.mjs';
import { getAuthAdapter, AUTH_STRATEGIES } from './auth-adapters.mjs';
import { ManagedJudicialConnectivity, sanitizeJudicialError } from './managed-connectivity.mjs';
import { EprocSyncScheduler, SYNC_SCHEDULE_HOURS_BRT, SYNC_TIMEZONE } from './eproc/scheduler/sync-scheduler.mjs';
import { canonicalPortalId, getEprocPortalById, isEprocPortalLiveSyncVerified, listEprocPortals, listLiveSyncVerifiedEprocPortals } from './eproc/portal-registry.mjs';

const EPROC_SYNC_IDENTITY = 'eproc-sync';

export class JudicialOrchestrator {
  constructor({ dataDirectory, securityManager, portalsConfig = [], credentialManagerOptions = {} }) {
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.portals = portalsConfig;
    this.eprocPortalSyncExecutor = null;
    this.credentialManager = new JudicialCredentialManager({ dataDirectory, securityManager, ...credentialManagerOptions });
    this.sessionManager = new JudicialSessionManager({ dataDirectory });
    this.managedConnectivity = new ManagedJudicialConnectivity({
      credentialManager: this.credentialManager,
      sessionManager: this.sessionManager,
      portalsConfig
    });
    this.syncScheduler = new EprocSyncScheduler({
      orchestrator: this,
      dataDirectory: this.dataDirectory,
      logger: console
    });
  }

  async init() {
    await this.credentialManager.init();
    await this.sessionManager.init();
  }

  async requestEprocSync(options = {}) {
    const requested = { ...options };
    if (!Array.isArray(options.portals)) {
      const eligible = new Set(listLiveSyncVerifiedEprocPortals().map(portal => portal.id));
      // A successful manual read is durable workspace evidence. It permits
      // later scheduled cycles for that same portal without changing the
      // registry's honest static liveSyncVerified claim.
      for (const portal of listEprocPortals({ status: 'active' })) {
        const session = await this.sessionManager.getSessionStatus(
          options.workspaceId || 'default', portal.id, EPROC_SYNC_IDENTITY
        );
        if (session?.lastSuccessfulSyncAt) eligible.add(portal.id);
      }
      requested.portals = [...eligible];
    }
    requested.includeWorkspaceVerified = options.trigger === 'scheduled';
    return await this.syncScheduler.requestSync(requested);
  }

  getEprocSyncJobStatus(workspaceId) {
    return this.syncScheduler.getJobStatus(workspaceId);
  }

  async getEprocIntegrationsStatus(workspaceId = 'default') {
    const credStatus = await this.credentialManager.getPublicStatus();
    const activeJob = this.getEprocSyncJobStatus(workspaceId);

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: SYNC_TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const brtHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const brtMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    let nextSlotHour = 7;
    let nextSlotDayOffset = 0;
    if (brtHour < 7 || (brtHour === 7 && brtMinute === 0)) {
      nextSlotHour = 7;
    } else if (brtHour < 19 || (brtHour === 19 && brtMinute === 0)) {
      nextSlotHour = 19;
    } else {
      nextSlotHour = 7;
      nextSlotDayOffset = 1;
    }
    const nextSyncFormatted = `${String(nextSlotHour).padStart(2, '0')}:00 BRT${nextSlotDayOffset ? ' (amanhã)' : ' (hoje)'}`;

    const canonicalPortals = listEprocPortals({ status: 'active' })
      .filter(portal => portal.capabilities?.productVisible === true)
      .map(portal => ({
      ...portal,
      name: portal.name.replace('Tribunal de Justiça do ', '').replace('Justiça Federal do ', 'JF '),
      acronym: `${portal.court} ${portal.level === 2 ? '2G' : '1G'}`,
      url: portal.baseUrl,
      authType: portal.auth?.totp ? 'Certificado Digital A1 + 2FA TOTP' : portal.auth?.certificate ? 'Certificado Digital A1 / Login Unificado' : 'Credencial do portal',
      requiresA1: Boolean(portal.auth?.certificate),
      requiresTotp: Boolean(portal.auth?.totp),
      isAwaitingVerification: !portal.capabilities?.liveSyncVerified
    }));

    const hasA1 = Boolean(credStatus?.certificate?.configured);

    const portalResults = [];
    for (const p of canonicalPortals) {
      const totpSecret = await this.credentialManager.getPortalTotpSecret(p.id);
      const hasTotp = Boolean(totpSecret);

      const lastPortalJob = (activeJob?.job?.portals || []).find(item => item.portalId === p.id);
      const isRunning = activeJob?.active === true
        && ['RUNNING', 'PENDING'].includes(String(lastPortalJob?.state || '').toUpperCase());
      const durableStatus = await this.sessionManager.getSessionStatus(workspaceId, p.id, EPROC_SYNC_IDENTITY);
      const connectionVerified = Boolean(durableStatus.lastSuccessfulSyncAt);
      const durableError = durableStatus.error ? String(durableStatus.error) : null;
      const credentialConfigured = hasA1 && (!p.requiresTotp || hasTotp);
      const liveSyncSupported = isEprocPortalLiveSyncVerified(p.id);

      let status = 'unverified';
      let statusLabel = 'Disponível — aguardando conexão/verificação';
      let badgeClass = 'warning';

      if (isRunning) {
        status = 'syncing';
        statusLabel = 'Sincronização em andamento';
      } else if (durableStatus.status === SESSION_STATUS.ERROR || durableError) {
        status = 'error';
        statusLabel = 'Erro na última sincronização';
        badgeClass = 'warning';
      } else if (connectionVerified) {
        status = 'connected';
        statusLabel = 'Conexão verificada';
        badgeClass = 'connected';
      } else if (!liveSyncSupported && !p.capabilities?.manualVerificationCandidate) {
        status = 'available';
        statusLabel = 'Disponível — aguardando conexão/verificação';
        badgeClass = 'muted';
      } else if (!hasA1) {
        status = 'pending_certificate';
        statusLabel = 'Aguardando Certificado A1';
        badgeClass = 'warning';
      } else if (p.requiresTotp && !hasTotp) {
        status = 'pending_totp';
        statusLabel = 'Aguardando Segundo Fator (2FA)';
        badgeClass = 'warning';
      } else if (credentialConfigured && (liveSyncSupported || p.capabilities?.manualVerificationCandidate)) {
        status = 'ready';
        statusLabel = 'Credenciais configuradas — conexão não verificada';
        badgeClass = 'muted';
      } else {
        status = 'available';
        statusLabel = 'Disponível — aguardando conexão/verificação';
        badgeClass = 'muted';
      }

      const metrics = connectionVerified && durableStatus.counts
        ? { ...durableStatus.counts }
        : null;

      portalResults.push({
        ...p,
        status,
        statusLabel,
        badgeClass,
        credentialConfigured,
        connectionVerified,
        metrics,
        lastAttemptAt: durableStatus.lastAttemptAt || lastPortalJob?.startedAt || activeJob?.job?.startedAt || null,
        lastSuccessfulSyncAt: durableStatus.lastSuccessfulSyncAt,
        lastSyncAt: durableStatus.lastSuccessfulSyncAt,
        lastError: isRunning ? null : (lastPortalJob?.error || durableError || null)
      });
    }

    return {
      ok: true,
      workspaceId,
      certificate: credStatus.certificate,
      totpEnabled: credStatus.automatedTotpEnabled,
      scheduler: {
        scheduleHours: SYNC_SCHEDULE_HOURS_BRT,
        timezone: SYNC_TIMEZONE,
        nextSyncFormatted,
        isDue: this.syncScheduler.isScheduledSyncTime(now)
      },
      activeJob,
      portals: portalResults
    };
  }

  async syncPortal(portalId, { workspaceId = 'default', onProgress, allowManualVerification = false, targetProcessNumber = null, maxProcesses = null } = {}) {
    const canonicalId = canonicalPortalId(portalId);
    if (!canonicalId) throw new Error(`Portal eproc desconhecido: ${portalId}.`);
    const portalConfig = getEprocPortalById(canonicalId);
    const durableStatus = await this.sessionManager.getSessionStatus(workspaceId, canonicalId, EPROC_SYNC_IDENTITY);
    const isManualCandidate = portalConfig?.capabilities?.manualVerificationCandidate === true;
    if (!isEprocPortalLiveSyncVerified(canonicalId) && !(allowManualVerification && isManualCandidate) && !durableStatus.lastSuccessfulSyncAt) {
      throw new Error(`${portalConfig?.name || canonicalId} ainda não possui conexão live verificada.`);
    }
    if (typeof this.eprocPortalSyncExecutor !== 'function') {
      throw new Error('Pipeline eproc real indisponível. Nenhuma sincronização foi executada.');
    }
    const allowWorkspaceVerified = Boolean(durableStatus.lastSuccessfulSyncAt);
    const attemptedAt = new Date().toISOString();
    await this.sessionManager.updateSessionStatus(workspaceId, canonicalId, SESSION_STATUS.AUTHENTICATING, {
      lastAttemptAt: attemptedAt,
      error: null,
      humanAction: null
    }, EPROC_SYNC_IDENTITY);
    let result;
    try {
      result = await this.eprocPortalSyncExecutor({
        portalId: canonicalId,
        portalConfig,
        workspaceId,
        onProgress,
        allowManualVerification,
        allowWorkspaceVerified,
        targetProcessNumber,
        maxProcesses
      });
    } catch (error) {
      await this.sessionManager.updateSessionStatus(workspaceId, canonicalId, SESSION_STATUS.ERROR, {
        lastAttemptAt: new Date().toISOString(),
        error: sanitizeJudicialError(error),
        humanAction: null
      }, EPROC_SYNC_IDENTITY);
      throw error;
    }
    if (result?.ok) {
      // Uma sincronização bem-sucedida encerra o ciclo de erro anterior: sem isso o
      // portal permaneceria exibindo "Erro na última sincronização" para sempre.
      await this.sessionManager.updateSessionStatus(workspaceId, canonicalId, SESSION_STATUS.CONNECTED, {
        lastSuccessfulSyncAt: new Date().toISOString(),
        counts: result.counts || null,
        lastAttemptAt: attemptedAt,
        error: null,
        humanAction: null,
        failureCount: 0,
        nextRefreshAt: null
      }, EPROC_SYNC_IDENTITY);
    } else {
      await this.sessionManager.updateSessionStatus(workspaceId, canonicalId, SESSION_STATUS.ERROR, {
        lastAttemptAt: new Date().toISOString(),
        error: sanitizeJudicialError(result?.error || result?.message || 'A sincronização eproc não confirmou sucesso.'),
        humanAction: null
      }, EPROC_SYNC_IDENTITY);
    }
    return result;
  }

  setEprocPortalSyncExecutor(executor) {
    this.eprocPortalSyncExecutor = typeof executor === 'function' ? executor : null;
  }

  setPortals(portalsConfig = []) {
    this.portals = portalsConfig.map(portal => ({ ...portal }));
    this.managedConnectivity.setPortals(this.portals);
  }

  async runA1Test() {
    const certSecrets = await this.credentialManager.getCertificateSecrets();
    if (!certSecrets) {
      return {
        operational: false,
        status: 'A1 NOT CONFIGURED',
        errorMessage: 'Nenhum certificado A1 configurado no Atrium.',
        steps: [{ id: 'pfxFile', name: 'Arquivo PFX', status: 'FAIL', detail: 'Nenhum certificado cadastrado.' }],
        summary: null
      };
    }
    const result = await runA1Sandbox({ pfxPath: certSecrets.path, passphrase: certSecrets.passphrase });
    
    // Atualiza o estado salvo sob lock do cofre
    await this.credentialManager.updateSecrets(secrets => {
      secrets.lastSandboxValidation = result;
      if (result.operational && result.summary && secrets.certificate) {
        secrets.certificate.summary = result.summary;
      }
    });

    return result;
  }

  async runTotpTest(portalId) {
    const secret = await this.credentialManager.getPortalTotpSecret(portalId);
    if (!secret) {
      return {
        operational: false,
        status: 'TOTP NOT CONFIGURED',
        errorMessage: `Nenhum segundo fator configurado para o portal ${portalId}.`,
        steps: [{ id: 'secret', name: 'Segredo TOTP', status: 'FAIL', detail: 'Segundo fator não configurado.' }],
        summary: null
      };
    }
    const result = runTotpSandbox({ secret });
    await this.credentialManager.updateSecrets(secrets => {
      secrets.lastTotpValidation ||= {};
      secrets.lastTotpValidation[portalId] = result;
    });
    return result;
  }

  async parseAndSaveTotp(portalId, rawData, label = '') {
    const parsed = parseTotpUri(rawData);
    if (parsed.type === 'single') {
      return await this.credentialManager.savePortalTotp(portalId, {
        secret: parsed.account.secret,
        label: label || parsed.account.issuer || parsed.account.name
      });
    }
    return { ok: true, type: 'migration', accounts: parsed.accounts };
  }

  async getDiagnostics(userId = 'default-admin') {
    const credStatus = await this.credentialManager.getPublicStatus();
    const managedCoverage = await this.managedConnectivity.coverage('agent-local', 'office-primary');
    const managedByPortal = new Map(managedCoverage.map(item => [item.id, item]));
    const portalDiagnostics = [];

    for (const portal of this.portals) {
      const creds = await this.credentialManager.getPortalCredentials(portal.id);
      const totpSecret = await this.credentialManager.getPortalTotpSecret(portal.id);
      const session = await this.sessionManager.getSessionStatus(userId, portal.id);

      let authStrategy = portal.authStrategy;
      if (!authStrategy) {
        if (['djen', 'datajud'].includes(portal.strategy)) authStrategy = AUTH_STRATEGIES.PUBLIC;
        else if (portal.certificateMode === 'pjeoffice') authStrategy = AUTH_STRATEGIES.PJEOFFICE_LOCAL;
        else if (portal.certificateMode === 'pfx-mtls') authStrategy = AUTH_STRATEGIES.CLIENT_CERT_MTLS;
        else authStrategy = AUTH_STRATEGIES.MANUAL_PERSISTENT_SESSION;
      }

      portalDiagnostics.push({
        id: portal.id,
        name: portal.name,
        group: portal.group || 'Justiça',
        system: portal.system || portal.strategy,
        authStrategy,
        requiresA1: Boolean(portal.usesCertificate),
        a1Operational: credStatus.certificate.status === 'operational',
        requiresTotp: Boolean(portal.supportsTotp !== false),
        totpConfigured: Boolean(totpSecret),
        credentialsConfigured: Boolean(creds?.username),
        sessionStatus: session.status,
        lastConnectedAt: session.lastConnectedAt,
        lastCheckedAt: session.lastCheckedAt,
        managed: managedByPortal.get(portal.id) || null
      });
    }

    return {
      a1: credStatus.certificate,
      totpEnabled: credStatus.automatedTotpEnabled,
      portals: portalDiagnostics,
      coverage: managedCoverage,
      readOnly: true,
      forbiddenAutomaticActions: ['science', 'signature', 'petition', 'protocol', 'acknowledgment', 'deadline-confirmation'],
      testedAt: new Date().toISOString()
    };
  }
}
