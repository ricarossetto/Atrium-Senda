import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createAssistantFeature } from '../js/features/assistant.js';
import { postJson, startTestServer } from './helpers.mjs';

const assistantSource = fs.readFileSync(new URL('../js/features/assistant.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(assistantSource, /export function createAssistantFeature\(/);
assert.doesNotMatch(assistantSource, /^\s*import\s/m, 'assistant.js deve permanecer sem imports de portal ou features');
assert.doesNotMatch(assistantSource, /\bfetch\s*\(/, 'assistant.js deve usar apenas secureFetch injetado');
assert.doesNotMatch(assistantSource, /localStorage|sessionStorage|Store\.|store\.state/);
assert.match(portalSource, /checkAiStatus\(\) \{ return getAssistantFeature\(\)\.checkStatus\(\); \}/);
assert.doesNotMatch(portalSource, /aiChatHistory:\s*\[\]|aiConfigured:\s*false|isAiTyping:\s*false/);

function makeElement() {
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains() { return true; } },
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener({ target: this, preventDefault() {}, ...event }); },
    count(type) { return (listeners.get(type) || []).length; },
    requestSubmit() { this.submitCount = (this.submitCount || 0) + 1; }
  };
}

const listenerIds = ['btnOpenGeminiKeyModal', 'geminiKeyClose', 'geminiKeyCancel', 'geminiKeyBackdrop', 'geminiKeyForm', 'btnSaveQuickAiKey', 'btnClearAiConversation', 'aiChatForm', 'aiChatInput', 'btnApplyCodexSkill'];
const listenerElements = Object.fromEntries(listenerIds.map(id => [id, makeElement()]));
const quickPrompt = makeElement();
quickPrompt.dataset.prompt = 'PROMPT RÁPIDO SINTÉTICO';
const listenerDocument = {
  body: { style: {} },
  getElementById: id => listenerElements[id] || null,
  querySelectorAll: selector => selector === '.quick-prompt-btn' ? [quickPrompt] : []
};
const listenerFeature = createAssistantFeature({ documentRef: listenerDocument, windowRef: { setTimeout }, secureFetch: async () => ({ ok: true, json: async () => ({}) }) });
assert.equal(listenerFeature.init(), true);
assert.equal(listenerFeature.init(), false);
for (const element of [...Object.values(listenerElements), quickPrompt]) {
  for (const type of ['click', 'submit', 'keydown']) assert.ok(element.count(type) <= 1, `listener duplicado: ${type}`);
}
listenerElements.aiChatInput.emit('keydown', { key: 'Enter', shiftKey: false });
assert.equal(listenerElements.aiChatForm.submitCount, 1);
listenerElements.aiChatInput.emit('keydown', { key: 'Enter', shiftKey: true });
assert.equal(listenerElements.aiChatForm.submitCount, 1);
let quickCalls = 0;
listenerFeature.sendQuickPrompt = text => { quickCalls++; assert.equal(text, quickPrompt.dataset.prompt); };
quickPrompt.emit('click');
assert.equal(quickCalls, 1);
await assert.rejects(() => listenerFeature.saveKey('curta'), /Chave inválida/);

const MARKDOWN_FIXTURE = `# Título Sintético

Texto com **negrito**, *itálico* e \`código inline\`.

\`\`\`js
const valor = "<script>alert(1)</script>";
\`\`\`

- item um
- item dois

> citação sintética

linha um
linha dois

<script>alert(1)</script>`;

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = NativeDate.parse('2026-08-29T12:00:00-03:00');
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    window.Date = FixedDate;
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const characterization = await page.evaluate(async markdownFixture => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const makeResponse = (ok, payload) => ({ ok, async json() { return payload; } });
    const requests = [];
    const audits = [];
    const originalAudit = store.audit.bind(store);
    store.audit = (action, detail) => {
      audits.push({ action, detail });
      return originalAudit(action, detail);
    };
    let statusMode = 'configured';
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      requests.push({ url, options: { ...options, body: options.body ? JSON.parse(options.body) : undefined } });
      if (url === '/api/ai/status') {
        if (statusMode === 'failure') throw new Error('Falha sintética de status');
        return makeResponse(true, { configured: statusMode === 'configured' });
      }
      if (url === '/api/ai/configure') return makeResponse(true, { message: 'Chave sintética validada', model: 'modelo-sintetico' });
      if (url === '/api/ai/chat') return makeResponse(true, { reply: markdownFixture, model: '' });
      throw new Error(`Endpoint inesperado: ${url}`);
    };

    const chip = document.getElementById('aiKeyStatusChip');
    const banner = document.getElementById('aiOnboardingBanner');
    const statuses = {};
    for (const mode of ['configured', 'unconfigured', 'failure']) {
      statusMode = mode;
      banner.style.display = 'block';
      await app.checkAiStatus();
      statuses[mode] = {
        configured: app.aiConfigured,
        chipText: chip.textContent,
        chipClass: chip.className,
        bannerDisplay: banner.style.display
      };
    }

    statusMode = 'configured';
    const syntheticKey = 'synthetic-gemini-key-000000000000';
    await app.saveGeminiKey(`  ${syntheticKey}  `);

    store.state.intimations = [{
      id: 'intimation-test-001',
      title: 'Publicação Sintética',
      text: 'Texto judicial inteiramente sintético',
      process: '0000000-00.0000.0.00.0000'
    }];
    app.selectedIntimation = 'intimation-test-001';
    app.aiConfigured = true;
    app.aiChatHistory = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      text: `histórico sintético ${index}`
    }));
    await app.sendAiMessage('Mensagem sintética\ncom segunda linha');
    const chatRequest = requests.findLast(item => item.url === '/api/ai/chat');
    const assistantMessage = document.querySelector('#aiChatMessages .assistant-message:last-child');
    const markdownHtml = assistantMessage.querySelector('.message-text').innerHTML;

    window.CODEX_LEGAL_SKILLS = [{
      id: 'skill-sintetica',
      title: 'Skill Sintética',
      name: 'Skill de Teste',
      description: 'Descrição sintética',
      instructions: 'I'.repeat(460)
    }];
    const skillSelect = document.getElementById('codexSkillSelect');
    skillSelect.innerHTML = '<option value="skill-sintetica">Skill Sintética</option>';
    skillSelect.value = 'skill-sintetica';
    skillSelect.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('btnApplyCodexSkill').click();

    return {
      statuses,
      configureRequest: requests.find(item => item.url === '/api/ai/configure'),
      chatPayload: chatRequest.options.body,
      markdownHtml,
      scriptElements: assistantMessage.querySelectorAll('script').length,
      history: app.aiChatHistory,
      skillDescription: document.getElementById('codexSkillDescription').textContent,
      skillTemplate: document.getElementById('aiChatInput').value,
      audits,
      keyInStore: JSON.stringify(store.state).includes(syntheticKey)
    };
  }, MARKDOWN_FIXTURE);

  const interactionCoverage = await page.evaluate(async () => {
    const app = window.portalApp;
    const input = document.getElementById('aiChatInput');
    const container = document.getElementById('aiChatMessages');
    const makeResponse = (ok, payload) => ({ ok, async json() { return payload; } });
    let requests = 0;
    const auxiliaryRequests = [];
    let release;
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      auxiliaryRequests.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
      if (url === '/api/ai/chat') {
        requests++;
        return new Promise(resolve => { release = () => resolve(makeResponse(true, { reply: 'Resposta dupla sintética' })); });
      }
      if (url === '/api/ai/status') return makeResponse(true, { configured: true });
      return makeResponse(true, { model: 'modelo-sintetico' });
    };

    const originalToast = app.toast;
    const quickKeyToasts = [];
    app.toast = (message, type) => quickKeyToasts.push({ message, type });
    const quickKeyInput = document.getElementById('aiQuickKeyInput');
    quickKeyInput.value = '';
    await app.handleQuickAiKeySubmit();
    quickKeyInput.value = 'synthetic-quick-key-000000000000';
    await app.handleQuickAiKeySubmit();
    const quickKey = {
      inputValue: quickKeyInput.value,
      buttonDisabled: document.getElementById('btnSaveQuickAiKey').disabled,
      buttonText: document.getElementById('btnSaveQuickAiKey').textContent,
      configureBody: auxiliaryRequests.find(item => item.url === '/api/ai/configure')?.body,
      toasts: quickKeyToasts
    };
    app.toast = originalToast;

    const keyBackdrop = document.getElementById('geminiKeyBackdrop');
    app.openGeminiKeyModal();
    keyBackdrop.firstElementChild.click();
    const openAfterInsideClick = !keyBackdrop.classList.contains('hidden');
    keyBackdrop.click();
    const closedAfterBackdropClick = keyBackdrop.classList.contains('hidden');

    app.aiConfigured = true;
    app.aiChatHistory = [];
    const first = app.sendAiMessage('Primeira submissão sintética');
    await Promise.resolve();
    const second = app.sendAiMessage('Segunda submissão bloqueada');
    await Promise.resolve();
    const duringRequest = { requests, typingRows: container.querySelectorAll('.ai-typing-row').length };
    release();
    await Promise.all([first, second]);

    let failedRequests = 0;
    window.KellerAuth.secureFetch = async url => {
      if (url === '/api/ai/chat') {
        failedRequests++;
        return makeResponse(false, { message: '<script>erro sintético</script>' });
      }
      return makeResponse(true, { configured: true });
    };
    const historyBeforeFailure = app.aiChatHistory.length;
    await app.sendAiMessage('Falha sintética');
    const lastMessage = container.querySelector('.assistant-message:last-child');
    const failure = {
      requests: failedRequests,
      historyBefore: historyBeforeFailure,
      historyAfter: app.aiChatHistory.length,
      typingRows: container.querySelectorAll('.ai-typing-row').length,
      scriptElements: lastMessage.querySelectorAll('script').length,
      escapedText: lastMessage.textContent.includes('<script>erro sintético</script>')
    };

    app.clearAiConversation();
    const clear = { history: structuredClone(app.aiChatHistory), text: container.textContent.replace(/\s+/g, ' ').trim() };

    let enterRequests = 0;
    window.KellerAuth.secureFetch = async () => {
      enterRequests++;
      return makeResponse(true, { reply: 'Resposta via teclado' });
    };
    input.value = 'Mensagem Shift+Enter';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    await Promise.resolve();
    const afterShiftEnter = enterRequests;
    input.value = 'Mensagem Enter';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    return { quickKey, modalBackdrop: { openAfterInsideClick, closedAfterBackdropClick }, duringRequest, afterRequestTyping: container.querySelectorAll('.ai-typing-row').length, failure, clear, afterShiftEnter, afterEnter: enterRequests };
  });

  assert.deepEqual(characterization.statuses, {
    configured: { configured: true, chipText: 'Chave Ativa', chipClass: 'status-chip connected', bannerDisplay: 'none' },
    unconfigured: { configured: false, chipText: 'Chave não configurada', chipClass: 'status-chip warning', bannerDisplay: 'block' },
    failure: { configured: false, chipText: 'Chave não configurada', chipClass: 'status-chip warning', bannerDisplay: 'block' }
  });
  assert.equal(characterization.configureRequest.url, '/api/ai/configure');
  assert.equal(characterization.configureRequest.options.method, 'POST');
  assert.deepEqual(characterization.configureRequest.options.body, { apiKey: 'synthetic-gemini-key-000000000000' });
  assert.deepEqual(Object.keys(characterization.chatPayload), ['message', 'context', 'history']);
  assert.equal(characterization.chatPayload.history.length, 12);
  assert.equal(characterization.chatPayload.history[0].text, 'histórico sintético 2');
  assert.deepEqual(Object.keys(characterization.chatPayload.context), ['intimation']);
  assert.equal(characterization.chatPayload.context.intimation.id, 'intimation-test-001');
  assert.equal(characterization.history.at(-2).role, 'user');
  assert.equal(characterization.history.at(-1).role, 'assistant');
  assert.equal(createHash('sha256').update(characterization.markdownHtml, 'utf8').digest('hex'), '3f130f88bb3dcdc97af83a4056377cf8fd6b95ba75167ad58f7398157a73e640');
  assert.equal(characterization.scriptElements, 0);
  assert.equal(characterization.skillDescription, 'Skill Sintética: Descrição sintética');
  assert.equal(createHash('sha256').update(characterization.skillTemplate, 'utf8').digest('hex'), '6cf17ec6d1e86d4107e31c355a7d4b0153cfa3b94b33c8a61e457d79dd7d3e46');
  assert.equal(characterization.keyInStore, false);
  assert.equal(JSON.stringify(characterization.audits).includes('synthetic-gemini-key'), false);
  assert.deepEqual(interactionCoverage.quickKey.configureBody, { apiKey: 'synthetic-quick-key-000000000000' });
  assert.equal(interactionCoverage.quickKey.inputValue, '');
  assert.equal(interactionCoverage.quickKey.buttonDisabled, false);
  assert.equal(interactionCoverage.quickKey.buttonText, 'Ativar Assistente Gratuito');
  assert.ok(interactionCoverage.quickKey.toasts.some(entry => entry.type === 'error'));
  assert.ok(interactionCoverage.quickKey.toasts.some(entry => entry.type === 'success'));
  assert.deepEqual(interactionCoverage.modalBackdrop, { openAfterInsideClick: true, closedAfterBackdropClick: true });
  assert.deepEqual(interactionCoverage.duringRequest, { requests: 1, typingRows: 1 });
  assert.equal(interactionCoverage.afterRequestTyping, 0);
  assert.deepEqual(interactionCoverage.failure, { requests: 1, historyBefore: 2, historyAfter: 2, typingRows: 0, scriptElements: 0, escapedText: true });
  assert.deepEqual(interactionCoverage.clear.history, []);
  assert.match(interactionCoverage.clear.text, /Conversa reiniciada\. Em que posso auxiliá-lo\(a\) agora com suas intimações, prazos ou minutas\?/);
  assert.equal(interactionCoverage.afterShiftEnter, 0);
  assert.equal(interactionCoverage.afterEnter, 1);
  console.log('✓ Feature modular do Assistente IA: arquitetura, segurança e contratos preservados.');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function setupMaster(baseUrl) {
  let responseValue = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.assistant.feature',
    displayName: 'Administradora Assistente Sintética',
    password: 'Assistant-Feature-2026!'
  });
  const setup = await responseValue.json();
  assert.equal(responseValue.status, 200);
  responseValue = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(responseValue.status, 200);
  return { cookie: responseValue.headers.get('set-cookie').split(';')[0] };
}
