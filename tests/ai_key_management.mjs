import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { createAssistantFeature } from '../js/features/assistant.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — GESTÃO DA CHAVE DE IA (REMOVER / ALTERAR)');
console.log('===============================================================\n');

function makeElement() {
  const classes = new Set();
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    textContent: '',
    className: '',
    value: '',
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, value) => { if (value) classes.add(name); else classes.delete(name); }
    },
    hasClass: name => classes.has(name),
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    emit(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener({ target: this, preventDefault() {}, ...event });
    },
    count(type) {
      return (listeners.get(type) || []).length;
    },
    requestSubmit() {
      this.submitCount = (this.submitCount || 0) + 1;
    }
  };
}

const elementIds = ['btnOpenGeminiKeyModal', 'geminiKeyClose', 'geminiKeyCancel', 'geminiKeyBackdrop', 'geminiKeyForm', 'geminiKeySubmit', 'btnOpenKeyModalFromCard', 'btnRetryAiProviders', 'btnClearAiConversation', 'btnRemoveGeminiKey', 'assistantContextSelect', 'aiChatForm', 'aiChatInput', 'codexSkillSelect', 'geminiApiKeyInput', 'geminiKeyFeedback', 'aiProviderSelect', 'aiProviderFeedback', 'aiProviderFeedbackText'];
const elements = Object.fromEntries(elementIds.map(id => [id, makeElement()]));
const documentRef = {
  body: { style: {} },
  documentElement: { dataset: {} },
  getElementById: id => elements[id] || null,
  querySelectorAll: () => [],
  activeElement: null
};

let confirmAnswer = true;
const windowRef = { setTimeout: (callback) => 0, confirm: () => confirmAnswer };
const audits = [];
const toasts = [];
const requests = [];
let statusConfigured = false;
let deleteResponse = { ok: true, configured: false, message: 'Chave de IA removida. O Assistente voltará a solicitar configuração.' };
let deleteStatus = 200;

const feature = createAssistantFeature({
  documentRef,
  windowRef,
  secureFetch: async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET' });
    if (url === '/api/ai/status') {
      return { ok: true, json: async () => ({ configured: statusConfigured, model: 'gemini-3.5-flash-lite' }) };
    }
    if (url === '/api/ai/configure' && options.method === 'DELETE') {
      return { ok: deleteStatus === 200, json: async () => (deleteStatus === 200 ? deleteResponse : { message: 'Apenas o administrador principal pode remover a chave de IA.' }) };
    }
    throw new Error(`Endpoint inesperado: ${url}`);
  },
  escapeHtml: value => String(value ?? ''),
  showToast: (message, type) => toasts.push({ message, type }),
  audit: (action, detail) => audits.push({ action, detail }),
  renderV2Presentation: () => false
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
assert.equal(elements.btnRemoveGeminiKey.count('click'), 1);
assert.equal(elements.btnOpenGeminiKeyModal.count('click'), 1);
assert.equal(elements.btnOpenKeyModalFromCard.count('click'), 1);
assert.equal(elements.btnRetryAiProviders.count('click'), 1);
console.log('  [1] init registra o listener de remoção uma única vez.');

feature.configured = false;
feature.syncKeyManagement();
assert.equal(elements.btnRemoveGeminiKey.hasClass('hidden'), true);
assert.equal(elements.btnOpenGeminiKeyModal.textContent, 'Configurar Chave de IA');
feature.configured = true;
feature.syncKeyManagement();
assert.equal(elements.btnRemoveGeminiKey.hasClass('hidden'), false);
assert.equal(elements.btnOpenGeminiKeyModal.textContent, 'Alterar chave de IA');
console.log('  [2] Botão de remover aparece só com chave ativa e o botão principal alterna para "Alterar".');

feature.configured = false;
statusConfigured = true;
assert.equal(await feature.checkStatus(), true);
assert.equal(feature.configured, true);
assert.equal(elements.btnRemoveGeminiKey.hasClass('hidden'), false);
assert.equal(elements.btnOpenGeminiKeyModal.textContent, 'Alterar chave de IA');
statusConfigured = false;
assert.equal(await feature.checkStatus(), false);
assert.equal(elements.btnRemoveGeminiKey.hasClass('hidden'), true);
assert.equal(elements.btnOpenGeminiKeyModal.textContent, 'Configurar Chave de IA');
console.log('  [3] checkStatus sincroniza o gerenciamento da chave com o estado real.');

feature.configured = true;
confirmAnswer = false;
requests.length = 0;
assert.equal(await feature.removeKey(), false);
assert.equal(requests.length, 0);
console.log('  [4] Cancelamento na confirmação não dispara remoção.');

confirmAnswer = true;
deleteResponse = { ok: true, configured: false, message: 'Chave de IA removida. O Assistente voltará a solicitar configuração.' };
const removed = await feature.removeKey();
assert.equal(removed, true);
const deleteRequest = requests.find(request => request.url === '/api/ai/configure');
assert.equal(deleteRequest.method, 'DELETE');
assert.ok(audits.some(entry => entry.action === 'Chave de IA removida'));
assert.ok(toasts.some(entry => entry.type === 'success'));
assert.equal(feature.configured, false);
assert.equal(elements.btnRemoveGeminiKey.hasClass('hidden'), true);
console.log('  [5] Remoção autenticada chama DELETE, audita, atualiza o status e esconde o botão.');

feature.configured = true;
statusConfigured = true;
const serverConfigured = { ok: true, configured: true, message: 'Chave removida do cofre do escritório; uma credencial definida no ambiente do servidor continua ativa.' };
deleteResponse = serverConfigured;
const stillConfigured = await feature.removeKey();
assert.equal(stillConfigured, true);
assert.ok(toasts.some(entry => entry.type === 'warning'));
assert.equal(feature.configured, true);
console.log('  [6] Credencial de ambiente remanescente é reportada como aviso, sem revelar valores.');

feature.configured = true;
deleteStatus = 403;
await assert.rejects(() => feature.removeKey(), /administrador principal/);
deleteStatus = 200;
console.log('  [7] Falha de RBAC na remoção é propagada como erro.');

const server = await startTestServer({ env: { GEMINI_API_KEY: '' } });
try {
  const anonymous = await fetch(`${server.baseUrl}/api/ai/configure`, { method: 'DELETE' });
  assert.equal(anonymous.status, 401);
  console.log('  [8] DELETE /api/ai/configure sem sessão retorna 401.');

  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.ai.key.management',
    displayName: 'Administradora Chave IA Sintética',
    password: 'Ai-Key-Management-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = (await response.json()).csrfToken;

  const withoutCsrf = await fetch(`${server.baseUrl}/api/ai/configure`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(withoutCsrf.status, 403);
  console.log('  [9] DELETE sem CSRF retorna 403.');

  const removal = await fetch(`${server.baseUrl}/api/ai/configure`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'X-CSRF-Token': csrf, Accept: 'application/json' }
  });
  const payload = await removal.json();
  assert.equal(removal.status, 200);
  assert.deepEqual(Object.keys(payload).sort(), ['configured', 'message', 'ok', 'provider']);
  assert.equal(payload.ok, true);
  assert.equal(payload.configured, false);
  assert.equal(fs.existsSync(path.join(server.dataDirectory, 'ai-secrets.json')), false);
  const status = await fetch(`${server.baseUrl}/api/ai/status`, { headers: { Cookie: cookie } });
  const statusBody = await status.json();
  assert.equal(statusBody.configured, false);
  assert.deepEqual(Object.keys(statusBody).sort(), ['configured', 'model', 'provider']);
  console.log('  [10] Remoção idempotente retorna 200, não cria cofre e o status permanece apenas booleano.');
} finally {
  await server.stop();
}

console.log('\n>>> AI KEY MANAGEMENT: PASS <<<\n');
