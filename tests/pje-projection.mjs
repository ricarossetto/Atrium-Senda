import assert from 'node:assert/strict';
import {
  projectPjeCommunicationToIntimation,
  projectPjeCommunicationsToIntimations,
  mergeProjectedPjeIntimations
} from '../lib/judicial/pje/sync/project-intimations.mjs';
import { computeIntimationIdentity } from '../lib/publications/intimation-identity.mjs';
import { mergePjeInventoryIntoState } from '../lib/judicial/pje/sync/ingest-inventory.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PROJEÇÃO PJe → PUBLICAÇÕES (INTIMAÇÕES CANÔNICAS)   ');
console.log('===============================================================\n');

const CNJ = '5000000-00.2026.8.12.0001';
const now = '2026-10-03T12:00:00.000Z';
const communication = {
  id: `pje:ws-teste:pje-tjmt-2g:id:53180112`,
  workspaceId: 'ws-teste',
  portalId: 'pje-tjmt-2g',
  portalName: 'TJMT 2º Grau',
  sourceCommunicationId: 'id:53180112',
  processNumber: CNJ,
  situationMemberships: ['Pendentes de ciência ou de resposta'],
  summary: 'Intimação sintética para conferência.',
  sourceReportedAt: '2026-09-30',
  sourceReportedDeadlineAt: '2026-10-10',
  status: 'in_review',
  firstSeenAt: '2026-10-03T11:00:00.000Z',
  lastSeenAt: '2026-10-03T11:00:00.000Z'
};

console.log('[P1] Comunicação elegível vira intimação com identidade estável...');
const item = projectPjeCommunicationToIntimation(communication, { now });
assert.ok(item, 'Comunicação com CNJ de 20 dígitos deve ser projetada.');
assert.equal(item.externalId, 'pje:pje-tjmt-2g:id:53180112');
assert.equal(item.id, item.externalId);
assert.equal(item.process, '50000000020268120001');
assert.equal(item.source, 'pje');
assert.equal(item.portalId, 'pje-tjmt-2g');
assert.equal(item.treatmentStatus, 'untreated', 'Projeção entra como não tratada.');
assert.equal(item.unread, true);
assert.equal(item.status, 'active');
assert.equal(item.sourceReportedAt, '2026-09-30', 'A data exibida é a informada na listagem.');
assert.equal(item.sourceReportedDeadlineSource, 'pje');
assert.equal('deadline' in item, false, 'A projeção nunca calcula prazo.');
assert.equal('fatalDeadline' in item, false, 'fatalDeadline permanece decisão humana.');
assert.notEqual(item.treatmentStatus, communication.status, 'communication.status não pode virar treatmentStatus.');
console.log('  ✓ Identidade, origem, tratamento inicial e limites de prazo.');

console.log('[P2] Comunicação sem CNJ, sem identidade de expediente ou removida não projeta...');
assert.equal(projectPjeCommunicationToIntimation({ ...communication, processNumber: '5000000-00.2026.8.12.001' }), null, 'CNJ sem 20 dígitos não pode gerar intimação.');
assert.equal(projectPjeCommunicationToIntimation({ ...communication, processNumber: '' }), null);
assert.equal(projectPjeCommunicationToIntimation({ ...communication, sourceCommunicationId: '' }), null);
assert.equal(projectPjeCommunicationToIntimation({ ...communication, deletedAt: '2026-10-01T00:00:00.000Z' }), null);
assert.equal(projectPjeCommunicationToIntimation(null), null);
console.log('  ✓ Sem processo ou identidade estável, nada é inventado.');

console.log('[P3] Identidade oficial reconhece a fonte pje...');
const identity = computeIntimationIdentity(item);
assert.equal(identity.eligible, true, 'pje: precisa ser fonte elegível para a fusão oficial.');
assert.equal(identity.source, 'pje');
assert.equal(identity.dataISO, '2026-09-30', 'A data de identidade é a da fonte, não a da coleta.');
assert.ok(identity.matchable, 'Registro com CNJ, data e texto é matchable.');
console.log('  ✓ Elegibilidade e data da fonte corretas.');

console.log('[P4] Upsert preserva tratamento, leitura, tarefas e prazos humanos...');
const existing = {
  id: item.externalId,
  externalId: item.externalId,
  treatmentStatus: 'treated',
  unread: false,
  treatedAt: '2026-09-30T10:00:00.000Z',
  treatmentNote: 'Conferida pela equipe.',
  linkedTaskIds: ['tarefa-1'],
  deadline: '2026-10-08',
  fatalDeadline: true,
  client: 'Cliente Sintético'
};
const first = mergeProjectedPjeIntimations([existing], [item]);
assert.equal(first.intimations.length, 1, 'Mesma identidade não duplica item.');
const merged = first.intimations[0];
assert.equal(merged.treatmentStatus, 'treated', 'Tratamento existente permanece.');
assert.equal(merged.unread, false, 'Leitura existente permanece.');
assert.equal(merged.treatedAt, '2026-09-30T10:00:00.000Z');
assert.equal(merged.treatmentNote, 'Conferida pela equipe.');
assert.deepEqual(merged.linkedTaskIds, ['tarefa-1']);
assert.equal(merged.deadline, '2026-10-08', 'Prazo humano não pode ser sobrescrito.');
assert.equal(merged.fatalDeadline, true);
assert.equal(merged.client, 'Cliente Sintético');
assert.equal(first.counters.pjeIntimationsUpdated, 1);
console.log('  ✓ Campos protegidos preservados.');

console.log('[P5] Projeção é idempotente e preserva o acervo de outras fontes...');
const intens = projectPjeCommunicationsToIntimations({ communications: [communication, communication] }, { now });
assert.equal(intens.length, 2, 'A projeção é por comunicação; o dedupe é do merge por identidade.');
const second = mergeProjectedPjeIntimations(first.intimations, intens);
assert.equal(second.intimations.length, 1, 'Reexecução não cria duplicata do mesmo expediente.');
const other = { id: 'djen:123', externalId: 'djen:123', treatmentStatus: 'untreated', text: 'DJEN' };
const withOther = mergeProjectedPjeIntimations([other], [item]);
assert.equal(withOther.intimations.length, 2, 'Item de outra fonte permanece no acervo.');
assert.equal(withOther.counters.pjeIntimationsCreated, 1);
console.log('  ✓ Idempotente e sem apagar outras fontes.');

console.log('[P6] Prazo PJe vira tarefa principal na Gestão de Tarefas...');
{
  const baseState = () => ({ settings: { deadlineMode: 'auto' }, processes: [], tasks: [], communications: [], intimations: [], audit: [] });
  const inventory = {
    portalId: 'pje-tjmt-1g',
    portalName: 'TJMT · PJe 1º grau',
    collectedAt: now,
    expedientes: {
      state: 'loaded',
      situations: [{ label: 'Pendentes de ciência ou de resposta', count: 1 }],
      expedientes: [{
        expedienteIdentity: 'id:999',
        processNumber: CNJ,
        prazoFinal: '23/10/2026',
        lastDate: '20/10/2026',
        situations: ['Pendentes de ciência ou de resposta'],
        summary: 'Intimação sintética com prazo declarado.'
      }]
    },
    acervo: { state: 'loaded', processes: [] }
  };
  const digitsCnj = CNJ.replace(/\D/g, '');
  const externalId = 'pje:pje-tjmt-1g:id:999';

  const auto = mergePjeInventoryIntoState(baseState(), inventory, { now, workspaceId: 'ws-teste' });
  const task = auto.state.tasks.find(candidate => candidate.sourceIntimationId === externalId);
  assert.ok(task, 'Prazo da fonte precisa virar tarefa, não só intimação.');
  assert.equal(task.id, `task:pje-panel:${externalId}`);
  assert.equal(task.deadline, '2026-10-23');
  assert.equal(task.deadlineSource, 'pje');
  assert.equal(task.sourceReportedDeadlineAt, '2026-10-23');
  assert.equal(task.process, digitsCnj);
  assert.equal(task.status, 'triagem');
  assert.match(task.title, /^Prazo PJe/);
  assert.ok(auto.state.intimations.some(item => item.deadline === '2026-10-23'), 'A intimação mantém o prazo.');

  const manual = mergePjeInventoryIntoState({ ...baseState(), settings: { deadlineMode: 'manual' } }, inventory, { now, workspaceId: 'ws-teste' });
  const manualTask = manual.state.tasks.find(candidate => candidate.sourceIntimationId === externalId);
  assert.ok(manualTask, 'Modo manual também cria tarefa de conferência.');
  assert.equal(manualTask.deadline, '', 'Modo manual não aplica prazo automaticamente.');
  assert.equal(manualTask.deadlineSource, null);
  assert.match(manualTask.title, /^Conferir prazo PJe/);

  const humanState = baseState();
  humanState.tasks.push({
    id: 'tarefa-humana',
    source: 'pje',
    sourceIntimationId: externalId,
    process: digitsCnj,
    title: 'Prazo ajustado pela equipe',
    status: 'triagem',
    deadline: '2026-10-30',
    deadlineSource: null,
    sourceReportedDeadlineAt: ''
  });
  const human = mergePjeInventoryIntoState(humanState, inventory, { now, workspaceId: 'ws-teste' });
  const humanTask = human.state.tasks.find(candidate => candidate.id === 'tarefa-humana');
  assert.equal(humanTask.deadline, '2026-10-30', 'Prazo humano nunca é sobrescrito.');
  assert.equal(humanTask.deadlineConflict?.source, 'pje');
  assert.equal(humanTask.deadlineConflict?.humanValue, '2026-10-30');

  const doneState = baseState();
  doneState.tasks.push({
    id: 'tarefa-concluida',
    source: 'pje',
    sourceIntimationId: externalId,
    process: digitsCnj,
    title: 'Prazo já cumprido',
    status: 'concluida',
    deadline: '2026-10-25',
    deadlineSource: 'pje',
    sourceReportedDeadlineAt: '2026-10-25'
  });
  const done = mergePjeInventoryIntoState(doneState, inventory, { now, workspaceId: 'ws-teste' });
  const doneTask = done.state.tasks.find(candidate => candidate.id === 'tarefa-concluida');
  assert.equal(doneTask.deadline, '2026-10-25', 'Tarefa concluída não ressuscita nem muda de prazo.');
  assert.equal(doneTask.status, 'concluida');
  console.log('  OK: auto cria prazo, manual cria conferência, humano e concluído prevalecem.');
}

console.log('[P7] Dois atos distintos com mesmo processo e prazo preservam tarefas individuais...');
{
  const seed = { settings: { deadlineMode: 'auto' }, processes: [], tasks: [], communications: [], intimations: [], audit: [] };
  const inventory = {
    portalId: 'pje-tjmt-1g',
    portalName: 'TJMT · PJe 1º grau',
    collectedAt: now,
    expedientes: {
      state: 'loaded',
      situations: [],
      expedientes: [
        { expedienteIdentity: 'id:1001', processNumber: CNJ, prazoFinal: '23/10/2026', lastDate: '20/10/2026', summary: 'Intimação de documento A.' },
        { expedienteIdentity: 'id:1002', processNumber: CNJ, prazoFinal: '23/10/2026', lastDate: '20/10/2026', summary: 'Intimação de documento B.' }
      ]
    },
    acervo: { state: 'loaded', processes: [] }
  };
  const first = mergePjeInventoryIntoState(seed, inventory, { now, workspaceId: 'ws-teste' });
  const linked = first.state.tasks.filter(t => String(t.id).startsWith('task:pje-panel:'));
  assert.equal(linked.length, 2, 'Atos distintos não podem ser reunidos só por processo e prazo iguais.');
  assert.deepEqual(new Set(linked.map(t => t.sourceIntimationId)), new Set([
    'pje:pje-tjmt-1g:id:1001', 'pje:pje-tjmt-1g:id:1002'
  ]), 'Cada tarefa deve se vincular ao seu expediente.');
  const repeat = mergePjeInventoryIntoState(first.state, inventory, { now, workspaceId: 'ws-teste' });
  assert.equal(repeat.state.tasks.filter(t => String(t.id).startsWith('task:pje-panel:')).length, 2,
    'Nova coleta dos mesmos atos não deve criar tarefas extras.');
  console.log('  OK: identidade por ato e idempotência preservadas.');
}

console.log('\n>>> PROJEÇÃO PJe → PUBLICAÇÕES: PASS <<<\n');
