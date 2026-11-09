import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_AREA, normalizeLegalArea } from '../lib/jev-beta/taxonomy.mjs';
import { buildDecisionContext, assertNoSecretsInContext } from '../lib/jev-beta/context.mjs';
import { decide } from '../lib/jev-beta/decision.mjs';
import { createTelemetry, buildAuditRecord } from '../lib/jev-beta/telemetry.mjs';
import { isWorkflowEnabled, resolveFailure, resolveTransport, validateModelCandidates, resolveModelRoute } from '../lib/jev-beta/policy.mjs';
import { routeTask } from '../lib/jev-beta/task-router.mjs';
import { checkResearchEvidence, toEvidenceItems } from '../lib/jev-beta/research-guard.mjs';
import { reviewCompletion, COMPLETION_MAX_CYCLES } from '../lib/jev-beta/completion-review.mjs';
import { guardToolCall, intersectPermission, escalateToolPolicy, normalizeToolPolicy } from '../lib/jev-beta/tool-guard.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

console.log('\n===============================================================');
console.log('  ATRIUM — DECISION LAYER: CONTRATOS DETERMINISTICOS (SEM REDE)');
console.log('===============================================================\n');

const mockTransport = payload => ({ kind: 'mock', fn: async () => payload });
const telemetry = () => createTelemetry();

console.log('[D1] Taxonomia canonica unica; alias civel->civil na borda...');
{
  assert.deepEqual([...LEGAL_AREA], ['civil', 'trabalhista', 'previdenciario', 'criminal', 'tributario', 'fazenda', 'marcas', 'outro']);
  assert.equal(normalizeLegalArea('fazenda_publica'), 'fazenda');
  assert.equal(normalizeLegalArea('INPI'), 'marcas');
  assert.equal(normalizeLegalArea('civel'), 'civil');
  assert.equal(normalizeLegalArea(' CIVIL '), 'civil');
  assert.throws(() => normalizeLegalArea('marciano'), error => error?.code === 'UNKNOWN_LEGAL_AREA');
  const area = getJevSchema('publication_triage').questions.find(question => question.key === 'area');
  assert.deepEqual(area.labels, [...LEGAL_AREA], 'schema consome a taxonomia canonica');
  assert.deepEqual(Object.keys(area.criteria).sort(), [...LEGAL_AREA].sort());
}

console.log('[D2] DecisionContext compacto com secret-sweep...');
{
  const context = buildDecisionContext({ taskType: 't', objective: 'o'.repeat(5000), legalArea: 'civel', stakes: 'HIGH', reversibility: 'nada', metadata: { a: 1 } });
  assert.equal(context.legalArea, 'civil');
  assert.equal(context.stakes, 'high');
  assert.equal(context.reversibility, 'irreversible', 'valor desconhecido assume o conservador');
  assert.equal(buildDecisionContext({}).stakes, 'low', 'default documentado preservado');
  assert.equal(buildDecisionContext({ stakes: '??' }).stakes, 'high', 'lixo assume o conservador');
  assert.equal(buildDecisionContext({ stakes: 'low' }).stakes, 'low', 'low explícito preservado');
  assert.ok(context.objective.length <= 2000);
  assert.ok(Object.isFrozen(context));
  assert.throws(() => buildDecisionContext({ objective: 'chave sk-live-abcdefgh' }), error => error?.code === 'SECRET_DETECTED');
  assert.throws(() => buildDecisionContext({ objective: 'password: segredo123' }), error => error?.code === 'SECRET_DETECTED');
  assert.throws(() => assertNoSecretsInContext({ token: 'xpl_abcdefgh12345678' }), error => error?.code === 'SECRET_DETECTED');
}

console.log('[D3] decide(): sucesso, fallback sem transporte, segredo nunca enviado...');
{
  const answers = { route: { type: 'choice', choice: 'deep_review', confidence: 0.8, probabilities: { deep_review: 0.8 } }, risky: { type: 'noul', noul: 0.7 } };
  const ok = await decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'texto sintetico', transport: mockTransport({ answers }), telemetry: telemetry() });
  assert.equal(ok.fallbackUsed, false);
  assert.equal(ok.decision.suggestion.route.label, 'deep_review');
  assert.equal(ok.audit.provider, 'jev');
  assert.equal(ok.audit.workflow, 'task-router');
  assert.match(ok.audit.decisionId, /^jev-/);
  assert.equal(ok.audit.inputFingerprint.length, 32);
  const off = await decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'x', transport: null, telemetry: telemetry() });
  assert.equal(off.fallbackUsed, true);
  assert.equal(off.action, 'abstain');
  const critical = await decide({ workflow: 'tool-check', schemaId: 'tool_check', rawState: 'x', transport: null, critical: true, telemetry: telemetry() });
  assert.equal(critical.action, 'deny');
  await assert.rejects(() => decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'api_key: ABCDEF1234567890', transport: mockTransport({}), telemetry: telemetry() }), error => error?.code === 'SECRET_DETECTED');
  const broken = await decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'x', transport: mockTransport({ sem: 'decisoes' }), telemetry: telemetry() });
  assert.equal(broken.fallbackUsed, true);
  const partial = await decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'x', transport: mockTransport({ answers: { route: { type: 'choice', choice: 'deep_review', confidence: 0.8 } } }), telemetry: telemetry() });
  assert.equal(partial.action, 'abstain', 'resposta parcial não vira decisão');
  assert.equal(partial.fallbackUsed, false, 'parcial é abstinência honesta, não falha');
  const limited = await decide({ workflow: 'task-router', schemaId: 'task_routing', rawState: 'x', transport: { kind: 'mock', fn: async () => { const error = new Error('lento'); error.code = 'RATE_LIMITED'; throw error; } }, telemetry: telemetry() });
  assert.equal(limited.fallbackUsed, true);
}

console.log('[D4] Task Router: 4 rotas, invalida, timeout e fallback...');
{
  const route = (label, confidence = 0.9, extra = {}) => routeTask(
    { taskType: 't', objective: 'o', entity: { type: 'e', id: '1' }, transport: mockTransport({ answers: { route: { type: 'choice', choice: label, confidence, probabilities: { [label]: confidence } }, risky: { type: 'noul', noul: 0.2 } } }), telemetry: telemetry(), ...extra },
    {}
  );
  for (const expected of ['proceed_fast', 'deep_review', 'split_task', 'block']) {
    const result = await route(expected);
    assert.equal(result.route, expected, `rota ${expected}`);
    assert.equal(result.halt, expected === 'block');
  }
  const invalid = await routeTask({ taskType: 't', objective: 'o', transport: mockTransport({ answers: { route: { type: 'choice', choice: 'voar', confidence: 0.9 }, risky: { type: 'noul', noul: 0.1 } } }), telemetry: telemetry() });
  assert.equal(invalid.route, 'deep_review', 'rotulo desconhecido cai no conservador');
  assert.equal(invalid.uncertain, true);
  const down = await routeTask({ taskType: 't', objective: 'o', transport: null, telemetry: telemetry() });
  assert.equal(down.route, 'deep_review');
  assert.equal(down.fallbackRoute, true);
  assert.equal(down.halt, false, 'fallback nunca bloqueia sozinho');
  const slow = await routeTask({ taskType: 't', objective: 'o', transport: { kind: 'mock', fn: async () => { const error = new Error('lento'); error.code = 'TIMEOUT'; throw error; } }, telemetry: telemetry() });
  assert.equal(slow.route, 'deep_review');
}

console.log('[D5] Research Guard: accept/verify_more/reject, sem evidencia, referencias preservadas...');
{
  const evidence = [
    { sourceId: 's1', identifier: 'Tema 1', court: 'STJ', title: 'Tese', summary: 'Suporte direto e literal a afirmacao.', tool: 'jurisprudencia_buscar' },
    { sourceId: 's2', identifier: '', court: '', title: 'Nota', summary: 'Contexto adicional parcial.', tool: 'x' }
  ];
  const accept = await checkResearchEvidence({ claim: 'Afirmacao X.', evidence, transport: mockTransport({ answers: { verdict: { type: 'choice', choice: 'accept', confidence: 0.9 }, sources_agree: { type: 'noul', noul: 0.8 } } }), telemetry: telemetry() });
  assert.equal(accept.verdict, 'accept');
  assert.deepEqual(accept.evidenceSourceIds, ['s1', 's2']);
  let called = false;
  await checkResearchEvidence({ claim: 'X.', evidence: [], transport: { kind: 'mock', fn: async () => { called = true; return {}; } }, telemetry: telemetry() });
  assert.equal(called, false, 'sem evidencia: sem chamada, reject deterministico');
  const empty = await checkResearchEvidence({ claim: 'X.', evidence: [], transport: null, telemetry: telemetry() });
  assert.equal(empty.verdict, 'reject');
  assert.equal(empty.reason, 'no-evidence');
  const noClaim = await checkResearchEvidence({ claim: '  ', evidence, transport: null, telemetry: telemetry() });
  assert.equal(noClaim.verdict, 'reject');
  const contra = await checkResearchEvidence({ claim: 'X.', evidence, transport: mockTransport({ answers: { verdict: { type: 'choice', choice: 'reject', confidence: 0.8 }, sources_agree: { type: 'noul', noul: 0.1 } } }), telemetry: telemetry() });
  assert.equal(contra.verdict, 'reject');
  const partial = await checkResearchEvidence({ claim: 'X.', evidence, transport: mockTransport({ answers: { verdict: { type: 'choice', choice: 'accept', confidence: 0.3 }, sources_agree: { type: 'noul', noul: 0.4 } } }), telemetry: telemetry() });
  assert.equal(partial.verdict, 'verify_more', 'confianca baixa vira verify_more, nunca accept fraco');
  assert.deepEqual(toEvidenceItems([{ title: '', summary: '' }]), [], 'item vazio descartado');
  assert.deepEqual(toEvidenceItems('nao-lista'), [], 'entrada invalida vira lista vazia');
  assert.deepEqual(
    toEvidenceItems([{ sourceId: 's9', citation: 'Acórdão X', excerptOrSummary: 'Trecho.', sourceType: 'acordao' }]),
    [{ sourceId: 's9', citation: 'Acórdão X', excerptOrSummary: 'Trecho.', sourceType: 'acordao' }],
    'formato missão (citation/excerptOrSummary) preservado'
  );
}

console.log('[D6] Completion Review: complete/verify_more/incomplete, gaps, limite de ciclos...');
{
  const base = { objective: 'O', completedWork: 'W', verification: 'V', entity: { type: 'e', id: '1' }, transport: null, telemetry: telemetry() };
  void base;
  const mockFor = conclusion => ({ kind: 'mock', fn: async () => ({ answers: { conclusion: { type: 'choice', choice: conclusion, confidence: 0.9 }, gaps_material: { type: 'noul', noul: 0.1 } } }) });
  const done = await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: [], transport: mockFor('complete'), telemetry: telemetry() });
  assert.equal(done.conclusion, 'complete');
  const guarded = await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: ['Falta o principal'], transport: mockFor('complete'), telemetry: telemetry() });
  assert.equal(guarded.conclusion, 'verify_more', 'complete com gap material e rebaixado');
  assert.equal(guarded.reason, 'gaps-unresolved');
  const incomplete = await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: ['X'], transport: mockFor('incomplete'), telemetry: telemetry() });
  assert.equal(incomplete.conclusion, 'incomplete');
  const abstained = await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: [], transport: null, telemetry: telemetry() });
  assert.equal(abstained.conclusion, 'verify_more', 'sem transporte nunca completa');
  const capped = await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: [], attempts: COMPLETION_MAX_CYCLES, transport: mockFor('complete'), telemetry: telemetry() });
  assert.equal(capped.conclusion, 'human_review');
  assert.equal(capped.forced, true);
  let spent = false;
  await reviewCompletion({ objective: 'O', completedWork: 'W', verification: 'V', knownGaps: [], attempts: 99, transport: { kind: 'mock', fn: async () => { spent = true; return {}; } }, telemetry: telemetry() });
  assert.equal(spent, false, 'teto de ciclos: sem chamada');
}

console.log('[D7] Tool Guard: matriz 16 combinacoes, nunca amplia, falha escala...');
{
  const locals = ['allow', 'confirm', 'review', 'deny'];
  const jevs = ['allow', 'confirm', 'review', 'deny', null];
  for (const local of locals) {
    for (const jev of jevs) {
      const effective = intersectPermission(local, jev);
      const order = { allow: 0, confirm: 1, review: 2, deny: 3 };
      assert.ok(order[effective] >= order[local], `${local} + ${jev} nunca amplia`);
    }
  }
  assert.equal(intersectPermission('confirm', 'allow'), 'confirm');
  assert.equal(intersectPermission('allow', 'deny'), 'deny');
  assert.equal(intersectPermission('banana', 'allow'), 'deny', 'politica desconhecida fecha');
  assert.equal(escalateToolPolicy('allow'), 'confirm');
  assert.equal(escalateToolPolicy('review'), 'deny');
  assert.equal(normalizeToolPolicy(''), 'deny');
  const action = { id: 'email-1', kind: 'email', summary: 'Envio manual de boletim.', reversibility: 'irreversible' };
  const denied = await guardToolCall({ action, localPolicy: 'confirm', transport: mockTransport({ answers: { decision: { type: 'choice', choice: 'deny', confidence: 0.9 }, irreversible: { type: 'noul', noul: 0.9 } } }), telemetry: telemetry() });
  assert.equal(denied.effective, 'deny');
  assert.equal(denied.widened, false);
  const kept = await guardToolCall({ action, localPolicy: 'confirm', transport: mockTransport({ answers: { decision: { type: 'choice', choice: 'allow', confidence: 0.9 }, irreversible: { type: 'noul', noul: 0.1 } } }), telemetry: telemetry() });
  assert.equal(kept.effective, 'confirm', 'allow do JEV nao afrouxa confirm local');
  const failed = await guardToolCall({ action, localPolicy: 'allow', transport: null, telemetry: telemetry() });
  assert.equal(failed.effective, 'confirm', 'falha escala a politica');
  const noAction = await guardToolCall({ action: null, localPolicy: 'allow', transport: null, telemetry: telemetry() });
  assert.equal(noAction.effective, 'deny');
}

console.log('[D8] Policy: flags, fail-safe, transporte e Model Router sem ficcao...');
{
  assert.equal(isWorkflowEnabled('task-router', {}), false);
  assert.equal(isWorkflowEnabled('task-router', { BETA_JEV_ENABLED: 'true' }), false, 'workflow novo exige flag propria');
  assert.equal(isWorkflowEnabled('task-router', { BETA_JEV_ENABLED: 'true', JEV_TASK_ROUTER_ENABLED: 'true' }), true);
  assert.equal(isWorkflowEnabled('triage', { BETA_JEV_ENABLED: 'true' }), true, 'triage preserva comportamento atual');
  assert.equal(isWorkflowEnabled('triage', {}), false, 'master desliga tudo');
  assert.throws(() => isWorkflowEnabled('invalido', {}), /desconhecido/);
  assert.deepEqual(resolveFailure({ kind: 'timeout', critical: false }).action, 'abstain');
  assert.deepEqual(resolveFailure({ kind: 'timeout', critical: true }).decision, 'deny');
  assert.deepEqual(resolveFailure({ kind: 'auth_invalid', critical: true }).decision, 'deny');
  assert.equal(resolveTransport({}), null);
  assert.equal(resolveTransport({ BETA_JEV_ENABLED: 'true', BETA_JEV_LIVE: 'true' }), null, 'sem JEV_TRANSPORT nao ha transporte');
  assert.deepEqual(resolveTransport({ BETA_JEV_ENABLED: 'true', BETA_JEV_LIVE: 'true', JEV_TRANSPORT: 'headless' }).kind, 'headless');
  assert.equal(resolveTransport({ BETA_JEV_ENABLED: 'true', BETA_JEV_LIVE: 'true', JEV_TRANSPORT: 'http', JEV_API_URL: 'https://x.test/v1', JEV_MODEL: 'm' }), null, 'http sem chave nao resolve');
  assert.deepEqual(validateModelCandidates(['a', 'b', 'a', '', 'z'], ['a', 'b']), { valid: ['a', 'b'], refused: ['z'] });
  assert.deepEqual(validateModelCandidates([], ['a']), { valid: [], refused: [] });
  assert.deepEqual(resolveModelRoute(), { route: null, reason: 'model-routing-not-enabled' });
}

console.log('[D9] Telemetria e auditoria sem PII...');
{
  const collector = createTelemetry({ maxEntries: 3 });
  collector.record({ workflow: 'task-router', decision: 'proceed_fast', action: 'suggest', latencyMs: 10, confidence: 0.9, inputTokens: 100, outputTokens: 5 });
  collector.record({ workflow: 'research-check', decision: 'verify_more', action: 'review', latencyMs: 20 });
  collector.record({ workflow: 'completion-review', decision: 'incomplete', action: 'review', latencyMs: 30, fallbackUsed: true });
  collector.record({ workflow: 'tool-check', decision: 'deny', action: 'deny', latency: 1, latencyMs: 5 });
  const summary = collector.summary();
  assert.equal(summary.total, 3, 'teto respeitado');
  assert.equal(summary.verifyMore, 1);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.fallbacks, 1);
  assert.equal(summary.totalInputTokens, 0, 'teto expulsou o registro antigo com tokens');
  const untracked = createTelemetry();
  untracked.record({ workflow: 'task-router', decision: 'proceed_fast', action: 'suggest', latencyMs: 10, confidence: 0.9, inputTokens: 100, outputTokens: 5 });
  assert.equal(untracked.summary().totalInputTokens, 100);
  assert.equal(untracked.summary().totalOutputTokens, 5);
  const blobs = JSON.stringify(summary);
  assert.ok(!/@/.test(blobs) && !/sk-(live|test)-/.test(blobs) && !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(blobs), 'agregados sem valores sensíveis');
  const audit = buildAuditRecord({ workflow: 'research-check', entityType: 'claim', entityId: 'c1', inputFingerprint: 'ab'.repeat(40), result: 'accept', confidence: 0.9 });
  assert.equal(audit.provider, 'jev');
  assert.match(audit.decisionId, /^jev-/);
  assert.equal(audit.inputFingerprint.length, 64);
  assert.throws(() => buildAuditRecord({}), /workflow/);
}

console.log('[D10] Seguranca de transporte: redaction, URL com credencial, loopback, fixtures limpas...');
{
  let captured = '';
  await decide({ workflow: 'triage', schemaId: 'publication_triage', rawState: 'Contato 123.456.789-09.', transport: { kind: 'mock', fn: async ({ state }) => { captured = state; return { answers: {} }; } }, telemetry: telemetry() });
  assert.ok(!captured.includes('123.456.789-09'), 'CPF redigido antes do transporte');
  const { buildNineRouterSystemoneRequest } = await import('../lib/jev-beta/client.mjs');
  assert.throws(() => buildNineRouterSystemoneRequest({ model: 'm', state: 'x', questions: { a: { type: 'noul', instructions: 'y?' } }, baseUrl: 'https://user:pass@x.test/v1' }), /Credencial/);
  assert.throws(() => buildNineRouterSystemoneRequest({ model: 'm', state: 'x', questions: { a: { type: 'noul', instructions: 'y?' } }, baseUrl: 'http://127.0.0.1:20128/v1' }), /loopback/i);
  for (const relative of ['tests/fixtures/jev-eval-cases.json', 'tests/fixtures/jev-eval-task-routing.json', 'tests/fixtures/jev-eval-research-evidence.json', 'tests/fixtures/jev-eval-completion-review.json']) {
    const content = readFileSync(path.join(ROOT, relative), 'utf8');
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(content), `${relative} sem CPF`);
    assert.ok(!/@/.test(content), `${relative} sem e-mail`);
    assert.ok(!/\d{7}-\d{2}\.\d{4}/.test(content), `${relative} sem CNJ`);
  }
}

console.log('\n[PASS] Decision Layer: contratos deterministicos integros.\n');
