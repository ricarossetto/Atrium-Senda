import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API HTTP PJe (AUTH, RBAC, CSRF, SINGLE-FLIGHT)      ');
console.log('===============================================================\n');

const PASSWORD = 'Senha-PJe-HTTP-2026!';
const sessionSecret = randomBytes(48).toString('base64url');
const encryptionKey = randomBytes(32).toString('base64');
const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-pje-http-'));

const server = await startTestServer({
  dataDirectory,
  env: { AUTH_SESSION_SECRET: sessionSecret, AUTH_ENCRYPTION_KEY: encryptionKey }
});

async function setupDefaultWorkspace() {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-pje-http',
    displayName: 'Dra. PJe Teste',
    email: 'pje-http@example.test',
    workspaceName: 'PJe Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  assert.ok(pending.setupToken, 'Setup inicial deve devolver setupToken.');
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

const session = await setupDefaultWorkspace();
const authHeaders = { Cookie: session.cookie };
const csrfHeaders = { Cookie: session.cookie, 'X-CSRF-Token': session.csrf };

try {
  console.log('[T1] PJe exige autenticação...');
  for (const pathname of ['/api/integrations/judicial/pje', '/api/integrations/judicial/pje/portals', '/api/judicial/communications']) {
    const response = await fetch(`${server.baseUrl}${pathname}`);
    assert.ok([401, 403].includes(response.status), `${pathname} deveria exigir auth (recebido ${response.status}).`);
  }
  console.log('  ✓ 401/403 sem sessão.');

  console.log('[T2] Status PJe autenticado e sem segredos...');
  const statusResponse = await fetch(`${server.baseUrl}/api/integrations/judicial/pje`, { headers: authHeaders });
  assert.equal(statusResponse.status, 200);
  const statusBody = await statusResponse.json();
  assert.equal(statusBody.ok, true);
  assert.equal(statusBody.workspaceId, session.workspaceId);
  assert.ok(Array.isArray(statusBody.portals) && statusBody.portals.length > 30, 'Registry nacional deve estar exposto.');
  assert.equal(statusBody.config.pjeEnabled, false, 'Config nasce desabilitada.');
  assert.deepEqual(statusBody.config.enabledPortals, []);
  const raw = JSON.stringify(statusBody).toLowerCase();
  for (const forbidden of ['totp', 'passphrase', 'pfx', 'cookie', 'bearer', 'challenge', 'jsessionid']) {
    assert.ok(!raw.includes(forbidden), `Status PJe não pode expor ${forbidden}.`);
  }
  const tjmt = statusBody.portals.find(portal => portal.id === 'pje-tjmt-1g');
  assert.equal(tjmt.statusLabel, 'PJe desabilitado');
  assert.equal(tjmt.verification, 'unverified', 'Nunca "verificado" sem job real.');
  console.log('  ✓ Status honesto, config padrão e zero segredo.');

  console.log('[T3] Config: RBAC, CSRF e validação server-side...');
  const noCsrf = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/config`, { pjeEnabled: true }, authHeaders);
  assert.ok([401, 403].includes(noCsrf.status), 'CSRF ausente deve bloquear.');
  const badPortal = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/config`, {
    pjeEnabled: true,
    enabledPortals: ['pje-tjmt-1g', 'portal-inventado'],
    runtimePreference: 'runtime-invalido',
    syncIntervalMinutes: 5
  }, csrfHeaders);
  assert.equal(badPortal.status, 200);
  const badPortalBody = await badPortal.json();
  assert.deepEqual(badPortalBody.config.enabledPortals, ['pje-tjmt-1g'], 'IDs desconhecidos devem ser filtrados.');
  assert.equal(badPortalBody.config.runtimePreference, 'auto', 'Runtime inválido não pode ser persistido.');
  assert.equal(badPortalBody.config.syncIntervalMinutes, 60, 'Intervalo abaixo de 60 deve ser elevado ao mínimo.');
  const tooLong = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/config`, { syncIntervalMinutes: 5000 }, csrfHeaders);
  const tooLongBody = await tooLong.json();
  assert.equal(tooLongBody.config.syncIntervalMinutes, 1440, 'Intervalo acima de 1440 deve ser limitado.');
  assert.equal(tooLongBody.config.pjeEnabled, true, 'Config anterior preservada em patch parcial.');
  const unavailableConfig = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/config`, { runtimePreference: 'local_sidecar' }, csrfHeaders);
  assert.equal(unavailableConfig.status, 400, 'Runtime sem canal não pode ser configurado.');
  assert.equal((await unavailableConfig.json()).message?.includes('não está disponível') || false, true, 'Erro deve declarar indisponibilidade.');
  console.log('  ✓ CSRF, portal inválido filtrado, runtime sem canal recusado, intervalo clampado.');

  console.log('[T4] Sync: auth, CSRF, portal inválido e single-flight...');
  const syncNoAuth = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'pje-tjmt-1g' });
  assert.ok([401, 403].includes(syncNoAuth.status));
  const syncNoCsrf = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'pje-tjmt-1g' }, authHeaders);
  assert.ok([401, 403].includes(syncNoCsrf.status));
  const syncBadPortal = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'nao-existe' }, csrfHeaders);
  assert.equal(syncBadPortal.status, 400, 'Portal desconhecido deve ser recusado.');
  const unavailableSync = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'pje-tjmt-1g', runtime: 'local_sidecar' }, csrfHeaders);
  assert.equal(unavailableSync.status, 503, 'Runtime sem canal não pode criar job.');
  const firstSync = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'pje-tjmt-1g', runtime: 'server' }, csrfHeaders);
  assert.equal(firstSync.status, 200);
  const firstBody = await firstSync.json();
  assert.ok(firstBody.jobId, 'Sync deve retornar jobId.');
  assert.equal(firstBody.joinedExisting, false);
  const secondSync = await postJson(`${server.baseUrl}/api/integrations/judicial/pje/sync`, { portalId: 'pje-tjmt-1g', runtime: 'server' }, csrfHeaders);
  const secondBody = await secondSync.json();
  assert.equal(secondBody.joinedExisting, true, 'Segundo clique deve conectar no job ativo.');
  assert.equal(secondBody.jobId, firstBody.jobId, 'Single-flight deve reutilizar o mesmo job.');
  console.log('  ✓ Single-flight com joinedExisting=true; portal inválido em 400.');

  console.log('[T5] Job: próprio 200, inexistente 404 e estado real...');
  const ownJob = await fetch(`${server.baseUrl}/api/integrations/judicial/pje/jobs/${firstBody.jobId}`, { headers: authHeaders });
  assert.equal(ownJob.status, 200);
  const ownJobBody = await ownJob.json();
  assert.equal(ownJobBody.job.jobId, firstBody.jobId);
  assert.equal(ownJobBody.job.percent, null, 'Percentual não pode ser inventado.');
  assert.equal(ownJobBody.job.workspaceId, session.workspaceId);
  const missingJob = await fetch(`${server.baseUrl}/api/integrations/judicial/pje/jobs/pje-inexistente`, { headers: authHeaders });
  assert.equal(missingJob.status, 404);
  console.log('  ✓ Job próprio legível; inexistente 404; percent=null.');

  console.log('[T6] Communications: auth, paginação e filtros (sem dados ainda)...');
  const commUnauth = await fetch(`${server.baseUrl}/api/judicial/communications`);
  assert.ok([401, 403].includes(commUnauth.status));
  const commList = await fetch(`${server.baseUrl}/api/judicial/communications?page=1&pageSize=5&hasSourceDeadline=true`, { headers: authHeaders });
  assert.equal(commList.status, 200);
  const commBody = await commList.json();
  assert.equal(commBody.ok, true);
  assert.equal(commBody.total, 0);
  assert.equal(commBody.page, 1);
  assert.equal(commBody.pageSize, 5);
  assert.deepEqual(commBody.items, []);
  const commDetailMissing = await fetch(`${server.baseUrl}/api/judicial/communications/inexistente`, { headers: authHeaders });
  assert.equal(commDetailMissing.status, 404);
  console.log('  ✓ Lista vazia paginada e detail 404 sem vazamento.');

  console.log('[T7] Job real do pipeline falha honestamente sem credencial e não fica RUNNING...');
  let job = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const jobResponse = await fetch(`${server.baseUrl}/api/integrations/judicial/pje/jobs/${firstBody.jobId}`, { headers: authHeaders });
    const payload = await jobResponse.json();
    job = payload.job;
    if (job && !['QUEUED', 'RUNNING'].includes(job.status)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(job, 'Job deve existir.');
  assert.notEqual(job.status, 'RUNNING', 'Job não pode ficar eternamente RUNNING.');
  assert.ok(['ERROR', 'SKIPPED_UNRELIABLE', 'DEGRADED'].includes(job.status), `Status final inesperado: ${job.status}`);
  assert.ok(job.finishedAt, 'Job finalizado precisa de finishedAt.');
  if (job.status === 'ERROR') {
    assert.ok(job.errorCode, 'Erro precisa de código honesto.');
  }
  console.log(`  ✓ Job terminou como ${job.status} (${job.errorCode || 'sem erro'}) sem falso sucesso.`);

  console.log('[T8] Hub judicial enriquecido com portais PJe em managedCoverage...');
  const hubResponse = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: authHeaders });
  assert.equal(hubResponse.status, 200);
  const hubBody = await hubResponse.json();
  assert.ok(Array.isArray(hubBody.managedCoverage), 'managedCoverage precisa continuar exposto.');
  assert.ok(Array.isArray(hubBody.portals) && hubBody.portals.length > 0, 'As rotas legadas do status judicial continuam disponíveis.');
  assert.ok(hubBody.diagnostics && Array.isArray(hubBody.diagnostics.coverage), 'Diagnóstico reconcilia a cobertura combinada.');
  const pjeCoverage = hubBody.managedCoverage.filter(item => item.system === 'PJe');
  assert.ok(pjeCoverage.length >= 1, 'Portais PJe habilitados devem compor a cobertura gerenciada.');
  const tjmtCoverage = pjeCoverage.find(item => item.id === 'pje-tjmt-1g');
  assert.ok(tjmtCoverage, 'pje-tjmt-1g precisa aparecer na cobertura gerenciada.');
  assert.equal(tjmtCoverage.authStrategy, 'pjeoffice-local');
  assert.equal(tjmtCoverage.enabled, true);
  assert.equal(tjmtCoverage.verification, 'unverified', 'Sem job verificado, a cobertura não pode se declarar verificada.');
  assert.equal(tjmtCoverage.connectivityState, 'action_required', 'Job ERROR honesto vira ação necessária, nunca falso conectado.');
  assert.ok(tjmtCoverage.humanAction, 'Estado degradado precisa de instrução humana.');
  const coverageRaw = JSON.stringify(pjeCoverage.map(item => ({ ...item, totpConfigured: undefined }))).toLowerCase();
  for (const forbidden of ['totp', 'passphrase', 'pfx', 'cookie', 'bearer', 'challenge', 'jsessionid']) {
    assert.ok(!coverageRaw.includes(forbidden), `Cobertura PJe não pode expor ${forbidden}.`);
  }
  console.log('  ✓ managedCoverage inclui PJe com estado honesto, sem segredos e sem remover rotas atuais.');

  console.log('\n>>> API HTTP PJe: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
