import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTaskCompletionTreatment,
  findLinkedPublication,
  linkedPublicationIds,
  planTaskCompletionTreatment
} from '../js/core/publication-task-treatment.js';

const intimations = [
  { id: 'pub-open', externalId: 'djen:1', process: '5000000-00.2026.8.21.0000', treatmentStatus: 'in_review' },
  { id: 'pub-untreated', externalId: 'djen:2', treatmentStatus: 'untreated' },
  { id: 'pub-treated', externalId: 'djen:3', treatmentStatus: 'treated' },
  { id: 'pub-discarded', externalId: 'djen:4', treatmentStatus: 'discarded' },
  { id: 'pub-merged', externalId: 'djen:5', treatmentStatus: 'untreated', mergedInto: 'pub-open' }
];

const taskFor = (id, publicationId, status = 'concluida') => ({ id, intimationId: publicationId, status, title: `Tarefa ${id}` });

test('identifica a publicação vinculada por id ou externalId', () => {
  assert.deepEqual(linkedPublicationIds({ intimationId: 'pub-open' }), ['pub-open']);
  assert.deepEqual(linkedPublicationIds({ sourceIntimationId: 'djen:1' }), ['djen:1']);
  assert.equal(findLinkedPublication({ intimationId: 'djen:1' }, intimations)?.id, 'pub-open');
  assert.equal(findLinkedPublication({ intimationId: 'pub-merged' }, intimations), null);
  assert.equal(findLinkedPublication({ intimationId: 'nao-existe' }, intimations), null);
});

test('concluir tarefa trata a publicação aberta e registra auditoria', () => {
  const state = { intimations: structuredClone(intimations), audit: [] };
  const plan = planTaskCompletionTreatment({
    previousTasks: [{ id: 't1', status: 'triagem' }],
    nextTasks: [taskFor('t1', 'pub-open')],
    intimations: state.intimations
  });
  assert.equal(plan.treatments.length, 1);
  const result = applyTaskCompletionTreatment(state, plan, { actor: 'Advogada Teste', nowIso: '2026-10-22T12:00:00.000Z' });
  assert.equal(result.changed, true);
  const publication = state.intimations.find(item => item.id === 'pub-open');
  assert.equal(publication.treatmentStatus, 'treated');
  assert.equal(publication.treatedBy, 'Advogada Teste');
  assert.equal(publication.treatmentSource, 'task-completion');
  assert.equal(publication.treatmentTaskId, 't1');
  assert.equal(state.audit.length, 1);
  assert.equal(state.audit[0].action, 'Publicação tratada ao concluir tarefa');
});

test('não trata publicação descartada, já tratada ou tarefa não concluída', () => {
  const state = { intimations: structuredClone(intimations), audit: [] };
  for (const [task, publicationId] of [
    [taskFor('t-discarded', 'pub-discarded'), 'pub-discarded'],
    [taskFor('t-treated', 'pub-treated'), 'pub-treated'],
    [taskFor('t-open', 'pub-untreated', 'triagem'), 'pub-untreated']
  ]) {
    const plan = planTaskCompletionTreatment({ previousTasks: [{ id: task.id, status: 'triagem' }], nextTasks: [task], intimations: state.intimations });
    const result = applyTaskCompletionTreatment(state, plan, { actor: 'Teste' });
    assert.equal(result.changed, false, `não deve tratar ${publicationId}`);
  }
  assert.equal(state.intimations.find(item => item.id === 'pub-untreated').treatmentStatus, 'untreated');
});

test('tarefa que já estava concluída não repete o tratamento', () => {
  const plan = planTaskCompletionTreatment({
    previousTasks: [{ id: 't1', status: 'concluida' }],
    nextTasks: [taskFor('t1', 'pub-open')],
    intimations
  });
  assert.deepEqual(plan.treatments, []);
});

test('aplica a regra mesmo sem estado anterior (cliente antigo), uma vez por publicação', () => {
  const state = { intimations: structuredClone(intimations), audit: [] };
  const plan = planTaskCompletionTreatment({
    previousTasks: [],
    nextTasks: [taskFor('t1', 'pub-open'), taskFor('t2', 'pub-open')],
    intimations: state.intimations
  });
  assert.equal(plan.treatments.length, 1);
  const result = applyTaskCompletionTreatment(state, plan, { actor: 'Teste' });
  assert.equal(result.treated.length, 1);
  assert.equal(state.audit.length, 1);
});
