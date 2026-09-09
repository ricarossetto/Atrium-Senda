import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SecurityManager } from '../security.mjs';
import {
  CURRENT_SCHEMA_VERSION,
  CURRENT_DATA_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  CURRENT_UI_SCHEMA_VERSION
} from '../state-migrations.mjs';

/**
 * ATRIUM — SaaS Multi-Tenant Manager
 * 
 * Gerencia o ciclo de vida de múltiplos escritórios de advocacia (Tenants),
 * garantindo isolamento criptográfico e de diretório estrito em conformidade
 * com o sigilo profissional da OAB e LGPD.
 */

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'app', 'www', 'mail', 'smtp', 'pop', 'imap', 'ftp',
  'static', 'assets', 'cdn', 'auth', 'billing', 'support', 'help', 'status',
  'dev', 'staging', 'test', 'master', 'root', 'saas', 'atrium', 'senda'
]);

export class TenantManager {
  constructor(options = {}) {
    this.rootDataDirectory = path.resolve(options.dataDirectory || path.join(process.cwd(), 'data'));
    this.systemDirectory = path.join(this.rootDataDirectory, 'system');
    this.tenantsDirectory = path.join(this.rootDataDirectory, 'tenants');
    this.catalogFile = path.join(this.systemDirectory, 'tenants.json');
    this.sessionSecret = options.sessionSecret || process.env.AUTH_SESSION_SECRET;
    this.encryptionKey = options.encryptionKey || process.env.AUTH_ENCRYPTION_KEY;
    this.secureCookies = Boolean(options.secureCookies);
    this.baseDomain = options.baseDomain || process.env.BASE_DOMAIN || 'atrium.adv.br';
    this.tenants = new Map(); // slug -> tenantRecord
  }

  async init() {
    await mkdir(this.systemDirectory, { recursive: true });
    await mkdir(this.tenantsDirectory, { recursive: true });

    if (existsSync(this.catalogFile)) {
      try {
        const raw = await readFile(this.catalogFile, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const t of list) {
            this.tenants.set(t.slug, t);
          }
        }
      } catch (err) {
        console.error('[TenantManager] Erro ao carregar catálogo de tenants:', err.message);
      }
    } else {
      await this.saveCatalog();
    }
  }

  async saveCatalog() {
    const list = Array.from(this.tenants.values());
    await writeFile(this.catalogFile, JSON.stringify(list, null, 2), 'utf8');
  }

  validateSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return { valid: false, reason: 'O subdomínio é obrigatório.' };
    }
    const clean = slug.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 30) {
      return { valid: false, reason: 'O subdomínio deve ter entre 3 e 30 caracteres.' };
    }
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(clean)) {
      return { valid: false, reason: 'O subdomínio pode conter apenas letras minúsculas, números e hífens.' };
    }
    if (RESERVED_SLUGS.has(clean)) {
      return { valid: false, reason: 'Este subdomínio é reservado pelo sistema.' };
    }
    if (this.tenants.has(clean)) {
      return { valid: false, reason: 'Este subdomínio já está em uso por outro escritório.' };
    }
    return { valid: true, slug: clean };
  }

  getTenantBySlug(slug) {
    if (!slug) return null;
    return this.tenants.get(String(slug).trim().toLowerCase()) || null;
  }

  getTenantById(id) {
    if (!id) return null;
    for (const t of this.tenants.values()) {
      if (t.id === id) return t;
    }
    return null;
  }

  listTenants() {
    return Array.from(this.tenants.values()).map(t => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      ownerEmail: t.ownerEmail,
      oab: t.oab,
      oabUf: t.oabUf,
      status: t.status,
      plan: t.plan,
      createdAt: t.createdAt
    }));
  }

  getTenantDataDir(tenantId) {
    return path.join(this.tenantsDirectory, tenantId);
  }

  /**
   * Cria um novo escritório (Tenant) com isolamento criptográfico completo.
   */
  async createTenant({ name, slug, ownerName, ownerEmail, oab = '', oabUf = '', password, plan = 'pro' }) {
    const slugCheck = this.validateSlug(slug);
    if (!slugCheck.valid) {
      throw Object.assign(new Error(slugCheck.reason), { statusCode: 400 });
    }
    const cleanSlug = slugCheck.slug;

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      throw Object.assign(new Error('Informe o nome da banca ou escritório.'), { statusCode: 400 });
    }
    if (!ownerName || typeof ownerName !== 'string' || ownerName.trim().length < 3) {
      throw Object.assign(new Error('Informe o nome do advogado responsável.'), { statusCode: 400 });
    }
    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      throw Object.assign(new Error('Informe um e-mail corporativo válido.'), { statusCode: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'), { statusCode: 400 });
    }

    const tenantId = `tenant_${cleanSlug}_${randomBytes(4).toString('hex')}`;
    const tenantDir = this.getTenantDataDir(tenantId);

    // 1. Cria a estrutura isolada de diretórios do escritório
    await mkdir(path.join(tenantDir, 'documents'), { recursive: true });
    await mkdir(path.join(tenantDir, 'recovery'), { recursive: true });
    await mkdir(path.join(tenantDir, 'feedback'), { recursive: true });
    await mkdir(path.join(tenantDir, 'migrations', 'pre-migration'), { recursive: true });

    // 2. Cria o SecurityManager isolado do escritório
    const tenantSecurity = new SecurityManager({
      dataDirectory: tenantDir,
      sessionSecret: this.sessionSecret,
      encryptionKey: this.encryptionKey,
      secureCookies: this.secureCookies
    });
    await tenantSecurity.init();

    // 3. Cadastra o Administrador Principal (Master Admin) do escritório
    const username = ownerEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const setupResult = await tenantSecurity.beginSetup({
      username,
      displayName: ownerName.trim(),
      email: ownerEmail.trim().toLowerCase(),
      oab: oab ? String(oab).trim() : undefined,
      oabUf: oabUf ? String(oabUf).trim().toUpperCase() : undefined,
      enableMonitoring: Boolean(oab && oabUf),
      password
    }, '127.0.0.1');

    const finishResult = await tenantSecurity.finishSetup({
      setupToken: setupResult.setupToken,
      skipMfa: true
    });

    // 4. Inicializa o envelope criptografado do banco de dados (app-state.json)
    const initialAppState = {
      appVersion: '2.1.1',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      dataVersion: CURRENT_DATA_VERSION,
      runtimeSchemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
      uiSchemaVersion: CURRENT_UI_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
      tenant: {
        id: tenantId,
        slug: cleanSlug,
        name: name.trim()
      },
      officeIdentity: {
        legalName: name.trim(),
        tradeName: name.trim(),
        document: '',
        oabRegistry: oab ? `${oab}/${oabUf}` : '',
        email: ownerEmail.trim().toLowerCase(),
        phone: '',
        address: ''
      },
      processes: [],
      contacts: [],
      tasks: [],
      intimations: [],
      events: [],
      financial: {
        transactions: [],
        categories: []
      },
      settings: {
        officeName: name.trim(),
        theme: 'mineral',
        notificationsEnabled: true
      },
      taskDefinitions: [
        { id: 'task-def-1', name: 'Elaborar Petição Inicial', points: 10, phase: 'Inicial', active: true },
        { id: 'task-def-2', name: 'Contestação', points: 15, phase: 'Defesa', active: true },
        { id: 'task-def-3', name: 'Cumprimento de Prazo', points: 5, phase: 'Instrução', active: true }
      ],
      actionGroups: [
        { id: 'ag-1', name: 'Ação Cível Comum', active: true },
        { id: 'ag-2', name: 'Trabalhista', active: true },
        { id: 'ag-3', name: 'Previdenciário', active: true }
      ]
    };

    const envelope = {
      version: CURRENT_SCHEMA_VERSION,
      encrypted: tenantSecurity.encrypt(JSON.stringify(initialAppState)),
      updatedAt: new Date().toISOString(),
      revision: randomBytes(12).toString('hex')
    };

    await writeFile(path.join(tenantDir, 'app-state.json'), JSON.stringify(envelope, null, 2), 'utf8');

    // 5. Registra o Tenant no catálogo mestre
    const tenantRecord = {
      id: tenantId,
      slug: cleanSlug,
      name: name.trim(),
      ownerName: ownerName.trim(),
      ownerEmail: ownerEmail.trim().toLowerCase(),
      oab: oab ? String(oab).trim() : '',
      oabUf: oabUf ? String(oabUf).trim().toUpperCase() : '',
      status: 'active',
      plan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.tenants.set(cleanSlug, tenantRecord);
    await this.saveCatalog();

    console.log(`[TenantManager] Novo escritório criado com sucesso: ${tenantRecord.name} (https://${cleanSlug}.${this.baseDomain})`);

    return {
      tenant: tenantRecord,
      sessionToken: finishResult.token,
      csrfToken: finishResult.csrfToken,
      user: finishResult.user,
      subdomain: cleanSlug,
      url: `https://${cleanSlug}.${this.baseDomain}`
    };
  }

  /**
   * Resolve o Tenant a partir da requisição HTTP (subdomínio, cabeçalho ou query param).
   */
  resolveTenant(req) {
    // 1. Cabeçalho explícito (prioridade de testes/desenvolvimento)
    const headerSlug = req.headers['x-tenant-slug'] || req.headers['x-tenant-id'];
    if (headerSlug) {
      const bySlug = this.getTenantBySlug(headerSlug);
      if (bySlug) return bySlug;
      const byId = this.getTenantById(headerSlug);
      if (byId) return byId;
    }

    // 2. Query param (ex: ?tenant=rossetto)
    try {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url, `http://${host}`);
      const queryTenant = url.searchParams.get('tenant');
      if (queryTenant) {
        const found = this.getTenantBySlug(queryTenant);
        if (found) return found;
      }
    } catch {}

    // 3. Subdomínio (ex: rossetto.atrium.adv.br)
    const host = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (host && host.includes('.')) {
      const parts = host.split('.');
      if (parts.length >= 3) {
        const sub = parts[0];
        if (!RESERVED_SLUGS.has(sub)) {
          const found = this.getTenantBySlug(sub);
          if (found) return found;
        }
      }
    }

    return null;
  }
}
