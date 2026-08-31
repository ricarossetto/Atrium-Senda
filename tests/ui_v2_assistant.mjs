import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2AssistantFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/assistant.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/assistant-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LEGAL AI WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createAssistantFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Assistant Feature.');
assert.doesNotMatch(featureSource, /^\s*import\s/m);
assert.doesNotMatch(featureSource, /\bfetch\s*\(|\bStore\b|store\.state|localStorage|sessionStorage/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|secureFetch|chatHistory|isTyping|localStorage|sessionStorage|\/api\/ai\//);
assert.match(featureSource, /history:\s*chatHistory\.slice\(-12\)/);
assert.match(featureSource, /if \(selectedIntimation\) context\.intimation = selectedIntimation/);

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

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  await prepareUiV2AssistantFixture(page, { configured: true, withContext: true });

  const result = await page.evaluate(async markdownFixture => {
    const { App, Store } = window.Atrium;
    const makeResponse = (ok, payload) => ({ ok, async json() { return payload; } });
    const requests = [];
    const audits = [];
    const originalAudit = Store.audit.bind(Store);
    Store.audit = (action, detail) => {
      audits.push({ action, detail });
      return originalAudit(action, detail);
    };
    let mode = 'configured';
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      if (url === '/api/ai/status') {
        if (mode === 'failure') throw new Error('falha sintética de status');
        return makeResponse(true, { configured: mode === 'configured' });
      }
      if (url === '/api/ai/configure') return makeResponse(true, { model: 'modelo-sintetico', message: 'Configuração sintética aceita' });
      if (url === '/api/ai/chat') return makeResponse(true, { reply: markdownFixture, model: 'Gemini sintético' });
      throw new Error(`Endpoint inesperado: ${url}`);
    };

    const statuses = {};
    for (const statusMode of ['configured', 'unconfigured', 'failure']) {
      mode = statusMode;
      await App.checkAiStatus();
      statuses[statusMode] = {
        configured: App.aiConfigured,
        chip: document.getElementById('aiKeyStatusChip').textContent,
        banner: getComputedStyle(document.getElementById('aiOnboardingBanner')).display,
        v2: document.getElementById('assistantV2StatusText').textContent
      };
    }

    const beforeShort = requests.length;
    let shortRejected = false;
    try { await App.saveGeminiKey('curta'); } catch { shortRejected = true; }
    const shortRequests = requests.length - beforeShort;

    mode = 'configured';
    const secret = 'synthetic-gemini-key-000000000000';
    await App.saveGeminiKey(`  ${secret}  `);
    const configure = requests.find(item => item.url === '/api/ai/configure');

    App.aiConfigured = false;
    App.closeGeminiKeyModal();
    const beforeGuard = requests.filter(item => item.url === '/api/ai/chat').length;
    await App.sendAiMessage('Mensagem que deve ser bloqueada');
    const guard = {
      requests: requests.filter(item => item.url === '/api/ai/chat').length - beforeGuard,
      open: !document.getElementById('geminiKeyBackdrop').classList.contains('hidden'),
      history: App.aiChatHistory.length
    };
    App.closeGeminiKeyModal();

    App.aiConfigured = true;
    App.aiChatHistory = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `histórico ${index}` }));
    await App.sendAiMessage('Mensagem sintética supervisionada');
    const chatRequest = requests.findLast(item => item.url === '/api/ai/chat');
    const assistantMessage = document.querySelector('#aiChatMessages .assistant-message:last-child');
    const markdownHtml = assistantMessage.querySelector('.message-text').innerHTML;

    const prompt = 'PROMPT EXTERNO SINTÉTICO — NÃO ENVIAR';
    const chatCountBeforePrompt = requests.filter(item => item.url === '/api/ai/chat').length;
    App.usePromptInAi(prompt);
    const promptBridge = {
      value: document.getElementById('aiChatInput').value,
      requests: requests.filter(item => item.url === '/api/ai/chat').length - chatCountBeforePrompt
    };

    return {
      statuses,
      shortRejected,
      shortRequests,
      configure,
      secretInStore: JSON.stringify(Store.state).includes(secret),
      secretInAudit: JSON.stringify(audits).includes(secret),
      guard,
      chatPayload: chatRequest.body,
      markdownHtml,
      scripts: assistantMessage.querySelectorAll('script').length,
      historyTail: App.aiChatHistory.slice(-2),
      promptBridge,
      contextText: document.getElementById('assistantV2ContextMeta').textContent,
      contextHidden: document.getElementById('assistantV2Context').hidden,
      endpoints: [...new Set(requests.map(item => item.url).filter(url => url.startsWith('/api/ai/')))]
    };
  }, MARKDOWN_FIXTURE);

  assert.deepEqual(result.statuses, {
    configured: { configured: true, chip: 'Chave Ativa', banner: 'none', v2: 'Gemini configurado' },
    unconfigured: { configured: false, chip: 'Chave não configurada', banner: 'block', v2: 'Configuração necessária' },
    failure: { configured: false, chip: 'Chave não configurada', banner: 'block', v2: 'Configuração necessária' }
  });
  assert.equal(result.shortRejected, true);
  assert.equal(result.shortRequests, 0);
  assert.deepEqual(result.configure, { url: '/api/ai/configure', method: 'POST', body: { apiKey: 'synthetic-gemini-key-000000000000' } });
  assert.equal(result.secretInStore, false);
  assert.equal(result.secretInAudit, false);
  assert.deepEqual(result.guard, { requests: 0, open: true, history: 0 });
  assert.deepEqual(Object.keys(result.chatPayload), ['message', 'context', 'history']);
  assert.equal(result.chatPayload.history.length, 12);
  assert.equal(result.chatPayload.history[0].text, 'histórico 2');
  assert.deepEqual(Object.keys(result.chatPayload.context), ['intimation']);
  assert.equal(result.chatPayload.context.intimation.id, 'assistant-intimation-v2');
  assert.equal(result.contextHidden, false);
  assert.match(result.contextText, /0000000-00\.2026\.8\.21\.0000/);
  assert.equal(createHash('sha256').update(result.markdownHtml, 'utf8').digest('hex'), '3f130f88bb3dcdc97af83a4056377cf8fd6b95ba75167ad58f7398157a73e640');
  assert.equal(result.scripts, 0);
  assert.deepEqual(result.historyTail.map(item => item.role), ['user', 'assistant']);
  assert.deepEqual(result.promptBridge, { value: 'PROMPT EXTERNO SINTÉTICO — NÃO ENVIAR', requests: 0 });
  assert.deepEqual(result.endpoints.sort(), ['/api/ai/chat', '/api/ai/configure', '/api/ai/status']);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Assistente V2: arquitetura única, status, chave, payload, contexto e Markdown preservados.');
