import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function runDeploymentTests() {
  console.log('=== TESTES DE DEPLOYMENT & CONFORMIDADE COM NUVEM (RENDER / PROD) ===\n');
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-deploy-test-'));
  const port = 54320 + Math.floor(Math.random() * 1000);
  const bootstrapToken = 'test-bootstrap-token-' + randomBytes(8).toString('hex');
  const collectorToken = randomBytes(32).toString('base64url');
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      JURISFLOW_CLOUD_MODE: 'true',
      KELLER_SKIP_COLLECTOR_ENV: 'true',
      KELLER_DATA_DIR: dataDirectory,
      JURISFLOW_DATA_DIR: dataDirectory,
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_ENCRYPTION_KEY: encryptionKey,
      COLLECTOR_INGEST_TOKEN: collectorToken,
      SETUP_BOOTSTRAP_TOKEN: bootstrapToken
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  child.stdout.on('data', c => { serverOutput += c; });
  child.stderr.on('data', c => { serverOutput += c; });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Aguardar boot
    console.log('1. Validando boot do servidor Node persistente em ambiente de produção...');
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const res = await fetch(`${baseUrl}/api/auth/status`);
        if (res.ok) { ready = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(ready, true, `O servidor de produção deve iniciar e responder 200 no /api/auth/status. Log: ${serverOutput}`);
    console.log('✓ Servidor de produção iniciou com sucesso (HTTP 200).');

    // 2. Validar bloqueio de bootstrap sem token secreto
    console.log('\n2. Validando proteção contra sequestro de primeiro administrador (SETUP_BOOTSTRAP_TOKEN)...');
    const unauthorizedSetup = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Hacker Anônimo',
        username: 'admin',
        password: 'Password123!@#',
        bootstrapToken: 'token-errado-123'
      })
    });
    assert.equal(unauthorizedSetup.status, 403, 'Acesso a setup sem bootstrapToken correto deve ser rejeitado com 403');
    console.log('✓ Requisição de setup não autorizada bloqueada com HTTP 403 Forbidden.');

    // 3. Validar bootstrap com token correto e ativação TOTP
    console.log('\n3. Validando setup de primeiro administrador com token de bootstrap correto e 2FA...');
    const authorizedSetup = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Administrador Titular',
        username: 'admin',
        password: 'Password123!@#',
        bootstrapToken: bootstrapToken
      })
    });
    assert.equal(authorizedSetup.status, 200, 'Setup com bootstrapToken correto deve retornar 200');
    const setupData = await authorizedSetup.json();
    assert.ok(setupData.setupToken, 'Deve retornar setupToken assinado');
    assert.ok(setupData.manualSecret, 'Deve retornar chave TOTP Base32');

    const totpCode = generateTotp(setupData.manualSecret);
    const verifyRes = await fetch(`${baseUrl}/api/auth/setup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupToken: setupData.setupToken, code: totpCode })
    });
    assert.equal(verifyRes.status, 200, 'Verificação do setup com TOTP deve retornar 200');
    const verifyData = await verifyRes.json();
    const sessionCookie = verifyRes.headers.get('set-cookie')?.split(';')[0];
    const csrfToken = verifyData.csrfToken;
    assert.ok(sessionCookie, 'Deve gerar cookie de sessão');
    assert.ok(csrfToken, 'Deve gerar CSRF token');
    console.log('✓ Administrador autenticado com MFA/TOTP e sessão segura.');

    // 4. Validar bloqueio de recursos locais do Windows na nuvem (Cloud Mode)
    console.log('\n4. Validando bloqueio de rotas Windows/PJe/A1 em Cloud Mode (JURISFLOW_CLOUD_MODE=true)...');
    const a1Attempt = await fetch(`${baseUrl}/api/integrations/judicial/certificate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ pfxBase64: 'dGVzdA==', passphrase: '123' })
    });
    assert.equal(a1Attempt.status, 503, 'A1 deve ser bloqueado na nuvem com 503 Service Unavailable');

    const resetAttempt = await fetch(`${baseUrl}/api/integrations/judicial/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ confirm: 'ZERAR_ACESSOS_JUDICIAIS' })
    });
    assert.equal(resetAttempt.status, 503, 'Reset de sessões judiciais de desktop deve retornar 503 na nuvem');

    const syncAttempt = await fetch(`${baseUrl}/api/integrations/judicial/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      }
    });
    assert.equal(syncAttempt.status, 200, 'Sync na nuvem deve retornar 200 com mensagem orientativa');
    const syncData = await syncAttempt.json();
    assert.equal(syncData.cloud, true, 'Sync deve indicar execução no dispositivo seguro');
    console.log('✓ Operações Windows / A1 restritas ao agente local (503 Service Unavailable na nuvem).');

    // 5. Validar que arquivos secretos não vazam via rotas estáticas
    console.log('\n5. Validando proteção estática contra vazamento de arquivos de configuração e segredos...');
    const secretEndpoints = ['/security.json', '/data/security.json', '/.env', '/package.json', '/render.yaml'];
    for (const ep of secretEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 404, `Rota estática para ${ep} deve retornar 404 Not Found`);
    }
    console.log('✓ Arquivos de segurança e variáveis de ambiente inacessíveis via HTTP.');

    console.log('\n===============================================================');
    console.log('✓ SUÍTE DE DEPLOYMENT & CONFORMIDADE DE PRODUÇÃO: 100% APROVADA!');
    console.log('===============================================================');
  } finally {
    child.kill('SIGKILL');
    await rm(dataDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

runDeploymentTests().catch(err => {
  console.error('Falha no teste de deployment:', err);
  process.exit(1);
});
