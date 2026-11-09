import assert from 'node:assert/strict';
import {
  createAiClassifierHttpHandler,
  AI_CLASSIFIER_TASK_RISK_SCHEMA_ID
} from '../lib/http/ai-classifier-routes.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import {
  normalizeTaskRiskStore,
  upsertTaskRiskEntry,
  pruneTaskRiskStore,
  taskRiskTargets,
  taskRiskPending,
  isTaskRiskEligible,
  taskRiskText,
  TASK_RISK_BATCH_LIMIT
} from '../lib/tasks/task-risk-suggestions.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — RISCO DE ESTOURO DAS TAREFAS (SCHEMA, STORE E ROTAS)');
console.log('===============================================================\n');

const CNJ = '5313106-50.2026.8.21.7000';

function tarefa(overrides = {}) {
  return {
    id: 'tarefa-risco-1',
    title: 'Minutar contestação complexa com perícia',
    description: 'Peça longa com pedido de perícia e documentos de terceiros.',
    process: CNJ,
    source: 'eproc',
    status: 'andamento',
    priority: 'normal',
    deadline: '2026-10-08',
    fatalDeadline: '',
    sourceReportedDeadlineAt: '2026-10-08',
    responsible: 'Advogada Teste',
    timeLogs: [],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    ...overrides
  };
}

function makeHarness({ tasks = [], enabled = true, answer = { choice: 'alto', confidence: 0.82 }, failSuggest = false } = {}) {
  const store = { settings: { aiClassifier: { enabled } }, tasks, intimations: [], audit: [], __revision: 'rev-1' };
  const riskState = { value: null };
  const seen = { schemaIds: [], lastJson: null, writes: 0 };
  const deps = {
    assertAuthenticated: (req, csrf) => {
      seen.csrf = Boolean(csrf);
      return { userId: 'u-ana', username: 'ana', displayName: 'Advogada Teste', role: 'member', mfaVerified: true, workspaceId: 'ws-beta' };
    },
    assertAdmin: () => {
      throw Object.assign(new Error('Apenas administradores.'), { statusCode: 403 });
    },
    readJson: async () => deps.__body,
    json: (res, status, payload) => {
      seen.lastJson = { status, payload };
    },
    readAppStateEnvelope: async () => ({ state: store, revision: store.__revision }),
    saveAppStateDirectUnlocked: async () => {
      seen.writes += 1;
      return { revision: 'rev-2' };
    },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias,
    triageStore: { read: async () => null, write: async () => true },
    taskRiskStore: {
      read: async () => riskState.value,
      write: async value => {
        riskState.value = value;
        seen.riskWritten = value;
        return true;
      }
    },
    runSuggest: async input => {
      seen.schemaIds.push(String(input?.schemaId || ''));
      if (failSuggest) throw Object.assign(new Error('provedor indisponível no teste'), { code: 'PROVIDER_DOWN' });
      return {
        answers: {
          risk: { type: 'choice', choice: answer.choice, confidence: answer.confidence, probabilities: { alto: answer.confidence, medio: 0.1, baixo: 0.05 } },
          blocked: { type: 'noul', noul: 0.8 }
        },
        usage: { input_tokens: 120, output_tokens: 10 }
      };
    },
    checkHeadlessAvailable: async () => ({ ok: true, reason: 'operacional' })
  };
  const handler = createAiClassifierHttpHandler(deps);
  const call = async (method, pathname, body = null) => {
    deps.__body = body;
    const raw = await handler({ method, url: pathname, socket: { remoteAddress: '127.0.0.1' } }, {}, { pathname });
    if (raw === false) throw new Error(`Rota não tratada: ${method} ${pathname}`);
    if (raw !== true) throw new Error(`Rota respondeu sem devolver true: ${method} ${pathname}`);
    return { raw, res: seen.lastJson };
  };
  return { store, seen, call, riskState };
}

console.log('[R1] Schema: três níveis de risco, leitura do prazo existente, nunca prazo novo...');
{
  const schema = getJevSchema('task_risk');
  assert.equal(schema.id, 'task_risk');
  assert.deepEqual(schema.questions.map(question => question.key), ['risk', 'blocked'], 'risco e bloqueio externo');
  assert.deepEqual(schema.questions[0].labels, ['alto', 'medio', 'baixo']);
  assert.match(schema.description, /nunca cria, altera ou infere deadline/i);
  assert.equal(AI_CLASSIFIER_TASK_RISK_SCHEMA_ID, 'task_risk');
  const texto = taskRiskText(tarefa());
  assert.match(texto, /prazo da tarefa: 2026-10-08/, 'a leitura vê o prazo que já existe');
  assert.match(texto, /situação: andamento/);
  assert.doesNotMatch(texto, /Advogada Teste|Cliente/, 'o texto comparado não carrega nome de pessoa nem de cliente');
  console.log('  OK: risco lê o que existe e não promete prazo.');
}

console.log('[R2] Elegibilidade e store derivada: concluída, absorvida e vazia ficam fora...');
{
  assert.equal(isTaskRiskEligible(tarefa()), true);
  assert.equal(isTaskRiskEligible(tarefa({ status: 'concluida' })), false, 'concluída não é analisada');
  assert.equal(isTaskRiskEligible(tarefa({ status: 'cancelada' })), false);
  assert.equal(isTaskRiskEligible(tarefa({ absorbedInto: 'outra' })), false, 'absorvida não é analisada');
  assert.equal(isTaskRiskEligible(tarefa({ active: false })), false);
  assert.equal(isTaskRiskEligible({ id: 'x', title: '', description: '' }), false, 'sem texto não há o que ler');

  let store = normalizeTaskRiskStore(null);
  store = upsertTaskRiskEntry(store, 'a', { risk: 'alto', riskConfidence: 0.9, action: 'suggest', reason: 'SUGGEST_ONLY', payloadHash: 'h1' });
  store = upsertTaskRiskEntry(store, 'b', { risk: 'baixo', riskConfidence: 0.7, action: 'suggest', reason: 'SUGGEST_ONLY', payloadHash: 'h2' });
  assert.equal(Object.keys(store.entries).length, 2);
  const pruned = pruneTaskRiskStore(store, ['a']);
  assert.equal(Object.keys(pruned.entries).length, 1, 'entrada sem tarefa viva é podada');
  assert.equal(pruned.removed, 1);

  const hashOf = texto => `hash:${texto.length}`;
  const pendentes = taskRiskPending({ tasks: [tarefa()], store: store, hashOf });
  assert.equal(pendentes.length, 1, 'tarefa sem entrada fresca é pendente');
  const alvo = taskRiskTargets({ tasks: [tarefa()], store: store, limit: 1, hashOf });
  assert.equal(alvo.length, 1);
  assert.equal(alvo[0].id, 'tarefa-risco-1');
  assert.ok(TASK_RISK_BATCH_LIMIT >= 10, 'o lote por invocação é declarado');
  console.log('  OK: elegibilidade e poda conforme o contrato.');
}

console.log('[R3] Rotas: leitura para o painel e triagem que não escreve no estado...');
{
  const harness = makeHarness({ tasks: [tarefa()] });
  const leitura = await harness.call('GET', '/api/ai-classifier/task-risks');
  assert.equal(leitura.res.status, 200);
  assert.equal(leitura.res.payload.enabled, true);
  assert.equal(leitura.res.payload.pending, 1, 'a tarefa aparece como pendente de análise');
  assert.deepEqual(leitura.res.payload.suggestions, {}, 'nada sugerido antes da triagem');

  const triagem = await harness.call('POST', '/api/ai-classifier/triage-task-risks', {});
  assert.equal(triagem.res.status, 200);
  assert.equal(triagem.res.payload.classified, 1);
  assert.equal(triagem.res.payload.failed, 0);
  assert.equal(triagem.res.payload.pending, 0, 'depois da leitura não há pendência');
  assert.equal(harness.seen.schemaIds[0], 'task_risk', 'usa o esquema de risco');
  assert.equal(harness.seen.writes, 0, 'a análise não grava o estado consolidado');
  assert.equal(harness.store.tasks[0].deadline, '2026-10-08', 'o prazo da tarefa permanece exatamente como estava');
  assert.equal(harness.store.tasks[0].fatalDeadline, '', 'nenhum prazo fatal é criado');
  assert.equal(harness.store.tasks[0].risk, undefined, 'nenhum campo de risco é escrito na tarefa');
  assert.equal(harness.seen.riskWritten.entries['tarefa-risco-1'].risk, 'alto', 'o veredito fica na store derivada');
  assert.equal(harness.seen.riskWritten.entries['tarefa-risco-1'].riskConfidence, 0.82);

  const depois = await harness.call('GET', '/api/ai-classifier/task-risks');
  const sugestao = depois.res.payload.suggestions['tarefa-risco-1'];
  assert.equal(sugestao.risk, 'alto');
  assert.equal(sugestao.riskConfidence, 0.82);
  assert.equal(sugestao.reasonLabel, 'a leitura foi concluída sem impedimento identificado', 'o motivo chega em linguagem');
  assert.doesNotMatch(JSON.stringify(depois.res.payload), /SUGGEST_ONLY/, 'código interno do motor não cruza a API');
  assert.doesNotMatch(JSON.stringify(depois.res.payload), /\bjev\b/i, 'resposta sem marca interna');
  console.log('  OK: leitura e triagem sem escrita no estado, com motivo em linguagem.');
}

console.log('[R4] Recurso desligado e falha do classificador são declarados...');
{
  const desligado = makeHarness({ tasks: [tarefa()], enabled: false });
  const leitura = await desligado.call('GET', '/api/ai-classifier/task-risks');
  assert.equal(leitura.res.payload.enabled, false);
  assert.deepEqual(leitura.res.payload.suggestions, {});
  await assert.rejects(() => desligado.call('POST', '/api/ai-classifier/triage-task-risks', {}), /desligado/);

  // Provedor indisponível: a falha é declarada por item e nada é gravado como sugestão.
  const falhou = makeHarness({ tasks: [tarefa()], failSuggest: true });
  const resultado = await falhou.call('POST', '/api/ai-classifier/triage-task-risks', {});
  assert.equal(resultado.res.status, 200);
  assert.equal(resultado.res.payload.classified, 0);
  assert.equal(resultado.res.payload.failed, 1, 'a falha do item é contada');
  assert.equal(resultado.res.payload.pending, 1, 'a tarefa continua pendente');
  assert.ok(resultado.res.payload.results[0].error, 'o motivo do item é declarado');
  assert.equal(falhou.seen.riskWritten, undefined, 'falha não grava sugestão');
  console.log('  OK: desligado recusa e falha por item é declarada sem gravar sugestão.');
}

console.log('[R5] Leitura não altera a tarefa...');
{
  const harness = makeHarness({ tasks: [tarefa()], answer: { choice: 'medio', confidence: 0.7 } });
  await harness.call('POST', '/api/ai-classifier/triage-task-risks', {});
  const antes = JSON.stringify(harness.store.tasks[0]);
  const leitura = await harness.call('GET', '/api/ai-classifier/task-risks');
  assert.equal(leitura.res.payload.suggestions['tarefa-risco-1'].risk, 'medio');
  assert.equal(JSON.stringify(harness.store.tasks[0]), antes, 'ler o risco não altera a tarefa');
  console.log('  OK: risco é leitura — nada muda na tarefa.');
}

console.log('\n>>> RISCO DE ESTOURO DAS TAREFAS: PASS <<<\n');
