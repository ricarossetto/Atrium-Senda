import assert from 'node:assert/strict';
import test from 'node:test';
import { absorbSourceDeadlineTasksForPublication } from '../lib/publications/source-deadline-consolidation.mjs';

const sourceTask = (overrides = {}) => ({
  id: 'task-generica',
  title: 'Prazo eproc — Evento 10',
  description: 'Registro coletado no Painel do Advogado.',
  process: '5000000-00.2026.8.21.0000',
  intimationId: 'pub-1',
  sourceIntimationId: 'pub-1',
  source: 'eproc',
  deadlineSource: 'eproc',
  sourceReportedDeadlineAt: '2026-11-10',
  deadline: '2026-11-10',
  status: 'triagem',
  priority: 'normal',
  active: true,
  sourceManagedSnapshot: {
    title: 'Prazo eproc — Evento 10',
    description: 'Registro coletado no Painel do Advogado.',
    status: 'triagem',
    deadline: '2026-11-10'
  },
  ...overrides
});

const stateWith = (tasks) => ({
  tasks,
  intimations: [{ id: 'pub-1', externalId: 'eproc:pub-1', process: '5000000-00.2026.8.21.0000', treatmentStatus: 'in_review', linkedTaskIds: ['task-generica'], taskId: 'task-generica' }],
  audit: []
});

const specificTask = { id: 'task-especifica', title: 'Réplica', process: '5000000-00.2026.8.21.0000', intimationId: 'pub-1', status: 'triagem', active: true };

test('tarefa específica absorve a genérica intocada e herda o prazo da fonte', () => {
  const state = stateWith([specificTask, sourceTask()]);
  const result = absorbSourceDeadlineTasksForPublication(state, {
    publicationId: 'pub-1',
    keeperId: 'task-especifica',
    actor: 'Advogada Teste',
    nowIso: '2026-10-22T12:00:00.000Z'
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.absorbed, ['task-generica']);
  const generic = state.tasks.find(task => task.id === 'task-generica');
  assert.equal(generic.active, false);
  assert.equal(generic.absorbedInto, 'task-especifica');
  assert.equal(generic.absorbReason, 'specific-task');
  const keeper = state.tasks.find(task => task.id === 'task-especifica');
  assert.equal(keeper.deadline, '2026-11-10');
  assert.equal(keeper.deadlineSource, 'eproc');
  assert.equal(keeper.sourceReportedDeadlineAt, '2026-11-10');
  assert.equal(state.intimations[0].taskId, 'task-especifica');
  assert.deepEqual(state.intimations[0].linkedTaskIds, ['task-especifica']);
  assert.equal(state.audit.length, 1);
});

test('tarefa com curadoria humana (responsável, prazo humano, nota) não é absorvida', () => {
  for (const touched of [
    sourceTask({ id: 'task-generica', responsible: 'Advogado Teste' }),
    sourceTask({ id: 'task-generica', deadline: '2026-11-20' }),
    sourceTask({ id: 'task-generica', notes: 'conferir' }),
    sourceTask({ id: 'task-generica', priority: 'urgente' })
  ]) {
    const state = stateWith([specificTask, touched]);
    const result = absorbSourceDeadlineTasksForPublication(state, { publicationId: 'pub-1', keeperId: 'task-especifica' });
    assert.equal(result.changed, false, `não deve absorver com ${JSON.stringify(touched.responsible || touched.deadline || touched.notes || touched.priority)}`);
    assert.equal(state.tasks.find(task => task.id === 'task-generica').active, true);
  }
});

test('tarefa de outro processo/publicação e tarefa já absorvida ficam intactas', () => {
  const other = sourceTask({ id: 'task-outra', intimationId: 'pub-2', sourceIntimationId: 'pub-2' });
  const already = sourceTask({ id: 'task-absorvida', absorbedInto: 'task-x', active: false });
  const state = stateWith([specificTask, other, already]);
  const result = absorbSourceDeadlineTasksForPublication(state, { publicationId: 'pub-1', keeperId: 'task-especifica' });
  assert.equal(result.changed, false);
  assert.equal(state.tasks.find(task => task.id === 'task-outra').active, true);
});

test('canAbsorb barra tarefa que o usuário não pode acessar', () => {
  const privada = sourceTask({ id: 'task-generica', scope: 'private', privateOwnerUserId: 'outro-usuario' });
  const state = stateWith([specificTask, privada]);
  const result = absorbSourceDeadlineTasksForPublication(state, {
    publicationId: 'pub-1',
    keeperId: 'task-especifica',
    canAbsorb: task => task.scope !== 'private'
  });
  assert.equal(result.changed, false);
  assert.equal(state.tasks.find(task => task.id === 'task-generica').active, true);
});

test('não sobrescreve prazo já preenchido na tarefa específica', () => {
  const keeper = { ...specificTask, deadline: '2026-11-25', deadlineSource: 'conferencia' };
  const state = stateWith([keeper, sourceTask()]);
  absorbSourceDeadlineTasksForPublication(state, { publicationId: 'pub-1', keeperId: 'task-especifica' });
  const after = state.tasks.find(task => task.id === 'task-especifica');
  assert.equal(after.deadline, '2026-11-25');
  assert.equal(after.deadlineSource, 'conferencia');
});
