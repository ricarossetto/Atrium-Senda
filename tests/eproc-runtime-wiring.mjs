import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JudicialOrchestrator } from '../lib/judicial/orchestrator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(process.cwd(), 'data', 'temp_runtime');

async function runRuntimeWiringTest() {
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log('=== TESTE FOCAL: EPROC SCHEDULER & RUNTIME WIRING AUDIT ===\n');

  // 1. Instantiation via JudicialOrchestrator
  const orchestrator = new JudicialOrchestrator({
    dataDirectory: DATA_DIR,
    securityManager: { encrypt: (x) => x, decrypt: (x) => x },
    portalsConfig: [
      { id: 'tjrs-eproc-1g', name: 'TJRS 1G' },
      { id: 'jfrs-eproc-1g', name: 'JFRS 1G' }
    ]
  });

  assert.ok(orchestrator.syncScheduler, 'Orchestrator deve instanciar EprocSyncScheduler no runtime');
  console.log('✓ 1. Instanciação e registro do EprocSyncScheduler no JudicialOrchestrator confirmados.');
  await orchestrator.init();
  const initialPortalStatus = await orchestrator.getEprocIntegrationsStatus('workspace-alpha');
  const initialTjrs = initialPortalStatus.portals.find(portal => portal.id === 'tjrs-eproc-1g');
  const initialJfsc = initialPortalStatus.portals.find(portal => portal.id === 'jfsc-eproc-1g');
  const initialJfpr = initialPortalStatus.portals.find(portal => portal.id === 'jfpr-eproc-1g');
  assert.equal(initialTjrs.connectionVerified, false, 'Credencial não pode equivaler a conexão verificada');
  assert.equal(initialTjrs.lastSuccessfulSyncAt, null, 'Sem execução real não pode haver last success');
  assert.equal(initialJfsc.statusLabel, 'Disponível — aguardando conexão/verificação');
  assert.equal(initialJfpr.statusLabel, 'Disponível — aguardando conexão/verificação');

  // Simulated portal sync runner with brief async delay to demonstrate concurrent lock
  orchestrator.syncPortal = async (portalId, { onProgress }) => {
    onProgress({
      state: 'RUNNING',
      phase: 'process_report',
      action: `Gerando relatório oficial para ${portalId}...`,
      determinate: true,
      completed: 10,
      total: 20,
      percent: 50,
      counts: { processes: 5 }
    });
    await new Promise(r => setTimeout(r, 60));
    return { ok: true, counts: { processes: 5 } };
  };

  // 2. Manual Sync Wiring: requestEprocSync({ trigger: 'manual' })
  const manualJobRes = await orchestrator.requestEprocSync({
    workspaceId: 'workspace-alpha',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g', 'jfrs-eproc-1g']
  });

  assert.equal(manualJobRes.ok, true);
  assert.equal(manualJobRes.manual, true);
  assert.ok(manualJobRes.jobId.startsWith('sync-'), 'Job ID único gerado');
  console.log('✓ 2. Disparo manual acoplado à fila única do scheduler com Job ID:', manualJobRes.jobId);

  // 3. Single Flight Lock on Concurrent Request
  const concurrentRes = await orchestrator.requestEprocSync({
    workspaceId: 'workspace-alpha',
    trigger: 'manual',
    portals: ['tjrs-eproc-1g']
  });

  assert.equal(concurrentRes.alreadyRunning, true, 'Deve indicar que o job já está em execução');
  assert.equal(concurrentRes.joinedExisting, true, 'Deve indicar joinedExisting: true sem erro 409');
  assert.equal(concurrentRes.status, 'running', 'Deve retornar status running do job');
  assert.equal(concurrentRes.jobId, manualJobRes.jobId, 'Deve reutilizar o mesmo jobId');
  console.log('✓ 3. Single-flight lock sem 409 comprovado: request concorrente une-se ao job ativo (joinedExisting: true).');

  // 4. Queryable Telemetry Status
  const statusRes = orchestrator.getEprocSyncJobStatus('workspace-alpha');
  assert.ok(statusRes, 'Status do job deve ser consultável por API');
  const job = statusRes.job;
  assert.equal(job.id, manualJobRes.jobId);
  assert.equal(job.workspaceId, 'workspace-alpha');
  assert.equal(job.trigger, 'manual');
  assert.ok(job.startedAt);
  assert.ok(job.overall);
  assert.ok(Array.isArray(job.portals));
  assert.equal(job.portals.length, 2);

  const p0 = job.portals[0];
  assert.ok(['PENDING', 'RUNNING', 'COMPLETED'].includes(p0.state));
  assert.ok(typeof p0.percent === 'number');
  assert.ok(p0.phase);
  assert.ok(p0.action);
  assert.ok(p0.counts);
  console.log('✓ 4. Telemetria estruturada do job consultável por API interna (fase, percentual, contadores).');

  // 5. Scheduled Sync Wiring Contract (07:00 / 12:00 / 19:00 BRT)
  const morning = new Date('2026-09-14T10:00:00.000Z'); // 07:00 BRT
  const evening = new Date('2026-09-14T22:00:00.000Z'); // 19:00 BRT
  const midday = new Date('2026-09-14T15:00:00.000Z');  // 12:00 BRT

  assert.equal(orchestrator.syncScheduler.isScheduledSyncTime(morning), true, '07:00 BRT deve ativar sync');
  assert.equal(orchestrator.syncScheduler.isScheduledSyncTime(evening), true, '19:00 BRT deve ativar sync');
  assert.equal(orchestrator.syncScheduler.isScheduledSyncTime(midday), true, '12:00 BRT deve ativar sync');
  console.log('✓ 5. Validação da janela horária (07:00, 12:00 e 19:00 America/Sao_Paulo) confirmada.');

  console.log('\n>>> RUNTIME WIRING TEST PASSED! <<<\n');
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
}

runRuntimeWiringTest().catch(err => {
  console.error('Falha no teste de runtime wiring:', err);
  process.exit(1);
});
