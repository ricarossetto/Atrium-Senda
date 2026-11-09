import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import {
  AI_PROVIDER_CATALOG,
  AI_PROVIDER_IDS,
  contentsToMessages,
  buildProviderChatRequest,
  extractProviderChatResponse,
  callCompatibleProvider,
  providerSummary
} from '../lib/ai/providers.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PROVEDORES DE IA (GEMINI, OPENCODE ZEN/GO, OPENAI, ANTHROPIC)');
console.log('===============================================================\n');

assert.ok(AI_PROVIDER_IDS.includes('gemini'));
assert.ok(AI_PROVIDER_IDS.includes('zen'));
assert.ok(AI_PROVIDER_IDS.includes('zen-anthropic'));
assert.ok(AI_PROVIDER_IDS.includes('zen-go'));
assert.ok(AI_PROVIDER_IDS.includes('zen-go-anthropic'));
assert.equal(AI_PROVIDER_CATALOG['zen'].baseUrl, 'https://opencode.ai/zen/v1');
assert.equal(AI_PROVIDER_CATALOG['zen-go'].baseUrl, 'https://opencode.ai/zen/go/v1');
assert.equal(AI_PROVIDER_CATALOG['zen'].kind, 'openai-compatible');
assert.equal(providerSummary('zen-anthropic').kind, 'anthropic-compatible');
assert.equal(providerSummary('openai').kind, 'openai-compatible');
assert.equal(providerSummary('anthropic').kind, 'anthropic-compatible');
assert.equal(providerSummary('zen-go').requiresSessionHeader, true);
assert.equal(providerSummary('zen').requiresSessionHeader, false);
assert.ok(AI_PROVIDER_CATALOG['zen'].models.includes('big-pickle'));
assert.ok(AI_PROVIDER_CATALOG['zen'].models.includes('claude-opus-5'));
assert.ok(AI_PROVIDER_CATALOG['zen'].models.includes('gemini-3.8-flash'));
assert.ok(AI_PROVIDER_CATALOG['zen'].models.includes('gpt-5.6-luna'));
assert.ok(AI_PROVIDER_CATALOG['zen'].models.includes('deepseek-v4-flash-free'));
assert.ok(AI_PROVIDER_CATALOG['zen'].models.length > 50, 'catálogo Zen deve listar o acervo real do OpenCode Zen');
assert.ok(AI_PROVIDER_CATALOG['zen-go'].models.includes('kimi-k3'));
assert.ok(AI_PROVIDER_CATALOG['zen-go'].models.includes('qwen3.8-max'));
assert.ok(AI_PROVIDER_CATALOG['zen-go'].models.includes('grok-4.6'));
assert.ok(AI_PROVIDER_CATALOG['zen-go'].models.includes('deepseek-v4-flash-vision-exp'));
assert.ok(AI_PROVIDER_CATALOG['zen-go'].models.length > 30, 'catálogo Go deve listar o acervo real do OpenCode Go');
for (const id of ['zen', 'zen-go', 'zen-anthropic', 'zen-go-anthropic']) {
  const models = AI_PROVIDER_CATALOG[id].models;
  assert.ok(models.every(model => model === model.trim() && model.length > 0), `${id} sem ids vazios`);
  assert.equal(new Set(models).size, models.length, `${id} sem modelos duplicados`);
  assert.ok(models.includes(AI_PROVIDER_CATALOG[id].defaultModel), `${id} defaultModel presente no catálogo`);
}
console.log('  [1] Catálogo traz Gemini, OpenCode Zen/Go (OpenAI e Anthropic), OpenAI e Anthropic.');

assert.deepEqual(contentsToMessages([
  { role: 'user', parts: [{ text: 'pergunta' }] },
  { role: 'model', parts: [{ text: 'resposta' }] },
  { role: 'user', parts: [{ text: '' }] }
]), [
  { role: 'user', content: 'pergunta' },
  { role: 'assistant', content: 'resposta' }
]);
console.log('  [2] Conversão do formato interno para mensagens ignora partes vazias.');

const key = 'x'.repeat(32);
const openaiRequest = buildProviderChatRequest({
  kind: 'openai-compatible',
  baseUrl: 'https://opencode.ai/zen/v1/',
  apiKey: key,
  model: 'deepseek-v4-flash',
  systemInstruction: 'sistema',
  contents: [{ role: 'user', parts: [{ text: 'ola' }] }]
});
assert.equal(openaiRequest.url, 'https://opencode.ai/zen/v1/chat/completions');
assert.equal(openaiRequest.headers.Authorization, `Bearer ${key}`);
assert.equal(openaiRequest.body.model, 'deepseek-v4-flash');
assert.equal(openaiRequest.body.messages[0].role, 'system');
assert.ok(!JSON.stringify(openaiRequest.body).includes('AI_PROVIDER_CATALOG'));

const anthropicRequest = buildProviderChatRequest({
  kind: 'anthropic-compatible',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKey: key,
  model: 'minimax-m3',
  systemInstruction: 'sistema',
  contents: [{ role: 'user', parts: [{ text: 'ola' }] }]
});
assert.equal(anthropicRequest.url, 'https://opencode.ai/zen/go/v1/messages');
assert.equal(anthropicRequest.headers['x-api-key'], key);
assert.equal(anthropicRequest.headers['anthropic-version'], '2023-06-01');
assert.equal(anthropicRequest.body.system, 'sistema');
assert.deepEqual(extractProviderChatResponse({ kind: 'openai-compatible', payload: { model: 'm', choices: [{ message: { content: 'ok' } }] } }), { text: 'ok', model: 'm', usage: null });
assert.deepEqual(extractProviderChatResponse({ kind: 'anthropic-compatible', payload: { model: 'm', content: [{ text: 'a' }, { text: 'b' }] } }), { text: 'ab', model: 'm', usage: null });
assert.deepEqual(
  extractProviderChatResponse({ kind: 'openai-compatible', payload: { model: 'm', choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } }).usage,
  { promptTokens: 10, completionTokens: 5, totalTokens: 15, reported: true },
  'Uso OpenAI é preservado quando o provedor informa.'
);
assert.deepEqual(
  extractProviderChatResponse({ kind: 'anthropic-compatible', payload: { model: 'm', content: [{ text: 'ok' }], usage: { input_tokens: 7, output_tokens: 3 } } }).usage,
  { promptTokens: 7, completionTokens: 3, totalTokens: 10, reported: true },
  'Uso Anthropic deriva o total sem fabricar contagem.'
);
assert.equal(
  extractProviderChatResponse({ kind: 'openai-compatible', payload: { model: 'm', choices: [{ message: { content: 'ok' } }], usage: {} } }).usage,
  null,
  'Uso vazio não vira token fabricado.'
);
const goRequest = buildProviderChatRequest({
  kind: 'openai-compatible',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKey: key,
  model: 'deepseek-v4-flash',
  contents: [{ role: 'user', parts: [{ text: 'oi' }] }],
  sessionId: 'atrium-ws-default'
});
assert.equal(goRequest.headers['x-opencode-session'], 'atrium-ws-default');
const zenRequest = buildProviderChatRequest({
  kind: 'openai-compatible',
  baseUrl: 'https://opencode.ai/zen/v1',
  apiKey: key,
  model: 'big-pickle',
  contents: [{ role: 'user', parts: [{ text: 'oi' }] }]
});
assert.equal('x-opencode-session' in zenRequest.headers, false);
console.log('  [3] Requisições OpenAI-compatible e Anthropic montam URL, headers e corpo corretos.');

const calls = [];
const successResult = await callCompatibleProvider({
  kind: 'openai-compatible',
  baseUrl: 'https://exemplo.test/v1',
  apiKey: key,
  model: 'mock-model',
  contents: [{ role: 'user', parts: [{ text: 'oi' }] }],
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ model: 'mock-model', choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }) };
  }
});
assert.equal(successResult.text, 'OK');
assert.deepEqual(successResult.usage, { promptTokens: 4, completionTokens: 2, totalTokens: 6, reported: true });
assert.equal(calls[0].url, 'https://exemplo.test/v1/chat/completions');
assert.equal(calls[0].options.headers.Authorization, `Bearer ${key}`);
await assert.rejects(() => callCompatibleProvider({
  kind: 'anthropic-compatible',
  baseUrl: 'https://exemplo.test/v1',
  apiKey: key,
  model: 'mock-model',
  contents: [],
  fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'unauthorized' } }) })
}), /401/);
await assert.rejects(() => callCompatibleProvider({ kind: 'openai-compatible', baseUrl: 'https://exemplo.test/v1', apiKey: '', model: 'm', contents: [] }), /não configurada/);
console.log('  [4] Chamada compatível trata sucesso, erro HTTP e ausência de chave.');

const server = await startTestServer({ env: { GEMINI_API_KEY: '' } });
try {
  const anonymous = await fetch(`${server.baseUrl}/api/ai/providers`);
  assert.equal(anonymous.status, 401);

  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.ai.providers',
    displayName: 'Administradora Provedores Sintética',
    password: 'Ai-Providers-2026!'
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = (await response.json()).csrfToken;

  const list = await fetch(`${server.baseUrl}/api/ai/providers`, { headers: { Cookie: cookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  const ids = listBody.providers.map(provider => provider.id);
  for (const required of ['gemini', 'zen', 'zen-anthropic', 'zen-go', 'zen-go-anthropic', 'openai', 'anthropic']) {
    assert.ok(ids.includes(required), `catálogo sem ${required}`);
  }
  assert.equal(listBody.active, null);
  assert.ok(listBody.providers.every(provider => provider.configured === false));
  assert.ok(!JSON.stringify(listBody).match(/apiKey|AIza|sk-|AQ\./));
  console.log('  [5] GET /api/ai/providers exige sessão e lista o catálogo sem expor chaves.');

  const invalidProvider = await postJson(`${server.baseUrl}/api/ai/configure`, {
    apiKey: key, provider: 'inexistente'
  }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(invalidProvider.status, 400);

  const insecureBase = await postJson(`${server.baseUrl}/api/ai/configure`, {
    apiKey: key, provider: 'zen', baseUrl: 'http://inseguro.test/v1', model: 'x'
  }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(insecureBase.status, 400);

  const localBase = await postJson(`${server.baseUrl}/api/ai/configure`, {
    apiKey: key, provider: 'zen', baseUrl: 'https://localhost/v1', model: 'x'
  }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert.equal(localBase.status, 400);

  const withoutCsrf = await postJson(`${server.baseUrl}/api/ai/configure`, {
    apiKey: key, provider: 'zen'
  }, { Cookie: cookie });
  assert.equal(withoutCsrf.status, 403);
  assert.equal(fs.existsSync(path.join(server.dataDirectory, 'ai-secrets.json')), false);
  console.log('  [6] Configure rejeita provedor desconhecido, base insegura, host local e ausência de CSRF.');

  const removal = await fetch(`${server.baseUrl}/api/ai/configure?provider=zen`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf, Accept: 'application/json' }
  });
  const removalBody = await removal.json();
  assert.equal(removal.status, 200);
  assert.equal(removalBody.ok, true);
  assert.equal(removalBody.configured, false);
  console.log('  [7] Remoção por provedor é idempotente e mantém o status consistente.');

  const status = await fetch(`${server.baseUrl}/api/ai/status`, { headers: { Cookie: cookie } });
  const statusBody = await status.json();
  assert.equal(statusBody.configured, false);
  assert.equal(statusBody.provider, null);
} finally {
  await server.stop();
}

// [8] Arquivo de segredos ilegível: quarentena com backup e catálogo continua disponível
const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-ai-corrupt-'));
fs.writeFileSync(path.join(corruptDir, 'ai-secrets.json'), JSON.stringify({ version: 2, algorithm: 'aes-256-gcm', encrypted: 'payload-invalido' }));
const corruptServer = await startTestServer({ dataDirectory: corruptDir, env: { GEMINI_API_KEY: '' } });
try {
  let response = await postJson(`${corruptServer.baseUrl}/api/auth/setup`, {
    username: 'admin.ai.corrupt',
    displayName: 'Administrador Corrompido Sintético',
    password: 'Ai-Corrupt-2026!'
  });
  const setup = await response.json();
  response = await postJson(`${corruptServer.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const cookie = response.headers.get('set-cookie').split(';')[0];

  const status = await fetch(`${corruptServer.baseUrl}/api/ai/status`, { headers: { Cookie: cookie } });
  const statusBody = await status.json();
  assert.equal(status.status, 200, 'status não pode responder 500 com segredos ilegíveis');
  assert.equal(statusBody.configured, false);
  assert.equal(statusBody.issue, 'SECRETS_UNREADABLE');

  const list = await fetch(`${corruptServer.baseUrl}/api/ai/providers`, { headers: { Cookie: cookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200, 'catálogo não pode responder 500 com segredos ilegíveis');
  assert.ok(listBody.providers.length >= 7);
  assert.equal(listBody.issue, 'SECRETS_UNREADABLE');

  const quarantined = fs.readdirSync(corruptDir).filter(name => name.startsWith('ai-secrets.corrupt-'));
  assert.equal(quarantined.length, 1, 'arquivo ilegível deve ir para quarentena com backup preservado');
  console.log('  [8] Segredos ilegíveis vão para quarentena; status e catálogo seguem 200 sem expor nada.');
} finally {
  await corruptServer.stop();
  fs.rmSync(corruptDir, { recursive: true, force: true });
}

console.log('\n>>> AI PROVIDERS: PASS <<<\n');
