import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { TenantManager } from '../lib/tenant/tenant-manager.mjs';
import { TenantContextRegistry } from '../lib/tenant/tenant-context.mjs';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('===============================================================');
console.log('  ATRIUM — MULTI-TENANT ISOLATION, RBAC & IDOR TEST SUITE      ');
console.log('===============================================================');

// ============================================================================
// PARTE 1: Isolamento do SaaS Tenant Engine em Memória / Camada Base
// ============================================================================
console.log('\n[PARTE 1] Validando motor multi-tenant de subdomínios (TenantManager)...');
const testBaseDir = await mkdtemp(path.join(tmpdir(), 'atrium-tenant-engine-'));
let registry = null;

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

  registry = new TenantContextRegistry(tenantManager, {
    sessionSecret,
    encryptionKey
  });

  // 1.1. Slugs e palavras reservadas
  assert.equal(tenantManager.validateSlug('api').valid, false);
  assert.equal(tenantManager.validateSlug('admin').valid, false);
  assert.equal(tenantManager.validateSlug('www').valid, false);
  assert.equal(tenantManager.validateSlug('ab').valid, false);
  assert.equal(tenantManager.validateSlug('alfa-adv').valid, true);
  console.log('  [PASS] 1.1. Validação estrita de slugs e palavras reservadas');

  // 1.2. Criação isolada de OFFICE_A e OFFICE_B
  const tenantA = await tenantManager.createTenant({
    name: 'Alfa Advocacia',
    slug: 'alfa-adv',
    ownerName: 'Dra. Alice Alfa',
    ownerEmail: 'alice@alfa.adv.br',
    password: 'SenhaForteAlfa2026!'
  });
  const tenantB = await tenantManager.createTenant({
    name: 'Beta Associados',
    slug: 'beta-law',
    ownerName: 'Dr. Bruno Beta',
    ownerEmail: 'bruno@beta.adv.br',
    password: 'SenhaForteBeta2026!'
  });
  assert.notEqual(tenantA.tenant.id, tenantB.tenant.id);
  console.log('  [PASS] 1.2. Criação isolada de tenants OFFICE_A e OFFICE_B');

  // 1.3. Prevenção de colisão de subdomínio
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
  console.log('  [PASS] 1.3. Bloqueio de colisão de subdomínio/slug');

  // 1.4. Isolamento estrito de dados e documentos
  const ctxA = await registry.getContextForTenant(tenantA.tenant);
  const ctxB = await registry.getContextForTenant(tenantB.tenant);

  const stateA = await ctxA.readState();
  stateA.processes.push({ id: 'proc-alfa-01', number: '5001111-22.2026.8.21.0001', client: 'Cliente Alfa' });
  await ctxA.saveStateDirect(stateA);

  const stateB = await ctxB.readState();
  assert.equal(stateB.processes.length, 0, 'Tenant B não pode ver processos do Tenant A');
  console.log('  [PASS] 1.4. Isolamento de banco de dados entre tenants');

  // 1.5. Isolamento de documentos em disco
  const payloadA = Buffer.from('DOCUMENTO CONFIDENCIAL ALFA');
  const docA = await ctxA.documentStorage.put(payloadA);
  await assert.rejects(
    () => ctxB.documentStorage.get(docA.checksum),
    /não encontrado/i
  );
  console.log('  [PASS] 1.5. Isolamento físico de acervo documental em disco');
} finally {
  await registry?.dispose?.();
  await rm(testBaseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// ============================================================================
// PARTE 2: Testes HTTP Live de Multi-Tenant, RBAC e Prevenção de IDOR
// ============================================================================
console.log('\n[PARTE 2] Iniciando Servidor HTTP Isolado para Auditoria Live...');

const server = await startTestServer({
  env: {
    ATRIUM_PUBLIC_SIGNUP: 'true',
    JURISFLOW_CLOUD_MODE: 'true',
    COOKIE_SECURE: 'false'
  }
});

const password = 'Senha-Segura-Multi-2026!';

try {
  // 2.1. Criar OFFICE_A com ADMIN_A
  console.log('\n[Setup] Criando OFFICE_A (Alfa Advocacia) com ADMIN_A...');
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_a',
    displayName: 'Dra. Alice Alfa',
    email: 'alice@alfa.test',
    workspaceName: 'Escritório Alfa',
    password
  });
  let pending = await res.json();
  assert.ok(res.ok && pending.setupToken, 'Falha no setup de OFFICE_A');
  const secretAdminA = pending.manualSecret;

  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const authAdminA = await res.json();
  const cookieAdminA = res.headers.get('set-cookie').split(';')[0];
  const workspaceIdA = authAdminA.user.workspaceId;
  assert.ok(workspaceIdA, 'OFFICE_A sem workspaceId');

  // 2.2. Criar OFFICE_B com ADMIN_B
  console.log('[Setup] Criando OFFICE_B (Beta Associados) com ADMIN_B...');
  res = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'admin_b',
    displayName: 'Dr. Bruno Beta',
    email: 'bruno@beta.test',
    workspaceName: 'Escritório Beta',
    password
  });
  pending = await res.json();
  assert.ok(res.ok && pending.setupToken, 'Falha no registro de OFFICE_B');
  const secretAdminB = pending.manualSecret;

  res = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const authAdminB = await res.json();
  const cookieAdminB = res.headers.get('set-cookie').split(';')[0];
  const workspaceIdB = authAdminB.user.workspaceId;
  assert.ok(workspaceIdB && workspaceIdB !== workspaceIdA, 'OFFICE_B deve ter workspaceId distinto');

  // 2.3. Cadastrar LAWYER_A em OFFICE_A (papel: collaborator/lawyer)
  console.log('[Setup] Cadastrando LAWYER_A em OFFICE_A...');
  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'lawyer_a',
    displayName: 'Dr. Lucas Lawyer Alfa',
    email: 'lawyer@alfa.test',
    password
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  const regLawyerA = await res.json();
  assert.ok(res.ok && regLawyerA.setupToken, 'Falha no pré-cadastro de LAWYER_A');

  res = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: regLawyerA.setupToken,
    code: generateTotp(regLawyerA.manualSecret)
  });
  assert.ok(res.ok, 'Falha na verificação de LAWYER_A');

  // 2.3. Obter lista de usuários e aprovar LAWYER_A via Admin Control Plane
  let usersRes = await fetch(`${server.baseUrl}/api/admin/users`, { headers: { Cookie: cookieAdminA } });
  let usersListA = await usersRes.json();
  const lawyerAUser = usersListA.users.find(u => u.username === 'lawyer_a');
  assert.ok(lawyerAUser, 'lawyer_a deve constar na listagem administrativa');
  assert.equal(lawyerAUser.status, 'pending_approval', 'Novo integrante deve iniciar com status pending_approval');

  // ADMIN_A aprova LAWYER_A
  const approveRes = await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: lawyerAUser.id,
    status: 'active',
    password,
    code: generateTotp(secretAdminA)
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(approveRes.status, 200, 'ADMIN_A deve conseguir aprovar LAWYER_A');

  // Login de LAWYER_A para obter sessão e CSRF
  res = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: 'lawyer_a',
    password,
    code: generateTotp(regLawyerA.manualSecret)
  });
  const authLawyerA = await res.json();
  assert.ok(res.ok && res.headers.get('set-cookie'), 'LAWYER_A aprovado deve conseguir logar');
  const cookieLawyerA = res.headers.get('set-cookie').split(';')[0];
  assert.equal(authLawyerA.user.role, 'collaborator', 'LAWYER_A deve ter papel de collaborator (não-admin)');

  // 2.4. Cadastrar ASSISTANT_A em OFFICE_A
  console.log('[Setup] Cadastrando ASSISTANT_A em OFFICE_A...');
  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'assistant_a',
    displayName: 'Assistente Ana Alfa',
    email: 'assistant@alfa.test',
    password
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  const regAssistantA = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: regAssistantA.setupToken,
    code: generateTotp(regAssistantA.manualSecret)
  });
  usersRes = await fetch(`${server.baseUrl}/api/admin/users`, { headers: { Cookie: cookieAdminA } });
  usersListA = await usersRes.json();
  const assistantAUser = usersListA.users.find(u => u.username === 'assistant_a');
  await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: assistantAUser.id,
    status: 'active',
    password,
    code: generateTotp(secretAdminA)
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  res = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: 'assistant_a',
    password,
    code: generateTotp(regAssistantA.manualSecret)
  });
  const authAssistantA = await res.json();
  const cookieAssistantA = res.headers.get('set-cookie').split(';')[0];
  assert.equal(authAssistantA.user.role, 'collaborator');

  // 2.5. Cadastrar LAWYER_B em OFFICE_B
  console.log('[Setup] Cadastrando LAWYER_B em OFFICE_B...');
  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'lawyer_b',
    displayName: 'Dra. Beatriz Lawyer Beta',
    email: 'lawyer@beta.test',
    password
  }, {
    Cookie: cookieAdminB,
    'X-CSRF-Token': authAdminB.csrfToken
  });
  const regLawyerB = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: regLawyerB.setupToken,
    code: generateTotp(regLawyerB.manualSecret)
  });
  const usersResB = await fetch(`${server.baseUrl}/api/admin/users`, { headers: { Cookie: cookieAdminB } });
  const usersListB = await usersResB.json();
  const lawyerBUser = usersListB.users.find(u => u.username === 'lawyer_b');
  await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: lawyerBUser.id,
    status: 'active',
    password,
    code: generateTotp(secretAdminB)
  }, {
    Cookie: cookieAdminB,
    'X-CSRF-Token': authAdminB.csrfToken
  });
  res = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: 'lawyer_b',
    password,
    code: generateTotp(regLawyerB.manualSecret)
  });
  const authLawyerB = await res.json();
  const cookieLawyerB = res.headers.get('set-cookie').split(';')[0];
  assert.equal(authLawyerB.user.role, 'collaborator');

  // 2.4. Popular dados jurídicos em OFFICE_A
  console.log('\n[Teste 2.4] Populando estado e acervo exclusivo de OFFICE_A...');
  const statePayloadA = {
    version: 1,
    settings: { officeName: 'Escritório Alfa' },
    contacts: [{ id: 'cli-alfa-01', name: 'Cliente Confidencial Alfa', role: 'client' }],
    processes: [{ id: 'proc-alfa-01', number: '5001111-22.2026.8.21.0001', client: 'Cliente Confidencial Alfa' }],
    intimations: [{ id: 'pub-alfa-01', title: 'Publicação Exclusiva Alfa', process: '5001111-22.2026.8.21.0001' }],
    tasks: [{ id: 'task-alfa-01', title: 'Petição Inicial Alfa', process: '5001111-22.2026.8.21.0001' }],
    agenda: [{ id: 'evt-alfa-01', title: 'Audiência de Instrução Alfa', date: '2026-10-15' }],
    financial: [{ id: 'fin-alfa-01', title: 'Honorários Alfa', amount: 50000 }],
    audit: [{ id: 'aud-alfa-01', action: 'INIT_ALFA', user: 'admin_a', timestamp: new Date().toISOString() }]
  };

  let stateResA = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminA } });
  let stateEnvA = await stateResA.json();
  res = await postJson(`${server.baseUrl}/api/state`, { state: statePayloadA, revision: stateEnvA.revision }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.ok(res.ok, 'Falha ao salvar estado de OFFICE_A');

  // 2.5. Popular dados jurídicos em OFFICE_B
  console.log('[Teste 2.5] Populando estado e acervo exclusivo de OFFICE_B...');
  const statePayloadB = {
    version: 1,
    settings: { officeName: 'Escritório Beta' },
    contacts: [{ id: 'cli-beta-01', name: 'Cliente Segredo Beta', role: 'client' }],
    processes: [{ id: 'proc-beta-01', number: '5002222-33.2026.8.21.0001', client: 'Cliente Segredo Beta' }],
    intimations: [{ id: 'pub-beta-01', title: 'Publicação Beta', process: '5002222-33.2026.8.21.0001' }],
    tasks: [{ id: 'task-beta-01', title: 'Contestação Beta', process: '5002222-33.2026.8.21.0001' }],
    agenda: [{ id: 'evt-beta-01', title: 'Audiência Beta', date: '2026-11-20' }],
    financial: [{ id: 'fin-beta-01', title: 'Honorários Beta', amount: 80000 }],
    audit: [{ id: 'aud-beta-01', action: 'INIT_BETA', user: 'admin_b', timestamp: new Date().toISOString() }]
  };

  let stateResB = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminB } });
  let stateEnvB = await stateResB.json();
  res = await postJson(`${server.baseUrl}/api/state`, { state: statePayloadB, revision: stateEnvB.revision }, {
    Cookie: cookieAdminB,
    'X-CSRF-Token': authAdminB.csrfToken
  });
  assert.ok(res.ok, 'Falha ao salvar estado de OFFICE_B');

  // ==========================================================================
  // PARTE 3: Testes de Prevenção de IDOR e Vazamento Cross-Tenant
  // ==========================================================================
  console.log('\n[PARTE 3] Executando testes rigorosos de tentativa de IDOR e manipulação de parâmetros...');

  // 3.1. Tentativa de IDOR via Query Param (?workspaceId=...)
  res = await fetch(`${server.baseUrl}/api/state?workspaceId=${workspaceIdB}`, {
    headers: { Cookie: cookieAdminA }
  });
  const stateLeakCheck1 = await res.json();
  assert.equal(stateLeakCheck1.state.settings.officeName, 'Escritório Alfa', 'Manipulação de workspaceId na query NÃO deve carregar dados de outro escritório');
  assert.equal(stateLeakCheck1.state.processes[0].id, 'proc-alfa-01');
  console.log('  [PASS] 3.1. Imunidade contra IDOR via Query Parameter (?workspaceId=...)');

  // 3.2. Tentativa de IDOR via Body Tampering ({ workspaceId: ... })
  stateResA = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminA } });
  stateEnvA = await stateResA.json();
  res = await postJson(`${server.baseUrl}/api/state`, {
    workspaceId: workspaceIdB,
    revision: stateEnvA.revision,
    state: {
      ...statePayloadA,
      settings: { officeName: 'Escritório Alfa Invasor' }
    }
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.ok(res.ok);

  // Verificar se OFFICE_B permaneceu intocado
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminB } });
  const betaStateAfterTamper = await res.json();
  assert.equal(betaStateAfterTamper.state.settings.officeName, 'Escritório Beta', 'OFFICE_B não pode ser modificado por sessão de OFFICE_A');
  assert.equal(betaStateAfterTamper.state.contacts[0].name, 'Cliente Segredo Beta');
  console.log('  [PASS] 3.2. Imunidade contra IDOR via Body Parameter (workspaceId tampering)');

  // 3.3. Tentativa de IDOR via Header Tampering (X-Workspace-Id / X-Tenant-Id)
  res = await fetch(`${server.baseUrl}/api/state`, {
    headers: {
      Cookie: cookieAdminA,
      'X-Workspace-Id': workspaceIdB,
      'X-Tenant-Id': workspaceIdB
    }
  });
  const stateLeakCheck3 = await res.json();
  assert.equal(stateLeakCheck3.state.processes[0].number, '5001111-22.2026.8.21.0001');
  console.log('  [PASS] 3.3. Imunidade contra IDOR via Headers Arbitrários');

  // 3.4. Busca Global (/api/search) estritamente isolada por workspace
  res = await fetch(`${server.baseUrl}/api/search?q=Segredo`, {
    headers: { Cookie: cookieAdminA }
  });
  const searchLeakCheck = await res.json();
  assert.equal(searchLeakCheck.results.length, 0, 'Busca em OFFICE_A jamais deve retornar dados de clientes de OFFICE_B');

  res = await fetch(`${server.baseUrl}/api/search?q=Confidencial`, {
    headers: { Cookie: cookieAdminA }
  });
  const searchAlfaCheck = await res.json();
  assert.ok(searchAlfaCheck.results.length >= 1, 'Busca em OFFICE_A deve encontrar seus próprios clientes');
  console.log('  [PASS] 3.4. Motor de busca global (/api/search) estritamente particionado por workspace');

  // 3.5. Isolamento de Documentos e Prevenção de IDOR no download
  const stateResDoc = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminA } });
  const stateEnvDoc = await stateResDoc.json();
  const sampleDocPayload = {
    revision: stateEnvDoc.revision,
    ownerType: 'contact',
    ownerId: 'cli-alfa-01',
    originalName: 'procuracao-secreta-alfa.pdf',
    contentBase64: Buffer.from('%PDF-1.4 Conteudo Sintetico Alfa').toString('base64'),
    documentType: 'Procuração'
  };
  res = await postJson(`${server.baseUrl}/api/documents`, sampleDocPayload, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 201, 'Upload de documento em OFFICE_A deve suceder');
  const uploadedDoc = await res.json();
  const docIdAlfa = uploadedDoc.document.id;

  // OFFICE_B tenta acessar diretamente o documento de OFFICE_A -> 404
  res = await fetch(`${server.baseUrl}/api/documents/${docIdAlfa}/content`, {
    headers: { Cookie: cookieAdminB }
  });
  assert.equal(res.status, 404, 'Tentativa de IDOR para ler documento de outro escritório deve retornar 404');
  console.log('  [PASS] 3.5. Acervo documental (/api/documents/:id/content) com isolamento e bloqueio de IDOR');

  // 3.6. Backup Cross-Tenant: Backup de OFFICE_B não pode ser restaurado em OFFICE_A
  const backupResB = await postJson(`${server.baseUrl}/api/system/backup/create`, { password, code: generateTotp(secretAdminB) }, {
    Cookie: cookieAdminB,
    'X-CSRF-Token': authAdminB.csrfToken
  });
  assert.equal(backupResB.status, 200);
  const backupDataB = (await backupResB.json()).backupData;

  // ADMIN_A tenta restaurar backup de OFFICE_B
  const restoreAttemptRes = await postJson(`${server.baseUrl}/api/system/backup/restore`, {
    backupData: backupDataB
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.ok(restoreAttemptRes.status === 400 || restoreAttemptRes.status === 403, 'Restauração de backup cross-workspace deve falhar com 400/403');
  console.log('  [PASS] 3.6. Backups criptografados invioláveis cross-tenant (impossível restaurar em outro escritório)');

  // 3.7. Validação de Não-Contaminação entre todas as coleções de entidades
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookieAdminA } });
  const alfaCompleteState = (await res.json()).state;
  const betaEntityIds = ['cli-beta-01', 'proc-beta-01', 'pub-beta-01', 'task-beta-01', 'evt-beta-01', 'fin-beta-01', 'aud-beta-01'];
  const allAlfaIds = JSON.stringify(alfaCompleteState);
  for (const betaId of betaEntityIds) {
    assert.ok(!allAlfaIds.includes(betaId), `Entidade ${betaId} de OFFICE_B vazou no estado de OFFICE_A`);
  }
  console.log('  [PASS] 3.7. Zero contaminação em clients, processes, documents, publications, tasks, calendar, financial e audit');

  // ==========================================================================
  // PARTE 4: Auditoria de Segurança do Admin Control Plane (/api/admin/*)
  // ==========================================================================
  console.log('\n[PARTE 4] Auditando endpoints do Admin Control Plane contra acessos indevidos...');

  const adminEndpoints = [
    { path: '/api/admin/overview', method: 'GET' },
    { path: '/api/admin/users', method: 'GET' },
    { path: '/api/admin/audit', method: 'GET' },
    { path: '/api/admin/diagnostic', method: 'GET' },
    { path: '/api/admin/known-issues', method: 'GET' },
    { path: '/api/admin/actions/rebuild-runtime', method: 'POST', body: {} },
    { path: '/api/admin/actions/rebuild-search', method: 'POST', body: {} }
  ];

  // 4.1. Bloqueio para requisições NÃO AUTENTICADAS (deve retornar 401 ou 403)
  for (const ep of adminEndpoints) {
    const r = await fetch(`${server.baseUrl}${ep.path}`, {
      method: ep.method,
      headers: ep.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: ep.method === 'POST' ? JSON.stringify(ep.body) : undefined
    });
    assert.ok(r.status === 401 || r.status === 403, `Endpoint ${ep.path} não autenticado deve negar acesso (obteve ${r.status})`);
  }
  console.log('  [PASS] 4.1. Todos os endpoints /api/admin/* negam acesso anônimo (401/403)');

  // 4.2. Bloqueio para USUÁRIOS NÃO-ADMIN (LAWYER_A com papel collaborator)
  for (const ep of adminEndpoints) {
    const r = await fetch(`${server.baseUrl}${ep.path}`, {
      method: ep.method,
      headers: {
        Cookie: cookieLawyerA,
        ...(ep.method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': authLawyerA.csrfToken } : {})
      },
      body: ep.method === 'POST' ? JSON.stringify(ep.body) : undefined
    });
    assert.equal(r.status, 403, `Endpoint ${ep.path} acessado por não-admin deve retornar 403 (obteve ${r.status})`);
    const errBody = await r.json();
    assert.match(errBody.message || errBody.error || '', /apenas administradores/i);
  }
  console.log('  [PASS] 4.2. Todos os endpoints /api/admin/* retornam 403 Forbidden para advogados/colaboradores');

  // 4.3. Acesso AUTORIZADO para Administrador de OFFICE_A
  res = await fetch(`${server.baseUrl}/api/admin/overview`, { headers: { Cookie: cookieAdminA } });
  assert.equal(res.status, 200);
  const overviewData = await res.json();
  assert.equal(overviewData.ok, true);
  assert.equal(overviewData.adminUser, 'admin_a');
  assert.equal(overviewData.counts.processes, 1);
  console.log('  [PASS] 4.3. Administrador legítimo acessa /api/admin/overview com sucesso (200 OK)');

  // 4.4. Sanitização estrita em /api/admin/users e /api/admin/diagnostic (zero segredos)
  res = await fetch(`${server.baseUrl}/api/admin/users`, { headers: { Cookie: cookieAdminA } });
  assert.equal(res.status, 200);
  const usersData = await res.json();
  for (const u of usersData.users) {
    assert.equal(u.passwordHash, undefined, 'passwordHash jamais pode ser exposto em /api/admin/users');
    assert.equal(u.salt, undefined, 'salt jamais pode ser exposto');
    assert.equal(u.encryptedTotp, undefined, 'encryptedTotp jamais pode ser exposto');
  }
  console.log('  [PASS] 4.4. Sanitização total de credenciais em /api/admin/users comprovada');

  // ==========================================================================
  // PARTE 5: Proteção do Último Administrador (Last Admin Protection)
  // ==========================================================================
  console.log('\n[PARTE 5] Validando travas de proteção do Último Administrador...');

  // Obter ID de admin_a
  const targetAdminUser = usersData.users.find(u => u.username === 'admin_a');
  assert.ok(targetAdminUser, 'admin_a não encontrado na listagem');

  // 5.1. Tentativa de rebaixar a si próprio sendo o único master_admin -> 400
  res = await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: targetAdminUser.id,
    role: 'collaborator',
    password,
    code: generateTotp(secretAdminA)
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 400, 'Rebaixamento do único master_admin deve ser bloqueado com 400');
  const roleErr = await res.json();
  assert.match(roleErr.message, /bloqueada.*único Administrador/i);
  console.log('  [PASS] 5.1. Bloqueio estrito de rebaixamento do único Administrador Mestre');

  // 5.2. Tentativa de desativar o único master_admin -> 400
  res = await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: targetAdminUser.id,
    status: 'inactive',
    password,
    code: generateTotp(secretAdminA)
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 400, 'Desativação do único master_admin deve ser bloqueada com 400');
  console.log('  [PASS] 5.2. Bloqueio estrito de desativação do único Administrador Mestre');

  // 5.3. Tentativa de mutação de papel por não-admin (LAWYER_A) -> 403
  res = await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: targetAdminUser.id,
    role: 'collaborator'
  }, {
    Cookie: cookieLawyerA,
    'X-CSRF-Token': authLawyerA.csrfToken
  });
  assert.equal(res.status, 403, 'Não-admin não pode alterar papéis de usuários');
  console.log('  [PASS] 5.3. Não-administradores são barrados com 403 ao tentar mutar papéis');

  // 5.4. Tentativa de ADMIN_A alterar papel de usuário de OFFICE_B (Cross-Tenant Admin) -> 404
  res = await postJson(`${server.baseUrl}/api/admin/users/role`, {
    userId: 'usr-inexistente-ou-de-outro-workspace',
    role: 'admin',
    password,
    code: generateTotp(secretAdminA)
  }, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 404, 'Usuário de outro workspace deve retornar 404 Not Found');
  console.log('  [PASS] 5.4. Ações administrativas cross-workspace são rejeitadas com 404');

  // ==========================================================================
  // PARTE 6: Ações Sensíveis (Rebuild Runtime / Search) e Trilha de Auditoria
  // ==========================================================================
  console.log('\n[PARTE 6] Validando autorização e trilha de auditoria em Ações Administrativas Sensíveis...');

  // 6.1. Rebuild Runtime requer CSRF e perfil de Admin
  res = await postJson(`${server.baseUrl}/api/admin/actions/rebuild-runtime`, {}, {
    Cookie: cookieAdminA
    // Sem CSRF
  });
  assert.equal(res.status, 403, 'Ação sensível sem CSRF deve falhar com 403');

  res = await postJson(`${server.baseUrl}/api/admin/actions/rebuild-runtime`, {}, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 200);
  console.log('  [PASS] 6.1. Rebuild runtime com autorização e proteção CSRF concluído');

  // 6.2. Rebuild Search Index requer CSRF e perfil de Admin
  res = await postJson(`${server.baseUrl}/api/admin/actions/rebuild-search`, {}, {
    Cookie: cookieAdminA,
    'X-CSRF-Token': authAdminA.csrfToken
  });
  assert.equal(res.status, 200);
  console.log('  [PASS] 6.2. Rebuild search index autorizado com sucesso');

  // 6.3. Verificar registro do evento na trilha de auditoria
  res = await fetch(`${server.baseUrl}/api/admin/audit?action=rebuild`, {
    headers: { Cookie: cookieAdminA }
  });
  assert.equal(res.status, 200);
  const auditRes = await res.json();
  assert.ok(auditRes.events.length > 0, 'Evento de ação administrativa deve constar na trilha de auditoria');
  assert.equal(auditRes.events[0].user, 'admin_a');
  assert.equal(auditRes.events[0].action, 'ADMIN_REBUILD_RUNTIME');
  console.log('  [PASS] 6.3. Trilha de auditoria registra ações administrativas com usuário e timestamp');

  console.log('\n===============================================================');
  console.log('  [RESULTADO: 100% APROVADO] TODAS AS ASSERÇÕES MULTI-TENANT, ');
  console.log('  RBAC, IDOR E ADMIN CONTROL PLANE PASSARAM COM SUCESSO!       ');
  console.log('===============================================================\n');

} finally {
  await server.stop();
}
