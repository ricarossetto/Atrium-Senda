import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EprocSyncScheduler, SYNC_SCHEDULE_HOURS_BRT, SYNC_TIMEZONE, VERIFIED_PORTALS_SEQUENCE } from '../lib/judicial/eproc/scheduler/sync-scheduler.mjs';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';

async function runSchedulerContractTest() {
  console.log('=== TESTE FOCAL: EPROC SCHEDULER CONTRACT & MULTI-TENANT ISOLATION (WAVE D) ===\n');

  // 1. Schedule Hours & Timezone
  assert.deepEqual(SYNC_SCHEDULE_HOURS_BRT, [7, 12, 19], 'Janelas de sincronização devem ser 07:00, 12:00 e 19:00 BRT');
  assert.equal(SYNC_TIMEZONE, 'America/Sao_Paulo');
  assert.deepEqual(VERIFIED_PORTALS_SEQUENCE, ['tjrs-eproc-1g'], 'Somente portal com evidência live positiva pode integrar a sequência operacional padrão');

  const scheduler = new EprocSyncScheduler();
  const date7am = new Date('2026-09-14T10:00:00.000Z'); // 10:00 UTC = 07:00 BRT
  assert.equal(scheduler.isScheduledSyncTime(date7am), true, '10:00 UTC deve corresponder a 07:00 BRT');

  const dateNoon = new Date('2026-09-14T15:00:00.000Z'); // 15:00 UTC = 12:00 BRT
  assert.equal(scheduler.isScheduledSyncTime(dateNoon), true, '15:00 UTC deve corresponder a 12:00 BRT');

  const date7pm = new Date('2026-09-14T22:00:00.000Z'); // 22:00 UTC = 19:00 BRT
  assert.equal(scheduler.isScheduledSyncTime(date7pm), true, '22:00 UTC deve corresponder a 19:00 BRT');

  const date8am = new Date('2026-09-14T11:00:00.000Z'); // 11:00 UTC = 08:00 BRT
  assert.equal(scheduler.isScheduledSyncTime(date8am), false, '08:00 BRT não é horário de coleta pesada');

  // Verify that 19:00 UTC does NOT match 19:00 BRT (19:00Z is 16:00 BRT)
  const date19Z = new Date('2026-09-14T19:00:00.000Z'); // 19:00 UTC = 16:00 BRT
  assert.equal(scheduler.isScheduledSyncTime(date19Z), false, '19:00 UTC é 16:00 BRT e NÃO deve ativar sync');
  console.log('✓ 1. Janela de agendamento automático validada: 07:00 (10:00Z) e 19:00 (22:00Z) America/Sao_Paulo.');

  // 2. Single-Flight Locking
  let executionSteps = [];
  let releasePipeline = () => {};
  const pipelineGate = new Promise(resolve => { releasePipeline = resolve; });
  let pipelineGateConsumed = false;

  const mockOrchestrator = {
    syncPortal: async (portalId, { onProgress }) => {
      executionSteps.push(portalId);
      if (!pipelineGateConsumed) {
        pipelineGateConsumed = true;
        await pipelineGate;
      }
      if (portalId === 'tjrs-eproc-2g') {
        throw new Error('Falha de rede simulada no TJRS 2G');
      }
      onProgress({
        phase: 'complete',
        determinate: true,
        percent: 100,
        counts: { processes: 10, deadlines: 3, hearings: 1, documents: 5 }
      });
      return { ok: true, counts: { processes: 10, deadlines: 3, hearings: 1, documents: 5 } };
    }
  };

  const syncEngine = new EprocSyncScheduler({ orchestrator: mockOrchestrator });

  const job1 = await syncEngine.requestSync({
    workspaceId: 'workspace-lawyer-alpha',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g', 'tjrs-eproc-2g', 'jfrs-eproc-1g', 'trf4-eproc-2g']
  });

  assert.equal(job1.ok, true);
  assert.equal(job1.manual, true);

  // Attempt concurrent sync on same workspace
  const job2 = await syncEngine.requestSync({
    workspaceId: 'workspace-lawyer-alpha',
    trigger: 'manual'
  });

  assert.equal(job2.alreadyRunning, true, 'Deve impedir sincronizações simultâneas');
  assert.equal(job2.joinedExisting, true, 'Deve indicar joinedExisting: true sem erro 409');
  assert.equal(job2.status, 'running', 'Deve retornar status running do job em execução');
  assert.equal(job2.jobId, job1.jobId, 'Deve retornar o identificador do job já ativo');

  // 2a. Escopo divergente jamais pode ser reportado como sucesso do alvo pedido.
  const mismatchedNowait = await syncEngine.requestSync({
    workspaceId: 'workspace-lawyer-alpha',
    trigger: 'manual',
    portals: ['jfrs-eproc-1g'],
    targetProcessNumber: '5000001-00.2026.8.21.0016'
  });
  assert.equal(mismatchedNowait.joinedExisting, true);
  assert.equal(mismatchedNowait.joinedScopeMismatch, true, 'Join deve sinalizar escopo divergente');

  const sameScopeJoin = await syncEngine.requestSync({
    workspaceId: 'workspace-lawyer-alpha',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g', 'tjrs-eproc-2g', 'jfrs-eproc-1g', 'trf4-eproc-2g']
  });
  assert.equal(sameScopeJoin.joinedExisting, true);
  assert.equal(sameScopeJoin.joinedScopeMismatch, undefined, 'Mesmo escopo reingressa sem divergência');
  releasePipeline();
  await new Promise(resolve => setTimeout(resolve, 80));
  console.log('✓ 2. Single-flight locking comprovado: zero concorrência sobre o mesmo workspace e retorno de joinedExisting.');

  // 2a2. Join com espera de escopo divergente não pode devolver sucesso.
  const waitScheduler = new EprocSyncScheduler({
    orchestrator: { syncPortal: async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { ok: true }; } }
  });
  await waitScheduler.requestSync({ workspaceId: 'ws-wait-scope', trigger: 'manual', portals: ['tjrs-eproc-1g'] });
  const waitMismatch = await waitScheduler.requestSync({
    workspaceId: 'ws-wait-scope',
    trigger: 'manual',
    portals: ['jfrs-eproc-1g'],
    targetProcessNumber: '5000001-00.2026.8.21.0016',
    waitForCompletion: true
  });
  assert.equal(waitMismatch.joinedScopeMismatch, true);
  assert.equal(waitMismatch.completed, true);
  assert.equal(waitMismatch.ok, false, 'Escopo divergente não pode devolver sucesso mesmo aguardando o job ativo');

  // 2a3. Join de job manual ativo não pode consumir o slot agendado.
  const joinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-eproc-slot-join-'));
  const joinScheduler = new EprocSyncScheduler({
    dataDirectory: joinDir,
    orchestrator: { syncPortal: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return { ok: true }; } }
  });
  const runningJob = await joinScheduler.requestSync({ workspaceId: 'ws-slot-join', trigger: 'manual' });
  assert.equal(runningJob.alreadyRunning, undefined);
  const scheduledJoin = await joinScheduler.requestSync({ workspaceId: 'ws-slot-join', trigger: 'scheduled' });
  assert.equal(scheduledJoin.joinedExisting, true);
  const nowSlotKey = joinScheduler.getScheduledSlotKey('ws-slot-join', new Date());
  assert.equal(joinScheduler.hasSlotExecuted(nowSlotKey), false, 'Ingressar em job ativo não pode consumir o slot agendado');
  await new Promise(resolve => setTimeout(resolve, 120));
  try { fs.rmSync(joinDir, { recursive: true, force: true }); } catch {}
  console.log('✓ 2c. Escopo divergente com espera falha fechado e slot agendado é preservado em join.');

  // Wait for background pipeline to complete
  await new Promise(r => setTimeout(r, 150));

  // 2b. Scheduled Slot Idempotency & SQLite Persistence
  const date7am_02 = new Date('2026-09-14T10:00:02.000Z'); // 07:00:02 BRT
  const date7am_32 = new Date('2026-09-14T10:00:32.000Z'); // 07:00:32 BRT

  const tempSlotsDir = path.join(process.cwd(), 'data', `test-slots-${Date.now()}`);
  const slotScheduler = new EprocSyncScheduler({ dataDirectory: tempSlotsDir });

  const slotKey = slotScheduler.getScheduledSlotKey('ws-idempotency', date7am_02);
  assert.equal(slotKey, 'ws-idempotency:2026-09-14:07:00:America/Sao_Paulo');

  // 07:00:02 -> Slot is open and ready to run
  assert.equal(slotScheduler.shouldRunScheduledSync('ws-idempotency', date7am_02), true);
  
  // Trigger scheduled sync for this slot (writes to SQLite and JSON)
  slotScheduler.markSlotExecuted(slotKey, { workspaceId: 'ws-idempotency' });

  // Verify persistence files exist
  assert.ok(fs.existsSync(path.join(tempSlotsDir, 'eproc-sync-slots.sqlite')), 'Tabela SQLite eproc_sync_slots deve existir');
  assert.ok(fs.existsSync(path.join(tempSlotsDir, 'eproc-scheduled-slots.json')), 'Arquivo JSON de fallback deve existir');

  // 07:00:32 -> Same slot within the 30s window must NOT run again
  assert.equal(slotScheduler.shouldRunScheduledSync('ws-idempotency', date7am_32), false, '07:00:32 não pode reexecutar o mesmo slot');

  // Fast job finished scenario: job is no longer running in activeJobs, but slot is remembered
  assert.equal(slotScheduler.activeJobs.has('ws-idempotency'), false, 'Job já encerrou');
  assert.equal(slotScheduler.shouldRunScheduledSync('ws-idempotency', date7am_32), false, 'Slot não reexecuta mesmo com job encerrado');

  // Restart scenario: new instance loads persisted slots from SQLite & disk
  const restartedScheduler = new EprocSyncScheduler({ dataDirectory: tempSlotsDir });
  assert.equal(restartedScheduler.hasSlotExecuted(slotKey), true, 'Novo scheduler após restart lê slots do SQLite');
  assert.equal(restartedScheduler.shouldRunScheduledSync('ws-idempotency', date7am_32), false, 'Restart dentro da janela não causa replay');

  // Clean up test slots
  try { fs.rmSync(tempSlotsDir, { recursive: true, force: true }); } catch {}
  console.log('✓ 2b. Slot idempotency e persistência SQLite comprovados: 07:00:02 executa, 07:00:32 deduped, e sobrevive a restart.');

  // 3. Failure Isolation
  const finalStatus = syncEngine.getJobStatus('workspace-lawyer-alpha');
  assert.equal(finalStatus.active, false);
  assert.equal(finalStatus.job.state, 'ERROR', 'Falha de qualquer portal não pode produzir false success no job agregado');
  assert.equal(finalStatus.job.overall.completedPortals, 4);

  const tjrs1 = finalStatus.job.portals.find(p => p.portalId === 'tjrs-eproc-1g');
  assert.equal(tjrs1.state, 'COMPLETED');
  assert.equal(tjrs1.error, null);

  const tjrs2 = finalStatus.job.portals.find(p => p.portalId === 'tjrs-eproc-2g');
  assert.equal(tjrs2.state, 'ERROR');
  assert.ok(tjrs2.error.includes('Falha de rede'));

  const jfrs1 = finalStatus.job.portals.find(p => p.portalId === 'jfrs-eproc-1g');
  assert.equal(jfrs1.state, 'COMPLETED', 'Falha no TJRS 2G não deve abortar JFRS 1G');

  const trf4 = finalStatus.job.portals.find(p => p.portalId === 'trf4-eproc-2g');
  assert.equal(trf4.state, 'COMPLETED', 'Falha anterior não deve abortar TRF4 2G');
  console.log('✓ 3. Isolamento sequencial de falhas: erro em um portal não aborta os demais.');

  // 4. Credential Scoping: workspace + judicialIdentity + credentialScope
  const mockSecrets = {
    workspaces: {
      'escritorio-a': {
        identities: {
          'advogado-ricardo': {
            totpSecrets: {
              'trf4-eproc': { secret: 'SECRET_TRF4_RICARDO' }
            }
          }
        }
      },
      'escritorio-b': {
        identities: {
          'advogado-parceiro': {
            totpSecrets: {
              'trf4-eproc': { secret: 'SECRET_TRF4_PARCEIRO' }
            }
          }
        }
      }
    }
  };

  const secretsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-eproc-scheduler-secrets-'));
  fs.writeFileSync(path.join(secretsDir, 'judicial-integrations.json'), JSON.stringify({ version: 2, encrypted: 'mock' }), 'utf8');
  const cm = new JudicialCredentialManager({
    dataDirectory: secretsDir,
    securityManager: { decrypt: () => JSON.stringify(mockSecrets) }
  });

  const ricardoSecret = await cm.getPortalTotpSecret('jfrs-eproc-1g', 'advogado-ricardo', 'escritorio-a');
  assert.equal(ricardoSecret, 'SECRET_TRF4_RICARDO');

  const parceiroSecret = await cm.getPortalTotpSecret('trf4-eproc-2g', 'advogado-parceiro', 'escritorio-b');
  assert.equal(parceiroSecret, 'SECRET_TRF4_PARCEIRO');

  // Verify cross-workspace isolation
  const crossSecret = await cm.getPortalTotpSecret('jfrs-eproc-1g', 'advogado-ricardo', 'escritorio-b');
  assert.equal(crossSecret, null, 'Não deve vazar segredo entre escritórios distintos');
  fs.rmSync(secretsDir, { recursive: true, force: true });
  console.log('✓ 4. Escopo de credenciais multitenant (workspace + judicialIdentity + credentialScope) estritamente isolado.');

  // 5. Conclusão com ressalvas: portal com erro que ainda coletou itens não é ERROR.
  const partialOrchestrator = {
    syncPortal: async (portalId, { onProgress }) => {
      onProgress({ phase: 'complete', determinate: true, percent: 100, counts: { processes: 3 } });
      return { ok: false, error: 'Falha sintética após coletar parte dos itens.', counts: { processes: 3, deadlines: 0 } };
    }
  };
  const partialScheduler = new EprocSyncScheduler({ orchestrator: partialOrchestrator });
  const partialJob = await partialScheduler.requestSync({
    workspaceId: 'workspace-lawyer-partial',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g'],
    waitForCompletion: true
  });
  assert.equal(partialJob.ok, true, 'Coleta parcial com dados persistidos não é falha total');
  assert.equal(partialJob.status, 'COMPLETED_WITH_WARNINGS', 'Job deve reportar conclusão com ressalvas');
  const partialPortalMeta = Array.isArray(partialJob.job?.portals) ? partialJob.job.portals[0] : null;
  assert.equal(partialPortalMeta?.state, 'PARTIAL', 'Portal que coletou parte dos itens fica PARTIAL');
  assert.ok(
    Array.isArray(partialPortalMeta?.warnings) && partialPortalMeta.warnings.some(text => /ressalvas/i.test(text)),
    'Ressalva precisa ser explícita no portal'
  );

  const emptyOrchestrator = {
    syncPortal: async () => ({ ok: false, error: 'Falha sintética sem nenhum item coletado.', counts: { processes: 0, deadlines: 0 } })
  };
  const emptyScheduler = new EprocSyncScheduler({ orchestrator: emptyOrchestrator });
  const emptyJob = await emptyScheduler.requestSync({
    workspaceId: 'workspace-lawyer-empty',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g'],
    waitForCompletion: true
  });
  assert.equal(emptyJob.ok, false, 'Falha sem nenhum dado coletado continua sendo erro');
  assert.equal(emptyJob.status, 'ERROR', 'Portal sem dados coletados permanece ERROR');
  assert.equal(emptyJob.job?.portals?.[0]?.state, 'ERROR');
  console.log('✓ 5. Estado do job separa "concluída com ressalvas" de "falhou" (sem mascarar erro real).');

  console.log('\n>>> EPROC SCHEDULER & MULTITENANT ISOLATION TEST PASSED! <<<\n');
}

runSchedulerContractTest().catch(err => {
  console.error('Falha no teste de agendador:', err);
  process.exit(1);
});
