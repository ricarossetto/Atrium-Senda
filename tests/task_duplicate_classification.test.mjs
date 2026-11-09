import assert from 'node:assert/strict';
import test from 'node:test';
import { planRepeatedTaskGroups } from '../lib/publications/source-deadline-consolidation.mjs';

const PROCESS = '5313106-50.2026.8.21.7000';

const task = (id, overrides = {}) => ({
  id,
  title: 'Protocolar contestação',
  description: 'Peça de defesa do cliente.',
  client: 'Cliente Teste',
  process: PROCESS,
  status: 'triagem',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides
});

const groupFor = groups => groups[0];

test('tarefas iguais no mesmo processo são classificadas como a mesma tarefa', () => {
  const { groups } = planRepeatedTaskGroups({
    tasks: [task('a', { deadline: '2026-10-30' }), task('b', { deadline: '2026-10-30' })],
    intimations: []
  });
  assert.equal(groups.length, 1);
  assert.equal(groupFor(groups).classification, 'identica');
  assert.equal(groupFor(groups).members.length, 2);
});

test('mesma tarefa com prazo diferente é declarada como tal', () => {
  const { groups } = planRepeatedTaskGroups({
    tasks: [task('a', { deadline: '2026-10-30' }), task('b', { deadline: '2026-11-10' })],
    intimations: []
  });
  assert.equal(groups.length, 1);
  assert.equal(groupFor(groups).classification, 'prazo-diferente');
});

test('mesmo título com corpo diferente não é chamado de tarefa igual', () => {
  const { groups } = planRepeatedTaskGroups({
    tasks: [
      task('a', { deadline: '2026-10-30' }),
      task('b', { deadline: '2026-10-30', description: 'Outra orientação completamente diferente.' })
    ],
    intimations: []
  });
  assert.equal(groups.length, 1);
  assert.equal(groupFor(groups).classification, 'mesma-tarefa');
});

test('tarefas diferentes do mesmo processo não são agrupadas por engano', () => {
  const { groups } = planRepeatedTaskGroups({
    tasks: [
      task('a', { title: 'Protocolar contestação', deadline: '2026-10-30' }),
      task('b', { title: 'Preparar audiência de instrução', deadline: '2026-11-05' })
    ],
    intimations: []
  });
  assert.deepEqual(groups, []);
});

test('tarefas de processos diferentes não entram no mesmo grupo', () => {
  const { groups } = planRepeatedTaskGroups({
    tasks: [
      task('a', { deadline: '2026-10-30' }),
      task('b', { process: '5000000-00.2026.8.21.0000', deadline: '2026-10-30' })
    ],
    intimations: []
  });
  assert.deepEqual(groups, []);
});

test('publicações com origem diferente e mesmo texto integral entram para conferência', () => {
  const text = 'Comunicação sintética sobre a decisão e seus fundamentos, com prazo para manifestação da parte interessada. '.repeat(2);
  const intimations = [
    { id: 'pub-a', process: PROCESS, fullText: text },
    { id: 'pub-b', process: PROCESS, fullText: text }
  ];
  const result = planRepeatedTaskGroups({
    tasks: [task('a', { intimationId: 'pub-a', deadline: '2026-10-30' }), task('b', { intimationId: 'pub-b', deadline: '2026-10-30' })],
    intimations
  });
  const group = result.groups.find(item => item.kind === 'mesmo-conteudo');
  assert.ok(group, 'fontes diferentes com mesmo texto e prazo devem aparecer juntas');
  assert.equal(group.requiresHumanChoice, true);
  assert.deepEqual(new Set(group.members.map(item => item.id)), new Set(['a', 'b']));
});

test('texto curto, prazo diferente ou atos de processos distintos não geram grupo por conteúdo', () => {
  const text = 'Comunicação sintética sobre a decisão e seus fundamentos, com prazo para manifestação da parte interessada. '.repeat(2);
  const intimations = [{ id: 'pub-a', process: PROCESS, fullText: text }, { id: 'pub-b', process: PROCESS, fullText: text }];
  const candidates = (a, b, pubs = intimations) => planRepeatedTaskGroups({ tasks: [a, b], intimations: pubs }).groups.filter(group => group.kind === 'mesmo-conteudo');
  assert.equal(candidates(task('a', { intimationId: 'pub-a', deadline: '2026-10-30' }), task('b', { intimationId: 'pub-b', deadline: '2026-11-01' })).length, 0);
  assert.equal(candidates(task('a', { intimationId: 'pub-a', deadline: '2026-10-30' }), task('b', { intimationId: 'pub-b', deadline: '2026-10-30' }), [{ id: 'pub-a', process: PROCESS, fullText: 'Processo sigiloso' }, { id: 'pub-b', process: PROCESS, fullText: 'Processo sigiloso' }]).length, 0);
});
