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
assert.match(featureSource, /selected \? \{ \[selected\.type\]: \{ id: selected\.id \} \} : \{\}/, 'O navegador deve enviar somente tipo e ID do contexto explícito.');

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
    const initialContextText = document.getElementById('assistantV2ContextMeta').textContent;

    Store.state.processes = [{ id: 'assistant-process-v2', number: '5000000-00.2026.8.21.0001', client: 'Cliente Contextual', actionType: 'Obrigação de fazer' }];
    Store.state.documents = [{ id: 'assistant-document-v2', name: 'laudo-contextual.pdf', documentType: 'Laudo', intelligence: { ocr: { checksum: 'ocr-contextual' } } }];
    Store.state.contacts = [{ id: 'assistant-contact-v2', name: 'Cliente Contextual', contactRole: 'Cliente' }];
    App.renderAssistant();
    const contextSelect = document.getElementById('assistantContextSelect');
    const contextOptionLabels = [...contextSelect.options].map(option => option.textContent);
    const selectAndSend = async (key, message) => {
      contextSelect.value = key;
      contextSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const sources = [...document.querySelectorAll('#assistantV2ContextSources span')].map(element => element.textContent);
      await App.sendAiMessage(message);
      return { payload: requests.findLast(item => item.url === '/api/ai/chat').body.context, sources };
    };
    const processContext = await selectAndSend('process:assistant-process-v2', 'Analise o processo selecionado.');
    const documentContext = await selectAndSend('document:assistant-document-v2', 'Analise o documento selecionado.');
    const contactContext = await selectAndSend('contact:assistant-contact-v2', 'Resuma o contexto do cliente selecionado.');

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
      contextText: initialContextText,
      contextHidden: document.getElementById('assistantV2Context').hidden,
      contextOptionLabels,
      processContext,
      documentContext,
      contactContext,
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
  assert.ok(result.contextOptionLabels.some(label => /5000000-00\.2026\.8\.21\.0001/.test(label)));
  assert.ok(result.contextOptionLabels.includes('laudo-contextual.pdf'));
  assert.ok(result.contextOptionLabels.includes('Cliente Contextual'));
  assert.deepEqual(result.processContext.payload, { process: { id: 'assistant-process-v2' } });
  assert.deepEqual(result.documentContext.payload, { document: { id: 'assistant-document-v2' } });
  assert.ok(result.documentContext.sources.includes('Dados do sistema') && result.documentContext.sources.includes('Texto extraído'));
  assert.deepEqual(result.contactContext.payload, { contact: { id: 'assistant-contact-v2' } });
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
