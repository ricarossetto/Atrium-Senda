import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PjeSyncService,
  PJE_JOB_STATUS,
  listPjeCommunicationsFromState,
  buildPjePortalsStatus,
  runPjePortalPipeline
} from '../lib/judicial/pje/sync/pje-sync-service.mjs';
import { getPjePortalById } from '../lib/judicial/pje/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — SERVIÇO DE SYNC PJe (JOBS, SINGLE-FLIGHT, AUDITORIA)');
console.log('===============================================================\n');

const auditDir = await mkdtemp(path.join(tmpdir(), 'atrium-pje-audit-'));
const portal = getPjePortalById('pje-tjmt-1g');

function makeExecutor(handler) {
  return async context => handler(context);
}

async function waitFor(service, jobId, statuses, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = service.getJob(jobId);
    if (job && statuses.includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Job ${jobId} não atingiu ${statuses.join('/')}`);
}

try {
  console.log('[T1] Single-flight: segundo clique conecta no job ativo...');
  let releaseExecutor;
  const gate = new Promise(resolve => { releaseExecutor = resolve; });
  const service = new PjeSyncService({
    auditDirectory: auditDir,
    executor: makeExecutor(async ({ portal: targetPortal, onStage }) => {
      onStage({ stage: 'auth', status: 'running' });
      await gate;
      onStage({ stage: 'collect', status: 'done' });
      return {
        runtime: 'server',
        collectorFamily: 'standard-pje',
        authStatus: 'verified',
        expedientesStatus: 'loaded',
        acervoStatus: 'loaded',
        expected: 8,
        collected: 8,
        missing: 0,
        diff: { status: 'CHANGED', added: 10, updated: 0, unchanged: 0, removed: 0 },
        processCounters: { processesCreated: 2, processesUpdated: 0, processesUnchanged: 0 },
        communicationCounters: { communicationsCreated: 4, communicationsUpdated: 0, communicationsUnchanged: 0, communicationsRemoved: 0 },
        reliable: true,
        portal: targetPortal.id
      };
    })
  });
  const first = service.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  assert.equal(first.joinedExisting, false);
  const second = service.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  assert.equal(second.joinedExisting, true);
  assert.equal(second.jobId, first.jobId);
  const running = service.getJob(first.jobId);
  assert.equal(running.status, PJE_JOB_STATUS.RUNNING);
  assert.equal(running.percent, null, 'Percentual não pode ser inventado.');
  releaseExecutor();
  const completed = await waitFor(service, first.jobId, [PJE_JOB_STATUS.COMPLETED]);
  assert.equal(completed.status, PJE_JOB_STATUS.COMPLETED);
  assert.equal(completed.collected, 8);
  assert.equal(completed.communicationCounters.communicationsCreated, 4);
  assert.ok(completed.durationMs !== null);
  console.log('  ✓ Mesmo job reaproveitado; estágio e contadores reais propagados.');

  console.log('[T2] Segunda sync idêntica retorna UNCHANGED...');
  service.executor = makeExecutor(async () => ({
    runtime: 'server',
    collectorFamily: 'standard-pje',
    authStatus: 'verified',
    expedientesStatus: 'loaded',
    acervoStatus: 'loaded',
    expected: 8,
    collected: 8,
    missing: 0,
    diff: { status: 'UNCHANGED', added: 0, updated: 0, unchanged: 10, removed: 0 },
    processCounters: { processesCreated: 0, processesUpdated: 0, processesUnchanged: 2 },
    communicationCounters: { communicationsCreated: 0, communicationsUpdated: 0, communicationsUnchanged: 4, communicationsRemoved: 0 },
    reliable: true
  }));
  const third = service.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  const unchanged = await waitFor(service, third.jobId, [PJE_JOB_STATUS.UNCHANGED]);
  assert.equal(unchanged.status, PJE_JOB_STATUS.UNCHANGED);
  console.log('  ✓ UNCHANGED é estado próprio, não COMPLETED disfarçado.');

  console.log('[T3] Coleta não confiável vira SKIPPED_UNRELIABLE...');
  service.executor = makeExecutor(async () => ({
    runtime: 'server',
    collectorFamily: 'standard-pje',
    authStatus: 'verified',
    expedientesStatus: 'partial',
    acervoStatus: 'loaded',
    expected: 8,
    collected: 1,
    missing: 7,
    diff: { status: 'SKIPPED_UNRELIABLE', added: 0, updated: 0, unchanged: 0, removed: 0 },
    reliable: false
  }));
  const fourth = service.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  const skipped = await waitFor(service, fourth.jobId, [PJE_JOB_STATUS.SKIPPED_UNRELIABLE]);
  assert.equal(skipped.processCounters, null);
  assert.equal(skipped.communicationCounters, null);
  console.log('  ✓ Sem importação e sem contadores quando a coleta não é confiável.');

  console.log('[T4] Falha de auth termina em ERROR com estágio...');
  service.executor = makeExecutor(async () => {
    const error = new Error('TOTP ausente');
    error.outcome = { authStatus: 'error', errorCode: 'AUTH-TOTP-REQUIRED', errorStage: 'auth' };
    throw error;
  });
  const fifth = service.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  const failed = await waitFor(service, fifth.jobId, [PJE_JOB_STATUS.ERROR]);
  assert.equal(failed.errorCode, 'AUTH-TOTP-REQUIRED');
  assert.equal(failed.errorStage, 'auth');
  console.log('  ✓ Erro honesto com código e estágio.');

  console.log('[T5] Auditoria persistida sem segredos...');
  const auditRaw = await readFile(path.join(auditDir, 'sync-audit.jsonl'), 'utf8');
  const lines = auditRaw.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(lines.length >= 4);
  const record = lines[0];
  assert.ok(record.syncId && record.workspaceId && record.portalId);
  assert.ok('finalStatus' in record && 'auth' in record && 'acervo' in record);
  const forbiddenKeys = ['cookie', 'cookies', 'token', 'accessToken', 'refreshToken', 'totpSecret', 'pfxPath', 'passphrase', 'authorization', 'challenge'];
  for (const record of lines) {
    for (const key of Object.keys(record)) {
      assert.ok(!forbiddenKeys.includes(key), `Auditoria não pode conter a chave ${key}.`);
    }
  }
  assert.ok(!/Bearer\s|-----BEGIN|password\s*[:=]/i.test(auditRaw), 'Auditoria não pode conter material secreto.');
  console.log('  ✓ JSONL com syncId/status/contadores e nenhum segredo.');

  console.log('[T6] Communications: filtros e paginação server-side...');
  const state = {
    communications: [
      { id: 'c1', workspaceId: 'ws-alfa', portalId: 'pje-tjmt-1g', processNumber: '0000000-00.2026.8.12.0001', status: 'new', situationMemberships: ['Pendentes de ciência ou de resposta'], sourceReportedDeadlineAt: '2026-09-25', firstSeenAt: 'x', lastSeenAt: 'y', version: 1, deletedAt: null },
      { id: 'c2', workspaceId: 'ws-alfa', portalId: 'pje-tjmt-1g', processNumber: '0000000-00.2026.8.12.0002', status: 'in_review', situationMemberships: [], firstSeenAt: 'x', lastSeenAt: 'y', version: 1, deletedAt: null },
      { id: 'c3', workspaceId: 'ws-beta', portalId: 'pje-tjmt-1g', processNumber: '0000000-00.2026.8.12.0003', status: 'new', situationMemberships: [], firstSeenAt: 'x', lastSeenAt: 'y', version: 1, deletedAt: null }
    ]
  };
  assert.equal(listPjeCommunicationsFromState(state, { workspaceId: 'ws-alfa' }).total, 2);
  assert.equal(listPjeCommunicationsFromState(state, { workspaceId: 'ws-alfa', status: 'in_review' }).total, 1);
  assert.equal(listPjeCommunicationsFromState(state, { workspaceId: 'ws-alfa', hasSourceDeadline: true }).total, 1);
  assert.equal(listPjeCommunicationsFromState(state, { workspaceId: 'ws-alfa', processNumber: '0002' }).total, 1);
  const page = listPjeCommunicationsFromState(state, { workspaceId: 'ws-alfa', page: 2, pageSize: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, 'c2');
  console.log('  ✓ Workspace/filtros/paginação derivados no servidor.');

  console.log('[T7] Status do portal deriva de job verificado, não de credencial...');
  const portals = buildPjePortalsStatus({
    portals: [portal],
    service,
    workspaceId: 'ws-alfa',
    config: { pjeEnabled: true, enabledPortals: [portal.id] }
  });
  assert.equal(portals.length, 1);
  assert.equal(portals[0].statusLabel, 'Erro', 'Último job com erro deve refletir honestamente.');
  const freshService = new PjeSyncService({ executor: makeExecutor(async () => ({})) });
  const freshPortals = buildPjePortalsStatus({ portals: [portal], service: freshService, workspaceId: 'ws-alfa', config: { pjeEnabled: true, enabledPortals: [portal.id] } });
  assert.equal(freshPortals[0].statusLabel, 'Não verificado', 'Sem job confiável não pode aparecer Conectado.');
  console.log('  ✓ Nunca mostra conectado apenas por existir credencial.');
  console.log('[T8] Restart do servidor reconcilia jobs órfãos para ERROR/PROCESS_RESTARTED...');
  const jobsDir = await mkdtemp(path.join(tmpdir(), 'atrium-pje-jobs-'));
  const jobsFile = path.join(jobsDir, 'jobs.json');
  let releaseOrphan;
  const orphanGate = new Promise(resolve => { releaseOrphan = resolve; });
  const serviceA = new PjeSyncService({
    jobsFile,
    executor: makeExecutor(async () => {
      await orphanGate;
      return { runtime: 'server', collectorFamily: 'standard-pje', authStatus: 'verified', expedientesStatus: 'loaded', acervoStatus: 'loaded', reliable: true, diff: { status: 'CHANGED' } };
    })
  });
  const orphan = serviceA.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server' });
  await waitFor(serviceA, orphan.jobId, [PJE_JOB_STATUS.RUNNING]);
  await new Promise(resolve => setTimeout(resolve, 200));
  const serviceB = new PjeSyncService({ jobsFile, executor: makeExecutor(async () => ({})) });
  const recovery = await serviceB.loadAndRecover();
  assert.equal(recovery.recovered, 1);
  const recoveredJob = serviceB.getJob(orphan.jobId);
  assert.equal(recoveredJob.status, PJE_JOB_STATUS.ERROR);
  assert.equal(recoveredJob.errorCode, 'PROCESS_RESTARTED');
  assert.ok(recoveredJob.finishedAt, 'Job órfão precisa de finishedAt.');
  releaseOrphan();
  await new Promise(resolve => setTimeout(resolve, 100));
  await rm(jobsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  console.log('  ✓ Nunca fica eternamente RUNNING após restart.');

  console.log('[T9] Guarda read-only indisponível aborta a coleta (fail-closed)...');
  await assert.rejects(
    () => runPjePortalPipeline({
      portal,
      workspaceId: 'ws-alfa',
      deps: { openSession: async () => ({ page: {} }), credentials: {} }
    }),
    error => error?.outcome?.errorCode === 'PJE-READONLY-GUARD-UNAVAILABLE' && error?.outcome?.errorStage === 'auth',
    'Sem a guarda read-only o pipeline não pode navegar no PJe.'
  );
  console.log('  ✓ Pipeline aborta com código próprio quando a guarda não instala.');

  console.log('[T10] Todo job termina com desfecho declarado no log (status + código + contadores)...');
  {
    const linhas = [];
    const logger = { log: message => linhas.push(String(message)), warn: message => linhas.push('WARN ' + message) };
    const logService = new PjeSyncService({
      logger,
      executor: makeExecutor(async () => ({
        runtime: 'server',
        collectorFamily: 'standard-pje',
        authStatus: 'verified',
        expedientesStatus: 'loaded',
        acervoStatus: 'loaded',
        expected: 6,
        collected: 6,
        missing: 0,
        diff: { status: 'CHANGED', added: 6, updated: 0, unchanged: 0, removed: 0 },
        reliable: true
      }))
    });
    const okJob = logService.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server', trigger: 'scheduled' });
    await waitFor(logService, okJob.jobId, [PJE_JOB_STATUS.COMPLETED]);
    const linhaOk = linhas.find(line => line.includes(`job ${okJob.jobId}`)) || '';
    assert.match(linhaOk, new RegExp(`\\[PjeSync\\] ${portal.id} COMPLETED`), 'sucesso precisa de linha declarada com o status');
    assert.match(linhaOk, /coletados 6\/6/, 'a linha precisa trazer coletados/esperados');
    assert.match(linhaOk, /expedientes loaded · acervo loaded/, 'a linha precisa declarar o estado das duas fontes');
    assert.match(linhaOk, /trigger scheduled/, 'a linha precisa dizer o gatilho do job');

    logService.executor = makeExecutor(async () => ({
      runtime: 'server',
      collectorFamily: 'standard-pje',
      authStatus: 'verified',
      expedientesStatus: 'partial',
      acervoStatus: 'loaded',
      expected: 3,
      collected: 6,
      missing: 0,
      diff: { status: 'SKIPPED_UNRELIABLE' },
      reliable: false
    }));
    const skipJob = logService.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server', trigger: 'scheduled' });
    await waitFor(logService, skipJob.jobId, [PJE_JOB_STATUS.SKIPPED_UNRELIABLE]);
    const linhaSkip = linhas.find(line => line.includes(`job ${skipJob.jobId}`)) || '';
    assert.match(linhaSkip, /SKIPPED_UNRELIABLE/, 'coleta não confiável precisa declarar o desfecho');
    assert.match(linhaSkip, /expedientes partial/, 'a linha precisa dizer QUAL fonte veio parcial');

    logService.executor = makeExecutor(async () => {
      const error = new Error('helper recusou a autenticação');
      error.outcome = { authStatus: 'error', errorCode: 'AUTH-HELPER-REJECTED', errorStage: 'auth' };
      throw error;
    });
    const errorJob = logService.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server', trigger: 'scheduled' });
    await waitFor(logService, errorJob.jobId, [PJE_JOB_STATUS.ERROR]);
    const linhaErro = linhas.find(line => line.includes(`job ${errorJob.jobId}`)) || '';
    assert.match(linhaErro, /ERROR/, 'falha precisa declarar o status');
    assert.match(linhaErro, /errorCode AUTH-HELPER-REJECTED \(estágio auth\)/, 'falha precisa declarar o código e o estágio');
    assert.equal(
      linhas.filter(line => line.includes(`[PjeSync] ${portal.id}`)).length,
      3,
      'cada job termina com exatamente uma linha de desfecho'
    );
  }
  console.log('  ✓ Nenhum job termina em silêncio: status, contadores e código de erro no log.');
  console.log('[T11] Eventos do auth chegam ao job e ao log, sem segredo...');
  {
    const seen = [];
    const logger = { log: message => seen.push(String(message)), warn: message => seen.push('WARN ' + message) };
    const authService = new PjeSyncService({
      logger,
      executor: makeExecutor(async ({ onEvent }) => {
        onEvent({ kind: 'certificate_helper', origin: 'https://pje.tjmt.jus.br', available: true, task: 'ok', seconds: 4 });
        onEvent({ kind: 'panel', origin: 'https://pje.tjmt.jus.br', seconds: 9 });
        return {
          runtime: 'server',
          collectorFamily: 'standard-pje',
          authStatus: 'verified',
          expedientesStatus: 'loaded',
          acervoStatus: 'loaded',
          expected: 1,
          collected: 1,
          missing: 0,
          diff: { status: 'UNCHANGED' },
          reliable: true
        };
      })
    });
    const authJob = authService.requestSync({ workspaceId: 'ws-alfa', portalId: portal.id, portal, runtime: 'server', trigger: 'manual' });
    const finished = await waitFor(authService, authJob.jobId, [PJE_JOB_STATUS.UNCHANGED]);
    assert.equal(finished.authSteps.length, 2, 'os dois estados do auth precisam ficar no job');
    assert.equal(finished.authSteps[0].kind, 'certificate_helper');
    assert.equal(finished.authSteps[0].available, true);
    assert.equal(finished.authSteps[1].kind, 'panel');
    assert.ok(seen.some(line => line.includes('[PjeAuth]')), 'o log precisa declarar o estado do auth');
    assert.equal(JSON.stringify(finished.authSteps).toLowerCase().includes('senha'), false, 'nenhum segredo no diagnostico');
  }
  console.log('  OK: auth deixa trilha observavel (helper, estado, segundos) sem expor segredo.');
} finally {
  await rm(auditDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log('\n>>> SERVIÇO DE SYNC PJe: PASS <<<\n');
