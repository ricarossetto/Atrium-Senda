import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { TenantManager } from '../lib/tenant/tenant-manager.mjs';
import { TenantContextRegistry } from '../lib/tenant/tenant-context.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — MULTI-TENANT ISOLATION & SAAS ENGINE TEST SUITE     ');
console.log('===============================================================\n');

const testBaseDir = await mkdtemp(path.join(tmpdir(), 'atrium-multitenant-test-'));

try {
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');

  const tenantManager = new TenantManager({
    dataDirectory: testBaseDir,
    sessionSecret,
    encryptionKey,
    secureCookies: false,
    baseDomain: 'atrium.adv.br'
  });
  await tenantManager.init();

  const registry = new TenantContextRegistry(tenantManager, {
    sessionSecret,
    encryptionKey
  });

  // 1. Validação de Slugs e Nomes Reservados
  console.log('[Teste 1] Validação de regras de subdomínio/slug...');
  assert.equal(tenantManager.validateSlug('api').valid, false);
  assert.equal(tenantManager.validateSlug('admin').valid, false);
  assert.equal(tenantManager.validateSlug('www').valid, false);
  assert.equal(tenantManager.validateSlug('ab').valid, false); // muito curto
  assert.equal(tenantManager.validateSlug('slug_invalido').valid, false); // underline proibido em subdomínios
  assert.equal(tenantManager.validateSlug('escritorio-silva').valid, true);

  // 2. Criação do Tenant A (Alfa Advocacia)
  console.log('[Teste 2] Criação isolada do Tenant A (Alfa)...');
  const tenantA = await tenantManager.createTenant({
    name: 'Alfa Advocacia e Consultoria',
    slug: 'alfa-adv',
    ownerName: 'Dra. Alice Alfa',
    ownerEmail: 'alice@alfa.adv.br',
    oab: '12345',
    oabUf: 'RS',
    password: 'SenhaForteAlfa2026!'
  });

  assert.ok(tenantA.tenant.id.startsWith('tenant_alfa-adv_'));
  assert.equal(tenantA.subdomain, 'alfa-adv');
  assert.ok(tenantA.sessionToken);

  // 3. Criação do Tenant B (Beta Associados)
  console.log('[Teste 3] Criação isolada do Tenant B (Beta)...');
  const tenantB = await tenantManager.createTenant({
    name: 'Beta & Associados',
    slug: 'beta-law',
    ownerName: 'Dr. Bruno Beta',
    ownerEmail: 'bruno@beta.adv.br',
    oab: '67890',
    oabUf: 'SP',
    password: 'SenhaForteBeta2026!'
  });

  assert.ok(tenantB.tenant.id.startsWith('tenant_beta-law_'));
  assert.notEqual(tenantA.tenant.id, tenantB.tenant.id);

  // 4. Tentativa de colisão de Slug
  console.log('[Teste 4] Prevenção de duplicidade de subdomínio...');
  await assert.rejects(
    () => tenantManager.createTenant({
      name: 'Outro Alfa',
      slug: 'alfa-adv',
      ownerName: 'Dr. Outro',
      ownerEmail: 'outro@alfa.adv.br',
      password: 'SenhaOutro2026!'
    }),
    /já está em uso/i
  );

  // 5. Isolamento de Contexto e Banco de Dados (app-state.json)
  console.log('[Teste 5] Verificação de sigilo e isolamento total de dados entre A e B...');
  const ctxA = await registry.getContextForTenant(tenantA.tenant);
  const ctxB = await registry.getContextForTenant(tenantB.tenant);

  // Tenant A cadastra um processo confidencial
  const stateA = await ctxA.readState();
  assert.equal(stateA.processes.length, 0);
  stateA.processes.push({
    id: 'proc-alfa-001',
    number: '5001234-56.2026.8.21.0001',
    client: 'Cliente Confidencial Alfa',
    secrecy: true
  });
  await ctxA.saveStateDirect(stateA);

  // Tenant B lê o seu próprio estado
  const stateB = await ctxB.readState();
  assert.equal(stateB.processes.length, 0, 'Tenant B JAMAIS deve ver processos do Tenant A!');
  assert.notEqual(stateB.tenant.id, stateA.tenant.id);
  assert.equal(stateB.tenant.slug, 'beta-law');
  assert.equal(stateA.tenant.slug, 'alfa-adv');

  // 6. Isolamento Criptográfico e de Autenticação
  console.log('[Teste 6] Isolamento de credenciais e senhas...');
  // Login com senha de Alice no SecurityManager do Tenant B deve ser rejeitado
  await assert.rejects(
    () => ctxB.security.login({ username: 'alice', password: 'SenhaForteAlfa2026!' }, '127.0.0.1', 'test-agent'),
    /Usuário ou senha inválido/i
  );

  // Login de Alice no Tenant A correto deve funcionar
  const loginA = await ctxA.security.login({ username: 'alice', password: 'SenhaForteAlfa2026!' }, '127.0.0.1', 'test-agent');
  assert.ok(loginA.token);
  assert.equal(loginA.user.username, 'alice');

  // 7. Isolamento de Documentos em Disco
  console.log('[Teste 7] Isolamento de acervo de documentos em disco...');
  const docPayload = Buffer.from('PETIÇÃO INICIAL CONFIDENCIAL DO CLIENTE ALFA');
  const docMeta = await ctxA.documentStorage.put(docPayload);
  assert.ok(docMeta.checksum);

  // O arquivo físico existe no diretório do Tenant A
  const pathA = ctxA.documentStorage.blobPath(docMeta.checksum);
  assert.ok(pathA.includes(tenantA.tenant.id));
  assert.ok(!pathA.includes(tenantB.tenant.id));

  // Tenant A consegue recuperar o documento descriptografado
  const docFromA = await ctxA.documentStorage.get(docMeta.checksum);
  assert.equal(docFromA.toString(), docPayload.toString());

  // Tenant B tenta obter o documento do Tenant A -> deve lançar 404 (não encontrado)
  await assert.rejects(
    () => ctxB.documentStorage.get(docMeta.checksum),
    /Conteúdo documental não encontrado/i
  );

  // 8. Resolução de Tenants por Requisição HTTP
  console.log('[Teste 8] Resolução dinâmica por Subdomínio e Headers...');
  // Header
  const reqHeader = { headers: { 'x-tenant-slug': 'alfa-adv' }, url: '/api/state' };
  assert.equal(tenantManager.resolveTenant(reqHeader)?.slug, 'alfa-adv');

  // Subdomínio
  const reqSubdomain = { headers: { host: 'beta-law.atrium.adv.br' }, url: '/api/state' };
  assert.equal(tenantManager.resolveTenant(reqSubdomain)?.slug, 'beta-law');

  // Query parameter
  const reqQuery = { headers: { host: 'atrium.adv.br' }, url: '/api/state?tenant=alfa-adv' };
  assert.equal(tenantManager.resolveTenant(reqQuery)?.slug, 'alfa-adv');

  // Domínio raiz sem subdomínio (SaaS Landing Page)
  const reqRoot = { headers: { host: 'atrium.adv.br' }, url: '/' };
  assert.equal(tenantManager.resolveTenant(reqRoot), null, 'Domínio raiz deve resolver null para abrir o portal SaaS!');

  console.log('\n✅ TODOS OS 8 TESTES DE ISOLAMENTO MULTI-TENANT PASSARAM COM 100% DE SUCESSO!\n');
} finally {
  await rm(testBaseDir, { recursive: true, force: true });
}
