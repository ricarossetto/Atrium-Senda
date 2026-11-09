import assert from 'node:assert/strict';
import { computeTaskPerformance } from '../js/core/task-performance.js';

console.log('\n=== PERFORMANCE DE TAREFAS (mês atual vs anterior) ===\n');

const now = new Date('2026-09-18T15:00:00.000Z');
const at = (day, points) => ({
  id: `t-${day}-${points}`,
  points,
  completedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`
});
const previousAt = (day, points) => ({
  id: `p-${day}-${points}`,
  points,
  completedAt: `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`
});

const tasks = [
  at(2, 10),
  at(2, 5),
  at(10, 25),
  at(18, 30),
  previousAt(1, 100),
  previousAt(20, 200),
  { id: 'pending-1', points: 10, deadline: '2026-09-20' },
  { id: 'late-1', points: 25, deadline: '2026-09-01' },
  { id: 'inactive', points: 999, completedAt: '2026-09-15T12:00:00.000Z', active: false }
];

const performance = computeTaskPerformance(tasks, { goal: 100, now });

assert.equal(performance.current.completed, 4, 'Tarefas concluídas do mês atual.');
assert.equal(performance.current.points, 70, 'Pontos do mês atual (10+5+25+30).');
assert.equal(performance.previous.completed, 2);
assert.equal(performance.previous.points, 300);
assert.equal(performance.pending, 2, 'Pendentes excluem concluídas e inativas.');
assert.equal(performance.late, 1, 'Atrasadas: prazo anterior a hoje.');
assert.equal(performance.goal, 100);
assert.equal(performance.goalRatio, 0.7);

assert.equal(performance.current.pointsCumulative.at(-1), 70);
assert.equal(performance.current.pointsCumulative[1], 15, 'Acumulado diário: dia 2 soma 10+5.');
assert.equal(performance.current.shownDays, 18, 'Mês atual para em hoje.');
assert.equal(performance.previous.daysInMonth, 31);
assert.equal(performance.variation.completed, (4 - 2) / 2 * 100);
assert.equal(performance.variation.points, (70 - 300) / 300 * 100);
console.log('✓ Séries mensais, acumulado diário, pendentes/atrasadas e alcance da meta.');

const empty = computeTaskPerformance([], { goal: null, now });
assert.equal(empty.current.completed, 0);
assert.equal(empty.goal, null);
assert.equal(empty.goalRatio, null, 'Sem meta não há fração de alcance.');
assert.equal(empty.variation.points, null, 'Sem base anterior não há variação.');
assert.equal(empty.current.pointsCumulative.every(value => value === 0), true);

const previousOnly = computeTaskPerformance([previousAt(5, 40)], { goal: 100, now });
assert.equal(previousOnly.variation.completed, -100, 'Sem conclusões no mês atual a variação é -100%.');
assert.equal(previousOnly.current.completed, 0);
console.log('✓ Estado vazio, sem meta e sem base anterior são honestos.');

const future = computeTaskPerformance([{ id: 'future', points: 5, completedAt: '2026-09-30T12:00:00.000Z' }], { now });
assert.equal(future.current.completed, 0, 'Conclusão futura não conta até chegar.');
assert.equal(computeTaskPerformance([{ id: 'x', completedAt: 'data inválida' }], { now }).current.completed, 0, 'Data inválida é ignorada.');
const reopened = computeTaskPerformance([{ id: 'r', points: 5, completedAt: '' }], { now });
assert.equal(reopened.current.completed, 0);
assert.equal(reopened.pending, 1, 'Sem completedAt a tarefa permanece na coluna viva.');
const legacyDone = computeTaskPerformance([{ id: 'l', points: 5, status: 'concluida' }], { now });
assert.equal(legacyDone.current.completed, 0, 'Concluída legada sem data não entra nas séries.');
assert.equal(legacyDone.pending, 0, 'Concluída legada sem data não conta como pendente.');
console.log('✓ Janela do mês atual, datas inválidas e reaberturas tratados.');

const referenceOnly = computeTaskPerformance([{ id: 'ref-only', points: 5, sourceReportedDeadlineAt: '2026-09-01' }], { now });
assert.equal(referenceOnly.pending, 1);
assert.equal(referenceOnly.late, 0, 'referência da fonte não vira atraso operacional');
const fatalOnly = computeTaskPerformance([{ id: 'fatal-only', fatalDeadline: '2026-09-01' }], { now });
assert.equal(fatalOnly.late, 1, 'prazo fatal humano conta como atraso');
console.log('V Referência da fonte não vira atraso; prazo humano continua contando.');

console.log('\n>>> TASK PERFORMANCE: PASS <<<\n');
