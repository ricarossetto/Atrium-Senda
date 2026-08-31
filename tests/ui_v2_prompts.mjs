import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPromptsFeature } from '../js/features/prompts.js';
import { prepareUiV2Page, prepareUiV2PromptsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource, promptsData, skillsData] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/prompts.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/prompts-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/prompts-data.js')),
  readFile(path.join(ROOT, 'js/skills-data.js'))
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LEGAL PROMPT LIBRARY');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createPromptsFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Prompts Feature.');
assert.doesNotMatch(featureSource, /^\s*import\s/m);
assert.doesNotMatch(featureSource, /\b(?:fetch|secureFetch)\s*\(/);
assert.doesNotMatch(presenterSource, /\bStore\b|customPrompts|\bfetch\s*\(|secureFetch|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|clipboard\.writeText|setTimeout|onUsePrompt/);
assert.equal(createHash('sha256').update(promptsData).digest('hex'), '5ad2e02eaf7ea80bb76b43e2de7beccc05ffb159af56b634a4f9d712e74f8340');
assert.equal(createHash('sha256').update(skillsData).digest('hex'), 'adc7de1e9cb6bb0ec896995f844e06941781a2b81366cd29eee4337d8e07405f');

const rollbackStore = {
  state: { customPrompts: [{ id: 'custom-rollback-v2', isCustom: true, title: 'Rollback V2' }] },
  audit() {}, save() {}, async flush() { return false; }
};
const rollbackFeature = createPromptsFeature({ store: rollbackStore, documentRef: { getElementById: () => null } });
assert.equal(await rollbackFeature.deletePrompt('default-protegido-v2'), false);
assert.equal(await rollbackFeature.deletePrompt('custom-rollback-v2'), false);
assert.equal(rollbackStore.state.customPrompts[0].id, 'custom-rollback-v2');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const fixture = await prepareUiV2PromptsFixture(page);

  const baseline = await page.evaluate(() => {
    const { Store } = window.Atrium;
    const originals = {
      audit: Store.audit.bind(Store),
      save: Store.save.bind(Store),
      flush: Store.flush.bind(Store)
    };
    window.__promptsV2Calls = { audit: 0, save: 0, flush: 0 };
    window.__promptsV2FlushFailure = false;
    Store.audit = (...args) => {
      window.__promptsV2Calls.audit++;
      return originals.audit(...args);
    };
    Store.save = (...args) => {
      window.__promptsV2Calls.save++;
      return originals.save(...args);
    };
    Store.flush = async (...args) => {
      window.__promptsV2Calls.flush++;
      if (window.__promptsV2FlushFailure) return false;
      return originals.flush(...args);
    };
    return {
      state: JSON.stringify(Store.state.customPrompts),
      requests: window.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });

  assert.deepEqual(await page.locator('#promptsGrid [data-prompt-id]').evaluateAll(cards => cards.map(card => card.dataset.promptId)),
    ['prompt-v2-custom', 'prompt-v2-redacao', 'prompt-v2-previdenciario', 'prompt-v2-long']);
  assert.equal(await page.locator('#promptsCountDisplay').textContent(), 'Mostrando 4 de 4 prompts');
  assert.equal(await page.locator('#promptsCategoryChips .prompt-chip').count(), 4);
  assert.equal(await page.locator('#promptsGrid [data-prompt-origin="custom"]').count(), 1);
  assert.equal(await page.locator('#promptsGrid [data-prompt-origin="default"]').count(), 3);
  assert.equal(await page.locator('[data-prompt-id="prompt-v2-redacao"] .prompt-tag').count(), 5, 'A apresentação deve limitar tags a cinco sem alterar os dados.');

  const searches = [
    ['Redação Cível Sintética', 'prompt-v2-redacao'],
    ['riscos e fatos', 'prompt-v2-previdenciario'],
    ['precedentes', 'prompt-v2-custom'],
    ['SEPARE FATOS PROVADOS', 'prompt-v2-previdenciario']
  ];
  for (const [query, id] of searches) {
    await page.locator('#promptsSearchInput').fill(query);
    assert.deepEqual(await page.locator('#promptsGrid [data-prompt-id]').evaluateAll(cards => cards.map(card => card.dataset.promptId)), [id]);
  }
  await page.locator('#btnClearPromptsSearch').click();
  assert.equal(await page.locator('#promptsSearchInput').inputValue(), '');
  assert.equal(await page.locator('#btnClearPromptsSearch').evaluate(element => element.classList.contains('hidden')), true);

  await page.locator('#promptCategorySelect').selectOption('Previdenciário');
  assert.deepEqual(await page.locator('#promptsGrid [data-prompt-id]').evaluateAll(cards => cards.map(card => card.dataset.promptId)), ['prompt-v2-previdenciario']);
  assert.equal(await page.locator('[data-category="Previdenciário"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-category="all"]').click();
  await page.locator('#promptTypeSelect').selectOption('Pesquisa');
  assert.deepEqual(await page.locator('#promptsGrid [data-prompt-id]').evaluateAll(cards => cards.map(card => card.dataset.promptId)), ['prompt-v2-custom']);
  await page.locator('#promptTypeSelect').selectOption('all');

  await page.locator('#promptsSearchInput').fill('resultado sintético inexistente');
  assert.match(await page.locator('#promptsGrid').textContent(), /Nenhum prompt encontrado/);
  assert.equal(await page.locator('#promptsCountDisplay').textContent(), 'Mostrando 0 de 4 prompts');
  await page.locator('#btnClearPromptsSearch').click();

  const readOnly = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state.customPrompts),
    calls: { ...window.__promptsV2Calls },
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.equal(readOnly.state, baseline.state);
  assert.deepEqual(readOnly.calls, { audit: 0, save: 0, flush: 0 });
  assert.equal(readOnly.requests, baseline.requests);
  assert.equal(readOnly.intervals, baseline.intervals);

  await page.evaluate(() => {
    window.__promptsV2Clipboard = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__promptsV2Clipboard.push(text); } }
    });
  });
  await page.locator('[data-copy-prompt="prompt-v2-long"]').click();
  await page.waitForFunction(() => document.querySelector('[data-copy-prompt="prompt-v2-long"]')?.classList.contains('copied'));
  assert.deepEqual(await page.evaluate(() => window.__promptsV2Clipboard), [fixture.defaults[2].prompt]);
  assert.match(await page.locator('[data-copy-prompt="prompt-v2-long"]').textContent(), /Copiado!/);

  const unavailable = await page.evaluate(async () => {
    const app = window.portalApp;
    const messages = [];
    const originalToast = app.toast;
    app.toast = (message, type) => messages.push({ message, type });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const result = await app.copyPrompt('PROMPT NÃO COPIADO', null);
    app.toast = originalToast;
    return { result, messages };
  });
  assert.equal(unavailable.result, false);
  assert.deepEqual(unavailable.messages, [{ message: 'Área de transferência indisponível neste navegador.', type: 'error' }]);

  const bridgeBefore = await page.evaluate(() => {
    window.__promptsV2AiRequests = [];
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      window.__promptsV2AiRequests.push({ url, method: options.method || 'GET' });
      return { ok: true, async json() { return { configured: false }; } };
    };
    return window.__promptsV2AiRequests.length;
  });
  await page.locator('[data-use-prompt="prompt-v2-redacao"]').click();
  const bridge = await page.evaluate(() => ({
    currentView: window.portalApp.currentView,
    value: document.getElementById('aiChatInput').value,
    focused: document.activeElement === document.getElementById('aiChatInput'),
    chatRequests: window.__promptsV2AiRequests.filter(item => item.url === '/api/ai/chat').length
  }));
  assert.equal(bridgeBefore, 0);
  assert.deepEqual(bridge, { currentView: 'assistant', value: fixture.defaults[0].prompt, focused: true, chatRequests: 0 });
  await page.evaluate(() => window.portalApp.switchView('prompts'));

  await page.locator('#btnNewPrompt').click();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)),
    ['title', 'category', 'type', 'tags', 'description', 'prompt']);
  assert.equal(await page.locator('#field-category').inputValue(), 'Cível');
  assert.equal(await page.locator('#field-type').inputValue(), 'Redação');
  await page.locator('#field-title').fill('Prompt Confidencial Sintético');
  await page.locator('#field-category').fill('Trabalhista');
  await page.locator('#field-type').selectOption('Assistente');
  await page.locator('#field-tags').fill(' tag um, tag dois ; tag três ');
  await page.locator('#field-description').fill('Descrição estritamente sintética');
  await page.locator('#field-prompt').fill('ESTRATÉGIA JURÍDICA CONFIDENCIAL SINTÉTICA');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  const created = await page.evaluate(() => {
    const record = window.Atrium.Store.state.customPrompts.find(item => item.title === 'Prompt Confidencial Sintético');
    return { record: structuredClone(record), audit: structuredClone(window.Atrium.Store.state.audit.at(-1)) };
  });
  assert.equal(created.record.isCustom, true);
  assert.deepEqual(created.record.tags, ['tag um', 'tag dois', 'tag três']);
  assert.equal(created.audit.action, 'Prompt personalizado criado');
  assert.equal(created.audit.detail, 'Prompt Confidencial Sintético');
  assert.equal(JSON.stringify(created.audit).includes('ESTRATÉGIA JURÍDICA CONFIDENCIAL SINTÉTICA'), false);
  assert.equal((await page.locator('#promptsGrid [data-prompt-id]').first().getAttribute('data-prompt-id')), created.record.id);

  await page.evaluate(id => {
    const record = window.Atrium.Store.state.customPrompts.find(item => item.id === id);
    record.updatedAt = '2020-01-01T00:00:00.000Z';
    window.portalApp.renderPrompts();
  }, created.record.id);
  await page.locator(`[data-edit-prompt="${created.record.id}"]`).click();
  await page.locator('#field-title').fill('Prompt Editado Sintético');
  await page.locator('#field-tags').fill('editado; normalizado');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(id => structuredClone(window.Atrium.Store.state.customPrompts.find(item => item.id === id)), created.record.id);
  assert.equal(edited.id, created.record.id);
  assert.equal(edited.createdAt, created.record.createdAt);
  assert.notEqual(edited.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.deepEqual(edited.tags, ['editado', 'normalizado']);
  assert.equal(await page.locator(`[data-prompt-id="${edited.id}"]`).count(), 1);

  assert.equal(await page.locator('[data-prompt-id="prompt-v2-redacao"] [data-edit-prompt], [data-prompt-id="prompt-v2-redacao"] [data-delete-prompt]').count(), 0);
  await page.locator(`[data-delete-prompt="${edited.id}"]`).click();
  await page.locator(`[data-prompt-id="${edited.id}"]`).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(id => window.Atrium.Store.state.customPrompts.some(item => item.id === id), edited.id), false);

  await page.evaluate(() => { window.__promptsV2FlushFailure = true; });
  await page.locator('[data-delete-prompt="prompt-v2-custom"]').click();
  await page.waitForFunction(() => window.Atrium.Store.state.customPrompts.some(item => item.id === 'prompt-v2-custom')
    && document.querySelector('[data-prompt-id="prompt-v2-custom"]'));
  assert.equal(await page.locator('[data-prompt-id="prompt-v2-custom"]').count(), 1);
  await page.evaluate(() => { window.__promptsV2FlushFailure = false; });

  const finalState = await page.evaluate(() => ({
    prompts: window.Atrium.Store.state.customPrompts,
    calls: window.__promptsV2Calls,
    requests: window.__uiV2RuntimeProbe.mutationRequests,
    intervals: window.__uiV2RuntimeProbe.intervals,
    filter: window.portalApp.promptsFilter
  }));
  assert.equal(finalState.prompts.some(item => item.id === 'prompt-v2-custom'), true);
  assert.ok(finalState.calls.audit >= 4);
  assert.ok(finalState.calls.save >= 4);
  assert.ok(finalState.calls.flush >= 4);
  assert.deepEqual(finalState.filter, { search: '', category: 'all', type: 'all' });
  assert.equal(finalState.intervals, baseline.intervals);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Prompts V2: arquitetura única, filtros, clipboard, bridge, CRUD, privacidade e rollback preservados.');
