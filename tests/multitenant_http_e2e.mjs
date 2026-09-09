import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

console.log('\n===============================================================');
console.log('  ATRIUM — MULTI-TENANT HTTP E2E ENDPOINTS TEST SUITE         ');
console.log('===============================================================\n');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const testDataDir = await mkdtemp(path.join(tmpdir(), 'atrium-http-e2e-'));
const testPort = 4199;

let serverProcess = null;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/auth/status`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timeout aguardando inicialização do servidor em ${url}`);
}

try {
  console.log(`[Setup] Inicializando servidor ATRIUM isolado na porta ${testPort}...`);
  serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(testPort),
      HOST: '127.0.0.1',
      JURISFLOW_DATA_DIR: testDataDir,
      NODE_ENV: 'test',
      COOKIE_SECURE: 'false',
      AUTH_SESSION_SECRET: randomBytes(48).toString('base64url'),
      AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      BASE_DOMAIN: 'atrium.adv.br'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', d => process.stdout.write(d.toString()));
  serverProcess.stderr.on('data', d => process.stderr.write(d.toString()));

  const baseUrl = `http://127.0.0.1:${testPort}`;
  await waitForServer(baseUrl);
  console.log('   ✓ Servidor ativo e respondendo.');

  // 1. Teste /api/saas/check-slug
  console.log('[Teste 1] GET /api/saas/check-slug (validação de subdomínio)...');
  const resReserved = await fetch(`${baseUrl}/api/saas/check-slug?slug=admin`);
  const dataReserved = await resReserved.json();
  assert.equal(dataReserved.valid, false);
  assert.ok(dataReserved.reason.includes('reservado'));

  const resAvailable = await fetch(`${baseUrl}/api/saas/check-slug?slug=escritorio-modelo`);
  const dataAvailable = await resAvailable.json();
  assert.equal(dataAvailable.valid, true);
  assert.equal(dataAvailable.slug, 'escritorio-modelo');
  console.log('   ✓ Validação de slugs funcionando perfeitamente.');

  // 2. Teste /api/saas/register-office
  console.log('[Teste 2] POST /api/saas/register-office (cadastro de novo escritório)...');
  const resRegister = await fetch(`${baseUrl}/api/saas/register-office`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      officeName: 'Escritório Modelo Advocacia',
      slug: 'escritorio-modelo',
      ownerName: 'Dr. Roberto Modelo',
      ownerEmail: 'roberto@modelo.adv.br',
      lawyerOab: '99887',
      oabUf: 'RS',
      adminPassword: 'SenhaSeguraModelo2026!'
    })
  });

  assert.equal(resRegister.status, 201);
  const dataRegister = await resRegister.json();
  assert.equal(dataRegister.ok, true);
  assert.equal(dataRegister.tenant.slug, 'escritorio-modelo');
  assert.equal(dataRegister.tenant.name, 'Escritório Modelo Advocacia');
  assert.equal(dataRegister.url, 'https://escritorio-modelo.atrium.adv.br');

  const setCookie = resRegister.headers.get('set-cookie');
  assert.ok(setCookie, 'Deve retornar cookie de sessão autenticada');
  const sessionCookie = setCookie.split(';')[0];
  console.log('   ✓ Escritório registrado e sessão autenticada recebida.');

  // 3. Teste /api/saas/info
  console.log('[Teste 3] GET /api/saas/info (status SaaS e contagem de tenants)...');
  const resInfo = await fetch(`${baseUrl}/api/saas/info`);
  const dataInfo = await resInfo.json();
  assert.equal(dataInfo.multiTenant, true);
  assert.equal(dataInfo.tenantCount, 1);
  assert.equal(dataInfo.baseDomain, 'atrium.adv.br');
  console.log('   ✓ Informações do ecossistema SaaS confirmadas.');

  // 4. Teste /api/auth/status com identificador de tenant
  console.log('[Teste 4] GET /api/auth/status com x-tenant-slug...');
  const resAuthStatus = await fetch(`${baseUrl}/api/auth/status`, {
    headers: {
      'x-tenant-slug': 'escritorio-modelo',
      'Cookie': sessionCookie
    }
  });
  const dataAuthStatus = await resAuthStatus.json();
  assert.equal(dataAuthStatus.authenticated, true);
  assert.equal(dataAuthStatus.user.username, 'roberto');
  assert.equal(dataAuthStatus.tenant.slug, 'escritorio-modelo');
  console.log('   ✓ Sessão de usuário autenticada no Tenant correto.');

  // 5. Teste /api/state com isolamento de tenant
  console.log('[Teste 5] GET /api/state e POST /api/state isolados no tenant...');
  const resState = await fetch(`${baseUrl}/api/state`, {
    headers: {
      'x-tenant-slug': 'escritorio-modelo',
      'Cookie': sessionCookie
    }
  });
  const dataState = await resState.json();
  assert.equal(dataState.stateStatus, 'READY');
  assert.equal(dataState.tenant.slug, 'escritorio-modelo');
  assert.equal(dataState.state.settings.officeName, 'Escritório Modelo Advocacia');

  // Adiciona um processo no tenant
  const updatedState = structuredClone(dataState.state);
  updatedState.processes.push({
    id: 'proc-teste-001',
    number: '5009999-00.2026.8.21.0001',
    client: 'Cliente Exclusivo do Escritório Modelo',
    actionType: 'Ação Cível'
  });

  const resSave = await fetch(`${baseUrl}/api/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': 'escritorio-modelo',
      'x-csrf-token': dataAuthStatus.csrfToken,
      'Cookie': sessionCookie
    },
    body: JSON.stringify({
      state: updatedState,
      revision: dataState.revision
    })
  });
  assert.equal(resSave.status, 200);
  const dataSave = await resSave.json();
  assert.equal(dataSave.ok, true);

  // Recarrega e confirma persistência
  const resStateAfter = await fetch(`${baseUrl}/api/state`, {
    headers: {
      'x-tenant-slug': 'escritorio-modelo',
      'Cookie': sessionCookie
    }
  });
  const dataStateAfter = await resStateAfter.json();
  assert.equal(dataStateAfter.state.processes.length, 1);
  assert.equal(dataStateAfter.state.processes[0].client, 'Cliente Exclusivo do Escritório Modelo');

  // Verificação de isolamento: requisição sem tenant header e sem o cookie
  const resDefaultState = await fetch(`${baseUrl}/api/state`);
  assert.ok(resDefaultState.status === 401, 'Acesso sem autenticação deve retornar 401');

  console.log('   ✓ Estado do escritório persistido e protegido com sigilo absoluto.');

  console.log('\n✅ TODOS OS TESTES HTTP MULTI-TENANT E2E FORAM CONCLUÍDOS COM SUCESSO!\n');
} finally {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  await rm(testDataDir, { recursive: true, force: true }).catch(() => {});
}
