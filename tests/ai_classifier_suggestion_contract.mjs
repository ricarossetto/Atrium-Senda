import assert from 'node:assert/strict';
import {
  createAiClassifierHttpHandler,
  AI_CLASSIFIER_SCHEMA_ID,
  AI_CLASSIFIER_TASK_SCHEMA_ID,
  AI_CLASSIFIER_TASK_RISK_SCHEMA_ID,
  AI_CLASSIFIER_PROCESS_SCHEMA_ID,
  AI_CLASSIFIER_FINANCIAL_SCHEMA_ID
} from '../lib/http/ai-classifier-routes.mjs';
import { recordHumanCorrection } from '../lib/jev-beta/calibration.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';

// C2: a leitura de sugestões deve mostrar a correção humana mesmo quando o modelo
// nunca classificou o registro. Referência: laço de process-suggestions. Sem servidor,
// sem disco e sem provedor: tudo é mock e texto sintético.

const SEM_REDE = () => {
  throw new Error('O teste não pode chamar serviço externo.');
};
const ATOR = 'Ana Teste';
const CNJ = '9999999-99.2099.9.99.9999';

function calibracaoComCorrecoes() {
  let store = null;
  const add = (schemaId, questionKey, label, targetKey) => {
    store = recordHumanCorrection(store, { schemaId, questionKey, label, targetKey, actor: ATOR }).store;
  };
  add(AI_CLASSIFIER_SCHEMA_ID, 'area', 'trabalhista', 'pub-corrigida');
  add(AI_CLASSIFIER_TASK_SCHEMA_ID, 'category', 'prazo', 'tarefa-corrigida');
  add(AI_CLASSIFIER_TASK_SCHEMA_ID, 'urgency', 'alta', 'tarefa-corrigida');
  add(AI_CLASSIFIER_TASK_RISK_SCHEMA_ID, 'risk', 'alto', 'tarefa-risco');
  add(AI_CLASSIFIER_PROCESS_SCHEMA_ID, 'movement_type', 'decisao', 'proc-corrigido');
  add(AI_CLASSIFIER_FINANCIAL_SCHEMA_ID, 'bucket', 'honorarios', 'fin-corrigido');
  return store;
}

function makeHarness() {
  const state = {
    settings: { aiClassifier: { enabled: true } },
    intimations: [
      { id: 'pub-corrigida', process: CNJ, text: 'Publicação sintética corrigida.', publishedAt: '2099-01-15T10:00:00-03:00' },
      { id: 'pub-sem-correcao', text: 'Publicação sintética sem classificação nem correção.' }
    ],
    tasks: [
      { id: 'tarefa-corrigida', title: 'Tarefa sintética corrigida', status: 'triagem' },
      { id: 'tarefa-risco', title: 'Tarefa sintética com risco corrigido', status: 'andamento' },
      { id: 'tarefa-sem-correcao', title: 'Tarefa sintética sem correção', status: 'triagem' }
    ],
    processes: [{
      id: 'proc-corrigido',
      number: CNJ,
      court: 'TJRS',
      county: 'Porto Alegre',
      actionClass: 'Procedimento sintético',
      subject: 'Assunto sintético',
      lastMovement: 'Andamento sintético para leitura assistida.',
      feeInstallments: [{ id: 'fin-corrigido', description: 'Parcela sintética de honorários' }]
    }],
    audit: []
  };
  const stores = {
    triage: null,
    taskTriage: null,
    taskRisk: null,
    duplicate: null,
    taskDuplicate: null,
    processTriage: null,
    financialTriage: null,
    calibration: calibracaoComCorrecoes()
  };
  const seen = {};
  const adapter = name => ({
    read: async () => stores[name],
    write: async value => {
      stores[name] = value;
      return true;
    }
  });
  const deps = {
    assertAuthenticated: () => ({ userId: 'u-ana', username: 'ana', role: 'admin', mfaVerified: true, workspaceId: 'ws-teste' }),
    assertAdmin: () => ({ userId: 'u-ana', username: 'ana', role: 'admin', mfaVerified: true, workspaceId: 'ws-teste' }),
    readJson: async () => ({}),
    json: (_res, status, payload) => {
      seen.lastJson = { status, payload };
    },
    readAppStateEnvelope: async () => ({ state, revision: 'rev-1' }),
    saveAppStateDirectUnlocked: async () => ({ revision: 'rev-2' }),
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias: (items, id) => resolveIntimationAlias(items, id),
    security: {
      listTeams: () => [],
      officeProfile: () => ({ accessMode: 'standard' })
    },
    runSuggest: SEM_REDE,
    checkHeadlessAvailable: SEM_REDE,
    execImpl: SEM_REDE,
    triageStore: adapter('triage'),
    taskTriageStore: adapter('taskTriage'),
    taskRiskStore: adapter('taskRisk'),
    duplicateStore: adapter('duplicate'),
    taskDuplicateStore: adapter('taskDuplicate'),
    processTriageStore: adapter('processTriage'),
    financialTriageStore: adapter('financialTriage'),
    calibrationStore: adapter('calibration')
  };
  const handler = createAiClassifierHttpHandler(deps);
  const get = async pathname => {
    const handled = await handler({ method: 'GET', url: pathname, socket: { remoteAddress: '127.0.0.1' } }, {}, { pathname });
    assert.strictEqual(handled, true, `rota não tratada: ${pathname}`);
    return seen.lastJson.payload;
  };
  return { state, stores, get };
}

console.log('--- C2: correção humana aparece na leitura sem sugestão do modelo ---');
{
  const h = makeHarness();

  const publications = await h.get('/api/ai-classifier/suggestions');
  const pub = publications.suggestions['pub-corrigida'];
  assert.equal(pub.area, 'trabalhista');
  assert.equal(pub.areaConfidence, 1);
  assert.equal(pub.origin, 'humano');
  assert.equal(pub.priority, '', 'sem modelo não inventamos prioridade');
  assert.equal(pub.priorityConfidence, 0);
  assert.ok(!('pub-sem-correcao' in publications.suggestions), 'sem entrada e sem correção continua fora da leitura');
  assert.ok(!/payloadHash|hash/i.test(JSON.stringify(publications)), 'proveniência não cruza a API');

  const tasks = await h.get('/api/ai-classifier/task-suggestions');
  const task = tasks.suggestions['tarefa-corrigida'];
  assert.equal(task.category, 'prazo');
  assert.equal(task.urgency, 'alta');
  assert.equal(task.categoryConfidence, 1);
  assert.equal(task.urgencyConfidence, 1);
  assert.equal(task.origin, 'humano');
  assert.ok(!('tarefa-risco' in tasks.suggestions), 'correção de risco não aparece como triagem de tarefa');
  assert.ok(!('tarefa-sem-correcao' in tasks.suggestions));

  const risks = await h.get('/api/ai-classifier/task-risks');
  const risk = risks.suggestions['tarefa-risco'];
  assert.equal(risk.risk, 'alto');
  assert.equal(risk.riskConfidence, 1);
  assert.equal(risk.action, 'suggest');
  assert.equal(risk.origin, 'humano');
  assert.match(risk.reasonLabel, /corrigido por pessoa/);
  assert.ok(!('tarefa-sem-correcao' in risks.suggestions));

  const processes = await h.get('/api/ai-classifier/process-suggestions');
  const process = processes.suggestions['proc-corrigido'];
  assert.equal(process.movementType, 'decisao');
  assert.equal(process.movementConfidence, 1, 'confiança do rótulo humano, não do modelo');
  assert.equal(process.origin, 'humano');
  assert.deepEqual(process.missingFields, [], 'processo completo não ganha lacuna artificial');

  const financial = await h.get('/api/ai-classifier/financial-suggestions');
  const money = financial.suggestions['fin-corrigido'];
  assert.equal(money.bucket, 'honorarios');
  assert.equal(money.bucketConfidence, 1);
  assert.equal(money.origin, 'humano');
  assert.equal(money.reason, '', 'sem modelo não inventamos motivo');

  console.log('  OK: publicação, tarefa, risco, processo e financeiro exibem a correção órfã.');
}

console.log('--- C2: comportamento existente permanece ---');
{
  const h = makeHarness();
  h.stores.triage = {
    version: 1,
    generatedAt: 'agora',
    entries: {
      'pub-corrigida': {
        area: 'civil', areaConfidence: 0.4, priority: 'baixa', priorityConfidence: 0.5,
        deadlineSignal: '', deadlineDays: '', action: 'suggest', reason: 'SUGGEST_ONLY', at: '2099-01-01T00:00:00.000Z'
      }
    }
  };
  const publications = await h.get('/api/ai-classifier/suggestions');
  const pub = publications.suggestions['pub-corrigida'];
  assert.equal(pub.area, 'trabalhista', 'humano vence o modelo');
  assert.equal(pub.priority, 'baixa', 'campo sem correção preserva a leitura do modelo');
  assert.equal(pub.origin, 'humano');
  assert.equal(pub.areaConfidence, 1);
  console.log('  OK: quando há modelo, a correção continua vencendo só nos campos corrigidos.');
}

console.log('--- C2: escopo e visibilidade permanecem ---');
{
  const h = makeHarness();
  h.stores.calibration = recordHumanCorrection(h.stores.calibration, {
    schemaId: AI_CLASSIFIER_SCHEMA_ID, questionKey: 'area', label: 'civil',
    targetKey: 'pub-fora-do-acervo', actor: ATOR
  }).store;
  const publications = await h.get('/api/ai-classifier/suggestions');
  assert.ok(!('pub-fora-do-acervo' in publications.suggestions), 'override fora do acervo não cria sugestão');
  console.log('  OK: correção sem registro visível não cria entrada na leitura.');
}

console.log('--- C2: registro sem dados não aparece; JSON de casos válidos não muda ---');
{
  const h = makeHarness();
  const pubs = await h.get('/api/ai-classifier/suggestions');
  assert.ok(!Object.prototype.hasOwnProperty.call(pubs.suggestions, 'pub-sem-correcao'), 'sem entrada e sem correção não vira sugestão');
  const tasks = await h.get('/api/ai-classifier/task-suggestions');
  assert.ok(!Object.prototype.hasOwnProperty.call(tasks.suggestions, 'tarefa-sem-correcao'));
  const risks = await h.get('/api/ai-classifier/task-risks');
  assert.ok(!Object.prototype.hasOwnProperty.call(risks.suggestions, 'tarefa-sem-correcao'));
  assert.equal(Object.getPrototypeOf(pubs.suggestions), Object.prototype, 'resposta continua objeto comum');
  assert.equal(
    JSON.stringify(pubs.suggestions),
    JSON.stringify({ 'pub-corrigida': pubs.suggestions['pub-corrigida'] }),
    'JSON permanece igual ao de um objeto literal'
  );
  console.log('  OK: ausência real permanece ausente; resposta serializa como objeto comum.');
}

console.log('\n[PASS] C2: contrato de sugestão preserva a correção humana sem sugestão do modelo.');
