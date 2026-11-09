import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService, TASK_COMPLETED_EVENT } from '../lib/notifications/notification-service.mjs';

const ws = 'ws-task-completion-privacy';
const users = [
  { id: 'u-dona', username: 'dona', displayName: 'Dona', email: 'dona@example.test', role: 'collaborator', status: 'active' },
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

function next19h() {
  const at19 = new Date();
  at19.setUTCHours(22, 0, 0, 0); // 19h BRT
  if (at19.getTime() <= Date.now()) at19.setUTCDate(at19.getUTCDate() + 1);
  return at19;
}

function digestFor(db, email) {
  const rows = db.db.prepare("SELECT * FROM notification_outbox WHERE event_type = 'TASK_COMPLETED_DIGEST'").all();
  const row = rows.find(r => db.decryptField(r.recipient) === email);
  return row ? db.getOutboxItemById(row.id) : null;
}

test('tarefa privada delegada a outro membro não vaza no inbox nem no digest', async t => {
  const { db, service } = fixture(t);
  const at19 = next19h();
  const completedAt = new Date(at19.getTime() - 30 * 60 * 1000).toISOString();

  const privateTask = {
    id: 'task-privada-1',
    title: 'Tarefa privada',
    status: 'concluida',
    completedAt,
    scope: 'private',
    privateOwnerUserId: 'u-dona',
    assigneeUserId: 'u-bruno',
    followerUserIds: ['u-carla']
  };
  const officeTask = {
    id: 'task-escritorio-1',
    title: 'Tarefa escritório',
    status: 'concluida',
    completedAt,
    assigneeUserId: 'u-bruno',
    followerUserIds: ['u-carla']
  };

  const result = await service.onTasksCompleted(ws, [privateTask, officeTask], {
    actor: 'Bruno',
    actorUserId: 'u-bruno',
    processes: []
  });
  assert.equal(result.recorded, 2);

  const events = db.getTaskCompletionEvents(ws);
  const priv = events.find(event => event.payload.taskId === 'task-privada-1');
  const office = events.find(event => event.payload.taskId === 'task-escritorio-1');
  assert.deepEqual(priv.payload.audienceUserIds, ['u-dona'], 'audiência da tarefa privada é só o dono');
  assert.deepEqual(new Set(office.payload.audienceUserIds), new Set(['u-bruno', 'u-carla']));

  const donaInbox = service.listTaskCompletionInbox(ws, { userId: 'u-dona', username: 'dona' });
  const brunoInbox = service.listTaskCompletionInbox(ws, { userId: 'u-bruno', username: 'bruno' });
  const carlaInbox = service.listTaskCompletionInbox(ws, { userId: 'u-carla', username: 'carla' });
  const adminInbox = service.listTaskCompletionInbox(ws, { userId: 'u-admin', username: 'admin' });

  assert.deepEqual(donaInbox.map(item => item.taskId), ['task-privada-1']);
  assert.deepEqual(brunoInbox.map(item => item.taskId), ['task-escritorio-1'], 'delegado não vê a tarefa privada');
  assert.deepEqual(carlaInbox.map(item => item.taskId), ['task-escritorio-1']);
  assert.equal(adminInbox.length, 0, 'ator/admin alheio não vê a tarefa privada');

  const digest = await service.dispatchTaskCompletionDigest(ws, users, {}, { now: at19 });
  assert.equal(digest.enqueued, 3, 'apenas Dona (privada) e Bruno/Carla (escritório)');

  const donaDigest = digestFor(db, 'dona@example.test');
  const brunoDigest = digestFor(db, 'bruno@example.test');
  const carlaDigest = digestFor(db, 'carla@example.test');
  assert.ok(donaDigest && brunoDigest && carlaDigest);
  assert.ok(donaDigest.payload.text.includes('Tarefa privada'));
  assert.ok(!donaDigest.payload.text.includes('Tarefa escritório'), 'dona não recebe a tarefa office');
  assert.ok(brunoDigest.payload.text.includes('Tarefa escritório'));
  assert.ok(!brunoDigest.payload.text.includes('Tarefa privada'), 'digest do delegado não expõe a privada');
  assert.ok(!carlaDigest.payload.text.includes('Tarefa privada'));
  assert.equal(digestFor(db, 'admin@example.test'), null);
});

test('tarefa office vinculada a processo privado restringe a audiência ao dono', async t => {
  const { db, service } = fixture(t);
  const privateProcess = {
    id: 'proc-privado',
    number: '5000000-00.2026.8.21.0001',
    client: 'Cliente Teste',
    scope: 'private',
    privateOwnerUserId: 'u-dona',
    responsibleUserIds: ['u-carla']
  };
  const task = {
    id: 'task-processo-privado',
    title: 'Protocolar em processo privado',
    status: 'concluida',
    completedAt: '2026-10-20T18:00:00.000Z',
    processId: 'proc-privado',
    process: privateProcess.number,
    assigneeUserId: 'u-bruno',
    followerUserIds: ['u-carla']
  };

  const result = await service.onTasksCompleted(ws, [task], {
    actor: 'Bruno',
    actorUserId: 'u-bruno',
    processes: [privateProcess]
  });
  assert.equal(result.recorded, 1);

  const event = db.getTaskCompletionEvents(ws)[0];
  assert.equal(event.event_type, TASK_COMPLETED_EVENT);
  assert.deepEqual(event.payload.audienceUserIds, ['u-dona']);
  assert.equal(service.listTaskCompletionInbox(ws, { userId: 'u-bruno', username: 'bruno' }).length, 0);
  assert.equal(service.listTaskCompletionInbox(ws, { userId: 'u-carla', username: 'carla' }).length, 0);
  assert.equal(service.listTaskCompletionInbox(ws, { userId: 'u-dona', username: 'dona' }).length, 1);
});
