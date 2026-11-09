import assert from 'node:assert/strict';
import {
  approveAgenticStep,
  buildAgenticPlan,
  deriveAgenticPlanStatus,
  finishAgenticStep,
  nextRunnableStep,
  recoverAgenticPlan,
  skipAgenticStep,
  startAgenticStep,
  summarizeAgenticPlan,
  unblockAgenticPlan
} from '../lib/legal-intelligence/agentic-plan.mjs';
import {
  AGENTIC_PLAN_LIMIT,
  findAgenticPlan,
  newAgenticPlanId,
  normalizeAgenticPlanFile,
  upsertAgenticPlan
} from '../lib/legal-intelligence/agentic-plan-store.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PLANOS AGENTICOS SUPERVISIONADOS (FASE 3)           ');
console.log('===============================================================\n');

console.log('[C1] Construção do plano por intenção...');
const withResearch = buildAgenticPlan({
  analysis: { message: 'Elabore a apelação com jurisprudência.', intent: { pieceType: 'apelacao', area: 'civel', needs: { research: true } }, research: { status: 'pending' } },
  now: '2026-09-21T10:00:00.000Z'
});
assert.deepEqual(withResearch.steps.map(step => step.status), ['done', 'pending-approval', 'blocked', 'blocked', 'blocked']);
assert.equal(withResearch.steps[0].summary, 'apelacao · civel');
assert.equal(withResearch.steps[1].requiresApproval, true);
assert.equal(withResearch.supervision, true);
assert.equal(deriveAgenticPlanStatus(withResearch), 'awaiting-approval');
const withoutResearch = buildAgenticPlan({
  analysis: { message: 'Contrato de honorários.', intent: { pieceType: 'contrato', needs: { research: false } }, research: { status: 'not-needed' } }
});
assert.equal(withoutResearch.steps[1].status, 'skipped', 'Pesquisa dispensada é marcada como skipped.');
assert.equal(withoutResearch.steps[2].status, 'blocked');
unblockAgenticPlan(withoutResearch);
assert.equal(withoutResearch.steps[2].status, 'pending', 'Redação destrava quando a pesquisa é terminal.');
assert.equal(deriveAgenticPlanStatus(withoutResearch), 'in_progress');
console.log('  ✓ Etapas derivadas da triagem, pesquisa sob aprovação e destrave correto.');

console.log('[C2] Aprovação, execução e terminalidade...');
assert.equal(approveAgenticStep(withResearch, 'pesquisa', { actor: '' }).reason, 'actor-required');
assert.equal(approveAgenticStep(withResearch, 'redacao', { actor: 'Advogada Teste' }).reason, 'step-not-pending-approval');
assert.equal(approveAgenticStep(withResearch, 'pesquisa', { actor: 'Advogada Teste', at: '2026-09-21T10:05:00.000Z' }).ok, true);
assert.equal(withResearch.steps[1].approvedBy, 'Advogada Teste');
assert.equal(nextRunnableStep(withResearch).id, 'pesquisa', 'Etapa aprovada é a próxima executável.');
startAgenticStep(withResearch, 'pesquisa');
assert.equal(deriveAgenticPlanStatus(withResearch), 'running');
finishAgenticStep(withResearch, 'pesquisa', { ok: true, summary: '2 fonte(s) · 3 item(ns)' });
unblockAgenticPlan(withResearch);
assert.equal(withResearch.steps[2].status, 'pending');
startAgenticStep(withResearch, 'redacao');
finishAgenticStep(withResearch, 'redacao', { ok: true, summary: 'minuta gerada' });
unblockAgenticPlan(withResearch);
startAgenticStep(withResearch, 'revisao-citacoes');
finishAgenticStep(withResearch, 'revisao-citacoes', { ok: false, error: 'referência não confirmada' });
assert.equal(deriveAgenticPlanStatus(withResearch), 'failed', 'Etapa falha marca o plano como failed.');
assert.equal(withResearch.steps[4].status, 'blocked');
assert.ok(withResearch.history.some(entry => entry.action === 'etapa-aprovada' && entry.actor === 'Advogada Teste'));
console.log('  ✓ Aprovação exige ator, execução registra histórico e falha é terminal.');

const recovered = recoverAgenticPlan(JSON.parse(JSON.stringify({
  ...withResearch,
  steps: withResearch.steps.map(step => step.id === 'redacao' ? { ...step, status: 'running' } : step)
})), { at: '2026-09-21T11:00:00.000Z' });
assert.equal(recovered.steps.find(step => step.id === 'redacao').status, 'pending', 'Retomada devolve etapa running para pending.');
assert.ok(recovered.history.some(entry => entry.action === 'retomada'));
const skipPlan = buildAgenticPlan({ analysis: { message: 'x', intent: { needs: { research: true } }, research: { status: 'pending' } } });
assert.equal(skipAgenticStep(skipPlan, 'pesquisa', { reason: 'dispensada pelo usuário', actor: 'Advogada Teste' }).ok, true);
assert.equal(skipPlan.steps[1].status, 'skipped');
assert.equal(nextRunnableStep(skipPlan), null, 'Plano com etapa aguardando aprovação não expõe próxima executável.');
const summary = summarizeAgenticPlan(withResearch);
assert.equal(summary.id, null);
assert.equal(summary.status, 'failed');
assert.equal(summary.steps.length, 5);
assert.equal(summary.steps.find(step => step.id === 'pesquisa').approvedBy, 'Advogada Teste');
console.log('  ✓ Retomada, dispensa, próxima executável e resumo.');

console.log('[C3] Persistência da fila de planos...');
assert.equal(normalizeAgenticPlanFile('lixo').plans.length, 0);
assert.equal(normalizeAgenticPlanFile({ plans: [{ id: 'sem-prefixo', steps: [] }] }).plans.length, 0);
const validPlan = { ...withResearch, id: 'plan-20260921100000-abc123' };
const file1 = upsertAgenticPlan(null, validPlan);
assert.equal(file1.plans.length, 1);
assert.equal(file1.plans[0].id, validPlan.id);
assert.equal(file1.plans[0].status, 'failed');
const updatedPlan = { ...validPlan, updatedAt: '2026-09-21T12:00:00.000Z', steps: validPlan.steps.map(step => step.id === 'revisao-citacoes' ? { ...step, status: 'done', error: null } : step) };
const file2 = upsertAgenticPlan(file1, updatedPlan);
assert.equal(file2.plans.length, 1, 'Mesmo plano é substituído, nunca duplicado.');
assert.equal(findAgenticPlan(file2, validPlan.id).status, 'awaiting-human', 'Plano com etapas automáticas concluídas aguarda a conferência humana.');
let capped = null;
for (let index = 0; index < AGENTIC_PLAN_LIMIT + 5; index += 1) {
  capped = upsertAgenticPlan(capped, {
    ...validPlan,
    id: `plan-20260921100000-${String(index).padStart(6, '0')}`,
    createdAt: `2026-09-21T10:00:${String(index % 60).padStart(2, '0')}.000Z`
  });
}
assert.equal(capped.plans.length, AGENTIC_PLAN_LIMIT, 'Fila de planos tem teto.');
assert.match(newAgenticPlanId({ now: Date.parse('2026-09-21T10:00:00.000Z'), random: () => 'abc123' }), /^plan-20260921100000-abc123$/);
console.log('  ✓ Normalização fail-closed, upsert, teto e identificador determinístico.');

console.log('\n>>> PLANOS AGENTICOS SUPERVISIONADOS: PASS <<<\n');
