import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveUiMode } from '../js/views/ui-v2/mode.js';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const preferenceInitSource = await readFile(new URL('../js/views/ui-v2/preference-init.js', import.meta.url), 'utf8');
const resolvePrepaint = storage => {
  const documentElement = { dataset: {} };
  vm.runInNewContext(preferenceInitSource, { localStorage: storage, document: { documentElement } });
  return documentElement.dataset.ui;
};
const storageFor = value => ({ getItem: () => value });
const throwingStorage = { getItem() { throw new Error('Storage indisponível'); } };

assert.equal(resolveUiMode(storageFor(null)), 'v2');
assert.equal(resolveUiMode(storageFor('v2')), 'v2');
assert.equal(resolveUiMode(storageFor('classic')), 'classic');
assert.equal(resolveUiMode(throwingStorage), 'v2');
assert.equal(resolvePrepaint(storageFor(null)), 'v2');
assert.equal(resolvePrepaint(storageFor('v2')), 'v2');
assert.equal(resolvePrepaint(storageFor('classic')), 'classic');
assert.equal(resolvePrepaint(throwingStorage), 'v2');

const session = await startUiV2Session();
const context = await session.createContext();

try {
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  await page.locator('#systemStatusBar[data-status="saved"], #systemStatusBar[data-status="ready"]').waitFor();
  await page.evaluate(() => window.Atrium.App.switchView('configuration'));
  await page.locator('#view-configuration.active #uiModeControl').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#uiModeControl').isHidden(), true, 'O seletor Classic não pode ser exposto ao usuário.');
  await page.locator('[data-ui-mode="classic"]').evaluate(button => button.click());
  await page.locator('html[data-ui="classic"]').waitFor({ state: 'attached' });

  const baseline = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const app = window.Atrium.App;
    globalThis.__uiV2Identity = { store, app, timer: app.autoSyncTimer };
    globalThis.__uiV2MutationSpies = { save: 0, flush: 0 };
    const nativeSave = store.save.bind(store);
    const nativeFlush = store.flush.bind(store);
    store.save = (...args) => { globalThis.__uiV2MutationSpies.save++; return nativeSave(...args); };
    store.flush = (...args) => { globalThis.__uiV2MutationSpies.flush++; return nativeFlush(...args); };
    return {
      state: JSON.stringify(store.state),
      revision: store.revision,
      auditLength: store.state.audit.length,
      mutationRequests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: globalThis.__uiV2RuntimeProbe.intervals,
      listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
      ids: [...document.querySelectorAll('[id]')].map(element => element.id),
      storage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    };
  });

  await page.locator('[data-ui-mode="v2"]').evaluate(button => button.click());
  await page.locator('html[data-ui="v2"]').waitFor({ state: 'attached' });
  await page.locator('[data-ui-mode="classic"]').evaluate(button => button.click());
  await page.locator('html[data-ui="classic"]').waitFor({ state: 'attached' });
  await page.locator('[data-ui-mode="v2"]').evaluate(button => button.click());
  await page.locator('html[data-ui="v2"]').waitFor({ state: 'attached' });

  const result = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const app = window.Atrium.App;
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return {
      state: JSON.stringify(store.state),
      revision: store.revision,
      auditLength: store.state.audit.length,
      mutationRequests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: globalThis.__uiV2RuntimeProbe.intervals,
      listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
      spy: globalThis.__uiV2MutationSpies,
      sameStore: store === globalThis.__uiV2Identity.store,
      sameApp: app === globalThis.__uiV2Identity.app,
      sameTimer: app.autoSyncTimer === globalThis.__uiV2Identity.timer,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      mode: document.documentElement.dataset.ui,
      savedMode: localStorage.getItem('atrium:ui:mode'),
      storage: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
    };
  });

  assert.equal(result.mode, 'v2', 'O modo Nova deve ficar ativo após a alternância final.');
  assert.equal(result.savedMode, 'v2', 'A preferência deve existir somente no storage local aprovado.');
  assert.equal(result.state, baseline.state, 'Alternar a apresentação não pode alterar o Store.');
  assert.equal(result.revision, baseline.revision, 'Alternar a apresentação não pode alterar revision.');
  assert.equal(result.auditLength, baseline.auditLength, 'Alternar a apresentação não pode gerar auditoria.');
  assert.equal(result.spy.save, 0, 'Alternar a apresentação não pode chamar Store.save().');
  assert.equal(result.spy.flush, 0, 'Alternar a apresentação não pode chamar Store.flush().');
  assert.equal(result.mutationRequests, baseline.mutationRequests, 'Alternar a apresentação não pode criar request mutável.');
  assert.equal(result.intervals, baseline.intervals, 'Alternar a apresentação não pode criar timer periódico.');
  assert.deepEqual(result.listeners, baseline.listeners, 'Alternar a apresentação não pode adicionar listeners persistentes.');
  assert.equal(result.sameStore, true, 'A V2 deve manter a mesma instância do Store.');
  assert.equal(result.sameApp, true, 'A V2 deve manter a mesma instância do App.');
  assert.equal(result.sameTimer, true, 'A V2 deve manter o mesmo timer de sincronização.');
  assert.deepEqual(result.duplicateIds, [], 'A reorganização do shell não pode duplicar IDs.');
  const storageChanges = new Set([...Object.keys(baseline.storage), ...Object.keys(result.storage)]);
  const changedKeys = [...storageChanges].filter(key => baseline.storage[key] !== result.storage[key]);
  assert.deepEqual(changedKeys, ['atrium:ui:mode'], 'Somente a preferência local da apresentação pode mudar.');
  assert.deepEqual(pageErrors, [], `A alternância gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Contrato UI mode aprovado: Store/revision/save/flush/network/App/timer/listeners/IDs preservados.');
} finally {
  await context.close();
  await session.stop();
}
