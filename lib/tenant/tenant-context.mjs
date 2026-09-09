import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SecurityManager } from '../security.mjs';
import { JudicialOrchestrator } from '../judicial/orchestrator.mjs';
import { EmailService } from '../email/email-service.mjs';
import {
  EncryptedLocalDocumentStorageProvider,
  assertDocumentStorageProvider
} from '../documents/document-storage-provider.mjs';
import { CURRENT_SCHEMA_VERSION, validateAppState } from '../state-migrations.mjs';

/**
 * Representa o contexto de execução isolado de um escritório específico (Tenant).
 */
export class TenantContext {
  constructor(tenantRecord, dataDirectory, globalOptions = {}) {
    this.tenant = tenantRecord;
    this.dataDirectory = dataDirectory;
    this.appStateFile = path.join(dataDirectory, 'app-state.json');
    this.globalOptions = globalOptions;

    this.security = new SecurityManager({
      dataDirectory,
      sessionSecret: globalOptions.sessionSecret || process.env.AUTH_SESSION_SECRET,
      encryptionKey: globalOptions.encryptionKey || process.env.AUTH_ENCRYPTION_KEY,
      secureCookies: Boolean(globalOptions.secureCookies)
    });

    this.judicialOrchestrator = new JudicialOrchestrator({
      dataDirectory,
      securityManager: this.security,
      portalsConfig: globalOptions.portalsConfig || []
    });

    this.emailService = new EmailService({
      dataDirectory,
      securityManager: this.security
    });

    this.documentStorage = assertDocumentStorageProvider(
      new EncryptedLocalDocumentStorageProvider({
        dataDirectory,
        securityManager: this.security
      })
    );

    this.appStateMutationTail = Promise.resolve();
  }

  async init() {
    await this.security.init();
    await this.judicialOrchestrator.init();
    await this.emailService.init();
    await this.documentStorage.init();
  }

  enqueueMutation(operation) {
    const queued = this.appStateMutationTail.then(operation, operation);
    this.appStateMutationTail = queued.catch(() => {});
    return queued;
  }

  async readStateEnvelope() {
    if (!existsSync(this.appStateFile)) {
      return { state: null, revision: null };
    }
    try {
      const raw = await readFile(this.appStateFile, 'utf8');
      const envelope = JSON.parse(raw);
      const decrypted = JSON.parse(this.security.decrypt(envelope.encrypted));
      return {
        state: decrypted,
        revision: envelope.revision || envelope.updatedAt || null
      };
    } catch (err) {
      console.error(`[TenantContext:${this.tenant.slug}] Falha ao ler envelope:`, err.message);
      return { state: null, revision: null };
    }
  }

  async readState() {
    const env = await this.readStateEnvelope();
    return env.state;
  }

  async saveStateDirect(value, expectedRevision = null) {
    return this.enqueueMutation(async () => {
      if (!value || typeof value !== 'object') {
        throw Object.assign(new Error('Estado inválido.'), { statusCode: 400 });
      }

      value.schemaVersion = CURRENT_SCHEMA_VERSION;
      validateAppState(value, CURRENT_SCHEMA_VERSION);

      const previous = await this.readStateEnvelope();
      if (expectedRevision && previous.revision && previous.revision !== expectedRevision) {
        throw Object.assign(new Error('Conflito de concorrência: o registro foi modificado por outro usuário.'), {
          statusCode: 409,
          code: 'STATE_REVISION_CONFLICT'
        });
      }

      const nextRevision = randomBytes(12).toString('hex');
      const envelope = {
        version: CURRENT_SCHEMA_VERSION,
        encrypted: this.security.encrypt(JSON.stringify(value)),
        updatedAt: new Date().toISOString(),
        revision: nextRevision
      };

      await writeFile(this.appStateFile, JSON.stringify(envelope, null, 2), 'utf8');
      return { ok: true, revision: nextRevision };
    });
  }
}

/**
 * Cache e Fábrica de TenantContext para evitar recriar instâncias pesadas a cada request.
 */
export class TenantContextRegistry {
  constructor(tenantManager, globalOptions = {}) {
    this.tenantManager = tenantManager;
    this.globalOptions = globalOptions;
    this.contexts = new Map(); // tenantId -> TenantContext
  }

  async getContextForTenant(tenantRecord) {
    if (!tenantRecord) return null;

    let ctx = this.contexts.get(tenantRecord.id);
    if (!ctx) {
      const dataDir = this.tenantManager.getTenantDataDir(tenantRecord.id);
      ctx = new TenantContext(tenantRecord, dataDir, this.globalOptions);
      await ctx.init();
      this.contexts.set(tenantRecord.id, ctx);
    }
    return ctx;
  }

  async resolveContextFromRequest(req) {
    const tenantRecord = this.tenantManager.resolveTenant(req);
    if (!tenantRecord) return null;
    return this.getContextForTenant(tenantRecord);
  }

  async getContextById(tenantId) {
    const tenantRecord = this.tenantManager.getTenantById(tenantId);
    return this.getContextForTenant(tenantRecord);
  }
}
