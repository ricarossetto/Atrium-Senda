import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService, TASK_COMPLETED_EVENT } from '../lib/notifications/notification-service.mjs';

const ws = 'ws-task-completion';
const users = [
  { id: 'u-ana', username: 'ana', displayName: 'Ana', email: 'ana@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-bruno', username: 'bruno', displayName: 'Bruno', email: 'bruno@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-carla', username: 'carla', displayName: 'Carla', email: 'carla@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-admin', username: 'admin', displayName: 'Admin', email: 'admin@example.test', role: 'admin', status: 'active' }
];

function fixture(t) {
  const db = new NotificationDatabase({ inMemory: true });
  db.setSetting('notifications_enabled_at', '2026-10-19T00:00:00.000Z');
  const provider = {
    getFromAddress: () => 'teste@example.test',
    checkBudget: () => ({ allowed: true }),
    sendEmail: async () => ({ providerMessageId: 'synthetic-message' })
  };
  const service = new NotificationService({
    db,
    provider,
    routingSecret: 'synthetic-routing-secret-test',
    securityManager: { listUsers: () => users },
    logger: { warn() {} }
  });
  t.after(() => db.close());
  return { db, service };
}

const process = {
  id: 'proc-1',
  number: '5000000-00.2026.8.21.0001',
  client: 'Cliente Teste',
  responsibleUserIds: ['u-carla']
};

test('conclusão registra evento para todos os envolvidos e não para o escritório inteiro', async t => {
  const { db, service } = fixture(t);
  const task = {
    id: 'task-1',
    title: 'Protocolar contestação',
    status: 'concluida',
    completedAt: '2026-10-20T18:00:00.000Z',
    processId: 'proc-1',
    process: process.number,
    client: process.client,
    assigneeUserId: 'u-ana',
    followerUserIds: ['u-bruno']
  };
  const result = await service.onTasksCompleted(ws, [task], {
    actor: 'Ana',
    actorUserId: 'u-ana',
    processes: [process]
  });
  assert.equal(result.recorded, 1);
  const events = db.getTaskCompletionEvents(ws);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, TASK_COMPLETED_EVENT);
  assert.deepEqual(new Set(events[0].payload.audienceUserIds), new Set(['u-ana', 'u-bruno', 'u-carla']));
  assert.equal(events[0].payload.actor, 'Ana');
  assert.equal(events[0].payload.title, 'Protocolar contestação');

  const ana = service.listTaskCompletionInbox(ws, { userId: 'u-ana', username: 'ana' });
  const bruno = service.listTaskCompletionInbox(ws, { userId: 'u-bruno', username: 'bruno' });
  const carla = service.listTaskCompletionInbox(ws, { userId: 'u-carla', username: 'carla' });
  const admin = service.listTaskCompletionInbox(ws, { userId: 'u-admin', username: 'admin' });
  assert.equal(ana.length, 1);
  assert.equal(bruno.length, 1);
  assert.equal(carla.length, 1);
  assert.equal(admin.length, 0);
  assert.match(ana[0].detail, /Ana/);
  assert.equal(ana[0].read, false);

  assert.equal(service.markTaskCompletionInboxRead(ws, 'u-ana', [ana[0].id]), 1);
  assert.equal(service.listTaskCompletionInbox(ws, { userId: 'u-ana', username: 'ana' })[0].read, true);

  await service.onTasksCompleted(ws, [task], { actor: 'Ana', actorUserId: 'u-ana', processes: [process] });
  assert.equal(db.getTaskCompletionEvents(ws).length, 1, 'retry idempotente não duplica evento');
});

test('sem envolvido resolvido, conclusão vai para administradores', async t => {
  const { db, service } = fixture(t);
  await service.onTasksCompleted(ws, [{
    id: 'task-2',
    title: 'Arquivar processo',
    status: 'concluida',
    completedAt: '2026-10-20T18:10:00.000Z'
  }], { actor: 'Sistema' });
  const event = db.getTaskCompletionEvents(ws)[0];
  assert.deepEqual(event.payload.audienceUserIds, ['u-admin']);
  assert.equal(service.listTaskCompletionInbox(ws, { userId: 'u-admin', username: 'admin' }).length, 1);
});

test('digest das 19h é único por destinatário/dia e separado do boletim', async t => {
  const { db, service } = fixture(t);
  const at19 = new Date();
  at19.setUTCHours(22, 0, 0, 0);
  const task = {
    id: 'task-3',
    title: 'Revisar minuta',
    status: 'concluida',
    completedAt: new Date(at19.getTime() - 30 * 60 * 1000).toISOString(),
    processId: 'proc-1',
    process: process.number,
    client: process.client,
    assigneeUserId: 'u-ana',
    followerUserIds: ['u-bruno']
  };
  await service.onTasksCompleted(ws, [task], { actor: 'Ana', actorUserId: 'u-ana', processes: [process] });
  const first = await service.dispatchTaskCompletionDigest(ws, users, { processes: [process] }, { now: at19 });
  assert.equal(first.enqueued, 3, 'Ana, Bruno e Carla recebem o digest');
  const second = await service.dispatchTaskCompletionDigest(ws, users, { processes: [process] }, { now: at19 });
  assert.equal(second.enqueued, 0, 'segunda execução no mesmo dia não duplica');
  const digests = db.db.prepare("SELECT * FROM notification_outbox WHERE event_type = 'TASK_COMPLETED_DIGEST'").all();
  assert.equal(digests.length, 3);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM notification_outbox WHERE event_type = 'OPERATIONAL_BULLETIN'").get().n, 0);
  const anaMessage = db.getOutboxItemById(digests.find(row => db.decryptField(row.recipient) === 'ana@example.test').id);
  assert.match(anaMessage.payload.subject, /Tarefas concluídas/);
  assert.match(anaMessage.payload.text, /Revisar minuta/);
  assert.ok(!anaMessage.payload.text.includes('conteúdo judicial completo'));
});

test('fora das 19h não envia digest', async t => {
  const { db, service } = fixture(t);
  await service.onTasksCompleted(ws, [{
    id: 'task-4', title: 'Tarefa', status: 'concluida', completedAt: '2026-10-20T20:30:00.000Z', assigneeUserId: 'u-ana'
  }], { actor: 'Ana', actorUserId: 'u-ana' });
  const result = await service.dispatchTaskCompletionDigest(ws, users, {}, { now: '2026-10-20T21:00:00.000Z' });
  assert.equal(result.enqueued, 0);
  assert.equal(result.reason, 'OUTSIDE_19H_WINDOW');
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM notification_outbox WHERE event_type = 'TASK_COMPLETED_DIGEST'").get().n, 0);
});
