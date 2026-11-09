import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDatabase, hashRecipient } from '../lib/notifications/db.mjs';
import { NotificationService, EVENT_TYPES } from '../lib/notifications/notification-service.mjs';

const ws = 'ws-audience';
const users = [
  { id: 'u-admin', username: 'admin-aud', email: 'admin-aud@example.test', role: 'admin', status: 'active' },
  { id: 'u-rogerio', username: 'rogerio-aud', email: 'rogerio-aud@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-secretaria', username: 'secretaria-aud', email: 'secretaria-aud@example.test', role: 'collaborator', status: 'active' }
];
const at = (hour, day = '2026-10-10') => `${day}T${String(hour).padStart(2, '0')}:00:00-03:00`;

const PROC_A = '5000000-00.2026.8.21.0001';
const PROC_B = '5000001-00.2026.8.21.0001';
const state = {
  processes: [
    { id: 'proc-a', number: PROC_A, client: 'Cliente Teste', responsible: 'Admin Aud, Rogerio Aud', responsibleUserIds: ['u-admin', 'u-rogerio'] },
    { id: 'proc-b', number: PROC_B, client: 'Cliente Teste' }
  ],
  tasks: [
    { id: 'task-a', title: 'Minuta do processo A', status: 'andamento', process: PROC_A, processId: 'proc-a', responsible: 'Rogerio Aud', assigneeUserId: 'u-rogerio', followerUserIds: [], deadline: '2026-10-11' }
  ],
  agenda: []
};

function fixture(t) {
  const db = new NotificationDatabase({ inMemory: true });
  db.setSetting('notifications_enabled_at', '2026-10-09T00:00:00.000Z');
  const provider = {
    getFromAddress: () => 'teste@example.test', checkBudget: () => ({ allowed: true }),
    sendEmail: async () => ({ providerMessageId: 'synthetic-message' })
  };
  const service = new NotificationService({ db, provider, routingSecret: 'synthetic-routing-secret-test', securityManager: { listUsers: () => users }, logger: { warn() {} } });
  t.after(() => db.close());
  return { db, service };
}

function record(db, id, type, payload, time = at(7)) {
  const result = db.recordEvent({ workspaceId: ws, eventType: type, fingerprint: `${type}:${id}`, payload });
  db.db.prepare('UPDATE notification_events SET created_at = ? WHERE id = ?').run(new Date(time).toISOString(), result.id);
  return result.id;
}

function bulletinFor(db, email) {
  return db.db.prepare("SELECT * FROM notification_outbox WHERE recipient = ? AND event_type = 'OPERATIONAL_BULLETIN' ORDER BY rowid").all(email)
    .map(row => db.getOutboxItemById(row.id)).at(-1);
}

test('boletim entrega a cada responsável só os eventos do seu processo; sem vínculo, transmite a todos', async t => {
  const { db, service } = fixture(t);
  const idPubA = record(db, 'pub-a', EVENT_TYPES.PUBLICATION_NEW, { id: 'pub-a', process: PROC_A, text: 'Publicação A', fullText: 'INTEGRA A SINTETICA '.repeat(20) });
  const idPubB = record(db, 'pub-b', EVENT_TYPES.PUBLICATION_NEW, { id: 'pub-b', process: PROC_B, text: 'Publicação B', fullText: 'INTEGRA B SINTETICA '.repeat(20) });
  const idMovA = record(db, 'mov-a', EVENT_TYPES.MOVEMENT_NEW, { id: 'mov-a', process: PROC_A, processId: 'proc-a', description: 'Andamento A' });
  const idDeadA = record(db, 'dead-a', EVENT_TYPES.DEADLINE_CRITICAL, { taskId: 'task-a', title: 'Minuta do processo A', process: PROC_A });
  const idHearB = record(db, 'hear-b', EVENT_TYPES.HEARING_NEW, { id: 'hear-b', title: 'Audiência B', process: PROC_B });

  const result = await service.dispatchScheduledBulletins(ws, users, state, { now: at(8) });
  assert.equal(result.enqueued, 3);

  const adminIds = bulletinFor(db, users[0].email).payload.events.map(event => event.id).sort();
  assert.deepEqual(adminIds, [idPubA, idPubB, idMovA, idDeadA, idHearB].sort());
  const rogerioIds = bulletinFor(db, users[1].email).payload.events.map(event => event.id).sort();
  assert.deepEqual(rogerioIds, [idPubA, idPubB, idMovA, idDeadA, idHearB].sort());
  const secretariaIds = bulletinFor(db, users[2].email).payload.events.map(event => event.id).sort();
  assert.deepEqual(secretariaIds, [idPubB, idHearB].sort());

  const secretariaContext = bulletinFor(db, users[2].email).payload.digestContext;
  assert.deepEqual(secretariaContext.deadlines, []);
  const adminHtml = bulletinFor(db, users[0].email).payload.html;
  const rogerioHtml = bulletinFor(db, users[1].email).payload.html;
  const secretariaHtml = bulletinFor(db, users[2].email).payload.html;
  assert.match(adminHtml, /INTEGRA A SINTETICA/);
  assert.match(rogerioHtml, /INTEGRA A SINTETICA/);
  // Gestor enxerga o escritório inteiro (canAccessProcess); processo sem responsável só ele.
  assert.match(adminHtml, /INTEGRA B SINTETICA/);
  assert.doesNotMatch(rogerioHtml, /INTEGRA B SINTETICA/);
  assert.doesNotMatch(secretariaHtml, /INTEGRA A SINTETICA|INTEGRA B SINTETICA/);
  assert.match(adminHtml, /<details/);
  assert.doesNotMatch(secretariaHtml, /<details/);
  const adminContext = bulletinFor(db, users[0].email).payload.digestContext;
  assert.ok(adminContext.deadlines.some(item => item.taskId === 'task-a'));

  const coveredA = db.db.prepare('SELECT count(*) AS n FROM notification_event_coverage WHERE recipient_hash = ?').get(hashRecipient(users[2].email)).n;
  assert.equal(coveredA, 2);
});

test('tarefa delegada à secretária chega só a ela e ao responsável do processo', async t => {
  const { db, service } = fixture(t);
  const delegated = {
    processes: [{ id: 'proc-c', number: '5000002-00.2026.8.21.0001', client: 'Cliente Teste', responsibleUserIds: ['u-admin'] }],
    tasks: [{ id: 'task-sec', title: 'Digitalizar peças', status: 'andamento', processId: 'proc-c', assigneeUserId: 'u-secretaria', followerUserIds: [] }],
    agenda: []
  };
  const idDeadSec = record(db, 'dead-sec', EVENT_TYPES.DEADLINE_CRITICAL, { taskId: 'task-sec', title: 'Digitalizar peças' });
  const result = await service.dispatchScheduledBulletins(ws, users, delegated, { now: at(14) });
  assert.equal(result.enqueued, 2);
  const adminIds = bulletinFor(db, users[0].email).payload.events.map(event => event.id);
  assert.deepEqual(adminIds, [idDeadSec]);
  const secretariaIds = bulletinFor(db, users[2].email).payload.events.map(event => event.id);
  assert.deepEqual(secretariaIds, [idDeadSec]);
  assert.equal(bulletinFor(db, users[1].email), undefined);
});

test('boletim usa o fullText atualizado no estado após enriquecimento tardio', async t => {
  const { db, service } = fixture(t);
  const enriched = {
    ...state,
    intimations: [{ id: 'pub-late', process: PROC_A, text: 'Resumo tardio.', fullText: 'INTEGRA TARDIA SINTETICA '.repeat(20) }]
  };
  record(db, 'pub-late', EVENT_TYPES.PUBLICATION_NEW, { id: 'pub-late', process: PROC_A, text: 'Resumo tardio.' });
  await service.dispatchScheduledBulletins(ws, users, enriched, { now: at(8) });
  assert.match(bulletinFor(db, users[0].email).payload.html, /INTEGRA TARDIA SINTETICA/);
  assert.equal(bulletinFor(db, users[2].email), undefined);
});
