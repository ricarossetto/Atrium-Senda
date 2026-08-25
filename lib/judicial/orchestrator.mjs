import { JudicialCredentialManager } from './credential-manager.mjs';
import { JudicialSessionManager, SESSION_STATUS } from './session-manager.mjs';
import { runA1Sandbox } from './a1-sandbox.mjs';
import { runTotpSandbox, parseTotpUri } from './totp-sandbox.mjs';
import { getAuthAdapter, AUTH_STRATEGIES } from './auth-adapters.mjs';

export class JudicialOrchestrator {
  constructor({ dataDirectory, securityManager, portalsConfig = [] }) {
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.portals = portalsConfig;
    this.credentialManager = new JudicialCredentialManager({ dataDirectory, securityManager });
    this.sessionManager = new JudicialSessionManager({ dataDirectory });
  }

  async init() {
    await this.credentialManager.init();
    await this.sessionManager.init();
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
    
    // Atualiza o estado salvo
    const secrets = await this.credentialManager.readRawSecrets();
    secrets.lastSandboxValidation = result;
    if (result.operational && result.summary && secrets.certificate) {
      secrets.certificate.summary = result.summary;
    }
    await this.credentialManager.saveRawSecrets(secrets);

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
    const secrets = await this.credentialManager.readRawSecrets();
    secrets.lastTotpValidation ||= {};
    secrets.lastTotpValidation[portalId] = result;
    await this.credentialManager.saveRawSecrets(secrets);
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
        lastCheckedAt: session.lastCheckedAt
      });
    }

    return {
      a1: credStatus.certificate,
      totpEnabled: credStatus.automatedTotpEnabled,
      portals: portalDiagnostics,
      testedAt: new Date().toISOString()
    };
  }
}
