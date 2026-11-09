import assert from 'node:assert/strict';
import { createTaskHttpHandler } from '../lib/http/task-routes.mjs';
import { createAiClassifierHttpHandler } from '../lib/http/ai-classifier-routes.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import {
  planTaskConsistency,
  buildPortfolioBrief,
  suggestTaskAssignments
} from '../lib/tasks/task-insights.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARTEIRA E CONSISTÊNCIA DAS TAREFAS (DETERMINÍSTICO)');
console.log('===============================================================\n');

const CNJ = '5313106-50.2026.8.21.7000';
const HOJE = '2026-09-30';

function tarefa(overrides = {}) {
  return {
    id: 'tarefa-insight-1',
    title: 'Minutar contestação',
    process: CNJ,
    source: 'eproc',
    status: 'andamento',
    priority: 'normal',
    deadline: '2026-10-08',
    timeLogs: [],
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    history: [],
    ...overrides
  };
}

function makeHarness({ tasks = [], users = [], now = HOJE } = {}) {
  const store = { settings: { aiClassifier: { enabled: true } }, tasks, users, intimations: [], audit: [], __revision: 'rev-1' };
  const seen = { lastJson: null, writes: 0 };
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
      store.__revision = `rev-${seen.writes + 1}`;
      return { revision: store.__revision };
    },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias,
    // Esta suíte não exercita a criação por publicação; o construtor oficial entra só para
    // satisfazer o contrato de dependências da factory (coberto em tests/publication_action.mjs).
    buildPublicationTask: (input, publicationId) => ({ id: `task-stub-${publicationId}`, ...input }),
    triageStore: { read: async () => null, write: async () => true }
  };
  const taskHandler = createTaskHttpHandler(deps);
  const aiHandler = createAiClassifierHttpHandler(deps);
  const call = async (method, pathname, body = null, which = 'task') => {
    deps.__body = body;
    const handler = which === 'ai' ? aiHandler : taskHandler;
    const raw = await handler({ method, url: pathname, socket: { remoteAddress: '127.0.0.1' } }, {}, { pathname });
    if (raw !== true) throw new Error(`Rota respondeu sem devolver true: ${method} ${pathname}`);
    return { res: seen.lastJson };
  };
  return { store, seen, call, taskById: id => store.tasks.find(task => String(task?.id) === String(id)) };
}

console.log('[D1] Consistência: só corrige o que tem evidência e é aditivo; o resto é sugestão...');
{
  const concluidaSemMarco = tarefa({ id: 'sem-marco', status: 'concluida', completedAt: '', updatedAt: '2026-09-28T12:00:00.000Z' });
  const responsavelDesconhecido = tarefa({ id: 'responsavel-fora', responsible: 'Pessoa Que Saiu' });
  const absorvidaOrfa = tarefa({ id: 'absorvida-orfa', absorbedInto: 'tarefa-que-nao-existe' });
  const plano = planTaskConsistency({
    tasks: [concluidaSemMarco, responsavelDesconhecido, absorvidaOrfa, tarefa({ id: 'saudavel' })],
    users: [{ name: 'Advogada Teste' }]
  });
  assert.equal(plano.fixes.length, 1, 'só a correção aditiva com evidência entra em fixes');
  assert.equal(plano.fixes[0].taskId, 'sem-marco');
  assert.equal(plano.fixes[0].field, 'completedAt');
  assert.equal(plano.fixes[0].proposed, '2026-09-28T12:00:00.000Z', 'a proposta usa o marco que já existe na tarefa');
  assert.ok(plano.suggestions.some(item => item.taskId === 'responsavel-fora' && item.field === 'responsible'), 'responsável fora da equipe é sugestão, nunca apagado sozinho');
  assert.ok(plano.suggestions.some(item => item.taskId === 'absorvida-orfa' && item.field === 'absorbedInto'), 'absorção órfã é sugestão');
  assert.ok(!plano.fixes.some(item => item.field === 'responsible'), 'nunca limpar responsável automaticamente');
  assert.ok(!plano.fixes.some(item => item.taskId === 'saudavel'));
  console.log('  OK: correção aditiva só com evidência; o resto vira sugestão.');
}

console.log('[D2] Carteira e responsável: resumo em linguagem e sugestão com base declarada...');
{
  const brief = buildPortfolioBrief({
    now: HOJE,
    tasks: [
      tarefa({ id: 'atrasada', deadline: '2026-09-25' }),
      tarefa({ id: 'vencendo', deadline: '2026-10-02' }),
      tarefa({ id: 'sem-responsavel', deadline: '2026-11-01' }),
      tarefa({ id: 'aguardando', status: 'aguardando', deadline: '' }),
      tarefa({ id: 'concluida', status: 'concluida', completedAt: '2026-09-29T10:00:00.000Z' })
    ]
  });
  assert.equal(brief.counts.abertas, 4, 'concluída não conta como aberta');
  assert.equal(brief.counts.atrasadas, 1);
  assert.equal(brief.counts.vencendo, 1);
  assert.equal(brief.counts.semResponsavel, 4);
  assert.ok(brief.lines[0].startsWith('Carteira:'), 'o resumo abre pelo tamanho da carteira');
  assert.ok(brief.lines.some(linha => /Atrasadas: 1/.test(linha)));
  assert.ok(brief.lines.some(linha => /prazo é decisão humana/.test(linha)), 'o resumo declara que nada é estimado');

  const sugestoes = suggestTaskAssignments({
    users: [{ name: 'Advogada A' }, { name: 'Advogado B' }],
    tasks: [
      tarefa({ id: 'hist-1', status: 'concluida', taskDefinition: 'Minutar contestação', completedBy: 'Advogada A', completedAt: '2026-09-01T10:00:00.000Z' }),
      tarefa({ id: 'hist-2', status: 'concluida', taskDefinition: 'Minutar contestação', completedBy: 'Advogada A', completedAt: '2026-09-02T10:00:00.000Z' }),
      tarefa({ id: 'hist-3', status: 'concluida', taskDefinition: 'Minutar contestação', completedBy: 'Advogado B', completedAt: '2026-09-03T10:00:00.000Z' }),
      tarefa({ id: 'aberta', taskDefinition: 'Minutar contestação' })
    ]
  });
  assert.equal(sugestoes.suggestions.length, 1, 'só a tarefa aberta e sem responsável recebe sugestão');
  assert.equal(sugestoes.suggestions[0].name, 'Advogada A', 'quem mais concluiu o tipo é sugerido');
  assert.equal(sugestoes.suggestions[0].confidence, 0.67, 'a confiança é a fatia declarada');
  assert.match(sugestoes.suggestions[0].basis, /2 de 3 tarefa/);
  const semHistorico = suggestTaskAssignments({ users: [{ name: 'Advogada A' }], tasks: [tarefa({ id: 'so-uma', taskDefinition: 'X' })] });
  assert.equal(semHistorico.suggestions.length, 0, 'sem evidência suficiente não há sugestão');
  console.log('  OK: resumo informa sem decidir e a sugestão declara a base.');
}

console.log('[D3] Rota de insights e correção com auditoria e desfazer...');
{
  const harness = makeHarness({
    users: [{ name: 'Advogada Teste' }],
    tasks: [
      tarefa({ id: 'sem-marco', status: 'concluida', completedAt: '', updatedAt: '2026-09-28T12:00:00.000Z', title: 'Protocolar contestação' }),
      tarefa({ id: 'aberta', taskDefinition: 'Minutar contestação' })
    ]
  });
  const leitura = await harness.call('GET', '/api/ai-classifier/task-insights', null, 'ai');
  assert.equal(leitura.res.status, 200);
  assert.equal(leitura.res.payload.consistency.fixes.length, 1, 'a leitura aponta a correção com evidência');
  assert.ok(Array.isArray(leitura.res.payload.portfolio.lines) && leitura.res.payload.portfolio.lines.length >= 3);
  assert.ok('assignment' in leitura.res.payload);
  assert.equal(harness.seen.writes, 0, 'a leitura não grava nada');

  const aplicado = await harness.call('POST', '/api/tasks/consistency/apply', {});
  assert.equal(aplicado.res.status, 200);
  assert.equal(aplicado.res.payload.applied.length, 1);
  assert.equal(aplicado.res.payload.applied[0].field, 'completedAt');
  const corrigida = harness.taskById('sem-marco');
  assert.equal(corrigida.completedAt, '2026-09-28T12:00:00.000Z', 'o marco foi preenchido com o dado que já existia');
  assert.match(corrigida.history.at(-1).action, /Consistência corrigida/);
  assert.ok(harness.store.audit.some(entry => entry.action === 'Consistência cadastral corrigida'), 'a correção entra na auditoria com autoria');
  assert.equal(harness.store.audit[0].actor, 'Advogada Teste');

  // Segunda passada: nada a corrigir (idempotente).
  const segunda = await harness.call('POST', '/api/tasks/consistency/apply', {});
  assert.equal(segunda.res.payload.applied.length, 0, 'depois de corrigir não há o que corrigir');

  const desfeito = await harness.call('POST', '/api/tasks/consistency/undo', {});
  assert.equal(desfeito.res.status, 200);
  assert.equal(harness.taskById('sem-marco').completedAt, undefined, 'o desfazer devolve o campo ao estado anterior');
  assert.ok(harness.store.audit.some(entry => entry.action === 'Correção de consistência desfeita'));

  // Valor existente nunca é sobrescrito: se a tarefa já tem o marco, o plano não a inclui.
  const jaTinha = makeHarness({ tasks: [tarefa({ id: 'com-marco', status: 'concluida', completedAt: '2026-09-01T10:00:00.000Z' })] });
  const segundaLeitura = await jaTinha.call('GET', '/api/ai-classifier/task-insights', null, 'ai');
  assert.equal(segundaLeitura.res.payload.consistency.fixes.length, 0, 'marco existente é dado humano: não é tocado');
  console.log('  OK: correção auditada, declarada e reversível, sem tocar valor existente.');
}

console.log('\n>>> CARTEIRA E CONSISTÊNCIA DAS TAREFAS: PASS <<<\n');
