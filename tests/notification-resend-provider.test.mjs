import assert from 'node:assert/strict';
import { ResendProvider } from '../lib/notifications/providers/resend-provider.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';

async function testResendProvider() {
  console.log('--- Testing ResendProvider ---');

  // Hermetismo: apiKey explicita vazia cai no process.env.RESEND_API_KEY (get apiKey).
  // A suíte assume ambiente limpo; isola a env para ser determinística em qualquer
  // máquina e restaura ao final.
  const savedResendApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  // 1. Missing API Key safely fails
  const unconfiguredProvider = new ResendProvider({ apiKey: '' });
  assert.equal(unconfiguredProvider.isConfigured(), false);
  await assert.rejects(
    async () => {
      await unconfiguredProvider.sendEmail({
        to: 'alguem@exemplo.com',
        subject: 'Teste',
        html: '<p>Oi</p>'
      });
    },
    /RESEND_API_KEY não configurada/
  );

  // 2. Mock mode works without API key
  const mockProvider = new ResendProvider({ mockMode: true });
  const mockResult = await mockProvider.sendEmail({
    to: 'destinatario@teste.com',
    subject: 'Assunto do Mock',
    html: '<p>Corpo</p>'
  });
  assert.equal(mockResult.ok, true);
  assert.ok(mockResult.providerMessageId.startsWith('mock-resend-'));

  // 3. Mock fetchFn to verify HTTP request, headers, and Idempotency-Key
  let capturedRequest = null;
  const mockFetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'msg-real-mock-123' })
    };
  };

  const providerWithFetch = new ResendProvider({
    apiKey: 're_test_dummy_key',
    fetchFn: mockFetch
  });

  const res = await providerWithFetch.sendEmail({
    to: 'advogado@escritorio.adv.br',
    subject: 'Publicação TJRS',
    html: '<b>Nova publicação</b>',
    idempotencyKey: 'idemp-key-abc-123',
    tags: [{ name: 'event_type', value: 'PUBLICATION_NEW' }]
  });

  assert.equal(res.ok, true);
  assert.equal(res.providerMessageId, 'msg-real-mock-123');
  assert.equal(capturedRequest.url, 'https://api.resend.com/emails');
  assert.equal(capturedRequest.options.headers['Idempotency-Key'], 'idemp-key-abc-123');
  assert.equal(capturedRequest.options.headers.Authorization, 'Bearer re_test_dummy_key');

  const parsedBody = JSON.parse(capturedRequest.options.body);
  assert.deepEqual(parsedBody.to, ['advogado@escritorio.adv.br']);
  assert.equal(parsedBody.from, 'ATRIUM Notificações <notificacoes@example.com>');
  assert.equal(parsedBody.tags[0].value, 'PUBLICATION_NEW');

  // 3b. Tag com workspace id (ws-<uuid>) não pode ser truncada na fronteira do provedor.
  const workspaceTag = `ws-${'0'.repeat(8)}-0000-4000-8000-${'1'.repeat(12)}`;
  await providerWithFetch.sendEmail({
    to: 'advogado@escritorio.adv.br',
    subject: 'Publicação TJRS',
    html: '<b>Nova publicação</b>',
    tags: [{ name: 'workspace_id', value: workspaceTag }]
  });
  const taggedBody = JSON.parse(capturedRequest.options.body);
  assert.equal(taggedBody.tags[0].value, workspaceTag, 'Tag de workspace foi truncada no envio.');

  // 4. Retryable error handling: 429 rate limit
  const rateLimitFetch = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ message: 'Rate limit exceeded' })
  });
  const rateLimitProvider = new ResendProvider({ apiKey: 're_test', fetchFn: rateLimitFetch });
  await assert.rejects(
    async () => {
      await rateLimitProvider.sendEmail({ to: 'user@test.com', subject: 'Hi' });
    },
    err => err.retryable === true && err.statusCode === 429
  );

  // 5. Non-retryable error handling: 400 Bad Request
  const badReqFetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ message: 'Invalid recipient format' })
  });
  const badReqProvider = new ResendProvider({ apiKey: 're_test', fetchFn: badReqFetch });
  await assert.rejects(
    async () => {
      await badReqProvider.sendEmail({ to: 'user@test.com', subject: 'Hi' });
    },
    err => err.retryable === false && err.statusCode === 400
  );

  // 6. Daily and Monthly Budget Protection
  const db = new NotificationDatabase({ inMemory: true });
  process.env.EMAIL_DAILY_SEND_LIMIT = '2';
  process.env.EMAIL_MONTHLY_SEND_LIMIT = '5';

  const budgetCheck1 = providerWithFetch.checkBudget(db);
  assert.equal(budgetCheck1.allowed, true);

  // Simulate 2 sent deliveries today
  const obx1 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'TEST',
    recipient: 'test1@example.test',
    payload: {},
    idempotencyKey: 'k1'
  });
  db.markOutboxSent(obx1.id, { providerMessageId: 'm1' });

  const obx2 = db.enqueueOutbox({
    workspaceId: 'ws-1',
    eventType: 'TEST',
    recipient: 'test2@example.test',
    payload: {},
    idempotencyKey: 'k2'
  });
  db.markOutboxSent(obx2.id, { providerMessageId: 'm2' });

  const budgetCheck2 = providerWithFetch.checkBudget(db);
  assert.equal(budgetCheck2.allowed, false);
  assert.equal(budgetCheck2.reason, 'DAILY_LIMIT_EXCEEDED');

  delete process.env.EMAIL_DAILY_SEND_LIMIT;
  delete process.env.EMAIL_MONTHLY_SEND_LIMIT;
  if (savedResendApiKey !== undefined) process.env.RESEND_API_KEY = savedResendApiKey;

  console.log('✓ All ResendProvider tests passed cleanly!');
}

testResendProvider().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
