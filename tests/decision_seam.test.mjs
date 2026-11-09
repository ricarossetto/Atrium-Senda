import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLegalIntelligenceService } from '../lib/legal-intelligence/index.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — DECISION SEAM: ORQUESTRADOR REAL, FLAGS ON/OFF');
console.log('===============================================================\n');

const PAYLOADS = {
  task_routing: route => ({
    answers: {
      route: { type: 'choice', choice: route, confidence: 0.85, probabilities: { [route]: 0.85 } },
      risky: { type: 'noul', noul: route === 'block' ? 0.9 : 0.2 }
    }
  }),
  completion_review: conclusion => ({
    answers: {
      conclusion: { type: 'choice', choice: conclusion, confidence: 0.88, probabilities: { [conclusion]: 0.88 } },
      gaps_material: { type: 'noul', noul: conclusion === 'complete' ? 0.05 : 0.7 }
    }
  }),
  research_check: verdict => ({
    answers: {
      verdict: { type: 'choice', choice: verdict, confidence: 0.8, probabilities: { [verdict]: 0.8 } },
      sources_agree: { type: 'noul', noul: 0.7 }
    }
  })
};

function mockTransport(calls = []) {
  return {
    kind: 'mock',
    fn: async ({ state, questions, schemaId }) => {
      calls.push(schemaId);
      if (schemaId === 'task_routing') return PAYLOADS.task_routing(calls.route || 'deep_review');
      if (schemaId === 'completion_review') return PAYLOADS.completion_review(calls.conclusion || 'complete');
      if (schemaId === 'research_check') return PAYLOADS.research_check(calls.verdict || 'verify_more');
      throw new Error(`schema inesperado no mock: ${schemaId}`);
    }
  };
}

async function makeService(env, transport) {
  return createLegalIntelligenceService({ rootDir: ROOT, env, jevTransport: transport === undefined ? null : transport });
}

function redacaoPlan() {
  return {
    id: 'plan-seam',
    message: 'Elabore apelação sintética.',
    status: 'in_progress',
    steps: [
      { id: 'triagem', status: 'done' },
      { id: 'redacao', status: 'approved' }
    ],
    artifacts: {}
  };
}

const mockCallModel = async () => ({ text: 'minuta sintética mock com fundamentação.', model: 'mock' });

function withEnv(vars, work) {
  const previous = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve()
    .then(work)
    .finally(() => {
      for (const key of Object.keys(vars)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

const BASE_ENV = { BETA_JEV_ENABLED: 'true', BETA_JEV_LIVE: 'true' };

console.log('[S1] Flags desligadas: fluxo original, sem rastro Jev...');
{
  const service = await makeService({}, null);
  const plan = redacaoPlan();
  const result = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(result.ok, true);
  assert.equal(result.step.status, 'done');
  assert.equal(plan.artifacts?.jev, undefined, 'sem advisory com flags off');
  assert.deepEqual(service.jevTelemetry(), {
    total: 0, byWorkflow: {}, byDecision: {}, errors: 0, fallbacks: 0,
    abstentions: 0, verifyMore: 0, incomplete: 0, avgLatencyMs: 0, totalInputTokens: 0, totalOutputTokens: 0
  });
}

console.log('[S2] Flags ligadas + transporte: advisory anexado; gate segura FAIL...');
{
  const calls = [];
  const service = await makeService({ ...BASE_ENV, JEV_TASK_ROUTER_ENABLED: 'true', JEV_COMPLETION_REVIEW_ENABLED: 'true' }, mockTransport(calls));
  const plan = redacaoPlan();
  const result = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(result.ok, false, 'gates FAIL na minuta mock segura a conclusão');
  assert.equal(plan.steps.find(step => step.id === 'redacao').status, 'pending');
  assert.equal(plan.artifacts?.jev?.taskRouting?.route, 'deep_review');
  assert.equal(plan.artifacts?.jev?.completionReview?.conclusion, 'verify_more');
  assert.ok(calls.includes('task_routing') && calls.includes('completion_review'));
  const telemetry = service.jevTelemetry();
  assert.equal(telemetry.total, 2);
  assert.equal(telemetry.byWorkflow['task-router'], 1);
  assert.equal(telemetry.byWorkflow['completion-review'], 1);
}

console.log('[S2b] Gates PASS: conclusão mantida com advisory...');
{
  const calls = [];
  const service = await makeService({ ...BASE_ENV, JEV_TASK_ROUTER_ENABLED: 'true', JEV_COMPLETION_REVIEW_ENABLED: 'true' }, mockTransport(calls));
  const plan = {
    id: 'plan-contrato',
    message: 'Elabore contrato sintético de prestação de serviços.',
    status: 'in_progress',
    steps: [{ id: 'triagem', status: 'done' }, { id: 'redacao', status: 'approved' }],
    artifacts: {}
  };
  const longDraft = `${'Cláusula sintética de prestação de serviços entre as partes. '}${'Obrigações recíprocas e prazo determinado. '.repeat(12)}`;
  const result = await service.runAgenticStep({ plan, documents: [], callModel: async () => ({ text: longDraft, model: 'mock' }) });
  assert.equal(result.ok, true);
  assert.equal(result.step.status, 'done');
  assert.equal(plan.artifacts?.jev?.completionReview?.conclusion, 'complete');
}

console.log('[S3] Block do roteador escala para aprovação humana, sem contorno...');
{
  const calls = [];
  calls.route = 'block';
  const service = await makeService({ ...BASE_ENV, JEV_TASK_ROUTER_ENABLED: 'true' }, mockTransport(calls));
  const plan = redacaoPlan();
  const result = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'jev-block-approval-required');
  const target = plan.steps.find(step => step.id === 'redacao');
  assert.equal(target.status, 'pending-approval');
  assert.equal(plan.artifacts?.jev?.taskRouting?.route, 'block');
}

console.log('[S4] Completion gate: verify_more segura, teto escala, sem loop...');
{
  const calls = [];
  calls.conclusion = 'verify_more';
  const service = await makeService({ ...BASE_ENV, JEV_COMPLETION_REVIEW_ENABLED: 'true' }, mockTransport(calls));
  const plan = redacaoPlan();
  const first = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(first.ok, false, 'verify_more não conclui');
  let target = plan.steps.find(step => step.id === 'redacao');
  assert.equal(target.status, 'pending');
  assert.equal(target.jevReviews, 1);
  assert.equal(plan.artifacts?.jev?.completionReview?.conclusion, 'verify_more');
  target.status = 'approved';
  const second = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(second.ok, false);
  target = plan.steps.find(step => step.id === 'redacao');
  assert.equal(target.status, 'pending-approval', 'teto de ciclos escala para humano');
  assert.equal(target.jevReviews, 2);
}

console.log('[S5] Flags ligadas sem transporte: idêntico ao desligado...');
{
  const service = await makeService({ ...BASE_ENV, JEV_TASK_ROUTER_ENABLED: 'true', JEV_COMPLETION_REVIEW_ENABLED: 'true', JEV_RESEARCH_GUARD_ENABLED: 'true' }, null);
  const plan = redacaoPlan();
  const result = await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(result.ok, true);
  assert.equal(result.step.status, 'done');
  assert.equal(plan.artifacts?.jev, undefined, 'sem transporte não há advisory');
}

console.log('[S6] Research advisory na pesquisa: reject determinístico sem gastar chamada...');
{
  const calls = [];
  const service = await makeService({ ...BASE_ENV, JEV_RESEARCH_GUARD_ENABLED: 'true' }, mockTransport(calls));
  const plan = {
    id: 'plan-pesquisa',
    message: 'Buscar precedente sintético.',
    status: 'in_progress',
    steps: [{ id: 'pesquisa', status: 'approved' }],
    artifacts: {}
  };
  await service.runAgenticStep({ plan, documents: [], callModel: mockCallModel });
  assert.equal(plan.artifacts?.jev?.researchCheck?.verdict, 'reject');
  assert.equal(plan.artifacts?.jev?.researchCheck?.reason, 'no-evidence');
  assert.ok(!calls.includes('research_check'), 'sem evidência não há chamada');
}

console.log('\n[PASS] Decision seam: real, seguro e reversível.\n');
