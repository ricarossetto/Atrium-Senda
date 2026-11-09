import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { resolveEprocProfileDir, sweepAndEnrichProcessesWithA1 } from '../lib/judicial/eproc-a1-downloader.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — H2: ISOLAMENTO DE CREDENCIAL A1/TOTP/PROFILE EPROC  ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYNTHETIC_TOTP = 'JBSWY3DPEHPK3PXP';
const SYNTHETIC_PASSPHRASE = 'atrium-test-only-passphrase';
const SYNTHETIC_CNJ = '5001234-56.2025.8.21.0001';
const PASSWORD = 'Senha-H2-Isolamento-2026!';

const sessionSecret = randomBytes(48).toString('base64url');
const encryptionKey = randomBytes(32).toString('base64');
const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-h2-data-'));
const fixtureDirectory = path.join(dataDirectory, 'fixtures');
const rootCertPath = path.join(fixtureDirectory, 'root-dummy.pfx');
const workspaceCertPath = path.join(fixtureDirectory, 'workspace-b-dummy.pfx');
await mkdir(fixtureDirectory, { recursive: true });
await writeFile(rootCertPath, 'synthetic-not-a-pfx', 'utf8');
await writeFile(workspaceCertPath, 'synthetic-not-a-pfx', 'utf8');

async function writeVault(targetDataDirectory, overrides = {}) {
  const security = new SecurityManager({ dataDirectory: targetDataDirectory, sessionSecret, encryptionKey });
  const payload = {
    certificate: null,
    portalCredentials: {},
    totpSecrets: {},
    managedIdentities: {},
    processAccessKeys: {},
    allowAutomatedTotp: false,
    lastSandboxValidation: null,
    lastTotpValidation: {},
    ...overrides
  };
  await mkdir(targetDataDirectory, { recursive: true });
  const envelope = {
    version: 2,
    algorithm: 'aes-256-gcm',
    updatedAt: new Date().toISOString(),
    encrypted: security.encrypt(JSON.stringify(payload))
  };
  await writeFile(path.join(targetDataDirectory, 'judicial-integrations.json'), JSON.stringify(envelope, null, 2), 'utf8');
}

const server = await startTestServer({
  dataDirectory,
  env: {
    AUTH_SESSION_SECRET: sessionSecret,
    AUTH_ENCRYPTION_KEY: encryptionKey,
    A1_PFX_PATH: rootCertPath,
    A1_PFX_PASSPHRASE: SYNTHETIC_PASSPHRASE,
    TJRS_EPROC_TOTP_SECRET: SYNTHETIC_TOTP
  }
});

function sessionHeaders(session) {
  return { Cookie: session.cookie, 'X-CSRF-Token': session.csrf };
}

async function setupDefaultWorkspace() {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-h2-alfa',
    displayName: 'Dra. Alfa Teste',
    email: 'alfa@example.test',
    workspaceName: 'Alfa Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  assert.ok(pending.setupToken, 'Falha ao iniciar o cadastro do workspace padrão.');
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const body = await response.json();
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.csrfToken,
    workspaceId: body.user?.workspaceId || body.workspace?.id
  };
}

async function registerWorkspace(username, displayName, email, workspaceName) {
  let response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username,
    displayName,
    email,
    workspaceName,
    password: PASSWORD
  });
  const pending = await response.json();
  assert.ok(pending.setupToken, 'Falha ao iniciar o cadastro do segundo workspace.');
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const body = await response.json();
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.csrfToken,
    workspaceId: body.workspace?.id || body.user?.workspaceId
  };
}

async function runSweepAndGetOutcome(session) {
  const response = await postJson(`${server.baseUrl}/api/integrations/eproc/sweep`, {}, sessionHeaders(session));
  assert.equal(response.status, 202, `O sweep deve aceitar requisição autenticada (recebido ${response.status}).`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(`${server.baseUrl}/api/integrations/eproc/sweep/status`, {
      headers: { Cookie: session.cookie }
    });
    const snapshot = await statusResponse.json();
    if (snapshot.status === 'error' || snapshot.status === 'completed') return snapshot;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('A varredura eproc não terminou dentro do prazo do teste.');
}

async function postEnrichSingle(session) {
  const response = await postJson(
    `${server.baseUrl}/api/integrations/eproc/processes/enrich-single`,
    { processNumber: SYNTHETIC_CNJ },
    sessionHeaders(session)
  );
  return { status: response.status, body: await response.json() };
}

function extractObjectLiteralCallSites(source, marker) {
  const sites = [];
  let index = 0;
  while ((index = source.indexOf(marker, index)) !== -1) {
    let depth = 0;
    let end = index + marker.length - 1;
    for (let cursor = index + marker.length - 1; cursor < source.length; cursor += 1) {
      const character = source[cursor];
      if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          end = cursor;
          break;
        }
      }
    }
    sites.push(source.slice(index, end + 1));
    index = end + 1;
  }
  return sites;
}

try {
  const workspaceA = await setupDefaultWorkspace();
  const workspaceB = await registerWorkspace('admin-h2-beta', 'Dr. Bruno Teste', 'beta@example.test', 'Beta Teste');
  assert.ok(workspaceA.workspaceId && workspaceB.workspaceId, 'Workspaces de teste não receberam identificadores.');
  assert.notEqual(workspaceA.workspaceId, workspaceB.workspaceId, 'Os dois workspaces não podem compartilhar o mesmo ID.');

  const workspaceBDirectory = path.join(dataDirectory, 'workspaces', workspaceB.workspaceId);
  const workspaceBVault = path.join(workspaceBDirectory, 'judicial-integrations.json');
  const rootVaultPath = path.join(dataDirectory, 'judicial-integrations.json');

  await writeVault(dataDirectory, {
    certificate: { path: rootCertPath, passphrase: SYNTHETIC_PASSPHRASE, fileName: 'root-dummy.pfx' },
    totpSecrets: { 'tjrs-eproc': { secret: SYNTHETIC_TOTP, label: 'TJRS 1G raiz' } }
  });
  const rootVaultBefore = await readFile(rootVaultPath, 'utf8');

  console.log('[T1] Workspace padrão continua usando o próprio cofre...');
  const outcomeA = await runSweepAndGetOutcome(workspaceA);
  assert.equal(outcomeA.status, 'error', 'Sweep do workspace padrão deve terminar em erro com PFX sintético.');
  assert.doesNotMatch(outcomeA.error, /Certificado Digital A1 não encontrado/, 'Workspace padrão não pode alegar credencial ausente com o cofre raiz preenchido.');
  assert.doesNotMatch(outcomeA.error, /2FA|Segundo fator/, 'Workspace padrão não pode alegar TOTP ausente com o cofre raiz preenchido.');
  console.log('  ✓ Workspace padrão alcançou o estágio de PFX usando o próprio cofre.');

  console.log('[T2] Workspace B sem A1 próprio não usa PFX/TOTP/env do padrão...');
  assert.equal(existsSync(workspaceBVault), false, 'Workspace B não pode já possuir cofre antes do teste.');
  const outcomeB = await runSweepAndGetOutcome(workspaceB);
  assert.equal(outcomeB.status, 'error', 'Sweep de B deve terminar em erro explícito.');
  assert.match(outcomeB.error, /Certificado Digital A1 não encontrado/, 'B deve falhar com A1_CERT_MISSING, nunca usar o PFX do padrão/env.');
  assert.equal(existsSync(workspaceBVault), false, 'B não pode criar cofre raiz por engano.');
  assert.equal(
    existsSync(path.join(workspaceBDirectory, 'browser-profiles', 'agent-eproc-worker')),
    false,
    'B não pode criar o perfil persistente do sweep antes de ter credencial própria.'
  );
  assert.equal(
    existsSync(path.join(dataDirectory, 'browser-profiles', 'agent-eproc-worker')),
    false,
    'Sweep de B não pode criar o perfil persistente global do padrão.'
  );
  console.log('  ✓ B falhou fechado com A1_CERT_MISSING e sem perfil cruzado.');

  console.log('[T3] TOTP não cruza workspace...');
  await writeVault(workspaceBDirectory, {
    certificate: { path: workspaceCertPath, passphrase: SYNTHETIC_PASSPHRASE, fileName: 'workspace-b-dummy.pfx' }
  });
  const outcomeB2 = await runSweepAndGetOutcome(workspaceB);
  assert.equal(outcomeB2.status, 'error', 'Sweep de B com cert próprio e sem TOTP deve falhar.');
  assert.match(outcomeB2.error, /2FA|Segundo fator/, 'B deve exigir TOTP próprio mesmo com TOTP no cofre raiz e no ambiente.');
  console.log('  ✓ B falhou com TOTP_2FA_MISSING; TOTP do padrão/env não foi herdado.');

  console.log('[T4] Workspace B com credencial própria usa exclusivamente a sua...');
  await writeVault(workspaceBDirectory, {
    certificate: { path: workspaceCertPath, passphrase: SYNTHETIC_PASSPHRASE, fileName: 'workspace-b-dummy.pfx' },
    totpSecrets: { 'tjrs-eproc': { secret: SYNTHETIC_TOTP, label: 'TJRS 1G workspace B' } }
  });
  const outcomeB3 = await runSweepAndGetOutcome(workspaceB);
  assert.equal(outcomeB3.status, 'error', 'Sweep de B com PFX sintético deve falhar no estágio de PFX.');
  assert.doesNotMatch(outcomeB3.error, /Certificado Digital A1 não encontrado/, 'B não pode ficar sem certificado após configurar o próprio.');
  assert.doesNotMatch(outcomeB3.error, /2FA|Segundo fator/, 'B não pode ficar sem TOTP após configurar o próprio.');
  assert.equal(await readFile(rootVaultPath, 'utf8'), rootVaultBefore, 'Cofre do padrão não pode ser alterado por operações do workspace B.');
  console.log('  ✓ B atravessou cert+TOTP próprios e o cofre do padrão permaneceu intacto.');

  console.log('[T5] enrich-single segue o mesmo isolamento...');
  await rm(workspaceBVault, { force: true });
  const enrichWithoutVault = await postEnrichSingle(workspaceB);
  assert.equal(enrichWithoutVault.status, 412, 'enrich-single sem cofre próprio deve responder 412.');
  assert.match(enrichWithoutVault.body.message, /Certificado Digital A1 não encontrado/, 'enrich-single não pode usar o PFX do padrão/env.');
  await writeVault(workspaceBDirectory, {
    certificate: { path: workspaceCertPath, passphrase: SYNTHETIC_PASSPHRASE, fileName: 'workspace-b-dummy.pfx' }
  });
  const enrichWithoutTotp = await postEnrichSingle(workspaceB);
  assert.equal(enrichWithoutTotp.status, 412, 'enrich-single sem TOTP próprio deve responder 412.');
  assert.match(enrichWithoutTotp.body.message, /2FA|Segundo fator/, 'enrich-single não pode usar o TOTP do padrão/env.');
  console.log('  ✓ enrich-single falhou fechado nos dois estágios sem herdar credenciais.');

  console.log('[T6] Contrato estrutural do pipeline único no /api/sync...');
  const serverSource = serverSourceText;
  const syncStart = serverSource.indexOf("url.pathname === '/api/sync'");
  const syncEnd = serverSource.indexOf('serveStatic(req, res)', syncStart);
  assert.ok(syncStart > 0 && syncEnd > syncStart, 'Não foi possível isolar o bloco /api/sync em server.mjs.');
  const syncBlock = serverSource.slice(syncStart, syncEnd);
  assert.match(
    syncBlock,
    /requestEprocSync\(/,
    'O /api/sync deve delegar ao pipeline oficial do EprocSyncScheduler.'
  );
  assert.doesNotMatch(
    syncBlock,
    /sweepAndEnrichProcessesWithA1\(/,
    'Nenhum segundo sweep A1 pode ser disparado dentro do /api/sync.'
  );
  assert.doesNotMatch(
    syncBlock,
    /ingestEprocDownloadsIfPresent/,
    'O importador PDF paralelo não pode permanecer no fluxo produtivo.'
  );
  console.log('  ✓ Pipeline único comprovado: /api/sync delega ao scheduler e não mantém coletor paralelo.');

  console.log('[T7] sweepAndEnrichProcessesWithA1 falha fechado sem credentialManager...');
  await assert.rejects(
    sweepAndEnrichProcessesWithA1({}),
    error => error?.code === 'EPROC_CREDENTIAL_MANAGER_REQUIRED' && error?.statusCode === 412
  );
  console.log('  ✓ Sem cofre do workspace, a varredura nem inicia.');

  console.log('[T8] Perfil de browser ancorado no diretório de dados do cofre...');
  const profileDirB = resolveEprocProfileDir({ dataDirectory: workspaceBDirectory }, 'scheduler-workspace-b');
  assert.equal(profileDirB, path.join(workspaceBDirectory, 'browser-profiles', 'scheduler-workspace-b'));
  assert.throws(() => resolveEprocProfileDir({}, 'agent-eproc-worker'), error => error?.code === 'EPROC_CREDENTIAL_MANAGER_REQUIRED');
  const sanitizedProfile = resolveEprocProfileDir({ dataDirectory: workspaceBDirectory }, '../escape');
  assert.equal(path.dirname(path.dirname(sanitizedProfile)), workspaceBDirectory, 'Sanitização do profileKey não pode escapar do diretório do cofre.');
  console.log('  ✓ Perfil deriva exclusivamente do diretório do cofre e não escapa da base.');

  console.log('[T9] Ponto único de injeção do sweep oficial por workspace em server.mjs...');
  const callSites = extractObjectLiteralCallSites(serverSource, 'createEprocRuntimeExecutor({');
  assert.equal(callSites.length, 1, `Esperado exatamente 1 executor oficial por workspace; encontrados ${callSites.length}.`);
  assert.match(callSites[0], /sweep:\s*sweepAndEnrichProcessesWithA1/, 'O executor deve injetar o sweep real.');
  assert.match(callSites[0], /credentialManager:\s*instance\.credentialManager/, 'O executor deve injetar o cofre do workspace.');
  const sweepReferences = (serverSource.match(/sweepAndEnrichProcessesWithA1/g) || []).length;
  assert.equal(sweepReferences, 2, `Import + injeção única esperados; encontrados ${sweepReferences} usos.`);
  assert.doesNotMatch(serverSource, /credManager:/, 'Parâmetro obsoleto credManager: não pode permanecer em server.mjs.');
  assert.doesNotMatch(serverSource, /saveStateEnvelope/, 'Identificador inexistente saveStateEnvelope não pode permanecer em server.mjs.');
  console.log('  ✓ Um único executor oficial por workspace injeta o cofre; nenhum resíduo do fallback global.');

  console.log('[T10] Auto-sweep pós-upload permanece desativado e neutralizado...');
  const certificateStart = serverSource.indexOf("url.pathname === '/api/integrations/judicial/certificate'");
  const twoFactorStart = serverSource.indexOf("url.pathname === '/api/integrations/judicial/2fa'");
  assert.ok(certificateStart > 0 && twoFactorStart > certificateStart, 'Não foi possível isolar o bloco da rota de certificado.');
  const certificateBlock = serverSource.slice(certificateStart, twoFactorStart);
  assert.doesNotMatch(certificateBlock, /sweepAndEnrichProcessesWithA1/, 'A rota de certificado não pode disparar sweep.');
  assert.doesNotMatch(certificateBlock, /saveStateEnvelope|credManager:|await readStateEnvelope\(/, 'A rota de certificado não pode conter o bloco morto original.');
  assert.match(certificateBlock, /\[eproc auto-sweep\]\s*Desativado/, 'A desativação do auto-sweep deve estar explícita no código.');
  console.log('  ✓ Bloco morto removido; auto-sweep explicitamente desativado sem disparo.');

  console.log('\n>>> H2 WORKSPACE CREDENTIAL ISOLATION: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
