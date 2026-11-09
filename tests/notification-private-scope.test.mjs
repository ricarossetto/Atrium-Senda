import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBulletinContext } from '../lib/notifications/helpers-bulletin-cadence.mjs';

const DAY = '2026-10-23';

test('boletim não inclui tarefa, agenda, processo ou termo de escopo privado', () => {
  const state = {
    processes: [
      { id: 'proc-office', number: '5000001-00.2026.8.21.0001', scope: 'office' },
      { id: 'proc-private', number: '5000002-00.2026.8.21.0001', scope: 'private', privateOwnerUserId: 'usr-dono' }
    ],
    terms: [
      { id: 'term-office', scope: 'office' },
      { id: 'term-private', scope: 'private', privateOwnerUserId: 'usr-dono' }
    ],
    tasks: [
      { id: 'task-office', title: 'Prazo público', deadline: '2026-10-24', processId: 'proc-office' },
      { id: 'task-private-scope', title: 'Prazo privado', deadline: '2026-10-24', scope: 'private', privateOwnerUserId: 'usr-dono' },
      { id: 'task-private-process', title: 'Prazo de processo privado', deadline: '2026-10-24', processId: 'proc-private' },
      { id: 'task-private-term', title: 'Prazo de termo privado', deadline: '2026-10-24', monitoredTermIds: ['term-private'] }
    ],
    agenda: [
      { id: 'event-office', title: 'Audiência pública', date: '2026-10-23T12:00:00Z' },
      { id: 'event-private', title: 'Reunião privada', date: '2026-10-23T13:00:00Z', scope: 'private', privateOwnerUserId: 'usr-dono' },
      { id: 'event-private-process', title: 'Audiência de processo privado', date: '2026-10-23T14:00:00Z', processId: 'proc-private' }
    ]
  };

  const context = buildBulletinContext(state, DAY);
  const agendaIds = context.agendaToday.map(item => item.id);
  const deadlineIds = context.deadlines.map(item => item.id);

  assert.deepEqual(agendaIds, ['event-office']);
  assert.deepEqual(deadlineIds, ['task-office']);
});
