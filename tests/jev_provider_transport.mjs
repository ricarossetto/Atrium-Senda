import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  JEV_PROVIDER_SYSTEM_INSTRUCTION,
  buildProviderDecisionPrompt,
  parseProviderDecision
} from '../lib/jev-beta/provider-transport.mjs';
import { extractJevDecision, buildJevProviderRequest, callJev, JEV_PROVIDER_API_URL, schemaToSystemoneQuestions } from '../lib/jev-beta/client.mjs';
import { createAiClassifierHttpHandler, AI_CLASSIFIER_MAX_INPUT_CHARS } from '../lib/http/ai-classifier-routes.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import { calibrationBlockFor } from '../lib/jev-beta/calibration.mjs';
import { assertJevInputSize } from '../lib/jev-beta/schemas.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Classificador pelo provedor de IA do escritório ---');

// --- A) Prompt: mesmo contrato do CLI, com o texto isolado como dado não confiável -------
{
  const prompt = buildProviderDecisionPrompt({ schemaId: 'publication_triage', state: 'Intimação sintética sobre verbas rescisórias.' });
  assert.match(JEV_PROVIDER_SYSTEM_INSTRUCTION, /\{"answers"/, 'instrução exige o formato de answers');
  assert.match(prompt.systemInstruction, /não confiável/i, 'texto é declarado como dado não confiável');
  assert.match(prompt.systemInstruction, /Esquema: publication_triage/, 'instrução identifica o esquema');
  const text = prompt.contents[0].parts[0].text;
  assert.match(text, /<texto>\nIntimação sintética sobre verbas rescisórias\.\n<\/texto>/, 'texto entra isolado nas tags');
  assert.match(text, /"priority"/);
  assert.match(text, /"area"/);
  assert.match(text, /"deadline_signal"/);
  assert.match(text, /"labels"/);
  assert.match(text, /FORMATO OBRIGATÓRIO/);
}
{
  const task = buildProviderDecisionPrompt({ schemaId: 'task_triage', state: 'Elaborar manifestação' });
  assert.match(task.contents[0].parts[0].text, /"category"/);
  assert.match(task.contents[0].parts[0].text, /"urgency"/);
  const processPrompt = buildProviderDecisionPrompt({ schemaId: 'process_triage', state: 'Decisão publicada no DJEN.' });
  assert.match(processPrompt.contents[0].parts[0].text, /"movement_type"/);
  const duplicate = buildProviderDecisionPrompt({ schemaId: 'duplicate_check', state: 'LEITURA A\n...\nLEITURA B\n...' });
  assert.match(duplicate.contents[0].parts[0].text, /"verdict"/);
}
assert.throws(() => buildProviderDecisionPrompt({ schemaId: 'esquema_inexistente', state: 'x' }), /desconhecid|inválid|Esquema/i, 'esquema inexistente falha fechado');
console.log('  OK: prompt replica o contrato do CLI e isola o texto como dado não confiável.');

// --- B) Parsing tolerante ---------------------------------------------------------------
{
  const direct = parseProviderDecision('{"answers": {"a": {"type":"choice","choice":"x","confidence":0.5}}}');
  assert.equal(direct.answers.a.choice, 'x');
  const fenced = parseProviderDecision('```json\n{"answers":{"a":{"type":"noul","noul":0.9}}}\n```');
  assert.equal(fenced.answers.a.noul, 0.9);
  const wrapped = parseProviderDecision('Segue a resposta: {"answers":{"a":{"type":"noul","noul":0.2}}} fim');
  assert.equal(wrapped.answers.a.noul, 0.2);
  const legacy = parseProviderDecision('{"decisions":{"a":1}}');
  assert.equal(legacy.answers.a, 1);
  const nested = parseProviderDecision('{"result":{"answers":{"a":1}}}');
  assert.equal(nested.answers.a, 1);
  for (const bad of ['', '   ', 'sem json nenhum', '{"answers": []}', '{"nada": 1}', '{quebrado']) {
    assert.throws(() => parseProviderDecision(bad), /PARSE_ERROR|sem decisão/i, `resposta inválida rejeitada: ${bad}`);
  }
  console.log('  OK: parsing aceita JSON direto, cercado ou com texto ao redor e rejeita o resto.');
}

// --- C) Defesa contra alucinação: rótulo fora do esquema não vira decisão ---------------
{
  const decision = extractJevDecision({
    answers: {
      area: { type: 'choice', choice: 'area_inventada', confidence: 0.99 },
      priority: { type: 'choice', choice: 'alta', confidence: 0.8 },
      deadline_signal: { type: 'noul', noul: 0.7 }
    }
  }, { schemaId: 'publication_triage' });
  assert.equal(decision.area, undefined, 'rótulo fora do esquema é descartado');
  assert.equal(decision.priority.label, 'alta');
  assert.equal(decision.deadline_signal.label, 'sim');
  console.log('  OK: rótulo inventado pelo modelo não cria decisão.');
}

// --- D) Módulo puro: sem rede, processo ou disco ----------------------------------------
{
  const source = readFileSync(new URL('../lib/jev-beta/provider-transport.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|child_process|process\.env|readFile/, 'transporte não acessa rede, processo ou disco');
  console.log('  OK: transporte é puro; o provedor é chamado pelo servidor.');
}

// --- E) Contrato de integração: o JEV roda na nuvem, sem CLI ----------------------------
{
  const server = serverSourceText;
  assert.match(server, /classifierProviderDecision\(/, 'servidor decide pelo provedor do escritório');
  assert.match(server, /runSuggest: async \(\{ state, questions, schemaId, sourceText = null \}\)/, 'runSuggest recebe o esquema e o texto original');
  assert.match(server, /classifierProviderDecision\(\{ state, schemaId: schema, sourceText \}\)/, 'texto original chega ao provedor sem a calibração');
  assert.match(server, /buildProviderDecisionPrompt\(\{ schemaId, state, legalText: sourceText \}\)/, 'prompt usa o texto original para os sinais jurídicos');
  assert.match(server, /provider\.kind === 'gemini'[\s\S]{0,40}callGeminiApi/, 'gemini usa o caminho nativo');
  assert.match(server, /requiresSessionHeader[\s\S]{0,120}atrium-je-v-/, 'provedor com roteamento por sessão recebe identificador derivado do workspace');
  assert.match(server, /createHash\('sha256'\)[\s\S]{0,80}currentWorkspaceId/, 'identificador de sessão não carrega dado pessoal');
  assert.match(server, /checkHeadlessAvailable: \(\) => classifierAvailability\(\)/, 'disponibilidade reflete o transporte');
  assert.match(server, /cofre `ai-secrets\.json`|ai-secrets\.json/, 'comentário registra a origem da chave');
  const routes = readFileSync(new URL('../lib/http/ai-classifier-routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /await suggest\(\{ state: stateForModel, questions: schemaToSystemoneQuestions\(schemaId\), schemaId, sourceText: clip\(redacted\) \}\)/, 'rota repassa o esquema e o texto original ao transporte');
  assert.equal(AI_CLASSIFIER_MAX_INPUT_CHARS, 12000, 'teto oficial do texto enviado ao modelo');
  const calibrationExcerpt = 'Correção humana sintética sobre verbas rescisórias.';
  const calibration = {
    examples: [{ schemaId: 'publication_triage', questionKey: 'area', label: 'trabalhista', modelLabel: 'civil', excerpt: calibrationExcerpt }]
  };
  const expectedBlock = '\nCALIBRAÇÃO DO ESCRITÓRIO (correções feitas por pessoas do escritório; use como padrão,\nelas vencem a sua impressão):\n- [area] "Correção humana sintética sobre verbas rescisórias." => trabalhista (modelo havia sugerido "civil")';
  assert.equal(calibrationBlockFor(calibration, 'publication_triage'), expectedBlock, 'exemplo humano e contraste preservados integralmente');
  const budget = 12000 - expectedBlock.length;
  const sensitiveValues = ['000.000.000-00', '00.000.000/0000-00', 'teste@example.test', '(00) 00000-0000', '0000000-00.2026.8.00.0000'];
  const rawPrefix = `Intimação sintética ${sensitiveValues.join(' ')}. `;
  const redactedPrefix = 'Intimação sintética [CPF REMOVIDO] [CNPJ REMOVIDO] [E-MAIL REMOVIDO] [TELEFONE REMOVIDO] [CNJ REMOVIDO]. ';
  const makeHarness = ({ text, calibrationValue, providerFailure = false }) => {
    const state = { settings: { aiClassifier: { enabled: true } }, intimations: [{ id: 'pub-transporte-teste', text }], audit: [] };
    const before = structuredClone(state);
    const seen = [];
    let response;
    let triage;
    const unused = () => { throw new Error('escrita oficial não permitida neste teste'); };
    const handler = createAiClassifierHttpHandler({
      assertAuthenticated: (_req, csrf) => {
        assert.equal(csrf, true, 'sugestão exige CSRF na fronteira');
        return { userId: 'usuario-teste', role: 'member' };
      },
      assertAdmin: unused,
      readJson: async () => ({ intimationId: 'pub-transporte-teste' }),
      json: (_res, status, payload) => { response = { status, payload }; },
      readAppStateEnvelope: async () => ({ state, revision: 'rev-teste' }),
      saveAppStateDirectUnlocked: unused,
      enqueueAppStateMutation: unused,
      assertRevision: unused,
      resolveIntimationAlias,
      triageStore: { read: async () => null, write: async value => { triage = value; } },
      ...(calibrationValue === undefined ? {} : { calibrationStore: { read: async () => calibrationValue, write: unused } }),
      checkHeadlessAvailable: async () => ({ ok: true }),
      runSuggest: async input => {
        seen.push(input);
        if (providerFailure) throw new Error(`falha interna ${sensitiveValues.join(' ')} ${input.state}`);
        return {
          answers: {
            priority: { type: 'choice', choice: 'normal', confidence: 0.9 },
            area: { type: 'choice', choice: 'trabalhista', confidence: 0.9 }
          },
          usage: { input_tokens: 10, output_tokens: 2 }
        };
      }
    });
    return { handler, state, before, seen, response: () => response, triage: () => triage };
  };
  const cases = [
    { name: 'curto com calibração', size: 200, calibrationValue: calibration, block: expectedBlock },
    { name: 'limite do orçamento com calibração', size: budget, calibrationValue: calibration, block: expectedBlock },
    { name: 'orçamento mais um com calibração', size: budget + 1, calibrationValue: calibration, block: expectedBlock },
    { name: 'longo com calibração', size: 14000, calibrationValue: calibration, block: expectedBlock },
    { name: 'abaixo do teto sem store', size: 11999, block: '' },
    { name: 'no teto sem store', size: 12000, block: '' },
    { name: 'acima do teto sem store', size: 12001, block: '' },
    { name: 'store vazio', size: 14000, calibrationValue: { examples: [] }, block: '' },
    { name: 'calibração de outro schema', size: 14000, calibrationValue: { examples: [{ ...calibration.examples[0], schemaId: 'task_triage' }] }, block: '' }
  ];
  for (const testCase of cases) {
    const redacted = redactedPrefix + 'a'.repeat(testCase.size - redactedPrefix.length);
    const text = rawPrefix + 'a'.repeat(testCase.size - redactedPrefix.length);
    const harness = makeHarness({ text, calibrationValue: testCase.calibrationValue });
    const result = await harness.handler.runTriageBacklog();
    assert.equal(result.classified, 1, `${testCase.name}: classificação executada`);
    assert.equal(result.failed, 0, `${testCase.name}: nenhum TOO_LARGE`);
    assert.equal(result.pending, 0, `${testCase.name}: publicação sai da fila`);
    assert.equal(harness.seen.length, 1, `${testCase.name}: uma única chamada`);
    const sent = harness.seen[0];
    assert.equal(sent.schemaId, 'publication_triage', 'schema do transporte preservado');
    assert.deepEqual(sent.questions, schemaToSystemoneQuestions('publication_triage'), 'perguntas tipadas preservadas');
    assert.equal(sent.state, redacted.slice(0, 12000 - testCase.block.length) + testCase.block, `${testCase.name}: corte exato preserva a calibração`);
    assert.ok(sent.state.length <= 12000, 'texto e calibração juntos respeitam o teto');
    assert.doesNotThrow(() => assertJevInputSize(sent.state));
    for (const value of sensitiveValues) {
      assert.ok(!JSON.stringify(sent).includes(value), 'PII sintética não cruza o transporte');
      assert.ok(!JSON.stringify(result).includes(value), 'PII sintética não cruza a resposta');
    }
    assert.deepEqual(harness.state, harness.before, 'triagem não altera o acervo oficial');
    assert.equal(harness.triage().entries['pub-transporte-teste'].area, 'trabalhista', 'derivado registra a decisão real');
    const exposed = JSON.stringify({ result, triage: harness.triage() });
    assert.ok(!exposed.includes(calibrationExcerpt), 'exemplo de calibração não é exposto');
    assert.ok(!exposed.includes(redactedPrefix), 'prompt redigido não é exposto');
    if (!testCase.block) assert.ok(!sent.state.includes('CALIBRAÇÃO DO ESCRITÓRIO'), 'sem exemplos pertinentes não há bloco artificial');
  }
  assert.throws(() => assertJevInputSize('a'.repeat(12001)), error => error.code === 'TOO_LARGE', 'validador mantém rejeição acima do teto');
  const failing = makeHarness({ text: rawPrefix + 'Texto sintético.', calibrationValue: calibration, providerFailure: true });
  await assert.rejects(
    () => failing.handler({ method: 'POST', socket: {} }, {}, { pathname: '/api/ai-classifier/suggest' }),
    error => error.statusCode === 502 && error.message === 'O Atrium IA falhou agora. Tente de novo em instantes.',
    'falha do transporte não expõe PII, prompt ou erro interno'
  );
  assert.equal(failing.seen.length, 1, 'falha do transporte não provoca retry');
  assert.equal(failing.response(), undefined, 'falha não produz resposta de sucesso');
  assert.deepEqual(failing.state, failing.before, 'falha não altera o acervo');
  console.log('  OK: calibração preservada sob orçamento, PII redigida e falha sanitizada em execução sintética.');
  console.log('  OK: servidor usa o provedor do escritório e mantém o CLI apenas como reserva local.');
}

// --- E2) Caminho oficial do JEV: Provider API do Command Code -------------------------
{
  const request = buildJevProviderRequest({ schemaId: 'publication_triage', state: 'Intimação sintética sobre verbas rescisórias.' });
  assert.equal(request.url, JEV_PROVIDER_API_URL);
  assert.equal(request.url, 'https://api.commandcode.ai/provider/v1/systemone');
  assert.equal(request.body.model, 'typesafe/jev', 'modelo de decisão JEV');
  assert.equal(request.body.state, 'Intimação sintética sobre verbas rescisórias.');
  assert.equal(typeof request.body.questions, 'object');
  assert.equal(request.body.questions.priority.type, 'choice');
  assert.equal(request.body.questions.deadline_signal.type, 'noul');
  assert.throws(
    () => buildJevProviderRequest({ schemaId: 'publication_triage', state: 'x', apiUrl: 'http://127.0.0.1:20128/v1' }),
    /HTTPS|loopback/i,
    'Provider API exige HTTPS público'
  );

  const seen = [];
  const payload = await callJev({
    request,
    apiKey: 'chave-de-teste',
    fetchImpl: async (url, options) => {
      seen.push({ url, auth: options?.headers?.Authorization, body: JSON.parse(options?.body || '{}') });
      return new Response(JSON.stringify({
        model: 'typesafe/jev',
        answers: { priority: { type: 'choice', choice: 'alta', confidence: 0.9, probabilities: { alta: 0.9, normal: 0.1 } }, area: { type: 'choice', choice: 'trabalhista', confidence: 0.8 } },
        usage: { input_tokens: 41, output_tokens: 12 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, JEV_PROVIDER_API_URL);
  assert.equal(seen[0].auth, 'Bearer chave-de-teste', 'chave vai só no cabeçalho');
  assert.equal(seen[0].body.model, 'typesafe/jev');
  assert.equal(payload.model, 'typesafe/jev');
  assert.equal(payload.usage.input_tokens, 41);
  const decision = extractJevDecision(payload, { schemaId: 'publication_triage' });
  assert.equal(decision.priority.label, 'alta');
  assert.equal(decision.area.label, 'trabalhista');

  let unauthorized = null;
  try {
    await callJev({
      request,
      apiKey: 'chave-errada',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid key' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    });
  } catch (error) {
    unauthorized = error;
  }
  assert.equal(unauthorized?.code, 'UNAUTHORIZED', 'chave inválida vira erro tipado');
  assert.ok(!JSON.stringify(unauthorized?.details || {}).includes('chave-errada'), 'erro não repete a chave');
  console.log('  OK: Provider API do JEV envia o corpo tipado com Bearer e a resposta vira decisão.');
}

// --- E3) Ordem de preferência no servidor ----------------------------------------------
{
  const server = serverSourceText;
  const chainOpen = server.indexOf('resolveClassifierDecision({');
  const jevIndex = server.indexOf('jev: async () => {');
  const providerIndex = server.indexOf('provider: () => classifierProviderDecision(');
  const cliIndex = server.indexOf('headless: () => callHeadlessCmd({');
  assert.ok(chainOpen > 0 && jevIndex > chainOpen && providerIndex > jevIndex && cliIndex > providerIndex, 'cadeia: JEV → provedor do escritório (degradado) → CLI local');
  assert.match(server, /JEV_API_KEY \|\| process\.env\.CMD_API_KEY/, 'chave do Command Code aceita como JEV_API_KEY ou CMD_API_KEY');
  assert.match(server, /onDegrade: failure =>/, 'falha do JEV declara a degradação');
  assert.match(server, /modelo de decisão JEV \(typesafe\/jev\) via Provider API/, 'disponibilidade nomeia o modelo de decisão');
  assert.match(server, /modo degradado, sem o modelo de decisão JEV/, 'reserva por provedor de chat é declarada degradada');
  console.log('  OK: servidor prefere o JEV e declara a reserva como degradada.');
}

console.log('\n[PASS] Transporte do provedor do escritório validado.');
