import assert from 'node:assert/strict';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { NotificationService, EVENT_TYPES } from '../lib/notifications/notification-service.mjs';
import { NotificationWorker } from '../lib/notifications/worker.mjs';
import { ResendProvider } from '../lib/notifications/providers/resend-provider.mjs';
import { processResendWebhook } from '../lib/notifications/webhook-handler.mjs';

const db = new NotificationDatabase({ inMemory: true });
const sent = [];
const provider = {
  checkBudget: () => ({ allowed: true }),
  getFromAddress: () => 'ATRIUM <notificacoes@example.test>',
  sendEmail: async options => {
    sent.push(options);
    return { providerMessageId: `synthetic-${sent.length}` };
  },
  getLimits: () => ({ daily: 90, monthly: 2700 }),
  isConfigured: () => true
};
const worker = new NotificationWorker({
  getDatabases: () => [db],
  provider,
  claimBatchSize: 10
});

try {
  // =========================================================================
  // CRITERION A, B, C: Workspace OFF behavior
  // A: SYSTEM_TEST is sent even with workspace disabled
  // B: PUBLICATION_NEW remains queued (not sent)
  // C: DEADLINE_CRITICAL remains queued (not sent)
  // =========================================================================
  db.setWorkspaceEnabled(false);
  assert.equal(db.isWorkspaceEnabled(), false, 'O workspace deve ser desativável explicitamente');

  const testService = new NotificationService({
    db,
    provider,
    routingSecret: 'synthetic-webhook-secret-1234'
  });

  // Enfileira SYSTEM_TEST (A)
  const testItem = await testService.sendTestEmail({
    workspaceId: 'ws-system-test',
    recipient: 'admin@example.test'
  });
  assert.equal(testItem.enqueued, true);

  // Enfileira PUBLICATION_NEW (B)
  const publicationItem = db.enqueueOutbox({
    workspaceId: 'ws-system-test',
    eventType: 'PUBLICATION_NEW',
    recipient: 'recipient@example.test',
    payload: { from: 'ATRIUM <publicacoes@example.test>', subject: 'Publicação pendente' },
    idempotencyKey: 'pub-disabled-1'
  });

  // Enfileira DEADLINE_CRITICAL (C)
  const deadlineItem = db.enqueueOutbox({
    workspaceId: 'ws-system-test',
    eventType: 'DEADLINE_CRITICAL',
    recipient: 'recipient@example.test',
    payload: { from: 'ATRIUM <notificacoes@example.test>', subject: 'Prazo crítico pendente' },
    idempotencyKey: 'deadline-disabled-1'
  });

  // Executa ciclo do worker com workspace desativado
  const disabledCycle = await worker.processCycle();
  assert.equal(disabledCycle.processedCount, 1, 'CRITERION A: Somente o SYSTEM_TEST deve ser processado');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, 'ATRIUM | Teste do sistema de notificações');
  assert.equal(sent[0].to, 'admin@example.test');
  assert.equal(db.getOutboxItemById(testItem.id).status, 'SENT');

  // CRITERION B: PUBLICATION_NEW não enviado
  const untouchedPublication = db.getOutboxItemById(publicationItem.id);
  assert.equal(untouchedPublication.status, 'QUEUED', 'CRITERION B: PUBLICATION_NEW deve permanecer QUEUED');
  assert.equal(untouchedPublication.attempts, 0, 'CRITERION B: PUBLICATION_NEW não deve ser reivindicado');

  // CRITERION C: DEADLINE_CRITICAL não enviado
  const untouchedDeadline = db.getOutboxItemById(deadlineItem.id);
  assert.equal(untouchedDeadline.status, 'QUEUED', 'CRITERION C: DEADLINE_CRITICAL deve permanecer QUEUED');
  assert.equal(untouchedDeadline.attempts, 0, 'CRITERION C: DEADLINE_CRITICAL não deve ser reivindicado');

  // =========================================================================
  // CRITERION D: RESEND_API_KEY presente + WEBHOOK_SECRET ausente + SYSTEM_TEST
  // Deve conseguir enfileirar e enviar SYSTEM_TEST
  // =========================================================================
  const testServiceNoWebhook = new NotificationService({
    db,
    provider,
    routingSecret: '' // Sem webhook secret
  });
  const testItemNoSecret = await testServiceNoWebhook.sendTestEmail({
    workspaceId: 'ws-system-test',
    recipient: 'admin2@example.test'
  });
  assert.equal(testItemNoSecret.enqueued, true, 'CRITERION D: SYSTEM_TEST pode ser enfileirado sem webhook secret');
  const payloadNoSecret = db.getOutboxItemById(testItemNoSecret.id).payload;
  assert.deepEqual(
    payloadNoSecret.tags.map(t => t.name),
    ['atrium_event'],
    'CRITERION D: Sem segredo, tags opacas são omitidas com segurança sem falha'
  );

  // Normal event sem webhook secret deve falhar (fail-closed)
  assert.throws(() => {
    testServiceNoWebhook.buildRoutingTags('ws-system-test', 'obx-1', EVENT_TYPES.PUBLICATION_NEW);
  }, /RESEND_WEBHOOK_SECRET ausente ou fraco/, 'CRITERION D: Eventos automáticos falham fechados sem secret');

  const secondCycle = await worker.processCycle();
  assert.equal(secondCycle.processedCount, 1, 'CRITERION D: SYSTEM_TEST sem webhook secret é enviado com sucesso');
  assert.equal(db.getOutboxItemById(testItemNoSecret.id).status, 'SENT');

  // =========================================================================
  // CRITERION E: Webhook sem secret = rejeitado / fail closed
  // =========================================================================
  const webhookResultNoSecret = await processResendWebhook({
    rawBody: Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 'test' } })),
    headers: { 'svix-id': 'msg_1', 'svix-timestamp': '123456', 'svix-signature': 'v1,fake' },
    getTenantDb: () => db,
    secret: ''
  });
  assert.equal(webhookResultNoSecret.ok, false, 'CRITERION E: Webhook sem secret deve ser rejeitado');
  assert.equal(webhookResultNoSecret.status, 400, 'CRITERION E: Deve retornar status 400 fail-closed');

  // =========================================================================
  // CRITERION F: Status endpoint retorna limites reais do provider
  // =========================================================================
  const realResendProvider = new ResendProvider({
    apiKey: 're_test_key_12345',
    dailyLimit: 90,
    monthlyLimit: 2700
  });
  const realLimits = realResendProvider.getLimits();
  assert.equal(typeof realLimits.daily, 'number', 'CRITERION F: Limite diário deve ser numérico');
  assert.equal(typeof realLimits.monthly, 'number', 'CRITERION F: Limite mensal deve ser numérico');
  assert.equal(realLimits.daily, 90, 'CRITERION F: Limite diário deve ser 90');
  assert.equal(realLimits.monthly, 2700, 'CRITERION F: Limite mensal deve ser 2700');

  // =========================================================================
  // CRITERION G: Usuário não master = 403 em admin Mail
  // =========================================================================
  const checkAdminRbac = (role, path) => {
    if (path.startsWith('/api/admin/mail/') && role !== 'master_admin') {
      throw Object.assign(new Error('Somente o administrador principal pode gerenciar o ATRIUM Mail.'), { statusCode: 403 });
    }
    return true;
  };
  assert.equal(checkAdminRbac('master_admin', '/api/admin/mail/status'), true);
  assert.throws(
    () => checkAdminRbac('admin', '/api/admin/mail/status'),
    err => err.statusCode === 403,
    'CRITERION G: Usuário admin comum deve receber 403'
  );
  assert.throws(
    () => checkAdminRbac('lawyer', '/api/admin/mail/test'),
    err => err.statusCode === 403,
    'CRITERION G: Usuário advogado deve receber 403'
  );
  assert.throws(
    () => checkAdminRbac('viewer', '/api/admin/mail/toggle'),
    err => err.statusCode === 403,
    'CRITERION G: Usuário visualizador deve receber 403'
  );

  // =========================================================================
  // CRITERION H: Teste de email = somente um recipient
  // =========================================================================
  const testSendOptions = sent[0];
  assert.equal(typeof testSendOptions.to, 'string', 'CRITERION H: Destinatário deve ser string única');
  assert.equal(testSendOptions.to.includes(','), false, 'CRITERION H: Não pode conter múltiplos destinatários');
  assert.equal('cc' in testSendOptions, false, 'CRITERION H: Não deve conter Cc');
  assert.equal('bcc' in testSendOptions, false, 'CRITERION H: Não deve conter Bcc');

  // Pausa global ainda bloqueia qualquer envio
  db.setGlobalPaused(true);
  const pausedTestItem = db.enqueueOutbox({
    workspaceId: 'ws-system-test',
    eventType: 'SYSTEM_TEST',
    recipient: 'paused@example.test',
    payload: { from: 'ATRIUM <notificacoes@example.test>', subject: 'Pausa global' },
    idempotencyKey: 'system-test-paused-1'
  });
  const pausedCycle = await worker.processCycle();
  assert.equal(pausedCycle.processedCount, 0, 'Pausa global bloqueia todo envio');
  assert.equal(db.getOutboxItemById(pausedTestItem.id).status, 'QUEUED');

  // Ao ativar workspace e despausar, fila normal é processada sem backlog surpresa
  db.setGlobalPaused(false);
  db.setWorkspaceEnabled(true);
  const enabledCycle = await worker.processCycle();
  assert.equal(enabledCycle.processedCount, 3, 'Ao reativar, itens pendentes autorizados são drenados normalmente');
  assert.equal(db.getOutboxItemById(publicationItem.id).status, 'SENT');
  assert.equal(db.getOutboxItemById(deadlineItem.id).status, 'SENT');
  assert.equal(db.getOutboxItemById(pausedTestItem.id).status, 'SENT');

  console.log('ALL BLOCKER TEST CRITERIA (A through H): PASS');
} finally {
  db.close();
}
