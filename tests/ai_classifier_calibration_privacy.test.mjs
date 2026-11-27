import assert from 'node:assert/strict';
import { createAiClassifierHttpHandler } from '../lib/http/ai-classifier-routes.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import { suggestionOverrideFor } from '../lib/jev-beta/calibration.mjs';

// B6 (defensivo): o trecho gravado em ai-calibration.json alimenta o classificador de TODO o
// escritório. Registro privado — direto ou por escopo derivado — e par com membro privado
// não podem contribuir com trecho. A correção humana e o override continuam valendo.
// Sem servidor, sem disco e sem chamada a provedor: tudo é mock e texto sintético.

const SENTINELA = 'SENTINELA-SINTETICO-CALIBRACAO-2026';
const CNJ = '9999999-99.2099.9.99.9999';
const DATA = '2099-01-15T10:00:00-03:00';
const SEM_REDE = () => {
  throw new Error('O teste não pode chamar serviço externo.');
};

function makeHarness(state) {
  const store = {
    settings: { aiClassifier: { enabled: true } },
    intimations: [],
    tasks: [],
    processes: [],
    audit: [],
    ...state
  };
  const stores = {
    triage: { value: null },
    taskTriage: { value: null },
    taskRisk: { value: null },
    duplicate: { value: null },
    taskDuplicate: { value: null },
    processTriage: { value: null },
    financialTriage: { value: null },
    calibration: { value: null }
  };
  const seen = {};
  const adapter = name => ({
    read: async () => stores[name].value,
    write: async value => {
      stores[name].value = value;
      seen[`${name}Written`] = value;
      return true;
    }
  });
  const deps = {
    assertAuthenticated: () => ({ userId: 'u-ana', username: 'ana', displayName: 'Ana Teste', role: 'admin', mfaVerified: true, workspaceId: 'ws-teste' }),
    assertAdmin: () => ({ userId: 'u-ana', username: 'ana', displayName: 'Ana Teste', role: 'admin', mfaVerified: true, workspaceId: 'ws-teste' }),
    readJson: async () => deps.__body,
    json: (res, status, payload) => {
      seen.lastJson = { status, payload };
    },
    readAppStateEnvelope: async () => ({ state: store, revision: 'rev-1' }),
    saveAppStateDirectUnlocked: async (next, revision) => ({ revision: revision || 'rev-2' }),
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
  const call = async (pathname, body) => {
    deps.__body = body;
    const handled = await handler({ method: 'POST', url: pathname, socket: { remoteAddress: '127.0.0.1' } }, {}, { pathname });
    assert.strictEqual(handled, true, `rota não tratada: ${pathname}`);
    return seen.lastJson;
  };
  const calibration = () => JSON.stringify(stores.calibration.value || {});
  const correctionOverride = (schemaId, targetKey) => suggestionOverrideFor(stores.calibration.value, schemaId, targetKey);
  return { store, stores, seen, call, calibration, correctionOverride };
}

const intimacao = (id, extras = {}) => ({
  id,
  externalId: `eproc:${id}`,
  process: CNJ,
  source: 'eproc',
  publishedAt: DATA,
  sourceReportedAt: DATA,
  title: 'PUBLICACAO SINTETICA DE TESTE',
  text: SENTINELA,
  ...extras
});

console.log('--- B6: trechos privados ficam fora da calibração compartilhada ---');

// Controle positivo: publicação de escritório continua gerando exemplo e override.
{
  const h = makeHarness({ intimations: [intimacao('pub-oficial')] });
  const res = await h.call('/api/ai-classifier/correct', {
    schemaId: 'publication_triage', questionKey: 'area', label: 'trabalhista', intimationId: 'pub-oficial'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.origin, 'humano');
  assert.ok(res.payload.example, 'registro de escritório continua virando exemplo');
  assert.match(res.payload.example.excerpt, new RegExp(SENTINELA));
  assert.equal(h.correctionOverride('publication_triage', 'pub-oficial').questions.area, 'trabalhista');
  console.log('  OK: controle positivo — registro de escritório gera exemplo e correção humana.');
}

// Publicação privada, ainda que pertencente à sessão: sem trecho, com override preservado.
{
  const h = makeHarness({
    intimations: [intimacao('pub-privada', { scope: 'private', privateOwnerUserId: 'u-ana' })]
  });
  const res = await h.call('/api/ai-classifier/correct', {
    schemaId: 'publication_triage', questionKey: 'area', label: 'trabalhista', intimationId: 'pub-privada'
  });
  assert.equal(res.status, 200, 'a correção continua sendo aceita');
  assert.equal(res.payload.origin, 'humano');
  assert.equal(res.payload.example, null, 'trecho privado não vira exemplo');
  assert.equal(h.correctionOverride('publication_triage', 'pub-privada').questions.area, 'trabalhista', 'correção humana vence');
  assert.ok(!h.calibration().includes(SENTINELA), 'o texto privado não foi gravado em lugar nenhum do store');
  console.log('  OK: publicação privada da própria sessão não contribui com trecho; override permanece.');
}

// Escopo derivado: tarefa de escritório ligada a processo privado da própria sessão.
{
  const h = makeHarness({
    processes: [{ id: 'proc-privado', number: CNJ, scope: 'private', privateOwnerUserId: 'u-ana' }],
    tasks: [{ id: 'tarefa-processo-privado', title: 'TAREFA SINTETICA', description: SENTINELA, processId: 'proc-privado' }]
  });
  const res = await h.call('/api/ai-classifier/correct', {
    schemaId: 'task_triage', questionKey: 'category', label: 'prazo', taskId: 'tarefa-processo-privado'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.example, null, 'escopo derivado por processo privado não vira exemplo');
  assert.ok(!h.calibration().includes(SENTINELA));
  assert.equal(h.correctionOverride('task_triage', 'tarefa-processo-privado').questions.category, 'prazo');
  console.log('  OK: escopo derivado por processo privado não contribui com trecho.');
}

// Escopo derivado por intimação privada: a tarefa é de escritório, a fonte é privada.
{
  const h = makeHarness({
    intimations: [intimacao('pub-privada-fonte', { scope: 'private', privateOwnerUserId: 'u-ana' })],
    tasks: [{ id: 'tarefa-intimacao-privada', title: 'TAREFA SINTETICA', description: SENTINELA, intimationId: 'pub-privada-fonte' }]
  });
  const res = await h.call('/api/ai-classifier/correct', {
    schemaId: 'task_triage', questionKey: 'category', label: 'prazo', taskId: 'tarefa-intimacao-privada'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.example, null, 'escopo derivado por intimação privada não vira exemplo');
  assert.ok(!h.calibration().includes(SENTINELA));
  console.log('  OK: escopo derivado por intimação privada não contribui com trecho.');
}

// Descarte de duplicata: par de escritório continua gerando exemplo.
{
  const h = makeHarness({ intimations: [intimacao('dup-oficial-a'), intimacao('dup-oficial-b')] });
  const res = await h.call('/api/ai-classifier/duplicate-dismiss', {
    aId: 'dup-oficial-a', bId: 'dup-oficial-b'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.learned, true, 'par de escritório continua virando exemplo');
  assert.match(h.calibration(), new RegExp(SENTINELA));
  console.log('  OK: controle positivo — par de publicações de escritório gera exemplo.');
}

// Descarte de duplicata com membro privado: nenhum trecho do par entra na calibração.
{
  const h = makeHarness({
    intimations: [
      intimacao('dup-privada-a', { scope: 'private', privateOwnerUserId: 'u-ana' }),
      intimacao('dup-privada-b', { scope: 'private', privateOwnerUserId: 'u-ana' })
    ]
  });
  const res = await h.call('/api/ai-classifier/duplicate-dismiss', {
    aId: 'dup-privada-a', bId: 'dup-privada-b'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.verdict, 'diferente');
  assert.equal(res.payload.origin, 'humano');
  assert.equal(res.payload.learned, false, 'par privado não vira exemplo');
  assert.ok(!h.calibration().includes(SENTINELA), 'nenhum dos dois lados do par foi gravado');
  console.log('  OK: par com membro privado não contribui com trecho; veredito humano preservado.');
}

// "Manter as duas": par de tarefas de escritório continua gerando exemplo.
{
  const h = makeHarness({
    tasks: [
      { id: 'tarefa-oficial-a', process: CNJ, title: 'PROVIDENCIA SINTETICA', description: SENTINELA },
      { id: 'tarefa-oficial-b', process: CNJ, title: 'PROVIDENCIA SINTETICA', description: SENTINELA }
    ]
  });
  const res = await h.call('/api/ai-classifier/task-duplicate-dismiss', {
    aId: 'tarefa-oficial-a', bId: 'tarefa-oficial-b'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.learned, true, 'par de tarefas de escritório continua virando exemplo');
  assert.match(res.payload.message, /exemplo/i, 'com learned true a mensagem anuncia o exemplo');
  assert.match(h.calibration(), new RegExp(SENTINELA));
  console.log('  OK: controle positivo — par de tarefas de escritório gera exemplo.');
}

// "Manter as duas": uma das tarefas ligada a intimação privada derruba o trecho do par inteiro.
{
  const h = makeHarness({
    intimations: [intimacao('pub-fonte-privada', { scope: 'private', privateOwnerUserId: 'u-ana' })],
    tasks: [
      { id: 'tarefa-mista-a', process: CNJ, title: 'PROVIDENCIA SINTETICA', description: SENTINELA, intimationId: 'pub-fonte-privada' },
      { id: 'tarefa-mista-b', process: CNJ, title: 'PROVIDENCIA SINTETICA', description: SENTINELA }
    ]
  });
  const res = await h.call('/api/ai-classifier/task-duplicate-dismiss', {
    aId: 'tarefa-mista-a', bId: 'tarefa-mista-b'
  });
  assert.equal(res.status, 200);
  assert.equal(res.payload.verdict, 'diferente');
  assert.equal(res.payload.learned, false, 'par com membro de escopo derivado privado não vira exemplo');
  assert.doesNotMatch(res.payload.message, /exemplo/i, 'com learned false a mensagem não anuncia exemplo');
  assert.match(res.payload.message, /saiu da conferência/i, 'a mensagem confirma a saída da conferência');
  assert.match(res.payload.message, /decisão humana/i, 'a mensagem confirma a decisão humana');
  assert.doesNotMatch(res.payload.message, /privad/i, 'a mensagem não explica o motivo do escopo');
  assert.ok(!h.calibration().includes(SENTINELA), 'o texto do par não foi gravado');
  console.log('  OK: par com membro privado por escopo derivado não contribui com trecho.');
}

console.log('\n[PASS] B6 defendido: nenhum trecho privado entra na calibração compartilhada.');
