import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveUiMode } from '../js/views/ui-v2/mode.js';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexSource = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const portalSource = await readFile(path.join(ROOT, 'js/portal.js'), 'utf8');
const uiV2Directory = path.join(ROOT, 'js/views/ui-v2');
const uiV2Files = (await readdir(uiV2Directory)).filter(file => file.endsWith('.js'));

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINAL PARITY CERTIFICATION');
console.log('===============================================================\n');

const expectedViews = [...UI_V2_CANONICAL_VIEWS].sort();
const navigationViews = [...indexSource.matchAll(/class="nav-item(?: active)?"[^>]*data-view="([^"]+)"/g)].map(match => match[1]).sort();
const declaredViews = [...indexSource.matchAll(/id="view-([^"]+)"/g)].map(match => match[1]).sort();
assert.deepEqual(navigationViews, expectedViews, 'A navegação deve listar exatamente as 17 views canônicas uma vez.');
assert.deepEqual(declaredViews, expectedViews, 'O DOM deve declarar exatamente as 17 views canônicas uma vez.');
assert.equal((portalSource.match(/const App\s*=\s*\{/g) || []).length, 1, 'Deve existir um único App canônico.');
assert.equal((portalSource.match(/import\s*\{[\s\S]*?\bStore\b[\s\S]*?\}\s*from '\.\/core\/store\.js';/g) || []).length, 1, 'O Portal deve importar uma única autoridade de Store.');
assert.doesNotMatch(portalSource, /create[A-Za-z]+V2Feature\s*\(/, 'Não pode existir feature funcional paralela V2.');

for (const file of uiV2Files) {
  const source = await readFile(path.join(uiV2Directory, file), 'utf8');
  assert.doesNotMatch(source, /(?:^|\n)\s*import[^\n]*core\/store|\bStore\.(?:state|save|flush|upsert|remove)|\bsecureFetch\b|\bfetch\s*\(|\bXMLHttpRequest\b/, `${file} não pode assumir autoridade funcional.`);
  if (!['mode.js', 'preference-init.js'].includes(file)) {
    assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b/, `${file} não pode criar persistência de apresentação.`);
  }
}

const storageFor = value => ({ getItem: () => value });
assert.equal(resolveUiMode(storageFor(null)), 'v2');
assert.equal(resolveUiMode(storageFor('classic')), 'classic');
assert.equal(resolveUiMode(storageFor('v2')), 'v2');
assert.equal(resolveUiMode({ getItem() { throw new Error('storage sintético indisponível'); } }), 'v2');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });

    for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    await page.locator('#systemStatusBar[data-status="saved"], #systemStatusBar[data-status="ready"]').waitFor();

    const baseline = await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      globalThis.__finalParityIdentity = { App, Store, timer: App.autoSyncTimer };
      globalThis.__finalParitySpies = { save: 0, flush: 0 };
      const nativeSave = Store.save.bind(Store);
      const nativeFlush = Store.flush.bind(Store);
      Store.save = (...args) => { globalThis.__finalParitySpies.save++; return nativeSave(...args); };
      Store.flush = (...args) => { globalThis.__finalParitySpies.flush++; return nativeFlush(...args); };
      return {
        state: JSON.stringify(Store.state), revision: Store.revision,
        audit: Store.state.audit.length,
        requests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
        intervals: globalThis.__uiV2RuntimeProbe.intervals,
        listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners)
      };
    });

    for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    await switchUiV2View(page, 'configuration');
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.locator('[data-ui-mode="classic"]').evaluate(button => button.click());
      await page.locator('html[data-ui="classic"]').waitFor({ state: 'attached' });
      await page.locator('[data-ui-mode="v2"]').evaluate(button => button.click());
      await page.locator('html[data-ui="v2"]').waitFor({ state: 'attached' });
    }

    const result = await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      return {
        state: JSON.stringify(Store.state), revision: Store.revision,
        audit: Store.state.audit.length,
        requests: globalThis.__uiV2RuntimeProbe.mutationRequests.length,
        intervals: globalThis.__uiV2RuntimeProbe.intervals,
        listeners: structuredClone(globalThis.__uiV2RuntimeProbe.listeners),
        spies: structuredClone(globalThis.__finalParitySpies),
        sameApp: App === globalThis.__finalParityIdentity.App,
        sameStore: Store === globalThis.__finalParityIdentity.Store,
        sameTimer: App.autoSyncTimer === globalThis.__finalParityIdentity.timer,
        mode: document.documentElement.dataset.ui,
        savedMode: localStorage.getItem('atrium:ui:mode')
      };
    });
    const layout = await collectUiV2LayoutEvidence(page);

    assert.equal(result.state, baseline.state, 'Navegação e troca de modo não podem alterar o estado.');
    assert.equal(result.revision, baseline.revision, 'Navegação e troca de modo não podem alterar revision.');
    assert.equal(result.audit, baseline.audit, 'Navegação e troca de modo não podem auditar.');
    assert.deepEqual(result.spies, { save: 0, flush: 0 });
    assert.equal(result.requests, baseline.requests, 'A apresentação não pode criar requests mutáveis.');
    assert.equal(result.intervals, baseline.intervals, 'A apresentação não pode criar timers.');
    assert.deepEqual(result.listeners, baseline.listeners, 'A apresentação não pode duplicar listeners persistentes.');
    assert.equal(result.sameApp, true);
    assert.equal(result.sameStore, true);
    assert.equal(result.sameTimer, true);
    assert.equal(result.mode, 'v2');
    assert.equal(result.savedMode, 'v2');
    assert.equal(layout.navItems, 17);
    assert.equal(layout.navGroups, 6);
    assert.deepEqual(layout.duplicateIds, []);
    assert.deepEqual(layout.visibleOverlays, []);
    assert.equal(layout.activeViews.length, 1);
    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`);

    console.log('✓ 17/17 views, 1 App, 1 Store, 1 árvore operacional e Classic fallback preservados.');
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}
