import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createPromptsFeature } from '../js/features/prompts.js';
import { postJson, startTestServer } from './helpers.mjs';

const promptsDataHash = createHash('sha256').update(fs.readFileSync(new URL('../js/prompts-data.js', import.meta.url))).digest('hex');
const skillsDataHash = createHash('sha256').update(fs.readFileSync(new URL('../js/skills-data.js', import.meta.url))).digest('hex');
const promptsSource = fs.readFileSync(new URL('../js/features/prompts.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(promptsSource, /export function createPromptsFeature\(/);
assert.doesNotMatch(promptsSource, /^\s*import\s/m, 'prompts.js não deve importar assistant, portal ou outras features');
assert.doesNotMatch(promptsSource, /\b(?:fetch|secureFetch)\s*\(/, 'prompts.js não deve acessar a rede');
assert.match(portalSource, /renderPrompts\(\) \{ return getPromptsFeature\(\)\.render\(\); \}/);
assert.match(portalSource, /getPromptsFeature\(\)\.savePrompt\(data, this\.modalMode\.defaults\)/);
assert.doesNotMatch(portalSource, /promptsFilter:\s*\{/);

function makeElement() {
  const listeners = new Map();
  return {
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    count(type) { return (listeners.get(type) || []).length; }
  };
}
const listenerIds = ['promptsSearchInput', 'btnClearPromptsSearch', 'promptCategorySelect', 'promptTypeSelect', 'promptsCategoryChips', 'btnNewPrompt', 'promptsGrid'];
const listenerElements = Object.fromEntries(listenerIds.map(id => [id, makeElement()]));
const listenerStore = { state: { customPrompts: [] }, audit() {}, save() {}, async flush() { return true; } };
const listenerFeature = createPromptsFeature({ store: listenerStore, documentRef: { getElementById: id => listenerElements[id] || null } });
assert.equal(listenerFeature.init(), true);
assert.equal(listenerFeature.init(), false);
for (const element of Object.values(listenerElements)) {
  for (const type of ['click', 'input', 'change']) assert.ok(element.count(type) <= 1, `listener duplicado: ${type}`);
}

const rollbackStore = {
  state: { customPrompts: [{ id: 'custom-rollback', isCustom: true, title: 'Rollback Sintético' }] },
  audit() {},
  save() {},
  async flush() { return false; }
};
const rollbackFeature = createPromptsFeature({ store: rollbackStore, documentRef: { getElementById: () => null } });
assert.equal(await rollbackFeature.deletePrompt('default-inexistente'), false);
assert.equal(await rollbackFeature.deletePrompt('custom-rollback'), false);
assert.equal(rollbackStore.state.customPrompts[0].id, 'custom-rollback');
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
    localStorage.setItem('atrium:ui:mode', 'classic');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const characterization = await page.evaluate(async () => {
    // Exercita a compatibilidade interna legada sem reabrir uma preferência pública para o Classic.
    document.documentElement.dataset.ui = 'classic';
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const defaultPrompts = [
      {
        id: 'default-test-001', title: 'Redação Sintética', category: 'Cível', type: 'Redação',
        description: 'Descrição padrão sintética', tags: ['petição', 'sintético'], prompt: 'PROMPT PADRÃO DE REDAÇÃO'
      },
      {
        id: 'default-test-002', title: 'Análise Previdenciária Sintética', category: 'Previdenciário', type: 'Análise',
        description: 'Outro padrão sintético', tags: ['benefício'], prompt: 'ANALISAR BENEFÍCIO SINTÉTICO'
      }
    ];
    const initialCustom = {
      id: 'custom-test-001', isCustom: true, title: 'Pesquisa Custom Sintética', category: 'Cível', type: 'Pesquisa',
      description: 'Descrição custom sintética', tags: ['custom', 'pesquisa'], prompt: 'PROMPT CUSTOM PRIMEIRO',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z'
    };
    window.PROMPTS_DATA = defaultPrompts;
    store.state.customPrompts = [initialCustom];
    store.state.audit = [];
    const persistence = { save: 0, flush: 0 };
    store.save = () => { persistence.save++; return true; };
    store.flush = async () => { persistence.flush++; return true; };
    const audits = [];
    const originalAudit = store.audit.bind(store);
    store.audit = (action, detail) => {
      audits.push({ action, detail });
      return originalAudit(action, detail);
    };

    app.promptsFilter = { search: '', category: 'all', type: 'all' };
    app.renderPrompts();
    const grid = document.getElementById('promptsGrid');
    const initialHtml = grid.innerHTML;
    const ids = () => [...grid.querySelectorAll('[data-prompt-id]')].map(item => item.dataset.promptId);
    const filterResults = { initial: ids() };

    const searchInput = document.getElementById('promptsSearchInput');
    searchInput.value = 'benefício sintético';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    const searchViaListener = ids();
    document.getElementById('btnClearPromptsSearch').click();
    const clearSearch = { ids: ids(), value: searchInput.value, focused: document.activeElement === searchInput };

    app.promptsFilter.search = 'benefício sintético';
    app.renderPrompts();
    filterResults.search = ids();
    app.promptsFilter = { search: '', category: 'Cível', type: 'all' };
    app.renderPrompts();
    filterResults.category = ids();
    app.promptsFilter = { search: '', category: 'all', type: 'Pesquisa' };
    app.renderPrompts();
    filterResults.type = ids();
    app.promptsFilter = { search: 'resultado inexistente', category: 'all', type: 'all' };
    app.renderPrompts();
    filterResults.emptyText = grid.textContent.replace(/\s+/g, ' ').trim();

    app.promptsFilter = { search: '', category: 'all', type: 'all' };
    app.renderPrompts();
    const clipboardWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { clipboardWrites.push(text); } }
    });
    const copyButton = grid.querySelector('[data-copy-prompt="default-test-001"]');
    copyButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const copyFeedback = { html: copyButton.innerHTML, copiedClass: copyButton.classList.contains('copied') };

    let autoSubmitCalls = 0;
    const originalSend = app.sendAiMessage;
    app.sendAiMessage = () => { autoSubmitCalls++; };
    app.usePromptInAi('PROMPT CARREGADO SEM ENVIO');
    app.sendAiMessage = originalSend;
    const aiInput = document.getElementById('aiChatInput');
    const useBehavior = {
      currentView: app.currentView,
      value: aiInput.value,
      height: aiInput.style.height,
      focused: document.activeElement === aiInput,
      autoSubmitCalls
    };

    app.openNewPromptModal();
    const form = document.getElementById('modalForm');
    form.elements.title.value = 'Prompt Criado Sintético';
    form.elements.category.value = 'Trabalhista';
    form.elements.type.value = 'Assistente';
    form.elements.tags.value = ' tag um, tag dois ; tag três ';
    form.elements.description.value = 'Descrição criada sintética';
    form.elements.prompt.value = 'TEXTO CRIADO SINTÉTICO';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: form });
    const created = structuredClone(store.state.customPrompts[0]);

    app.openNewPromptModal(created);
    const editForm = document.getElementById('modalForm');
    editForm.elements.title.value = 'Prompt Editado Sintético';
    editForm.elements.tags.value = 'editado; normalizado';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: editForm });
    const edited = structuredClone(store.state.customPrompts.find(item => item.id === created.id));

    app.promptsFilter = { search: '', category: 'all', type: 'all' };
    app.renderPrompts();
    document.querySelector(`[data-delete-prompt="${created.id}"]`).click();
    const deleted = !store.state.customPrompts.some(item => item.id === created.id);
    const defaultDeleteButton = document.querySelector('[data-delete-prompt="default-test-001"]');

    return {
      initialHtml,
      filterResults,
      searchViaListener,
      clearSearch,
      clipboardWrites,
      copyFeedback,
      useBehavior,
      created,
      edited,
      deleted,
      defaultDeleteButton: Boolean(defaultDeleteButton),
      persistence,
      audits,
      defaultPrompts
    };
  });

  assert.equal(promptsDataHash, '5ad2e02eaf7ea80bb76b43e2de7beccc05ffb159af56b634a4f9d712e74f8340');
  assert.equal(skillsDataHash, 'adc7de1e9cb6bb0ec896995f844e06941781a2b81366cd29eee4337d8e07405f');
  assert.equal(createHash('sha256').update(characterization.initialHtml, 'utf8').digest('hex'), 'c0d4b9fff3c808bee0313a35f02ba09a5f6f57714c2b22aea0c79e4458688103');
  assert.deepEqual(characterization.filterResults, {
    initial: ['custom-test-001', 'default-test-001', 'default-test-002'],
    search: ['default-test-002'],
    category: ['custom-test-001', 'default-test-001'],
    type: ['custom-test-001'],
    emptyText: '⌕ Nenhum prompt encontrado Tente ajustar os termos da pesquisa ou selecione outra área do direito.'
  });
  assert.deepEqual(characterization.searchViaListener, ['default-test-002']);
  assert.deepEqual(characterization.clearSearch, { ids: ['custom-test-001', 'default-test-001', 'default-test-002'], value: '', focused: false });
  assert.deepEqual(characterization.clipboardWrites, ['PROMPT PADRÃO DE REDAÇÃO']);
  assert.equal(createHash('sha256').update(characterization.copyFeedback.html, 'utf8').digest('hex'), 'e53b5d569a716f0a788e258a9c7308199bb7a10741883d9ffa9bd8227f39bbe1');
  assert.equal(characterization.copyFeedback.copiedClass, true);
  assert.deepEqual(characterization.useBehavior, { currentView: 'assistant', value: 'PROMPT CARREGADO SEM ENVIO', height: '72px', focused: true, autoSubmitCalls: 0 });
  assert.equal(characterization.created.isCustom, true);
  assert.deepEqual(characterization.created.tags, ['tag um', 'tag dois', 'tag três']);
  assert.equal(characterization.created.createdAt, '2026-08-29T15:00:00.000Z');
  assert.equal(characterization.edited.id, characterization.created.id);
  assert.equal(characterization.edited.createdAt, characterization.created.createdAt);
  assert.deepEqual(characterization.edited.tags, ['editado', 'normalizado']);
  assert.equal(characterization.deleted, true);
  assert.equal(characterization.defaultDeleteButton, false);
  assert.ok(characterization.persistence.save >= 3);
  assert.ok(characterization.persistence.flush >= 3);
  assert.deepEqual(characterization.audits.map(entry => entry.action), ['Prompt personalizado criado', 'Prompt personalizado atualizado', 'Prompt personalizado excluído']);
  assert.equal(createHash('sha256').update(JSON.stringify(characterization.defaultPrompts), 'utf8').digest('hex'), '9727724bd057fbf28405c74439c69485fb9e02e5366007cd8c7c7c6ea182bef9');
  console.log('✓ Biblioteca modular de Prompts: arquitetura, filtros, UI e persistência preservados.');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function setupMaster(baseUrl) {
  let responseValue = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.prompts.feature',
    displayName: 'Administradora Prompts Sintética',
    password: 'Prompts-Feature-2026!'
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
