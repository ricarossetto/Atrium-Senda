import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { runA1Sandbox } from './a1-sandbox.mjs';
import { normalizeBase32, runTotpSandbox } from './totp-sandbox.mjs';
import { getCredentialScopeForPortal, getPortalCredentialKeyCandidates } from './eproc/portal-registry.mjs';

export const WORKSPACE_ACCESS_KEY_OWNER = '__workspace__';

/**
 * Serialização de escritas do cofre por arquivo: leitura-modificação-escrita
 * concorrente nunca pode perder uma credencial ou truncar o JSON.
 */
const secretWriteQueues = new Map();

function withSecretsFileLock(filePath, task) {
  const previous = secretWriteQueues.get(filePath) || Promise.resolve();
  const run = previous.then(task, task);
  secretWriteQueues.set(filePath, run.then(() => undefined, () => undefined));
  return run;
}

export class JudicialCredentialManager {
  constructor({ dataDirectory, securityManager, allowLegacyRootFallback = true, allowEnvironmentFallback = true }) {
    this.dataDirectory = dataDirectory;
    this.security = securityManager;
    this.allowLegacyRootFallback = Boolean(allowLegacyRootFallback);
    this.allowEnvironmentFallback = Boolean(allowEnvironmentFallback);
    this.secretsFile = path.join(dataDirectory, 'judicial-integrations.json');
    this.secretsDir = path.join(dataDirectory, 'secrets');
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
    await mkdir(this.secretsDir, { recursive: true });
  }

  async readRawSecrets() {
    try {
      let targetFile = this.secretsFile;
      if (!existsSync(targetFile)) {
        const rootCandidate = path.join(path.resolve(this.dataDirectory, '..', '..'), 'judicial-integrations.json');
        if (this.allowLegacyRootFallback && existsSync(rootCandidate)) {
          targetFile = rootCandidate;
        } else {
          return this.defaultSecrets();
        }
      }
      const envelope = JSON.parse(await readFile(targetFile, 'utf8'));
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
    const temporaryPath = `${this.secretsFile}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.secretsFile);
  }

  /**
   * Executa uma atualização do cofre sob lock por arquivo: lê o estado atual,
   * aplica a mutação e grava de forma atômica, sem lost update concorrente.
   */
  async updateSecrets(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('Mutação do cofre é obrigatória.');
    return await withSecretsFileLock(this.secretsFile, async () => {
      const secrets = await this.readRawSecrets();
      const result = await mutator(secrets);
      await this.saveRawSecrets(secrets);
      return result;
    });
  }

  defaultSecrets() {
    return {
      certificate: null,
      portalCredentials: {},
      totpSecrets: {},
      managedIdentities: {},
      processAccessKeys: {},
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

  async getPortalCredentials(portalId, identityId = '', workspaceId = '') {
    const secrets = await this.readRawSecrets();
    const scope = getCredentialScopeForPortal(portalId);

    // 1. Workspace + JudicialIdentity scoped (strict tenant isolation)
    if (workspaceId && identityId) {
      const wsIdent = secrets.workspaces?.[workspaceId]?.identities?.[identityId];
      return lookupByPortalOrScope(wsIdent?.portalCredentials, portalId, scope) || null;
    }

    // 2. Identity scoped (single-tenant / legacy identity)
    if (identityId) {
      const creds = secrets.managedIdentities?.[identityId]?.portalCredentials;
      return lookupByPortalOrScope(creds, portalId, scope) || null;
    }

    // 3. Global portal / scope (unscoped system query only)
    return lookupByPortalOrScope(secrets.portalCredentials, portalId, scope) || null;
  }

  async getPortalTotpSecret(portalId, identityId = '', workspaceId = '') {
    const secrets = await this.readRawSecrets();
    const scope = getCredentialScopeForPortal(portalId);

    // 1. Workspace + JudicialIdentity scoped (strict tenant isolation)
    if (workspaceId && identityId) {
      const wsIdent = secrets.workspaces?.[workspaceId]?.identities?.[identityId];
      const entry = lookupByPortalOrScope(wsIdent?.totpSecrets, portalId, scope)
        || lookupSiblingDegreeTotp(wsIdent?.totpSecrets, portalId);
      if (entry?.secret) return entry.secret;
      // Never fall back to global credentials or .env when workspace and identity are specified!
      return null;
    }

    // 2. Identity scoped (single-tenant / legacy identity)
    if (identityId) {
      const idSecrets = secrets.managedIdentities?.[identityId]?.totpSecrets;
      const entry = lookupByPortalOrScope(idSecrets, portalId, scope)
        || lookupSiblingDegreeTotp(idSecrets, portalId);
      if (entry?.secret) return entry.secret;
      return null;
    }

    // 3. Global portal / scope (unscoped system query only)
    const entry = lookupByPortalOrScope(secrets.totpSecrets, portalId, scope)
      || lookupSiblingDegreeTotp(secrets.totpSecrets, portalId);
    if (entry?.secret) return entry.secret;

    // 4. Fallback híbrido operacional via variáveis de ambiente (.env) para comandos de teste/CLI não autenticados
    if (!this.allowEnvironmentFallback) return null;
    const envKeyPortal = portalId.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_TOTP_SECRET';
    if (process.env[envKeyPortal]) return process.env[envKeyPortal].trim();

    for (const s of getScopeCandidates(scope)) {
      const envKeyScope = s.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_TOTP_SECRET';
      if (process.env[envKeyScope]) return process.env[envKeyScope].trim();
    }

    if (portalId.includes('trf4') || portalId.includes('jfrs') || portalId.includes('jfsc') || portalId.includes('jfpr')) {
      const reg = process.env.TRF4_REGION_TOTP_SECRET || process.env.TRF4_EPROC_TOTP_SECRET;
      if (reg) return reg.trim();
    }
    if (portalId.includes('jfrs') && process.env.JFRS_EPROC_TOTP_SECRET) {
      return process.env.JFRS_EPROC_TOTP_SECRET.trim();
    }
    if (portalId.includes('jfsc') && process.env.JFSC_EPROC_TOTP_SECRET) {
      return process.env.JFSC_EPROC_TOTP_SECRET.trim();
    }
    if (portalId.includes('jfpr') && process.env.JFPR_EPROC_TOTP_SECRET) {
      return process.env.JFPR_EPROC_TOTP_SECRET.trim();
    }
    if (scope === 'tjrs-eproc' && process.env.TJRS_EPROC_TOTP_SECRET) {
      return process.env.TJRS_EPROC_TOTP_SECRET.trim();
    }

    return null;
  }

  // Operações de Cadastro e Atualização
  async saveCertificate({ fileName, pfxBuffer, passphrase }) {
    await this.init();
    const safeBaseName = path.basename(fileName || 'certificado.pfx');
    const destination = path.resolve(this.secretsDir, `a1-${Date.now()}-${randomBytes(6).toString('hex')}.pfx`);
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

    let replacedPath = null;
    await this.updateSecrets(secrets => {
      replacedPath = secrets.certificate?.path || null;
      secrets.certificate = {
        path: destination,
        passphrase,
        fileName: safeBaseName,
        source: 'upload',
        configuredAt: new Date().toISOString(),
        summary: sandboxResult.summary
      };
      secrets.lastSandboxValidation = sandboxResult;
    });
    if (replacedPath && replacedPath !== destination) {
      try { await unlink(replacedPath); } catch {}
    }

    return { ok: true, summary: sandboxResult.summary, sandboxResult };
  }

  async removeCertificate() {
    let removedPath = null;
    await this.updateSecrets(secrets => {
      removedPath = secrets.certificate?.path || null;
      secrets.certificate = null;
      secrets.lastSandboxValidation = null;
    });
    if (removedPath) {
      try { await unlink(removedPath); } catch {}
    }
    return { ok: true, removed: true };
  }

  async savePortalTotp(portalId, { secret, label = '', identityId = '', workspaceId = '', replacePortalIds = [] }) {
    const cleanSecret = normalizeBase32(secret);
    const validation = runTotpSandbox({ secret: cleanSecret });
    if (!validation.operational) {
      throw Object.assign(new Error(validation.errorMessage || 'Segredo TOTP inválido.'), {
        errorCode: validation.errorCode,
        validation
      });
    }

    await this.updateSecrets(secrets => {
      let target;
      if (workspaceId && identityId) {
        secrets.workspaces ||= {};
        secrets.workspaces[workspaceId] ||= { identities: {} };
        secrets.workspaces[workspaceId].identities[identityId] ||= { portalCredentials: {}, totpSecrets: {} };
        target = secrets.workspaces[workspaceId].identities[identityId].totpSecrets;
      } else if (identityId) {
        target = ensureManagedIdentity(secrets, identityId).totpSecrets;
      } else {
        target = (secrets.totpSecrets ||= {});
      }

      for (const legacyPortalId of new Set(replacePortalIds.map(String))) {
        if (legacyPortalId && legacyPortalId !== portalId) delete target[legacyPortalId];
      }
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
    });

    return { ok: true, portalId, validation };
  }

  async removePortalTotp(portalId, { identityId = '', workspaceId = '' } = {}) {
    let removed = false;
    await this.updateSecrets(secrets => {
      let target;
      if (workspaceId && identityId) {
        target = secrets.workspaces?.[workspaceId]?.identities?.[identityId]?.totpSecrets;
      } else if (identityId) {
        target = secrets.managedIdentities?.[identityId]?.totpSecrets;
      } else {
        target = secrets.totpSecrets;
      }
      removed = Boolean(target?.[portalId]);
      if (target) delete target[portalId];
      if (secrets.lastTotpValidation) delete secrets.lastTotpValidation[portalId];
      secrets.allowAutomatedTotp = hasStoredTotp(secrets);
    });
    return { ok: true, removed };
  }

  async savePortalCredentials(portalId, { username, password, oab, uf, identityId = '', workspaceId = '' }) {
    await this.updateSecrets(secrets => {
      let target;
      if (workspaceId && identityId) {
        secrets.workspaces ||= {};
        secrets.workspaces[workspaceId] ||= { identities: {} };
        secrets.workspaces[workspaceId].identities[identityId] ||= { portalCredentials: {}, totpSecrets: {} };
        target = secrets.workspaces[workspaceId].identities[identityId].portalCredentials;
      } else if (identityId) {
        target = ensureManagedIdentity(secrets, identityId).portalCredentials;
      } else {
        target = (secrets.portalCredentials ||= {});
      }

      target[portalId] = {
        username: String(username || '').trim(),
        password: String(password || ''),
        oab: String(oab || '').trim(),
        uf: String(uf || '').trim().toUpperCase(),
        updatedAt: new Date().toISOString()
      };
    });
    return { ok: true, portalId, configured: true };
  }

  async removePortalCredentials(portalId) {
    await this.updateSecrets(secrets => {
      if (secrets.portalCredentials) delete secrets.portalCredentials[portalId];
    });
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

  async getProcessAccessKey(processNumber, userId = '', portalId = '') {
    const cnj = String(processNumber || '').replace(/\D/g, '');
    const secrets = await this.readRawSecrets();
    const dict = secrets.processAccessKeys || {};
    const candidates = [];
    const pushCandidate = (...args) => {
      try { candidates.push(processAccessKeyId(processNumber, ...args)); } catch {}
    };
    if (portalId) {
      if (userId) pushCandidate(userId, portalId);
      pushCandidate(WORKSPACE_ACCESS_KEY_OWNER, portalId);
    }
    if (userId) pushCandidate(userId);
    if (!userId && !portalId) pushCandidate(WORKSPACE_ACCESS_KEY_OWNER);
    for (const id of candidates) {
      const scopedKey = dict[id]?.accessKey;
      if (scopedKey) return scopedKey;
    }
    // Chave do workspace gravada pelo coletor A1 com escopo portal/grau: quando o
    // chamador não informa portal (ex.: consulta processual genérica), localiza por
    // identidade estável (owner + CNJ). Com portal explícito, o escopo é respeitado.
    if (!portalId && cnj.length === 20) {
      const suffix = `:${cnj}`;
      for (const [id, entry] of Object.entries(dict)) {
        if (id.startsWith(`${WORKSPACE_ACCESS_KEY_OWNER}:`) && id.endsWith(suffix) && entry?.accessKey) {
          return entry.accessKey;
        }
      }
    }
    return null;
  }

  /**
   * Existe alguma chave guardada para este CNJ, de qualquer dono (coletor ou
   * registro manual)? Usado pela reconciliação do sweep para nunca limpar a
   * marca de "chave armazenada" quando o cofre ainda guarda a chave.
   */
  async hasAnyProcessAccessKey(processNumber) {
    const cnj = String(processNumber || '').replace(/\D/g, '');
    if (cnj.length !== 20) return false;
    const secrets = await this.readRawSecrets();
    const dict = secrets.processAccessKeys || {};
    const suffix = `:${cnj}`;
    return Object.entries(dict).some(([id, entry]) => id.endsWith(suffix) && Boolean(entry?.accessKey));
  }

  async saveProcessAccessKey(processNumber, { accessKey, userId = '', portalId = '' } = {}) {    const normalized = String(accessKey || '').trim();
    if (normalized.length < 4 || normalized.length > 500) {
      throw Object.assign(new Error('A chave de acesso deve conter entre 4 e 500 caracteres.'), { statusCode: 400 });
    }
    const keyId = processAccessKeyId(processNumber, userId, portalId);
    await this.updateSecrets(secrets => {
      secrets.processAccessKeys ||= {};
      secrets.processAccessKeys[keyId] = {
        accessKey: normalized,
        portalId: portalId || null,
        updatedAt: new Date().toISOString()
      };
    });
    return { ok: true, configured: true, keyId };
  }

  async removeProcessAccessKey(processNumber, userId = '', portalId = '') {
    const id = processAccessKeyId(processNumber, userId, portalId);
    let removed = false;
    await this.updateSecrets(secrets => {
      removed = Boolean(secrets.processAccessKeys?.[id]);
      if (secrets.processAccessKeys) delete secrets.processAccessKeys[id];
    });
    return { ok: true, removed };
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

function hasStoredTotp(secrets) {
  if (Object.keys(secrets.totpSecrets || {}).length > 0) return true;
  if (Object.values(secrets.managedIdentities || {}).some(identity => Object.keys(identity?.totpSecrets || {}).length > 0)) return true;
  return Object.values(secrets.workspaces || {}).some(workspace =>
    Object.values(workspace?.identities || {}).some(identity => Object.keys(identity?.totpSecrets || {}).length > 0)
  );
}

function processAccessKeyId(processNumber, userId, portalId = '') {
  const cnj = String(processNumber || '').replace(/\D/g, '');
  const owner = String(userId || '').trim().toLocaleLowerCase('pt-BR');
  if (cnj.length !== 20 || !owner) throw Object.assign(new Error('Usuário e processo são obrigatórios para guardar a chave de acesso.'), { statusCode: 400 });
  const portal = portalId ? portalId.trim().toLowerCase() : '';
  return portal ? `${owner}:${portal}:${cnj}` : `${owner}:${cnj}`;
}

export function getScopeCandidates(scope) {
  if (!scope) return [];
  if (scope === 'trf4-region' || scope === 'trf4-eproc') {
    return ['trf4-region', 'trf4-eproc'];
  }
  return [scope];
}

export function lookupByPortalOrScope(dict, portalId, scope) {
  if (!dict || typeof dict !== 'object') return null;
  // 1. Canonical and registry-approved legacy portal keys have strict priority
  for (const candidate of getPortalCredentialKeyCandidates(portalId)) {
    if (dict[candidate]) return dict[candidate];
  }
  // 2. Regional scopes
  for (const s of getScopeCandidates(scope)) {
    if (dict[s]) return dict[s];
  }
  return null;
}

function siblingDegreePortalIds(portalId) {
  const id = String(portalId || '').trim().toLowerCase();
  if (!id) return [];
  if (id.endsWith('-1g')) return [`${id.slice(0, -3)}-2g`];
  if (id.endsWith('-2g')) return [`${id.slice(0, -3)}-1g`];
  return [];
}

/**
 * O 2FA do eproc é por tribunal: 1G e 2G compartilham o mesmo QR, e a família
 * TRF4 (TRF4/JFRS/JFSC/JFPR) compartilha o mesmo vínculo regional. Este fallback
 * resolve vínculos salvos em chaves legadas de outro grau/portal da mesma família.
 */
export function lookupSiblingDegreeTotp(dict, portalId) {
  const scope = getCredentialScopeForPortal(portalId);
  const candidates = siblingDegreePortalIds(portalId);
  if (scope === 'trf4-eproc') {
    candidates.push('trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g');
  }
  for (const candidate of candidates) {
    const found = lookupByPortalOrScope(dict, candidate, getCredentialScopeForPortal(candidate));
    if (found) return found;
  }
  return null;
}

