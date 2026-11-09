import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService } from '../lib/notifications/notification-service.mjs';

const ws = 'ws-office-invite';

function fixture(t) {
  const db = new NotificationDatabase({ inMemory: true });
  const provider = { getFromAddress: () => 'convites@example.test' };
  const service = new NotificationService({
    db,
    provider,
    routingSecret: 'synthetic-routing-secret-test',
    baseUrl: 'https://atrium.example.test',
    logger: { warn() {} }
  });
  t.after(() => db.close());
  return { db, service };
}

test('convite por e-mail enfileira um transacional com link no fragmento e sem senha', async t => {
  const { db, service } = fixture(t);
  const result = await service.sendTeamInviteEmail({
    workspaceId: ws,
    recipient: 'convidada@example.test',
    displayName: 'Pessoa Convidada',
    officeName: 'Escritório Teste',
    inviterName: 'Gestora Teste',
    inviteUrl: 'https://atrium.example.test/login#invite=token-sintetico',
    invitationId: 'inv-1',
    generation: '2026-10-20T10:00:00.000Z'
  });
  assert.equal(result.enqueued, true);
  const row = db.db.prepare("SELECT * FROM notification_outbox WHERE event_type = 'TEAM_INVITE'").get();
  assert.ok(row);
  const item = db.getOutboxItemById(row.id);
  assert.match(item.payload.subject, /Escritório Teste/);
  assert.match(item.payload.text, /https:\/\/atrium\.example\.test\/login#invite=token-sintetico/);
  assert.match(item.payload.text, /48 horas/);
  assert.ok(!/senha\s*:/i.test(item.payload.text));
  const duplicate = await service.sendTeamInviteEmail({
    workspaceId: ws,
    recipient: 'convidada@example.test',
    displayName: 'Pessoa Convidada',
    officeName: 'Escritório Teste',
    inviterName: 'Gestora Teste',
    inviteUrl: 'https://atrium.example.test/login#invite=token-sintetico',
    invitationId: 'inv-1',
    generation: '2026-10-20T10:00:00.000Z'
  });
  assert.equal(duplicate.enqueued, false, 'mesmo convite não duplica o e-mail');
  const resent = await service.sendTeamInviteEmail({
    workspaceId: ws,
    recipient: 'convidada@example.test',
    displayName: 'Pessoa Convidada',
    officeName: 'Escritório Teste',
    inviterName: 'Gestora Teste',
    inviteUrl: 'https://atrium.example.test/login#invite=token-renovado',
    invitationId: 'inv-1',
    generation: '2026-10-20T11:00:00.000Z'
  });
  assert.equal(resent.enqueued, true, 'reenvio renovado enfileira novo e-mail');
});

test('link de outro domínio não é enviado como CTA', async t => {
  const { db, service } = fixture(t);
  await service.sendTeamInviteEmail({
    workspaceId: ws,
    recipient: 'convidada@example.test',
    officeName: 'Escritório Teste',
    inviteUrl: 'https://malicioso.example.test/login#invite=x',
    invitationId: 'inv-2'
  });
  const row = db.db.prepare("SELECT * FROM notification_outbox WHERE event_type = 'TEAM_INVITE'").get();
  const item = db.getOutboxItemById(row.id);
  assert.ok(!item.payload.html.includes('malicioso.example.test'));
  assert.ok(!item.payload.text.includes('malicioso.example.test'));
});
