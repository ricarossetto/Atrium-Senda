import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';
import {
  EPROC_LOCK_WARN_AFTER_MS,
  canClearEprocJob,
  createEprocLockRegistry,
  emptyEprocSweepJob,
  isEprocWorkspaceBusy
} from '../lib/judicial/eproc/legacy-operation-state.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — H2.2: LEASE EPROC LEGADO (TOKEN, SEM EXPIRAÇÃO)     ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Senha-H2-2-Lease-2026!';
const silentLogger = { warn() {}, log() {}, error() {} };

// ---------------------------------------------------------------------------
// Unidade: lease com token (busy global != ownership, sem expiração por tempo)
// ---------------------------------------------------------------------------
console.log('[U1] Lease com token, ownership e release compare-and-clear...');
assert.equal(EPROC_LOCK_WARN_AFTER_MS, 120_000);
const lock = createEprocLockRegistry({ logger: silentLogger });
assert.equal(lock.isBusy(), false);
const acquiredA = lock.acquire('Varredura e sincronização reservada', '5001234-56.2025.8.21.0001', 'ws-a');
assert.equal(acquiredA.acquired, true);
assert.ok(typeof acquiredA.token === 'string' && acquiredA.token.length >= 16, 'acquire deve devolver token único.');
assert.equal(lock.isBusy(), true, 'Busy global deve continuar serializando a automação.');
assert.equal(lock.isBusyFor('ws-a'), true);
assert.equal(lock.isBusyFor('ws-b'), false);
const deniedB = lock.acquire('Download de autos', '5009999-88.2025.8.21.0002', 'ws-b');
assert.equal(deniedB.acquired, false);
assert.equal(deniedB.code, 'EPROC_BUSY');
assert.doesNotMatch(deniedB.message, /5001234|Varredura|sincroniza/i, 'Mensagem para outro workspace não pode conter CNJ/op do dono.');
assert.match(deniedB.message, /em andamento/i);
assert.equal(lock.release(), false, 'release sem token não pode liberar operação ativa.');
assert.equal(lock.release('token-invalido'), false, 'release com token errado não pode liberar operação ativa.');
assert.equal(lock.isBusy(), true);
assert.equal(lock.release(acquiredA.token), true, 'Somente o token do dono corrente libera.');
assert.equal(lock.release(acquiredA.token), false, 'Duplo release é no-op.');
assert.equal(lock.isBusy(), false);
const acquiredB = lock.acquire('Download de autos', null, 'ws-b');
assert.equal(acquiredB.acquired, true);
assert.notEqual(acquiredB.token, acquiredA.token, 'Cada acquire deve gerar novo token.');
assert.equal(lock.release(acquiredA.token), false, 'Token antigo é inerte após novo acquire.');
assert.equal(lock.isBusyFor('ws-b'), true);
assert.equal(lock.isBusyFor('ws-a'), false);
assert.equal(lock.release(acquiredB.token), true);
console.log('  ✓ Ownership por token, mensagem sanitizada e release compare-and-clear.');

console.log('[U2] Tempo decorrido nunca libera operação ativa (limiar = telemetria)...');
let nowMs = 1_000_000;
const warnings = [];
const longLock = createEprocLockRegistry({
  warnAfterMs: 1_000,
  now: () => nowMs,
  logger: { warn: (...args) => warnings.push(args.join(' ')) }
});
const longLease = longLock.acquire('Varredura longa', '5001234-56.2025.8.21.0001', 'ws-a');
nowMs += 10 * 60_000;
assert.equal(longLock.isBusy(), true, 'Tempo decorrido não pode liberar operação ativa.');
assert.equal(longLock.isBusyFor('ws-a'), true);
const deniedLong = longLock.acquire('Outra operação', null, 'ws-b');
assert.equal(deniedLong.acquired, false, 'Operação viva continua bloqueando segunda automação.');
assert.equal(deniedLong.code, 'EPROC_BUSY');
assert.equal(warnings.length, 1, 'Warning de longa duração deve ser emitido uma única vez por operação.');
assert.doesNotMatch(warnings[0], /5001234/, 'Telemetria não pode expor CNJ do dono.');
longLock.isBusy();
assert.equal(warnings.length, 1, 'Leituras seguintes não repetem o warning.');
assert.equal(longLock.release(longLease.token), true);
assert.equal(longLock.isBusy(), false);
console.log('  ✓ Sem auto-expiração; limiar apenas warning único.');

console.log('[U3] Predicados do reset e do guard do factory reset...');
assert.equal(canClearEprocJob({ status: 'idle' }), true);
assert.equal(canClearEprocJob({ status: 'error' }), true);
assert.equal(canClearEprocJob({ status: 'completed' }), true);
assert.equal(canClearEprocJob({ status: 'running' }), false, 'Job running impede limpeza do acompanhamento.');
assert.equal(canClearEprocJob(null), true);
assert.equal(isEprocWorkspaceBusy({}), false);
assert.equal(isEprocWorkspaceBusy({ schedulerJobActive: true }), true);
assert.equal(isEprocWorkspaceBusy({ sweepJobRunning: true }), true);
assert.equal(isEprocWorkspaceBusy({ leaseHeldByWorkspace: true }), true);
assert.equal(isEprocWorkspaceBusy({ leaseHeldByWorkspace: false, sweepJobRunning: false, schedulerJobActive: false }), false);
console.log('  ✓ Composição do guard e decisão de reset testáveis sem servidor.');

console.log('[U4] Job vazio tem ownership e shape compatível...');
const emptyJob = emptyEprocSweepJob('ws-x');
assert.equal(emptyJob.workspaceId, 'ws-x');
assert.equal(emptyJob.status, 'idle');
assert.equal(emptyJob.id, null);
assert.deepEqual(emptyJob.logs, []);
assert.equal(emptyJob.result, null);
console.log('  ✓ Shape do job preservado para a UI.');

// ---------------------------------------------------------------------------
// Contratos estruturais em server.mjs / UI
// ---------------------------------------------------------------------------
console.log('[C1] Contratos de wiring no servidor e na UI...');
const serverSource = serverSourceText;
assert.match(serverSource, /const eprocSweepJobs = new Map\(\)/, 'Job deve ser escopado por workspace em Map.');
assert.doesNotMatch(serverSource, /(?<![A-Za-z])eprocSweepJob(?!s|For)/, 'Nenhum identificador global eprocSweepJob pode permanecer.');
assert.doesNotMatch(serverSource, /canReset/, 'canReset não pode permanecer: o reset não interage com o lease.');
assert.match(serverSource, /function releaseEprocLock\(token\)/, 'Wrapper de release deve exigir token.');
assert.doesNotMatch(serverSource, /releaseEprocLock\(\s*\)/, 'Nenhuma liberação pode ocorrer sem token.');
const tokenDeclarations = [...serverSource.matchAll(/const (\w+LeaseToken) = /g)].map(match => match[1]).sort();
assert.deepEqual(
  tokenDeclarations,
  ['downloadLeaseToken'],
  'Somente o download de autos mantém lease próprio; sync/enrich usam o EprocSyncScheduler oficial.'
);
const releaseArgs = [...serverSource.matchAll(/releaseEprocLock\((\w+Token)\)/g)].map(match => match[1]);
const releaseCounts = {};
for (const arg of releaseArgs) releaseCounts[arg] = (releaseCounts[arg] || 0) + 1;
assert.deepEqual(
  releaseCounts,
  { downloadLeaseToken: 1 },
  'O lease do download de autos deve ser liberado exatamente uma vez.'
);
assert.match(serverSource, /buildLegacyEprocJobView\(/, 'O acompanhamento legado deve ser projeção do job oficial.');
assert.match(serverSource, /requestEprocSync\(/, 'Rotas legadas devem delegar ao pipeline oficial.');
assert.match(serverSource, /getEprocSyncJobStatus\(currentWorkspaceId\(\)\)\?\.active === true/, 'Download de autos deve recusar concorrência com o pipeline oficial.');
const statusStart = serverSource.indexOf("url.pathname === '/api/integrations/eproc/sweep/status'");
const resetStart = serverSource.indexOf("url.pathname === '/api/integrations/eproc/reset-lock'");
const enrichStart = serverSource.indexOf("url.pathname === '/api/integrations/eproc/processes/enrich-single'");
assert.ok(statusStart > 0 && resetStart > statusStart && enrichStart > resetStart);
const statusBlock = serverSource.slice(statusStart, resetStart);
assert.match(statusBlock, /eprocSweepJobFor\(workspaceId\)/, 'Status deve retornar apenas o job do workspace autenticado.');
const resetBlock = serverSource.slice(resetStart, enrichStart);
assert.match(resetBlock, /assertAdmin\(req, true, COLLECTION_ADMIN_MESSAGE\)/, 'Reset de acompanhamento deve exigir CSRF e administrador.');
assert.match(resetBlock, /canClearEprocJob\(/, 'Reset deve decidir pelo job do próprio workspace.');
assert.doesNotMatch(resetBlock, /releaseEprocLock/, 'Reset não pode liberar lease.');
const guardStart = serverSource.indexOf('const assertCollectorsIdle');
const guardEnd = serverSource.indexOf('await assertCollectorsIdle();');
assert.ok(guardStart > 0 && guardEnd > guardStart);
const guardBlock = serverSource.slice(guardStart, guardEnd);
assert.match(guardBlock, /isEprocWorkspaceBusy\(/, 'Guarda do factory reset deve usar a composição única.');
assert.match(guardBlock, /schedulerJobActive:/);
assert.match(guardBlock, /sweepJobRunning:/);
assert.match(guardBlock, /leaseHeldByWorkspace:/);
const processesUi = await readFile(path.join(ROOT, 'js/features/processes.js'), 'utf8');
assert.doesNotMatch(processesUi, /reset-lock/, 'UI não pode resetar trava ativa automaticamente.');
console.log('  ✓ Reset por job, guard composto, lease com token e UI sem reset automático.');

// ---------------------------------------------------------------------------
// HTTP: isolamento local multi-workspace
// ---------------------------------------------------------------------------
async function setupDefaultWorkspace(server) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-h21-alfa',
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

async function registerWorkspace(server, username, displayName, email, workspaceName) {
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

function sessionHeaders(session, withCsrf = true) {
  return withCsrf
    ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf }
    : { Cookie: session.cookie };
}

async function fetchStatus(server, session) {
  const response = await fetch(`${server.baseUrl}/api/integrations/eproc/sweep/status`, {
    headers: { Cookie: session.cookie }
  });
  assert.equal(response.status, 200, 'Status do sweep deve responder 200 para sessão válida.');
  return response.json();
}

async function waitTerminalJob(server, session, jobId) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const snapshot = await fetchStatus(server, session);
    if (snapshot.id === jobId && (snapshot.status === 'error' || snapshot.status === 'completed')) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Job ${jobId} não terminou dentro do prazo.`);
}

async function startSweep(server, session) {
  const response = await postJson(`${server.baseUrl}/api/integrations/eproc/sweep`, {}, sessionHeaders(session));
  assert.equal(response.status, 202, `Sweep deve aceitar requisição autenticada (recebido ${response.status}).`);
  const body = await response.json();
  assert.ok(body.jobId, 'Sweep deve retornar jobId.');
  return body.jobId;
}

const localServer = await startTestServer({});
try {
  console.log('[H1] Local: A cria job; B nunca vê dados de A...');
  const workspaceA = await setupDefaultWorkspace(localServer);
  const workspaceB = await registerWorkspace(localServer, 'admin-h21-beta', 'Dr. Bruno Teste', 'beta@example.test', 'Beta Teste');
  assert.notEqual(workspaceA.workspaceId, workspaceB.workspaceId);

  const statusBefore = await fetchStatus(localServer, workspaceB);
  assert.equal(statusBefore.status, 'idle');
  assert.equal(statusBefore.id, null);
  assert.equal(statusBefore.error, null);
  assert.deepEqual(statusBefore.logs, []);
  assert.equal(statusBefore.result, null);

  const jobA = await startSweep(localServer, workspaceA);
  const jobATerminal = await waitTerminalJob(localServer, workspaceA, jobA);
  assert.equal(jobATerminal.status, 'error', 'Sweep sintético sem A1 deve terminar em erro.');

  const statusBWhileA = await fetchStatus(localServer, workspaceB);
  assert.equal(statusBWhileA.id, null, 'B não pode receber o jobId de A.');
  assert.equal(statusBWhileA.status, 'idle', 'B deve ver o próprio estado idle.');
  assert.equal(statusBWhileA.error, null, 'B não pode receber o erro de A.');
  assert.equal(statusBWhileA.result, null, 'B não pode receber o result de A.');
  assert.deepEqual(statusBWhileA.logs, [], 'B não pode receber os logs de A.');
  assert.equal(statusBWhileA.action, '', 'B não pode receber a action de A.');
  assert.doesNotMatch(JSON.stringify(statusBWhileA), new RegExp(jobA), 'Resposta de B não pode conter o jobId de A.');
  console.log('  ✓ B recebe apenas o próprio estado idle.');

  console.log('[H2] Local: job de B não sobrescreve o de A...');
  const jobB = await startSweep(localServer, workspaceB);
  assert.notEqual(jobB, jobA, 'Jobs de workspaces distintos não podem compartilhar id.');
  const statusAAfterB = await fetchStatus(localServer, workspaceA);
  assert.equal(statusAAfterB.id, jobA, 'A deve continuar vendo seu próprio job após o POST de B.');
  const jobBTerminal = await waitTerminalJob(localServer, workspaceB, jobB);
  assert.equal(jobBTerminal.status, 'error');
  console.log('  ✓ Jobs independentes por workspace.');

  console.log('[H3] Local: reset de B não altera o job de A...');
  const resetB = await postJson(`${localServer.baseUrl}/api/integrations/eproc/reset-lock`, {}, sessionHeaders(workspaceB));
  assert.equal(resetB.status, 200, 'Reset com job terminal do próprio workspace é permitido.');
  const statusBAfterReset = await fetchStatus(localServer, workspaceB);
  assert.equal(statusBAfterReset.status, 'idle', 'Reset deve limpar apenas o job de B.');
  const statusAAfterReset = await fetchStatus(localServer, workspaceA);
  assert.equal(statusAAfterReset.id, jobA, 'Reset de B não pode apagar o job de A.');
  console.log('  ✓ Reset escopado ao workspace solicitante.');

  console.log('[H4] Local: reset sem CSRF é rejeitado...');
  const resetNoCsrf = await postJson(`${localServer.baseUrl}/api/integrations/eproc/reset-lock`, {}, sessionHeaders(workspaceB, false));
  assert.equal(resetNoCsrf.status, 403, 'Reset de acompanhamento é mutação e exige CSRF.');
  console.log('  ✓ CSRF aplicado ao reset.');

  console.log('[H5] Local: reset do dono limpa apenas o job do dono...');
  const resetA = await postJson(`${localServer.baseUrl}/api/integrations/eproc/reset-lock`, {}, sessionHeaders(workspaceA));
  assert.equal(resetA.status, 200);
  const statusAFinal = await fetchStatus(localServer, workspaceA);
  assert.equal(statusAFinal.status, 'idle');
  assert.equal(statusAFinal.id, null);
  console.log('  ✓ Polling do dono continua compatível (shape preservado).');
} finally {
  await localServer.stop();
}

// ---------------------------------------------------------------------------
// HTTP: cloud preserva isolamento do status
// ---------------------------------------------------------------------------
const cloudServer = await startTestServer({
  env: { JURISFLOW_CLOUD_MODE: 'true', ATRIUM_PUBLIC_SIGNUP: 'true' }
});
try {
  console.log('[H6] Cloud: status de B não expõe job do default...');
  const cloudA = await setupDefaultWorkspace(cloudServer);
  const cloudB = await registerWorkspace(cloudServer, 'admin-h21-gama', 'Dr. Gama Teste', 'gama@example.test', 'Gama Teste');
  assert.notEqual(cloudA.workspaceId, cloudB.workspaceId);

  const cloudJobA = await startSweep(cloudServer, cloudA);
  await waitTerminalJob(cloudServer, cloudA, cloudJobA);

  const cloudStatusB = await fetchStatus(cloudServer, cloudB);
  assert.equal(cloudStatusB.id, null, 'Cloud: B não pode ver o job do default.');
  assert.equal(cloudStatusB.status, 'idle');
  assert.doesNotMatch(JSON.stringify(cloudStatusB), new RegExp(cloudJobA));

  const cloudStartB = await postJson(`${cloudServer.baseUrl}/api/integrations/eproc/sweep`, {}, sessionHeaders(cloudB));
  assert.equal(cloudStartB.status, 503, 'Cloud: non-default continua impedido de iniciar varredura.');

  const cloudResetB = await postJson(`${cloudServer.baseUrl}/api/integrations/eproc/reset-lock`, {}, sessionHeaders(cloudB));
  assert.equal(cloudResetB.status, 200, 'Cloud: reset com job terminal do próprio workspace permanece disponível.');
  const cloudStatusAAfter = await fetchStatus(cloudServer, cloudA);
  assert.equal(cloudStatusAAfter.id, cloudJobA, 'Cloud: reset de B não pode apagar o job do default.');
  console.log('  ✓ Cloud mantém isolamento de status e reset escopado.');
} finally {
  await cloudServer.stop();
}

console.log('\n>>> EPROC LEGACY LEASE ISOLATION: PASS <<<\n');
