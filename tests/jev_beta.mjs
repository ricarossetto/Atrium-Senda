import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isJevFlagEnabled, readJevFlags, jevAutomationPolicy, assertLiveProbeAllowed } from '../lib/jev-beta/feature-flags.mjs';
import { redactForJev, assertNoSecretsInText } from '../lib/jev-beta/redaction.mjs';
import { getJevSchema, assertJevInputSize, JEV_SCHEMA_IDS } from '../lib/jev-beta/schemas.mjs';
import { buildJevDecideRequest, buildJevGatewayRequest, buildNineRouterSystemoneRequest, schemaToSystemoneQuestions, extractJevDecision, callJev, callHeadlessCmd, buildHeadlessPayload, parseHeadlessEnvelope, assertCmdBin, isLocalTransportAllowed, NINE_ROUTER_FREE_MODEL, CMD_PROVIDER_MODEL } from '../lib/jev-beta/client.mjs';
import { normalizeJevSuggestion, assertSuggestionIsAssistive } from '../lib/jev-beta/classifier.mjs';
import { openJevBetaStore } from '../lib/jev-beta/storage.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JEV BETA: CLASSIFIER CONTRACTS (ISOLATED)');
console.log('===============================================================\n');

console.log('[T1] Flags desligadas por padrão...');
{
  const env = {};
  assert.equal(isJevFlagEnabled('BETA_JEV_ENABLED', env), false);
  assert.equal(isJevFlagEnabled('BETA_JEV_LIVE', env), false);
  assert.equal(isJevFlagEnabled('BETA_JEV_AUTOMATIONS', env), false);
  assert.equal(isJevFlagEnabled('BETA_JEV_ENABLED', { BETA_JEV_ENABLED: '' }), false);
  assert.equal(isJevFlagEnabled('BETA_JEV_ENABLED', { BETA_JEV_ENABLED: 'banana' }), false);
  assert.equal(isJevFlagEnabled('BETA_JEV_ENABLED', { BETA_JEV_ENABLED: 'true' }), true);
  const flags = readJevFlags(env);
  assert.equal(flags.length, 3);
  assert.deepEqual(jevAutomationPolicy(env), { enabled: false, live: false, batch: false, liveProbeAllowed: false, batchAllowed: false });
  assert.throws(() => assertLiveProbeAllowed(env), /não autorizada/);
  assert.throws(() => isJevFlagEnabled('NOPE', env), /desconhecida/);
}

console.log('[T2] Redação remove PII sintética antes de egresso...');
{
  const text = 'Intimação sintética: CPF 123.456.789-09, CNPJ 12.345.678/0001-95, mail sintético pessoa@example.test, fone (11) 98765-4321, CNJ 1234567-89.2026.8.26.0100.';
  const { redacted, findings } = redactForJev(text);
  assert.ok(!redacted.includes('123.456.789-09'));
  assert.ok(!redacted.includes('12.345.678/0001-95'));
  assert.ok(!redacted.includes('pessoa@example.test'));
  assert.ok(!redacted.includes('1234567-89.2026.8.26.0100'));
  assert.ok(redacted.includes('[CPF REMOVIDO]'));
  assert.ok(redacted.includes('[CNPJ REMOVIDO]'));
  assert.ok(redacted.includes('[CNJ REMOVIDO]'));
  assert.equal(findings.cpf >= 1, true);
  assert.equal(findings.cnpj >= 1, true);
  assert.equal(findings.email >= 1, true);
  assert.equal(findings.cnj >= 1, true);
  assert.throws(() => assertNoSecretsInText('chave sk_live_abc'), /Segredo detectado/);
}

console.log('[T3] Schemas sem prazo e com cardinalidade válida...');
{
  assert.ok(JEV_SCHEMA_IDS.includes('publication_triage'));
  assert.ok(JEV_SCHEMA_IDS.includes('task_triage'));
  assert.ok(JEV_SCHEMA_IDS.includes('contact_link'));
  const schema = getJevSchema('publication_triage');
  assert.equal(schema.threshold, 0.65);
  assert.equal(getJevSchema('contact_link').threshold, 0.9);
  const serialized = JSON.stringify(schema);
  assert.ok(!/fatalDeadline/.test(serialized));
  assert.throws(() => getJevSchema('nope'), /desconhecido/);
  assert.throws(() => assertJevInputSize(''), /vazio/);
  assert.throws(() => assertJevInputSize('x'.repeat(12001)), /teto/);
}

console.log('[T4] Client valida URL e nunca usa credencial embutida...');
{
  const req = buildJevDecideRequest({ schemaId: 'publication_triage', redactedText: 'texto sintético de intimação' });
  assert.equal(req.mode, 'direct');
  assert.ok(req.url.startsWith('https://'));
  assert.throws(() => buildJevDecideRequest({ schemaId: 'publication_triage', redactedText: 'x', apiUrl: 'http://inseguro.test/v1' }), /HTTPS/);
  assert.throws(() => buildJevDecideRequest({ schemaId: 'publication_triage', redactedText: 'x', apiUrl: 'https://user:pass@api.typesafe.ai/v1/decide' }), /Credencial/);
  assert.throws(() => buildJevDecideRequest({ schemaId: 'publication_triage', redactedText: 'x', apiUrl: 'https://127.0.0.1/v1' }), /bloqueado/i);
  const gw = buildJevGatewayRequest({ schemaId: 'task_triage', redactedText: 'tarefa sintética' });
  assert.equal(gw.mode, 'gateway-degraded');
  const normalized = extractJevDecision({ decisions: { priority: { label: 'alta', confidence: 0.9 }, area: { label: 'civil', confidence: 0.8 }, needs_human_review: { label: 'sim', confidence: 0.7 } } }, { schemaId: 'publication_triage' });
  assert.equal(normalized.priority.label, 'alta');
  assert.throws(() => extractJevDecision({}, { schemaId: 'publication_triage' }), /tipadas/);
  const noNetwork = () => { throw new Error('rede proibida em teste'); };
  await assert.rejects(() => callJev({ request: req, apiKey: '', fetchImpl: noNetwork }), /JEV_API_KEY/);
  const fake401 = async () => ({ ok: false, status: 401, json: async () => ({ error: 'API key required' }) });
  await assert.rejects(() => callJev({ request: req, apiKey: 'sintetica', fetchImpl: fake401 }), (error) => error?.code === 'UNAUTHORIZED');
  const fake422 = async () => ({ ok: false, status: 422, json: async () => ({ error: 'model not found' }) });
  await assert.rejects(() => callJev({ request: req, apiKey: 'sintetica', fetchImpl: fake422 }), (error) => error?.code === 'PARSE_ERROR' && String(error?.details?.bodyExcerpt || '').includes('model not found'));
  const fakeConnRefused = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => callJev({ request: req, apiKey: 'sintetica', fetchImpl: fakeConnRefused }), (error) => error?.code === 'UNREACHABLE');
}

console.log('[T5] Classificador sugere ou abstém; nunca prazo/vínculo automático...');
{
  const abstain = normalizeJevSuggestion({ schemaId: 'publication_triage', normalizedDecision: {}, redactedText: 'texto sintético' });
  assert.equal(abstain.action, 'abstain');
  assert.equal(abstain.reason, 'INSUFFICIENT_EVIDENCE');
  assert.equal(abstain.authority, 'non-authoritative');
  assertSuggestionIsAssistive(abstain);
  const suggest = normalizeJevSuggestion({
    schemaId: 'publication_triage',
    normalizedDecision: {
      priority: { label: 'alta', confidence: 0.92 },
      area: { label: 'civil', confidence: 0.88 },
      needs_human_review: { label: 'sim', confidence: 0.95 }
    },
    redactedText: 'texto sintético'
  });
  assert.equal(suggest.action, 'suggest');
  assert.equal(suggest.humanRequired, true);
  assert.ok(suggest.notes.includes('nunca prazo'));
  assertSuggestionIsAssistive(suggest);
  const low = normalizeJevSuggestion({
    schemaId: 'contact_link',
    normalizedDecision: { link_decision: { label: 'vincular', confidence: 0.5 } },
    redactedText: 'texto sintético'
  });
  assert.equal(low.action, 'abstain');
}

console.log('[T6] Storage isolado por diretório; bloqueia oficial...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'jev-beta-test-'));
  try {
    const store = await openJevBetaStore(dir);
    const result = normalizeJevSuggestion({ schemaId: 'task_triage', normalizedDecision: {}, redactedText: 'tarefa sintética' });
    const stored = await store.appendSuggestion(result);
    assert.equal(stored.stored, 1);
    const entries = await store.readAll();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].schema, 'task_triage');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await assert.rejects(() => openJevBetaStore('data/system'), /bloqueado/i);
  await assert.rejects(() => openJevBetaStore(''), /obrigatório/);
}

console.log('\n[PASS] Jev beta isolado: sem rede, sem Store oficial, sem PII.\n');

console.log('[T7] Transporte local (9Router) bloqueado por padrão, opt-in explícito...');
{
  assert.equal(isLocalTransportAllowed({}), false);
  assert.equal(isLocalTransportAllowed({ JEV_ALLOW_LOCAL_TRANSPORT: 'true' }), true);
  assert.equal(isLocalTransportAllowed({ JEV_ALLOW_LOCAL_TRANSPORT: 'banana' }), false);
  assert.throws(() => buildJevGatewayRequest({ schemaId: 'task_triage', redactedText: 'tarefa sintética', baseUrl: 'http://127.0.0.1:20128/v1' }), /loopback/i);
  const local = buildJevGatewayRequest({ schemaId: 'task_triage', redactedText: 'tarefa sintética', baseUrl: 'http://127.0.0.1:20128/v1', allowLocal: true });
  assert.equal(local.mode, 'gateway-degraded');
  assert.ok(local.url.startsWith('http://127.0.0.1:20128/'));
  assert.throws(() => buildJevGatewayRequest({ schemaId: 'task_triage', redactedText: 'tarefa sintética', baseUrl: 'http://user:pass@127.0.0.1:20128/v1', allowLocal: true }), /Credencial/);
  assert.throws(() => buildJevGatewayRequest({ schemaId: 'task_triage', redactedText: 'tarefa sintética', baseUrl: 'http://192.168.1.10:20128/v1', allowLocal: true }), /bloqueada|HTTPS/);
}

console.log('\n[PASS] Transporte local com opt-in explícito.\n');

console.log('[T8] Lane nativa 9Router System One (pass-through)...');
{
  const questions = schemaToSystemoneQuestions('intent_routing');
  assert.deepEqual(Object.keys(questions).sort(), ['complexity', 'intent', 'lane']);
  assert.equal(questions.lane.type, 'choice');
  assert.ok(questions.lane.instructions.length > 0);
  assert.deepEqual(Object.keys(questions.lane.criteria).sort(), ['classificador', 'pipeline_completo', 'resposta_direta']);
  const pubQuestions = schemaToSystemoneQuestions('publication_triage');
  assert.deepEqual(pubQuestions.needs_human_review, { type: 'noul', instructions: pubQuestions.needs_human_review.instructions });
  assert.ok(!('criteria' in pubQuestions.needs_human_review));
  const req = buildNineRouterSystemoneRequest({ model: NINE_ROUTER_FREE_MODEL, state: 'texto sintético', questions, baseUrl: 'http://127.0.0.1:20128/v1', allowLocal: true });
  assert.equal(req.mode, 'nine-router-systemone');
  assert.ok(req.url.endsWith('/v1/systemone'));
  assert.equal(req.body.model, 'opencode/jev-1.13-free');
  assert.equal(req.body.state, 'texto sintético');
  assert.throws(() => buildNineRouterSystemoneRequest({ model: '', state: 'x', questions, baseUrl: 'http://127.0.0.1:20128/v1', allowLocal: true }), /Modelo/);
  assert.throws(() => buildNineRouterSystemoneRequest({ model: NINE_ROUTER_FREE_MODEL, state: 'x', questions: {}, baseUrl: 'http://127.0.0.1:20128/v1', allowLocal: true }), /Questions/);
  assert.throws(() => buildNineRouterSystemoneRequest({ model: NINE_ROUTER_FREE_MODEL, state: 'x', questions, baseUrl: 'http://127.0.0.1:20128/v1' }), /loopback/i);
  const viaQuestions = extractJevDecision({ questions: { intent: { label: 'triage', score: 0.7 }, complexity: { label: 'media', score: 0.75 }, lane: { label: 'classificador', score: 0.81 } } }, { schemaId: 'intent_routing' });
  assert.equal(viaQuestions.lane.label, 'classificador');
  assert.equal(viaQuestions.lane.confidence, 0.81);
  const routed = normalizeJevSuggestion({ schemaId: 'intent_routing', normalizedDecision: viaQuestions, redactedText: 'texto sintético' });
  assert.equal(routed.action, 'suggest');
  assertSuggestionIsAssistive(routed);
  const nativeNoul = extractJevDecision({ answers: { needs_human_review: { type: 'noul', noul: 0.13 } } }, { schemaId: 'publication_triage' });
  assert.equal(nativeNoul.needs_human_review.label, 'nao');
  assert.ok(Math.abs(nativeNoul.needs_human_review.confidence - 0.87) < 1e-9);
  const nativeChoice = extractJevDecision({ answers: { area: { type: 'choice', choice: 'civil', confidence: 0.78, probabilities: { civil: 0.85, outro: 0.15 } } } }, { schemaId: 'publication_triage' });
  assert.deepEqual(nativeChoice.area, { label: 'civil', confidence: 0.78 });
  const nativeScore = extractJevDecision({ decisions: { priority: { type: 'score', score: 1, confidence: 0.9, legend: { 0: 'baixa', 1: 'normal', 2: 'alta' } } } }, { schemaId: 'publication_triage' });
  assert.equal(nativeScore.priority.label, 'normal');
}

console.log('\n[PASS] Lane nativa 9Router pronta para shadow probe.\n');

console.log('[T9] Transporte headless (CLI local, sem chave no beta)...');
{
  assert.equal(CMD_PROVIDER_MODEL, 'typesafe/jev');
  const payload = buildHeadlessPayload({ model: CMD_PROVIDER_MODEL, state: 'texto sintético', questions: { a: { type: 'noul', instructions: 'x?' } } });
  assert.deepEqual(JSON.parse(payload.stdin), { model: 'typesafe/jev', state: 'texto sintético', questions: { a: { type: 'noul', instructions: 'x?' } } });
  assert.throws(() => buildHeadlessPayload({ model: '', state: 'x', questions: { a: { type: 'noul', instructions: 'x?' } } }), /Modelo/);
  assert.equal(assertCmdBin('commandcode'), 'commandcode');
  assert.throws(() => assertCmdBin('../../etc/sh'), /Binário/);
  assert.throws(() => assertCmdBin('a;b'), /Binário/);
  const real = parseHeadlessEnvelope('{"type":"result","subtype":"success","model":"typesafe/jev","answers":{"eh_teste":{"type":"noul","noul":0.86}},"usage":{"input_tokens":284,"output_tokens":22},"durationMs":2272}');
  assert.equal(real.model, 'typesafe/jev');
  assert.equal(real.answers.eh_teste.noul, 0.86);
  assert.throws(() => parseHeadlessEnvelope('não-json'), (error) => error?.code === 'PARSE_ERROR');
  assert.throws(() => parseHeadlessEnvelope('{"type":"result","subtype":"error"}'), (error) => error?.code === 'PARSE_ERROR');
  const fakeExec = (command, opts, cb) => {
    assert.ok(command.startsWith('"commandcode" -p -m "typesafe/jev" --output-format json < "'));
    cb(null, '{"type":"result","subtype":"success","model":"typesafe/jev","answers":{"x":{"type":"noul","noul":0.2}},"usage":{"input_tokens":10,"output_tokens":1}}', '');
  };
  const via = await callHeadlessCmd({ bin: 'commandcode', model: 'typesafe/jev', state: 'sintético', questions: { x: { type: 'noul', instructions: 'y?' } }, execImpl: fakeExec });
  assert.equal(via.answers.x.noul, 0.2);
  const fakeFail = (command, opts, cb) => cb(new Error('spawn ENOENT'));
  await assert.rejects(() => callHeadlessCmd({ model: 'typesafe/jev', state: 's', questions: { x: { type: 'noul', instructions: 'y?' } }, execImpl: fakeFail }), (error) => error?.code === 'CMD_FAILED');
  await assert.rejects(() => callHeadlessCmd({ model: 'evil;rm', state: 's', questions: { x: { type: 'noul', instructions: 'y?' } }, execImpl: fakeExec }), (error) => error?.code === 'INVALID_MODEL');
}

console.log('\n[PASS] Headless pronto (auth fica no CLI do operador).\n');
