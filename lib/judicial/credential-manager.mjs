import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { runA1Sandbox } from './a1-sandbox.mjs';
import { normalizeBase32, runTotpSandbox } from './totp-sandbox.mjs';

export class JudicialCredentialManager {
  constructor({ dataDirectory, securityManager }) {
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.secretsFile = path.join(dataDirectory, 'judicial-integrations.json');
    this.secretsDir = path.join(dataDirectory, 'secrets');
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
    await mkdir(this.secretsDir, { recursive: true });
  }

  async readRawSecrets() {
    try {
      if (!existsSync(this.secretsFile)) {
        return this.defaultSecrets();
      }
      const envelope = JSON.parse(await readFile(this.secretsFile, 'utf8'));
      const decrypted = JSON.parse(this.security.decrypt(envelope.encrypted));
      return { ...this.defaultSecrets(), ...decrypted };
    } catch (err) {
      if (existsSync(this.secretsFile)) {
        throw new Error('Falha ao abrir as credenciais judiciais criptografadas.', { cause: err });
      }
      return this.defaultSecrets();
    }
  }

  async saveRawSecrets(secrets) {
    await this.init();
    const envelope = {
      version: 2,
      algorithm: 'aes-256-gcm',
      updatedAt: new Date().toISOString(),
      encrypted: this.security.encrypt(JSON.stringify(secrets))
    };
    await writeFile(this.secretsFile, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  defaultSecrets() {
    return {
      certificate: null,
      portalCredentials: {},
      totpSecrets: {},
      managedIdentities: {},
      allowAutomatedTotp: false,
      lastSandboxValidation: null,
      lastTotpValidation: {}
    };
  }

  // Métodos Internos Seguros (Usados apenas pelo Orchestrator e AuthAdapters)
  async getCertificateSecrets() {
    const secrets = await this.readRawSecrets();
    if (!secrets.certificate?.path || !existsSync(secrets.certificate.path)) return null;
    return {
      path: secrets.certificate.path,
      passphrase: secrets.certificate.passphrase,
      fileName: secrets.certificate.fileName
    };
  }

  async getPortalCredentials(portalId, identityId = '') {
    const secrets = await this.readRawSecrets();
    if (identityId && secrets.managedIdentities?.[identityId]?.portalCredentials?.[portalId]) {
      return secrets.managedIdentities[identityId].portalCredentials[portalId];
    }
    return secrets.portalCredentials?.[portalId] || null;
  }

  async getPortalTotpSecret(portalId, identityId = '') {
    const secrets = await this.readRawSecrets();
    const entry = (identityId && secrets.managedIdentities?.[identityId]?.totpSecrets?.[portalId])
      || secrets.totpSecrets?.[portalId];
    return entry ? entry.secret : null;
  }

  // Operações de Cadastro e Atualização
  async saveCertificate({ fileName, pfxBuffer, passphrase }) {
    await this.init();
    const safeBaseName = path.basename(fileName || 'certificado.pfx');
    const destination = path.join(this.secretsDir, `a1-${Date.now()}-${randomBytes(6).toString('hex')}.pfx`);
    await writeFile(destination, pfxBuffer, { mode: 0o600 });

    // Valida imediatamente com o sandbox
    const sandboxResult = await runA1Sandbox({ pfxPath: destination, passphrase });
    if (!sandboxResult.operational) {
      try { await unlink(destination); } catch {}
      throw Object.assign(new Error(sandboxResult.errorMessage || 'O certificado A1 informado é inválido.'), {
        errorCode: sandboxResult.errorCode,
        sandboxResult
      });
    }

    const secrets = await this.readRawSecrets();
    if (secrets.certificate?.path && secrets.certificate.path !== destination) {
      try { await unlink(secrets.certificate.path); } catch {}
    }

    secrets.certificate = {
      path: destination,
      passphrase,
      fileName: safeBaseName,
      source: 'upload',
      configuredAt: new Date().toISOString(),
      summary: sandboxResult.summary
    };
    secrets.lastSandboxValidation = sandboxResult;
    await this.saveRawSecrets(secrets);

    return { ok: true, summary: sandboxResult.summary, sandboxResult };
  }

  async removeCertificate() {
    const secrets = await this.readRawSecrets();
    if (secrets.certificate?.path) {
      try { await unlink(secrets.certificate.path); } catch {}
    }
    secrets.certificate = null;
    secrets.lastSandboxValidation = null;
    await this.saveRawSecrets(secrets);
    return { ok: true, removed: true };
  }

  async savePortalTotp(portalId, { secret, label = '', identityId = '' }) {
    const cleanSecret = normalizeBase32(secret);
    const validation = runTotpSandbox({ secret: cleanSecret });
    if (!validation.operational) {
      throw Object.assign(new Error(validation.errorMessage || 'Segredo TOTP inválido.'), {
        errorCode: validation.errorCode,
        validation
      });
    }

    const secrets = await this.readRawSecrets();
    const target = identityId ? ensureManagedIdentity(secrets, identityId).totpSecrets : (secrets.totpSecrets ||= {});
    target[portalId] = {
      secret: cleanSecret,
      label: label || portalId,
      configuredAt: new Date().toISOString(),
      algorithm: validation.summary.algorithm,
      digits: validation.summary.digits,
      period: validation.summary.period
    };
    secrets.allowAutomatedTotp = true;
    secrets.lastTotpValidation ||= {};
    secrets.lastTotpValidation[portalId] = validation;
    await this.saveRawSecrets(secrets);

    return { ok: true, portalId, validation };
  }

  async removePortalTotp(portalId) {
    const secrets = await this.readRawSecrets();
    if (secrets.totpSecrets) delete secrets.totpSecrets[portalId];
    if (secrets.lastTotpValidation) delete secrets.lastTotpValidation[portalId];
    secrets.allowAutomatedTotp = Object.keys(secrets.totpSecrets || {}).length > 0;
    await this.saveRawSecrets(secrets);
    return { ok: true, removed: true };
  }

  async savePortalCredentials(portalId, { username, password, oab, uf, identityId = '' }) {
    const secrets = await this.readRawSecrets();
    const target = identityId ? ensureManagedIdentity(secrets, identityId).portalCredentials : (secrets.portalCredentials ||= {});
    target[portalId] = {
      username: String(username || '').trim(),
      password: String(password || ''),
      oab: String(oab || '').trim(),
      uf: String(uf || '').trim().toUpperCase(),
      updatedAt: new Date().toISOString()
    };
    await this.saveRawSecrets(secrets);
    return { ok: true, portalId, configured: true };
  }

  async removePortalCredentials(portalId) {
    const secrets = await this.readRawSecrets();
    if (secrets.portalCredentials) delete secrets.portalCredentials[portalId];
    await this.saveRawSecrets(secrets);
    return { ok: true, removed: true };
  }

  // Visão Pública Higienizada (100% Segura para o Frontend)
  async getPublicStatus() {
    const secrets = await this.readRawSecrets();
    const cert = secrets.certificate;
    const certAccessible = Boolean(cert?.path && existsSync(cert.path));

    let a1Status = 'not_configured';
    if (certAccessible) {
      if (secrets.lastSandboxValidation?.operational) a1Status = 'operational';
      else a1Status = 'configured';
    }

    const a1Summary = secrets.lastSandboxValidation?.summary || (cert?.summary ? {
      holder: cert.summary.holder,
      documentMasked: cert.summary.documentMasked,
      issuer: cert.summary.issuer,
      notAfter: cert.summary.notAfter,
      fingerprintSha256Masked: cert.summary.fingerprintSha256Masked
    } : null);

    return {
      certificate: {
        configured: Boolean(cert?.path),
        accessible: certAccessible,
        status: a1Status,
        fileName: cert?.fileName || '',
        summary: a1Summary,
        lastTestedAt: secrets.lastSandboxValidation?.summary?.testedAt || cert?.configuredAt || null
      },
      automatedTotpEnabled: Boolean(secrets.allowAutomatedTotp),
      totpCount: Object.keys(secrets.totpSecrets || {}).length,
      credentialsCount: Object.keys(secrets.portalCredentials || {}).length
    };
  }
}

function ensureManagedIdentity(secrets, identityId) {
  const safeIdentity = String(identityId || '').trim();
  if (!safeIdentity) throw new Error('A identidade judicial gerenciada é obrigatória.');
  secrets.managedIdentities ||= {};
  secrets.managedIdentities[safeIdentity] ||= { portalCredentials: {}, totpSecrets: {} };
  secrets.managedIdentities[safeIdentity].portalCredentials ||= {};
  secrets.managedIdentities[safeIdentity].totpSecrets ||= {};
  return secrets.managedIdentities[safeIdentity];
}
