import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planSourceDeadlineTaskConsolidation,
  applySourceDeadlineTaskConsolidation,
  isSourceDeadlineTask,
  isUntouchedSourceTask,
  hasSourceOwnedDeadline,
  sourceActLabel,
  SOURCE_DEADLINE_CONSOLIDATION_REASON
} from '../lib/publications/source-deadline-consolidation.mjs';
import { reconcileEprocSourceItems } from '../lib/judicial/eproc-a1-downloader.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Consolidação de tarefas duplicadas de prazo ---');

const CNJ = '5313106-50.2026.8.21.7000';
const ACT = 'Prazo em aberto';

function intimation({ id, deadline, changedAt, collectedAt, event = ACT, source = 'eproc' }) {
  return {
    id,
    externalId: id,
    source,
    process: CNJ,
    processNumber: CNJ,
    event,
    title: event,
    sourceReportedDeadlineAt: deadline,
    sourceDeadlineChangedAt: changedAt,
    sourceCollectedAt: collectedAt,
    sourceReportedAt: collectedAt
  };
}

/** Tarefa projetada pela fonte, intocada (formato exato do reconciliador do eproc). */
function projectedTask({ id, deadline, sourceValue, intimationId, title = `Prazo eproc — ${ACT}`, status = 'triagem' }) {
  return {
    id,
    externalId: id,
    intimationId,
    sourceIntimationId: intimationId,
    process: CNJ,
    source: 'eproc',
    title,
    description: 'Registro coletado no Painel do Advogado.',
    deadline,
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: sourceValue,
    priority: 'normal',
    status,
    active: true,
    sourceManagedSnapshot: { title, description: 'Registro coletado no Painel do Advogado.', status, deadline }
  };
}

// --- A) O caso real: duas suspensões, três tarefas, um só prazo vigente --------------------
{
  const intimations = [
    intimation({ id: 'eproc:row-1', deadline: '2026-09-29', changedAt: '2026-09-20T10:00:00.000Z', collectedAt: '2026-09-20T10:00:00.000Z' }),
    intimation({ id: 'eproc:row-2', deadline: '2026-09-30', changedAt: '2026-09-25T10:00:00.000Z', collectedAt: '2026-09-25T10:00:00.000Z' }),
    intimation({ id: 'eproc:row-3', deadline: '2026-10-01', changedAt: '2026-09-28T10:00:00.000Z', collectedAt: '2026-09-28T10:00:00.000Z' })
  ];
  const tasks = [
    projectedTask({ id: 'task-manual-era', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1', title: `Conferir prazo informado pelo eproc — ${ACT}` }),
    projectedTask({ id: 'task-row-2', deadline: '2026-09-30', sourceValue: '2026-09-30', intimationId: 'eproc:row-2' }),
    projectedTask({ id: 'task-row-3', deadline: '2026-10-01', sourceValue: '2026-10-01', intimationId: 'eproc:row-3' })
  ];
  const state = { tasks, intimations, audit: [] };
  const plan = planSourceDeadlineTaskConsolidation({ tasks, intimations });
  assert.equal(plan.groups.length, 1, 'uma família (processo + ato) é reconhecida');
  assert.equal(plan.groups[0].keeperId, 'task-row-3', 'keeper é a declaração mais recente da fonte');
  assert.deepEqual(plan.groups[0].absorbable.sort(), ['task-manual-era', 'task-row-2']);
  assert.deepEqual(plan.groups[0].preserved, []);

  const applied = applySourceDeadlineTaskConsolidation(state, plan, { actor: 'Teste', nowIso: '2026-09-29T12:00:00.000Z' });
  assert.equal(applied.changed, true);
  assert.deepEqual(applied.absorbed.sort(), ['task-manual-era', 'task-row-2']);
  assert.equal(applied.auditEntries.length, 1);
  assert.match(applied.auditEntries[0].action, /consolidadas/);
  const auditDetail = JSON.stringify(applied.auditEntries);
  for (const forbidden of ['Registro coletado no Painel', 'Cliente', 'responsável', 'Advogada']) {
    assert.ok(!auditDetail.includes(forbidden), `auditoria sem conteúdo/PII: ${forbidden}`);
  }

  const keeper = state.tasks.find(task => task.id === 'task-row-3');
  assert.equal(keeper.deadline, '2026-10-01', 'keeper mantém o prazo vigente');
  assert.equal(keeper.active, true);
  assert.ok(keeper.history.some(entry => /Absorveu a tarefa task-manual-era/.test(entry.action)), 'histórico do keeper guarda o prazo anterior');
  for (const absorbedId of ['task-manual-era', 'task-row-2']) {
    const loser = state.tasks.find(task => task.id === absorbedId);
    assert.equal(loser.absorbedInto, 'task-row-3', 'absorção é reversível e aponta para a oficial');
    assert.equal(loser.absorbReason, SOURCE_DEADLINE_CONSOLIDATION_REASON);
    assert.equal(loser.absorbedBy, 'Teste');
    assert.equal(loser.active, false, 'absorvida sai do fluxo');
    assert.ok(loser.absorbedAt);
    assert.equal(loser.mergedInto, undefined, 'tarefa não usa semântica de intimação');
  }
  console.log('  OK: três tarefas do mesmo ato → uma oficial com o prazo correto e duas absorvidas de forma reversível.');
}

// --- B) Idempotência: segunda passada não absorve de novo nem duplica histórico -------------
{
  const intimations = [
    intimation({ id: 'eproc:row-1', deadline: '2026-09-29', changedAt: '2026-09-20T10:00:00.000Z', collectedAt: '2026-09-20T10:00:00.000Z' }),
    intimation({ id: 'eproc:row-2', deadline: '2026-10-01', changedAt: '2026-09-25T10:00:00.000Z', collectedAt: '2026-09-25T10:00:00.000Z' })
  ];
  const tasks = [
    projectedTask({ id: 'task-old', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1' }),
    projectedTask({ id: 'task-new', deadline: '2026-10-01', sourceValue: '2026-10-01', intimationId: 'eproc:row-2' })
  ];
  const state = { tasks, intimations, audit: [] };
  applySourceDeadlineTaskConsolidation(state, planSourceDeadlineTaskConsolidation({ tasks, intimations }), { actor: 'Teste' });
  const keeperHistory = state.tasks.find(task => task.id === 'task-new').history.length;
  const second = applySourceDeadlineTaskConsolidation(state, planSourceDeadlineTaskConsolidation({ tasks, intimations }), { actor: 'Teste' });
  assert.equal(second.changed, false, 'plano reaplicado não muda nada');
  assert.equal(second.absorbed.length, 0);
  assert.equal(second.auditEntries.length, 0, 'auditoria não duplica');
  assert.equal(state.tasks.find(task => task.id === 'task-new').history.length, keeperHistory, 'histórico não duplica');
  console.log('  OK: consolidação idempotente (sem reabsorção, sem auditoria e sem histórico repetidos).');
}

// --- C) Prazo humano e tarefa com curadoria nunca são absorvidos ---------------------------
{
  const intimations = [
    intimation({ id: 'eproc:row-1', deadline: '2026-09-29', changedAt: '2026-09-20T10:00:00.000Z', collectedAt: '2026-09-20T10:00:00.000Z' }),
    intimation({ id: 'eproc:row-2', deadline: '2026-10-01', changedAt: '2026-09-25T10:00:00.000Z', collectedAt: '2026-09-25T10:00:00.000Z' })
  ];
  const humanDeadlineTask = projectedTask({ id: 'task-human', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1' });
  humanDeadlineTask.deadline = '2026-09-27';
  humanDeadlineTask.deadlineSource = null;
  const curatedTask = projectedTask({ id: 'task-curated', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1' });
  curatedTask.responsible = 'Advogada Teste';
  const fatalTask = projectedTask({ id: 'task-fatal', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1' });
  fatalTask.fatalDeadline = '2026-10-05';
  const workedTask = projectedTask({ id: 'task-worked', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:row-1' });
  workedTask.timeLogs = [{ id: 'log', minutes: 15 }];

  assert.equal(hasSourceOwnedDeadline(humanDeadlineTask), false, 'prazo humano não é da fonte');
  assert.equal(isUntouchedSourceTask(curatedTask), false, 'responsável humano tira a tarefa da absorção');
  assert.equal(isUntouchedSourceTask(fatalTask), false, 'prazo fatal nunca é absorvido');
  assert.equal(isUntouchedSourceTask(workedTask), false, 'tarefa com apontamento nunca é absorvida');

  const tasks = [
    humanDeadlineTask,
    curatedTask,
    fatalTask,
    workedTask,
    projectedTask({ id: 'task-new', deadline: '2026-10-01', sourceValue: '2026-10-01', intimationId: 'eproc:row-2' })
  ];
  const plan = planSourceDeadlineTaskConsolidation({ tasks, intimations });
  assert.equal(plan.groups.length, 1);
  assert.deepEqual(plan.groups[0].absorbable, [], 'nada humanizado é absorvido');
  assert.deepEqual(plan.groups[0].preserved.sort(), ['task-curated', 'task-fatal', 'task-human', 'task-worked']);
  const applied = applySourceDeadlineTaskConsolidation({ tasks, intimations, audit: [] }, plan, { actor: 'Teste' });
  assert.equal(applied.changed, false, 'sem candidato intocado, nenhuma escrita acontece');
  assert.equal(tasks.every(task => task.active !== false), true);
  console.log('  OK: prazo humano, prazo fatal e tarefa com curadoria ficam preservados; nada é absorvido.');
}

// --- D) Atos diferentes no mesmo processo não se misturam ----------------------------------
{
  const intimations = [
    intimation({ id: 'eproc:a', deadline: '2026-09-29', changedAt: '2026-09-20T10:00:00.000Z', collectedAt: '2026-09-20T10:00:00.000Z', event: 'Prazo em aberto' }),
    intimation({ id: 'eproc:b', deadline: '2026-10-10', changedAt: '2026-09-20T10:00:00.000Z', collectedAt: '2026-09-20T10:00:00.000Z', event: 'Intimação para manifestação' })
  ];
  const tasks = [
    projectedTask({ id: 'task-act-1', deadline: '2026-09-29', sourceValue: '2026-09-29', intimationId: 'eproc:a' }),
    projectedTask({ id: 'task-act-2', deadline: '2026-10-10', sourceValue: '2026-10-10', intimationId: 'eproc:b', title: 'Prazo eproc — Intimação para manifestação' })
  ];
  const plan = planSourceDeadlineTaskConsolidation({ tasks, intimations });
  assert.equal(plan.groups.length, 0, 'dois atos com prazos distintos seguem sendo dois trabalhos');
  console.log('  OK: prazos de atos diferentes no mesmo processo não são consolidados.');
}

// --- E) Elegibilidade e rótulo do ato ------------------------------------------------------
{
  assert.equal(isSourceDeadlineTask({ id: 'x', source: 'interna' }), false, 'tarefa interna nunca entra');
  assert.equal(isSourceDeadlineTask({ id: 'x', sourceReportedDeadlineAt: '2026-09-29', source: 'interna' }), false);
  assert.equal(isSourceDeadlineTask({ id: 'x', sourceReportedDeadlineAt: '2026-09-29', source: 'eproc' }), true);
  assert.equal(isSourceDeadlineTask({ id: 'x', sourceReportedDeadlineAt: '2026-09-29', source: 'pje' }), true);
  assert.equal(isSourceDeadlineTask({ id: 'x', sourceReportedDeadlineAt: '2026-09-29', source: 'interna', deadlineSource: 'pje' }), true);
  assert.equal(isSourceDeadlineTask({ id: 'x', sourceReportedDeadlineAt: '2026-09-29', source: 'eproc', absorbedInto: 'y' }), false, 'absorvida não reentra');
  assert.equal(
    sourceActLabel({ intimation: null, task: { title: 'Conferir prazo informado pelo eproc — Ato X' } }),
    sourceActLabel({ intimation: null, task: { title: 'Prazo eproc — Ato X' } }),
    'rótulo do ato não depende do modo que gerou o título'
  );
  console.log('  OK: elegibilidade exige projeção da fonte e a família ignora o modo (manual/auto).');
}

// --- F) Contrato de fiação no servidor e no reconciliador do eproc -------------------------
{
  const server = serverSourceText;
  const persistSource = server.slice(
    server.indexOf('async function persistExternalCollectionsToCanonical'),
    server.indexOf('async function waitForActiveEprocSync')
  );
  assert.match(persistSource, /applySourceDeadlineTaskConsolidation\(/, 'persistência oficial consolida as tarefas duplicadas');
  assert.ok(
    persistSource.indexOf('applySourceDeadlineSync(') < persistSource.indexOf('applySourceDeadlineTaskConsolidation('),
    'consolidação roda depois da propagação do prazo (o keeper já tem a data vigente)'
  );

  const downloader = readFileSync(new URL('../lib/judicial/eproc-a1-downloader.mjs', import.meta.url), 'utf8');
  assert.match(downloader, /from '\.\.\/publications\/source-deadline-consolidation\.mjs'/, 'coletor compartilha a mesma regra');
  assert.match(downloader, /planSourceDeadlineTaskConsolidation\(/, 'coletor planeja a consolidação no fim da reconciliação');
  assert.match(downloader, /findCanonicalSourceTaskId\(/, 'criação de tarefa reusa a oficial da mesma família');
  console.log('  OK: servidor e coletor usam o mesmo módulo puro de consolidação.');
}

// --- G) O caso real de ponta a ponta no reconciliador do eproc -----------------------------
{
  const state = { intimations: [], processes: [], tasks: [], settings: { deadlineMode: 'auto' }, audit: [] };
  const portalId = 'tjrs-eproc-1g';
  const collectionStatus = {
    open_deadline: { discovered: true, collected: true },
    pending_intimation: { discovered: true, collected: true }
  };
  const row = (deadlineAt, sentAt) => ({
    processNumber: CNJ,
    event: 'Evento 42',
    subject: '09/09/2026 00:00:00',
    sourceText: 'Texto sintético do prazo em aberto.',
    sentAt,
    deadlineAt
  });
  const sync = (collectedAt, openDeadlines) => reconcileEprocSourceItems(state, {
    portalId, portalLabel: 'TJRS 1G', collectedAt, openDeadlines, pendingIntimations: [], collectionStatus
  });

  const first = sync('2026-09-20T10:00:00.000Z', [row('20/09/2026 23:59', '14/09/2026 10:30')]);
  assert.equal(first.created, 1);
  assert.equal(state.tasks.length, 1, 'primeira leitura projeta uma tarefa');
  const taskId = state.tasks[0].id;
  assert.equal(state.tasks[0].deadline, '2026-09-20');

  // Primeira suspensão: mesmo ato, nova data e novo `sentAt` (fingerprint e id diferentes).
  const second = sync('2026-09-25T10:00:00.000Z', [row('30/09/2026 23:59', '25/09/2026 09:00')]);
  assert.equal(state.intimations.length, 2, 'a leitura nova entra como novo registro (histórico preservado)');
  assert.equal(state.tasks.length, 1, 'guardiao de familia reaproveita a tarefa em vez de criar a segunda');
  assert.equal(state.tasks[0].id, taskId);
  assert.equal(state.tasks[0].deadline, '2026-09-30', 'prazo da fonte acompanha a suspensao');

  // Segunda suspensão.
  sync('2026-09-28T10:00:00.000Z', [row('01/10/2026 23:59', '28/09/2026 09:00')]);
  const live = state.tasks.filter(task => !task.absorbedInto && task.active !== false);
  assert.equal(live.length, 1, 'uma única tarefa viva depois de duas suspensões');
  assert.equal(live[0].deadline, '2026-10-01', 'a tarefa viva carrega o prazo vigente');
  assert.equal(state.intimations.length, 3, 'as três leituras continuam no acervo');
  assert.equal(state.intimations.every(item => (item.linkedTaskIds || []).includes(taskId)), true, 'todas as leituras apontam para a tarefa principal');

  // Acervo legado (o que existe hoje em produção): duas tarefas repetidas do mesmo ato com
  // prazos antigos — a consolidação do fim do ciclo absorve as repetidas e mantém a vigente.
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.tasks.push({
    ...legacy.tasks[0],
    id: 'task:eproc-panel:legacy-1',
    externalId: 'task:eproc-panel:legacy-1',
    deadline: '2026-09-20',
    sourceReportedDeadlineAt: '2026-09-20',
    sourceManagedSnapshot: { ...legacy.tasks[0].sourceManagedSnapshot, deadline: '2026-09-20' },
    sourceIntimationId: legacy.intimations[0].id,
    intimationId: legacy.intimations[0].id
  });
  const plan = planSourceDeadlineTaskConsolidation({ tasks: legacy.tasks, intimations: legacy.intimations });
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].keeperId, taskId, 'keeper é a tarefa com a declaração mais recente da fonte');
  const applied = applySourceDeadlineTaskConsolidation(legacy, plan, { actor: 'Sincronização', nowIso: '2026-09-29T12:00:00.000Z' });
  assert.equal(applied.changed, true);
  assert.deepEqual(applied.absorbed, ['task:eproc-panel:legacy-1']);
  assert.equal(legacy.tasks.filter(task => task.active !== false && !task.absorbedInto).length, 1, 'so sobra a tarefa vigente no fluxo');
  assert.equal(legacy.tasks.find(task => task.id === 'task:eproc-panel:legacy-1').absorbedInto, taskId);
  console.log('  OK: republicação do mesmo ato não cria tarefa nova e o acervo legado é consolidado.');
}

// --- H) Coerência de superfície: absorvida some do painel E do digest ----------------------
{
  const caso = [
    ['server.mjs (digest de e-mail)', 'server.mjs', /task\.active !== false && !task\.absorbedInto && !task\.completedAt && !task\.discardedAt/],
    ['lib/search-index.mjs', 'lib/search-index.mjs', /if \(!item \|\| item\.active === false \|\| item\.absorbedInto\) continue;/],
    ['lib/ai-context.mjs', 'lib/ai-context.mjs', /\.filter\(task => task && task\.active !== false && !task\.absorbedInto\)/],
    ['lib/http/ai-classifier-routes.mjs (lote)', 'lib/http/ai-classifier-routes.mjs', /tasks: \(Array\.isArray\(state\.tasks\) \? state\.tasks : \[\]\)\.filter\(task => task && task\.active !== false && !task\.absorbedInto\)/],
    ['lib/http/ai-classifier-routes.mjs (poda)', 'lib/http/ai-classifier-routes.mjs', /\.filter\(record => record && record\.active !== false && !record\.absorbedInto\)/],
    ['js/portal.js (alertas)', 'js/portal.js', /item\.active !== false && !TERMINAL_STATUSES\.includes\(item\.status\)/],
    ['js/portal.js (inspetor de processo)', 'js/portal.js', /getLinkedTasks: processNumber => Store\.state\.tasks\.filter\(task => task\.active !== false/],
    ['js/core/activity-inbox.js', 'js/core/activity-inbox.js', /task\.active === false \|\| TERMINAL_STATUSES/],
    ['js/features/agenda.js (lista)', 'js/features/agenda.js', /tasks: \(store\.state\.tasks \|\| \[\]\)\.filter\(task => task && task\.active !== false\)/],
    ['js/features/agenda.js (calendário)', 'js/features/agenda.js', /const tasks = \(store\.state\.tasks \|\| \[\]\)\.filter\(task => task && task\.active !== false\);/],
    ['js/features/dashboard.js (3 superfícies)', 'js/features/dashboard.js', /const tasks = \(store\.state\.tasks \|\| \[\]\)\.filter\(task => task && task\.active !== false\);/],
    ['js/features/publications.js (providências)', 'js/features/publications.js', /filter\(task => task\.active !== false && \(linkedTaskIds\.includes\(task\.id\)/],
    ['js/components/global-search.js', 'js/components/global-search.js', /matches\(\(state\.tasks \|\| \[\]\)\.filter\(item => item && item\.active !== false\)/],
    ['js/core/client-context.js', 'js/core/client-context.js', /\(state\.tasks \|\| \[\]\)\.filter\(task => task && task\.active !== false\)/],
    ['js/core/legal-timeline.js', 'js/core/legal-timeline.js', /\(state\.tasks \|\| \[\]\)\.filter\(task => task && task\.active !== false\)/]
  ];
  const faltando = [];
  for (const [rotulo, arquivo, esperado] of caso) {
    const fonte = readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');
    if (!esperado.test(fonte)) faltando.push(rotulo);
  }
  assert.deepEqual(faltando, [], `consumidores sem o filtro de tarefa absorvida/ausente: ${faltando.join('; ')}`);
  const dashboard = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
  assert.equal((dashboard.match(/task\.active !== false/g) || []).length >= 3, true, 'as três superfícies do dashboard filtram a absorvida');
  const digest = serverSourceText;
  assert.match(digest, /Tarefa absorvida \(duplicata de prazo consolidada\) e item ausente no portal não entram no\s*\n\s*\/\/ digest/, 'o filtro do digest está documentado no ponto de uso');
  console.log('  OK: tarefa absorvida/ausente some de painel, busca, assistente, triagem e digest de e-mail.');
}

console.log('\n[PASS] Consolidação de tarefas duplicadas de prazo validada.');
// ---------------------------------------------------------------------------
// Tarefas repetidas (conferência humana) — o caso real de 29/09: prazo original + suspensão
// no mesmo processo, com rótulos de ato diferentes. O plano automático continua conservador;
// o plano de conferência agrupa e a absorção só acontece por decisão humana, sendo reversível.
// ---------------------------------------------------------------------------
{
  const { planRepeatedTaskGroups, applyTaskGroupConsolidation, undoTaskGroupConsolidation, planSourceDeadlineTaskConsolidation } =
    await import('../lib/publications/source-deadline-consolidation.mjs');

  const CNJ = '5313106-50.2026.8.21.7000';
  const publicacao = { id: 'intimacao-suspensao', externalId: 'eproc:tjrs-eproc-1g:abc123', process: CNJ, sourceReportedDeadlineAt: '2026-10-01', sourceActLabel: 'Suspensão' };
  const tasks = [
    { id: 'tarefa-prazo-original', title: 'Prazo eproc — manifestação', process: CNJ, intimationId: publicacao.id, deadline: '2026-09-29', sourceReportedDeadlineAt: '2026-09-29', deadlineSource: 'eproc', status: 'triagem', active: true, updatedAt: '2026-09-20T10:00:00.000Z' },
    { id: 'tarefa-suspensao-1', title: 'Suspensão — prazo redesignado', process: CNJ, intimationId: publicacao.id, deadline: '2026-09-30', sourceReportedDeadlineAt: '2026-09-30', deadlineSource: 'eproc', status: 'triagem', active: true, updatedAt: '2026-09-25T10:00:00.000Z' },
    { id: 'tarefa-suspensao-2', title: 'Suspensão — novo prazo', process: CNJ, intimationId: publicacao.id, deadline: '2026-10-01', sourceReportedDeadlineAt: '2026-10-01', deadlineSource: 'eproc', status: 'triagem', active: true, updatedAt: '2026-09-27T10:00:00.000Z' },
    { id: 'tarefa-outra', title: 'Outra tarefa do mesmo processo', process: CNJ, deadline: '2026-11-01', status: 'triagem', active: true, humanOwned: true },
    { id: 'tarefa-absorvida', title: 'Já absorvida', process: CNJ, intimationId: publicacao.id, absorbedInto: 'tarefa-suspensao-2', active: false }
  ];
  const intimations = [publicacao];

  const grupos = planRepeatedTaskGroups({ tasks, intimations }).groups;
  assert.equal(grupos.length, 1, 'as três tarefas do mesmo processo+publicação formam um grupo');
  assert.equal(grupos[0].requiresHumanChoice, true, 'grupo de tarefas repetidas exige decisão humana');
  assert.equal(grupos[0].members.length, 3, 'tarefa absorvida não entra no grupo');
  assert.equal(grupos[0].suggestedKeeperId, 'tarefa-suspensao-2', 'sugestão é a declaração de fonte mais recente');
  assert.equal(grupos[0].differences, true, 'diferenças (prazo/ato/responsável) são sinalizadas para a conferência');
  assert.ok(grupos[0].members.some(membro => membro.humanOwned === false), 'tarefa da fonte não é marcada como digitada por pessoa');

  const automatico = planSourceDeadlineTaskConsolidation({ tasks, intimations });
  assert.equal(automatico.absorptions.length, 0, 'o plano automático continua conservador para este caso (nada de absorção silenciosa)');

  const estado = { tasks: JSON.parse(JSON.stringify(tasks)), intimations: [JSON.parse(JSON.stringify(publicacao))], audit: [] };
  estado.intimations[0].linkedTaskIds = ['tarefa-prazo-original', 'tarefa-suspensao-1', 'tarefa-suspensao-2'];
  const resultado = applyTaskGroupConsolidation(estado, {
    keeperId: 'tarefa-suspensao-2',
    loserIds: ['tarefa-prazo-original', 'tarefa-suspensao-1'],
    actor: 'Advogada Teste',
    nowIso: '2026-09-29T22:00:00.000Z'
  });
  assert.equal(resultado.changed, true, 'consolidação humana aplica');
  assert.equal(resultado.absorbed.length, 2, 'duas tarefas absorvidas');
  const absorvida = estado.tasks.find(tarefa => tarefa.id === 'tarefa-prazo-original');
  assert.equal(absorvida.absorbedInto, 'tarefa-suspensao-2');
  assert.equal(absorvida.active, false);
  assert.ok(String(absorvida.absorbReason || '').length > 0, 'absorção registra o motivo');
  const keeper = estado.tasks.find(tarefa => tarefa.id === 'tarefa-suspensao-2');
  assert.ok(keeper.history.some(entrada => /Absorveu a tarefa repetida/.test(entrada.action)), 'keeper guarda histórico da absorção');
  assert.ok(estado.intimations[0].linkedTaskIds.every(id => id === 'tarefa-suspensao-2'), 'vínculo da publicação passa a apontar só para a oficial');
  assert.equal(resultado.auditEntries.length, 1, 'auditoria registrada');

  const desfeito = undoTaskGroupConsolidation(estado, { absorbedId: 'tarefa-prazo-original', actor: 'Advogada Teste' });
  assert.equal(desfeito.changed, true, 'desfazer devolve a tarefa ao fluxo');
  const devolvida = estado.tasks.find(tarefa => tarefa.id === 'tarefa-prazo-original');
  assert.equal(devolvida.absorbedInto, undefined);
  assert.equal(devolvida.active, true);
  console.log('  OK: tarefas repetidas (grupo por processo+publicação, decisão humana, auditoria e desfazer).');
}

// ---------------------------------------------------------------------------
// Recusa do grupo repetido: o caso real de 29/09 (segundo clique em "Manter esta e absorver as
// outras" depois de o grupo já ter sido absorvido). O servidor precisa devolver o motivo legível
// e o painel precisa recarregar — deixar o grupo vencido na tela foi o que produziu a recusa.
// ---------------------------------------------------------------------------
{
  const server = serverSourceText;
  const rota = server.slice(server.indexOf("url.pathname === '/api/tasks/consolidate'"), server.indexOf("url.pathname === '/api/tasks/consolidate'") + 2_200);
  assert.match(rota, /assertAuthenticated\(req, true\)/, 'consolidação exige sessão e CSRF');
  assert.match(rota, /reason: result\.reason \|\| 'sem-mudanca'/, 'recusa carrega o motivo de máquina para o painel explicar');
  assert.doesNotMatch(rota, /Nada foi consolidado agora \(/, 'a recusa não mostra o código interno para quem opera');
  assert.match(rota, /já estavam unificadas ou encerradas/, 'a recusa chega em texto humano');

  const feature = readFileSync(new URL('../js/features/tasks.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    feature,
    /async function loadTaskDuplicateGroups\(force = false\) \{\s*if \(taskDuplicateRunning\) return;/,
    'a recarga do painel não pode ser barrada pela consolidação em andamento'
  );
  assert.match(feature, /if \(taskDuplicateLoading\) return;/, 'o freio da recarga é a busca em voo');
  assert.match(feature, /async function loadTaskDuplicateGroups\(force = false\)[\s\S]{0,700}try \{[\s\S]{0,200}taskDuplicateGroups = await fetchTaskDuplicateGroups\(\);[\s\S]{0,160}renderDuplicatePanelSafely\(\);[\s\S]{0,160}finally \{[\s\S]{0,80}taskDuplicateLoading = false;/, 'a recarga libera o freio no finally');
  assert.match(feature, /if \(!response\.ok\) \{[\s\S]{0,400}consolidationRefusalMessage\(data\)[\s\S]{0,400}await loadTaskDuplicateGroups\(true\);/, 'recusa explica o motivo e recarrega o painel');
  assert.match(feature, /reason === 'nada-a-absorver'[\s\S]{0,400}já estavam unificadas/, 'o motivo técnico vira texto humano no painel');
  assert.match(feature, /applyTaskAbsorptionLocally\(data\.absorbed, taskDuplicateLastUndo, data\.revision\)/, 'absorção vale também no estado local (kanban converge com o painel)');
  assert.match(feature, /applyTaskReturnLocally\(absorbedId, data\.revision\)/, 'desfazer devolve a tarefa ao fluxo no estado local');
  assert.match(feature, /typeof store\.adoptServerRevision === 'function'/, 'revisão do servidor é adotada com caminho alternativo para store.js antigo em cache');
  const inicioConsolidacao = feature.indexOf('async function consolidateDuplicateGroup');
  const recargaDoPainel = feature.indexOf('await loadTaskDuplicateGroups(true);', inicioConsolidacao);
  const liberaProximoClique = feature.indexOf('taskDuplicateRunning = false;', inicioConsolidacao);
  assert.ok(
    recargaDoPainel > 0 && liberaProximoClique > recargaDoPainel,
    'a recarga do painel acontece dentro da consolidação, antes de liberar o próximo clique'
  );
  console.log('  OK: recusa do grupo repetido tem motivo legível e o painel recarrega (sem grupo vencido na tela).');
}
