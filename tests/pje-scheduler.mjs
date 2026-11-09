import assert from 'node:assert/strict';
import { computeDuePjePortals, PJE_JOB_STATUS } from '../lib/judicial/pje/sync/pje-sync-service.mjs';
import { getPjePortalById, listPjePortals, resolvePjeCollector } from '../lib/judicial/pje/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — SCHEDULER PJe (DECISÃO DE VENCIMENTO E SINGLE-FLIGHT)');
console.log('===============================================================\n');

const tjmt1 = getPjePortalById('pje-tjmt-1g');
const tjmt2 = getPjePortalById('pje-tjmt-2g');
const trt4 = getPjePortalById('pje-trt4-1g');
const tse = getPjePortalById('pje-tse');
const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const baseConfig = {
  pjeEnabled: true,
  automaticSyncEnabled: true,
  enabledPortals: ['pje-tjmt-1g', 'pje-tjmt-2g'],
  runtimePreference: 'auto',
  syncIntervalMinutes: 360
};
const allPortals = listPjePortals();

console.log('[T1] PJe desabilitado ou automático desabilitado não roda...');
assert.deepEqual(computeDuePjePortals({ config: { ...baseConfig, pjeEnabled: false }, portals: allPortals, jobs: [], nowMs: NOW }).due, []);
assert.equal(computeDuePjePortals({ config: { ...baseConfig, pjeEnabled: false }, portals: allPortals, jobs: [], nowMs: NOW }).reason, 'pje_disabled');
assert.deepEqual(computeDuePjePortals({ config: { ...baseConfig, automaticSyncEnabled: false }, portals: allPortals, jobs: [], nowMs: NOW }).due, []);
assert.equal(computeDuePjePortals({ config: { ...baseConfig, automaticSyncEnabled: false }, portals: allPortals, jobs: [], nowMs: NOW }).reason, 'automatic_disabled');
console.log('  ✓ 0 execuções quando desabilitado.');

console.log('[T2] Intervalo governa: cedo demais não roda, vencido roda...');
const recentJobs = [{ jobId: 'j1', portalId: 'pje-tjmt-1g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW - 60 * 60_000).toISOString() }];
const early = computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: recentJobs, nowMs: NOW });
assert.ok(!early.due.includes('pje-tjmt-1g'));
assert.equal(early.skipped['pje-tjmt-1g'], 'not_due');
assert.ok(early.due.includes('pje-tjmt-2g'), 'Portal sem job prévio deve vencer.');
const late = computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: [{ ...recentJobs[0], finishedAt: new Date(NOW - 7 * 60 * 60_000).toISOString() }], nowMs: NOW });
assert.deepEqual(late.due, ['pje-tjmt-2g'], 'Portal nunca executado é o mais atrasado e pega o certificado primeiro.');
assert.equal(late.skipped['pje-tjmt-1g'], 'waiting_turn', 'Vencido há 7h segue elegível, apenas esperando a vez na fila sequencial.');
console.log('  ✓ Janela de intervalo respeitada (60 minutos mínimo herdado da config).');

console.log('[T3] Job ativo bloqueia novo sync (single-flight por portal)...');
const activeJobs = [{ jobId: 'j2', portalId: 'pje-tjmt-1g', status: PJE_JOB_STATUS.RUNNING, startedAt: new Date(NOW).toISOString() }];
const withActive = computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: activeJobs, nowMs: NOW });
assert.ok(!withActive.due.includes('pje-tjmt-1g'));
assert.equal(withActive.skipped['pje-tjmt-1g'], 'active');
console.log('  ✓ Manual + scheduled concorrentes: o ativo vence o agendamento.');

console.log('[T4] Falha de um portal não impede o outro...');
const mixedJobs = [
  { jobId: 'j3', portalId: 'pje-tjmt-1g', status: PJE_JOB_STATUS.ERROR, finishedAt: new Date(NOW - 10 * 60 * 60_000).toISOString() },
  { jobId: 'j4', portalId: 'pje-tjmt-2g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW - 10 * 60 * 60_000).toISOString() }
];
const afterErrors = computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: mixedJobs, nowMs: NOW });
assert.deepEqual(afterErrors.due, ['pje-tjmt-1g'], 'Ambos vencidos: um por tick, começando pelo mais atrasado.');
assert.equal(afterErrors.skipped['pje-tjmt-2g'], 'waiting_turn', 'O vizinho espera a vez.');
console.log('  ✓ Erro anterior não bloqueia nem contamina o portal vizinho.');

console.log('[T4b] Certificado é usado por vez (fila sequencial entre portais)...');
const staggered = computeDuePjePortals({
  config: baseConfig,
  portals: allPortals,
  jobs: [
    { jobId: 'j5', portalId: 'pje-tjmt-1g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW - 10 * 60 * 60_000).toISOString() },
    { jobId: 'j6', portalId: 'pje-tjmt-2g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW - 20 * 60 * 60_000).toISOString() }
  ],
  nowMs: NOW
});
assert.deepEqual(staggered.due, ['pje-tjmt-2g'], 'Mais atrasado (20h) pega o certificado antes do de 10h.');
assert.equal(staggered.skipped['pje-tjmt-1g'], 'waiting_turn');
const nextTick = computeDuePjePortals({
  config: baseConfig,
  portals: allPortals,
  jobs: [
    { jobId: 'j5', portalId: 'pje-tjmt-1g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW - 10 * 60 * 60_000).toISOString() },
    { jobId: 'j7', portalId: 'pje-tjmt-2g', status: PJE_JOB_STATUS.COMPLETED, finishedAt: new Date(NOW).toISOString() }
  ],
  nowMs: NOW
});
assert.deepEqual(nextTick.due, ['pje-tjmt-1g'], 'No tick seguinte, com o primeiro concluído, o próximo entra sozinho.');
assert.equal(nextTick.skipped['pje-tjmt-2g'], 'not_due');
console.log('  ✓ Fila sequencial: nunca dois portais autenticados no mesmo tick.');

console.log('[T5] Cobertura por evidência de runtime e família...');
const withTse = computeDuePjePortals({ config: { ...baseConfig, enabledPortals: ['pje-tse', 'pje-trt4-1g'] }, portals: allPortals, jobs: [], nowMs: NOW });
assert.ok(!withTse.due.includes('pje-tse'), 'Família sem collector implementado não pode ser agendada.');
assert.equal(withTse.skipped['pje-tse'], 'collector_not_implemented');
assert.ok(withTse.due.includes('pje-trt4-1g'), 'Família trabalhista implementada é agendável.');
assert.equal(resolvePjeCollector(trt4).status, 'implemented');
assert.deepEqual(computeDuePjePortals({ config: { ...baseConfig, enabledPortals: ['portal-inventado'] }, portals: allPortals, jobs: [], nowMs: NOW }).skipped['portal-inventado'], 'unknown_portal');
console.log('  ✓ Só famílias com collector implementado entram na fila.');

console.log('[T6] Isolamento por workspace e ordem estável para stagger...');
const workspaceA = computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: [], nowMs: NOW });
const workspaceB = computeDuePjePortals({ config: { ...baseConfig, enabledPortals: ['pje-trt4-1g'] }, portals: allPortals, jobs: [], nowMs: NOW });
assert.deepEqual(workspaceA.due, ['pje-tjmt-1g'], 'Fila sequencial entrega um portal por tick.');
assert.equal(workspaceA.skipped['pje-tjmt-2g'], 'waiting_turn');
assert.deepEqual(workspaceB.due, ['pje-trt4-1g']);
assert.deepEqual(computeDuePjePortals({ config: baseConfig, portals: allPortals, jobs: [], nowMs: NOW }).due, workspaceA.due, 'Decisão determinística para stagger.');
console.log('  ✓ Workspaces independentes; ordem determinística para stagger de 5s no tick.');
void tjmt1; void tjmt2;

console.log('\n>>> SCHEDULER PJe: PASS <<<\n');
