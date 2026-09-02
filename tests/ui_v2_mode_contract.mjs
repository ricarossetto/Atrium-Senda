import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveUiMode } from '../js/views/ui-v2/mode.js';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const preferenceInitSource = await readFile(new URL('../js/views/ui-v2/preference-init.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const resolvePrepaint = storage => {
  const documentElement = { dataset: {} };
  vm.runInNewContext(preferenceInitSource, { localStorage: storage, document: { documentElement } });
  return documentElement.dataset.ui;
};
const storageFor = value => ({ getItem: () => value });
const throwingStorage = { getItem() { throw new Error('Storage indisponível'); } };

for (const storage of [storageFor(null), storageFor('v2'), storageFor('classic'), throwingStorage]) {
  assert.equal(resolveUiMode(storage), 'v2', 'ATRIUM 2.0 deve resolver sempre para a interface V2.');
  assert.equal(resolvePrepaint(storage), 'v2', 'O prepaint deve impedir qualquer flash ou retorno ao Classic.');
}
assert.doesNotMatch(indexSource, /id="uiModeControl"|data-ui-mode=/, 'A versão estável não pode expor seletor ou rota DOM para o Classic.');

const session = await startUiV2Session();
const context = await session.createContext();

try {
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  await page.locator('#systemStatusBar[data-status="saved"], #systemStatusBar[data-status="ready"]').waitFor();

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
      state: JSON.stringify(store.state), revision: store.revision, auditLength: store.state.audit.length,
      mutationRequests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: globalThis.__uiV2RuntimeProbe.intervals,
      listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners)
    };
  });

  for (const view of ['configuration', 'dashboard', 'processes', 'inbox', 'configuration']) {
    await page.evaluate(target => window.Atrium.App.switchView(target), view);
    await page.locator(`#view-${view}.active`).waitFor();
  }

  const result = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const app = window.Atrium.App;
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return {
      state: JSON.stringify(store.state), revision: store.revision, auditLength: store.state.audit.length,
      mutationRequests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: globalThis.__uiV2RuntimeProbe.intervals,
      listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
      spy: globalThis.__uiV2MutationSpies,
      sameStore: store === globalThis.__uiV2Identity.store,
      sameApp: app === globalThis.__uiV2Identity.app,
      sameTimer: app.autoSyncTimer === globalThis.__uiV2Identity.timer,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      mode: document.documentElement.dataset.ui,
      modeControls: document.querySelectorAll('#uiModeControl, [data-ui-mode]').length
    };
  });

  assert.equal(result.mode, 'v2');
  assert.equal(result.modeControls, 0);
  assert.equal(result.state, baseline.state, 'Navegar na V2 não pode alterar o Store.');
  assert.equal(result.revision, baseline.revision);
  assert.equal(result.auditLength, baseline.auditLength);
  assert.deepEqual(result.spy, { save: 0, flush: 0 });
  assert.equal(result.mutationRequests, baseline.mutationRequests);
  assert.equal(result.intervals, baseline.intervals);
  assert.deepEqual(result.listeners, baseline.listeners);
  assert.equal(result.sameStore, true);
  assert.equal(result.sameApp, true);
  assert.equal(result.sameTimer, true);
  assert.deepEqual(result.duplicateIds, []);
  assert.deepEqual(pageErrors, [], `A V2 exclusiva gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Contrato estável aprovado: V2 exclusiva, sem seletor Classic e com Store/App/runtime preservados.');
} finally {
  await context.close();
  await session.stop();
}
