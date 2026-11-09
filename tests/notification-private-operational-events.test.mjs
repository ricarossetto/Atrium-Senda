import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationService, EVENT_TYPES } from '../lib/notifications/notification-service.mjs';

function serviceWith(events) {
  const service = Object.create(NotificationService.prototype);
  service.db = {
    recordEvent: event => {
      events.push(event);
      return { isNew: true };
    }
  };
  return service;
}

test('boletim não registra evento de publicação, audiência, andamento ou prazo privado', async () => {
  const events = [];
  const service = serviceWith(events);

  await service.onNewPublications('ws-teste', [
    { id: 'pub-privada-scope', scope: 'private', process: '5000001-00.2026.8.21.0001', text: 'Conteúdo privado' },
    { id: 'pub-privada-dono', privateOwnerUserId: 'usr-dona', process: '', text: 'Sem processo resolvido' },
    { id: 'pub-escritorio', process: '5000002-00.2026.8.21.0001', text: 'Conteúdo do escritório' }
  ]);

  await service.onNewHearings('ws-teste', [
    { id: 'aud-privada', scope: 'private', privateOwnerUserId: 'usr-dona', process: '', date: '2026-10-24', time: '10:00' },
    { id: 'aud-escritorio', process: '5000002-00.2026.8.21.0001', date: '2026-10-24', time: '11:00' }
  ]);

  await service.onNewMovements('ws-teste', [
    { scope: 'private', description: 'Andamento privado', date: '2026-10-24' },
    { description: 'Andamento do escritório', process: '5000002-00.2026.8.21.0001', date: '2026-10-24' }
  ]);

  const now = new Date('2026-10-24T10:00:00-03:00');
  await service.checkDeadlines('ws-teste', [
    { id: 'task-privada', scope: 'private', privateOwnerUserId: 'usr-dona', title: 'Prazo privado', deadline: '2026-10-24' },
    { id: 'task-escritorio', title: 'Prazo do escritório', deadline: '2026-10-24' }
  ], { now });

  const ids = events.map(event => event.payload.id ?? event.payload.taskId);
  assert.deepEqual(events.map(event => event.eventType), [
    EVENT_TYPES.PUBLICATION_NEW,
    EVENT_TYPES.HEARING_NEW,
    EVENT_TYPES.MOVEMENT_NEW,
    EVENT_TYPES.DEADLINE_CRITICAL
  ]);
  assert.deepEqual(ids, ['pub-escritorio', 'aud-escritorio', '5000002-00.2026.8.21.0001:2026-10-24:Andamento do escritório', 'task-escritorio']);
});

test('registro privado suprimido também fica fora do boletim', async () => {
  const events = [];
  const service = serviceWith(events);
  await service.onNewPublications('ws-teste', [
    { id: 'pub-suprimida', captureSuppressed: true, process: '5000001-00.2026.8.21.0001' }
  ]);
  assert.equal(events.length, 0);
});

test('evento de publicação preserva a íntegra oficial para o template recolhido', async () => {
  const events = [];
  const service = serviceWith(events);
  await service.onNewPublications('ws-teste', [{
    id: 'pub-integra',
    process: '5000007-00.2026.8.21.0001',
    text: 'Resumo sintético.',
    fullText: 'ÍNTEGRA CANÔNICA SINTÉTICA'
  }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.text, 'Resumo sintético.');
  assert.equal(events[0].payload.fullText, 'ÍNTEGRA CANÔNICA SINTÉTICA');
});
