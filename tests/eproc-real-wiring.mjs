import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JudicialOrchestrator } from '../lib/judicial/orchestrator.mjs';
import { reconcileManagedEprocCoverage } from '../lib/judicial/coverage-reconciliation.mjs';
import { createEprocRuntimeExecutor } from '../lib/judicial/eproc/runtime-executor.mjs';
import { listLiveSyncVerifiedEprocPortals, isEprocPortalLiveSyncVerified } from '../lib/judicial/eproc/portal-registry.mjs';
import { sweepAndEnrichProcessesWithA1 } from '../lib/judicial/eproc-a1-downloader.mjs';
import { serverSourceText } from './server-source.mjs';

const dataDirectory = path.join(process.cwd(), 'data', `temp-eproc-real-wiring-${process.pid}`);
const workspaceId = 'workspace-wiring-a';
const securityManager = { encrypt: value => value, decrypt: value => value };
const orchestrators = [];

async function waitForJob(orchestrator, id) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = orchestrator.getEprocSyncJobStatus(id);
    if (status?.active === false) return status.job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timeout aguardando job focal eproc.');
}

async function createOrchestrator(sweep) {
  const orchestrator = new JudicialOrchestrator({ dataDirectory, securityManager, portalsConfig: [] });
  await orchestrator.init();
  orchestrator.setEprocPortalSyncExecutor(createEprocRuntimeExecutor({ sweep }));
  orchestrators.push(orchestrator);
  return orchestrator;
}

try {
  fs.rmSync(dataDirectory, { recursive: true, force: true });
  assert.deepEqual(listLiveSyncVerifiedEprocPortals().map(portal => portal.id), ['tjrs-eproc-1g']);
  for (const portalId of ['trf4-eproc-2g', 'jfrs-eproc-1g', 'tjrs-eproc-2g', 'jfsc-eproc-1g', 'jfpr-eproc-1g']) {
    assert.equal(isEprocPortalLiveSyncVerified(portalId), false);
  }
  assert.equal(isEprocPortalLiveSyncVerified('jfsc-eproc-1g'), false);
  assert.equal(isEprocPortalLiveSyncVerified('jfpr-eproc-1g'), false);
  const schedulerSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'judicial', 'eproc', 'scheduler', 'sync-scheduler.mjs'), 'utf8');
  const orchestratorSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'judicial', 'orchestrator.mjs'), 'utf8');
  const executorSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'judicial', 'eproc', 'runtime-executor.mjs'), 'utf8');
  const downloaderSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'judicial', 'eproc-a1-downloader.mjs'), 'utf8');
  const serverSource = serverSourceText;
  assert.doesNotMatch(schedulerSource, /VERIFIED_PORTALS_SEQUENCE\s*=\s*Object\.freeze\(\s*\[/);
  assert.doesNotMatch(`${orchestratorSource}\n${executorSource}`, /(?:===|!==)\s*['"]tjrs-eproc-1g['"]/);
  assert.doesNotMatch(downloaderSource, /progress:\s*(?:70|80|95)\b/);
  assert.doesNotMatch(executorSource, /acquireEprocLock|releaseEprocLock/);
  const runtimeRegistration = serverSource.slice(
    serverSource.indexOf('setEprocPortalSyncExecutor(createEprocRuntimeExecutor'),
    serverSource.indexOf('}));', serverSource.indexOf('setEprocPortalSyncExecutor(createEprocRuntimeExecutor')) + 4
  );
  assert.doesNotMatch(runtimeRegistration, /acquireEprocLock|releaseEprocLock/);
  const syncRoute = serverSource.slice(
    serverSource.indexOf("url.pathname === '/api/integrations/eproc/sync'"),
    serverSource.indexOf("url.pathname === '/api/judicial/sync-status'")
  );
  assert.match(syncRoute, /readJson\(req,\s*20_000\)/, 'Rota eproc deve ler a seleção explícita enviada pela UI.');
  assert.match(syncRoute, /portals:\s*Array\.isArray\(body\.portals\)/, 'Rota eproc deve encaminhar os portais selecionados ao scheduler.');

  let releaseSweep;
  let calls = 0;
  const successfulSweep = async ({ judicialOperation, profileKey, onProgress, maxProcesses }) => {
    calls += 1;
    assert.equal(judicialOperation, 'syncReadOnly');
    assert.equal(profileKey, 'scheduler-workspace-wiring-a');
    assert.equal(maxProcesses, 4, 'Sweep sem valor explícito deve usar o default do executor (4), nunca 0.');
    onProgress({ phase: 'collecting', determinate: false, progress: null, completed: null, total: null });
    if (calls === 1) await new Promise(resolve => { releaseSweep = resolve; });
    onProgress({ phase: 'completed', determinate: true, progress: 100, completed: 1, total: 1 });
    return { ok: true, sweptCount: 1, enrichedCount: 1, newIntimationsCount: 2, updatedProcesses: [{ number: 'synthetic-a' }] };
  };

  const first = await createOrchestrator(successfulSweep);
  const requested = await first.requestEprocSync({ workspaceId, trigger: 'manual' });
  const joined = await first.requestEprocSync({ workspaceId, trigger: 'manual' });
  assert.equal(joined.joinedExisting, true);
  assert.equal(joined.jobId, requested.jobId);
  for (let attempt = 0; attempt < 100 && !releaseSweep; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(calls, 1);
  assert.equal(typeof releaseSweep, 'function');
  releaseSweep();
  const successfulJob = await waitForJob(first, workspaceId);
  assert.equal(successfulJob.state, 'COMPLETED');
  const successfulPortal = successfulJob.portals.find(portal => portal.portalId === 'tjrs-eproc-1g');
  assert.deepEqual(successfulPortal.counts, { processes: 1, enrichedProcesses: 1, deadlines: 0, intimations: 2 });

  const successfulStatus = await first.getEprocIntegrationsStatus(workspaceId);
  const persistedAt = successfulStatus.portals.find(portal => portal.id === 'tjrs-eproc-1g').lastSuccessfulSyncAt;
  assert.ok(persistedAt);

  const candidateWorkspace = 'workspace-manual-candidate';
  const candidate = await createOrchestrator(async ({ portalId, allowUnverified, onProgress }) => {
    assert.equal(portalId, 'tjrs-eproc-2g');
    assert.equal(allowUnverified, true);
    onProgress({ phase: 'completed', determinate: true, progress: 100, completed: 1, total: 1 });
    return { ok: true, sweptCount: 1, enrichedCount: 1, newIntimationsCount: 0, updatedProcesses: [] };
  });
  await candidate.requestEprocSync({ workspaceId: candidateWorkspace, trigger: 'manual', portals: ['tjrs-eproc-2g'] });
  const candidateJob = await waitForJob(candidate, candidateWorkspace);
  assert.equal(candidateJob.state, 'COMPLETED', 'Candidato manual deve concluir somente após leitura real positiva.');
  const candidateStatus = await candidate.getEprocIntegrationsStatus(candidateWorkspace);
  assert.ok(candidateStatus.portals.find(portal => portal.id === 'tjrs-eproc-2g')?.lastSuccessfulSyncAt);

  const scheduledCalls = [];
  const scheduledAfterReload = await createOrchestrator(async ({ portalId, allowUnverified, onProgress, maxProcesses }) => {
    scheduledCalls.push({ portalId, allowUnverified, maxProcesses });
    onProgress({ phase: 'completed', determinate: true, progress: 100, completed: 1, total: 1 });
    return { ok: true, sweptCount: 1, enrichedCount: 1, newIntimationsCount: 0, updatedProcesses: [] };
  });
  await scheduledAfterReload.requestEprocSync({ workspaceId: candidateWorkspace, trigger: 'scheduled' });
  const scheduledJob = await waitForJob(scheduledAfterReload, candidateWorkspace);
  assert.equal(scheduledJob.state, 'COMPLETED', 'Evidência persistida deve autorizar o portal no ciclo agendado após reload.');
  assert.deepEqual(
    scheduledCalls.map(call => call.portalId).sort(),
    ['tjrs-eproc-1g', 'tjrs-eproc-2g'],
    'O agendamento combina o portal estaticamente verificado com o portal validado neste workspace.'
  );
  assert.equal(scheduledCalls.find(call => call.portalId === 'tjrs-eproc-2g')?.allowUnverified, true);
  assert.deepEqual(
    [...new Set(scheduledCalls.map(call => call.maxProcesses))],
    [4],
    'Regressão: agendamento sem maxProcesses explícito deve enriquecer com o default do executor (null não pode virar 0).'
  );

  const isolatedScheduledCalls = [];
  const isolatedScheduled = await createOrchestrator(async ({ portalId, onProgress }) => {
    isolatedScheduledCalls.push(portalId);
    onProgress({ phase: 'completed', determinate: true, progress: 100, completed: 1, total: 1 });
    return { ok: true, sweptCount: 1, enrichedCount: 1, newIntimationsCount: 0, updatedProcesses: [] };
  });
  await isolatedScheduled.requestEprocSync({ workspaceId: 'workspace-without-candidate-evidence', trigger: 'scheduled' });
  await waitForJob(isolatedScheduled, 'workspace-without-candidate-evidence');
  assert.deepEqual(isolatedScheduledCalls, ['tjrs-eproc-1g'], 'Evidência de um workspace não pode habilitar portal em outro.');

  const blocked = await createOrchestrator(async () => ({ ok: true }));
  await blocked.requestEprocSync({ workspaceId: 'workspace-blocked-candidate', trigger: 'manual', portals: ['jfsc-eproc-1g'] });
  const blockedJob = await waitForJob(blocked, 'workspace-blocked-candidate');
  assert.equal(blockedJob.state, 'ERROR');
  assert.match(blockedJob.portals[0].error, /não possui conexão live verificada/i);

  const partialSweep = async ({ onProgress }) => {
    onProgress({ phase: 'partial_error', determinate: false, progress: null, completed: null, total: null });
    return {
      ok: false,
      partial: true,
      error: 'Falha real no processo B.',
      errors: [{ scope: 'process', processNumber: 'synthetic-b', error: 'Falha real no processo B.' }],
      sweptCount: 2,
      enrichedCount: 1,
      newIntimationsCount: 0,
      updatedProcesses: [{ number: 'synthetic-a' }]
    };
  };

  const restarted = await createOrchestrator(partialSweep);
  const afterRestart = await restarted.getEprocIntegrationsStatus(workspaceId);
  assert.equal(afterRestart.portals.find(portal => portal.id === 'tjrs-eproc-1g').lastSuccessfulSyncAt, persistedAt);
  await restarted.requestEprocSync({ workspaceId, trigger: 'manual' });
  const failedJob = await waitForJob(restarted, workspaceId);
  assert.equal(failedJob.state, 'COMPLETED_WITH_WARNINGS', 'Coleta com itens confirmados e erro parcial é "concluída com ressalvas", não falha total.');
  assert.equal(failedJob.portals.find(portal => portal.portalId === 'tjrs-eproc-1g').state, 'PARTIAL');
  const failedPortal = failedJob.portals.find(portal => portal.portalId === 'tjrs-eproc-1g');
  assert.deepEqual(failedPortal.counts, { processes: 2, enrichedProcesses: 1, deadlines: 0, intimations: 0 });
  assert.equal(failedPortal.partialResults.updatedProcesses[0].number, 'synthetic-a');
  assert.equal(failedPortal.errors[0].processNumber, 'synthetic-b');
  const afterFailure = await restarted.getEprocIntegrationsStatus(workspaceId);
  const failedStatus = afterFailure.portals.find(portal => portal.id === 'tjrs-eproc-1g');
  assert.equal(failedStatus.lastSuccessfulSyncAt, persistedAt, 'Falha posterior deve preservar a evidência do último sucesso.');
  assert.equal(failedStatus.status, 'error', 'Falha posterior deve aparecer como erro corrente no status do portal.');
  assert.match(failedStatus.lastError || '', /Falha real no processo B\./, 'O erro corrente deve ser exposto sem apagar o sucesso histórico.');

  // Sucesso posterior deve encerrar o erro corrente (sem ficar preso em "Erro na última sincronização").
  const recoveredMaxValues = [];
  const recovered = await createOrchestrator(async ({ maxProcesses }) => {
    recoveredMaxValues.push(maxProcesses);
    return { ok: true, sweptCount: 1, enrichedCount: 1 };
  });
  await recovered.requestEprocSync({ workspaceId, trigger: 'manual' });
  const recoveredJob = await waitForJob(recovered, workspaceId);
  assert.equal(recoveredJob.state, 'COMPLETED');
  assert.deepEqual(recoveredMaxValues, [4], 'Sweep manual sem valor explícito deve usar o default (4).');
  await recovered.requestEprocSync({ workspaceId, trigger: 'manual', maxProcesses: 0 });
  const zeroJob = await waitForJob(recovered, workspaceId);
  assert.equal(zeroJob.state, 'COMPLETED');
  assert.deepEqual(recoveredMaxValues, [4, 0], 'Valor explícito 0 (relatório sem enriquecimento) deve ser respeitado.');
  const afterRecovery = await recovered.getEprocIntegrationsStatus(workspaceId);
  const recoveredStatus = afterRecovery.portals.find(portal => portal.id === 'tjrs-eproc-1g');
  assert.equal(recoveredStatus.lastError, null, 'Sucesso posterior deve limpar o erro corrente do portal.');
  assert.equal(recoveredStatus.status, 'connected', 'Portal com sucesso recente deve voltar a conectado.');
  assert.notEqual(recoveredStatus.lastSuccessfulSyncAt, null);

  // Estado de intervenção humana herdado do coletor legado não pode prender o eproc.
  const staleActionCoverage = reconcileManagedEprocCoverage([{
    id: 'tjrs-eproc-1g', system: 'eproc', connectivityState: 'action_required', humanAction: 'Conclua o login no portal.'
  }], [{
    id: 'tjrs-eproc-1g', status: 'ready', lastError: null, lastSuccessfulSyncAt: null,
    lastAttemptAt: '2026-09-17T00:00:00.000Z'
  }]);
  assert.equal(staleActionCoverage[0].connectivityState, 'not_verified', 'Eproc sem erro oficial deve ficar como não verificado.');
  assert.equal(staleActionCoverage[0].humanAction, null, 'Ação humana legada não pode permanecer no eproc.');

  const coverageBase = [{
    id: 'tjrs-eproc-1g', system: 'eproc', connectivityState: 'error',
    verification: 'verified', lastError: 'erro antigo', lastSuccessfulSyncAt: persistedAt,
    humanAction: 'Conclua o login, CAPTCHA ou segundo fator no portal.'
  }, { id: 'djen-cnj', system: 'djen', connectivityState: 'connected' }];
  const activeCoverage = reconcileManagedEprocCoverage(coverageBase, [{
    id: 'tjrs-eproc-1g', status: 'pending', lastError: 'erro antigo', lastSuccessfulSyncAt: persistedAt,
    lastAttemptAt: '2026-09-16T12:00:00.000Z'
  }]);
  assert.equal(activeCoverage[0].connectivityState, 'authenticating', 'PENDING ativo deve prevalecer sobre erro antigo.');
  assert.equal(activeCoverage[0].lastError, null, 'PENDING ativo não deve expor erro obsoleto.');
  const failedCoverage = reconcileManagedEprocCoverage(coverageBase, [{
    id: 'tjrs-eproc-1g', status: 'error', lastError: 'erro atual', lastSuccessfulSyncAt: persistedAt,
    lastAttemptAt: '2026-09-16T12:01:00.000Z'
  }]);
  assert.equal(failedCoverage[0].connectivityState, 'error');
  assert.equal(failedCoverage[0].lastSuccessfulSyncAt, persistedAt, 'Erro atual deve preservar último sucesso.');
  assert.equal(failedCoverage[0].lastAttemptAt, '2026-09-16T12:01:00.000Z');
  assert.equal(failedCoverage[0].humanAction, null, 'Erro oficial do eproc não herda o texto legado de intervenção do coletor.');
  assert.equal(failedCoverage[1].connectivityState, 'connected', 'Reconciliador não deve alterar fontes não eproc.');

  const isolated = await restarted.getEprocIntegrationsStatus('workspace-wiring-b');
  assert.equal(isolated.portals.find(portal => portal.id === 'tjrs-eproc-1g').lastSuccessfulSyncAt, null);

  await assert.rejects(
    () => sweepAndEnrichProcessesWithA1({ judicialOperation: 'acknowledgeIntimation' }),
    /operação judicial bloqueada por default-deny/i
  );

  console.log('EPROC REAL WIRING: PASS');
} finally {
  for (const orchestrator of orchestrators) orchestrator.syncScheduler.sqliteDb?.close();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
}
