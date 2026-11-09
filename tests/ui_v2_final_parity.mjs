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
  UI_V2_CANONICAL_VIEWS,
  UI_V2_PRIMARY_NAV_VIEWS
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
const expectedPrimaryNavigation = [...UI_V2_PRIMARY_NAV_VIEWS].sort();
const navigationViews = [...indexSource.matchAll(/class="nav-item(?: active)?"[^>]*data-view="([^"]+)"/g)].map(match => match[1]).sort();
const declaredViews = [...indexSource.matchAll(/id="view-([^"]+)"/g)].map(match => match[1]).sort();
assert.deepEqual(navigationViews, expectedPrimaryNavigation, 'A sidebar deve listar exatamente os destinos primários oficiais uma vez.');
assert.deepEqual(declaredViews, expectedViews, 'O DOM deve declarar exatamente as 18 views oficiais uma vez.');
assert.match(await readFile(path.join(ROOT, 'js/views/ui-v2/configuration-presenter.js'), 'utf8'), /dataset\.viewLink\s*=\s*'audit'/, 'Auditoria deve permanecer acessível por Configurações > Sistema.');
assert.equal((portalSource.match(/const App\s*=\s*\{/g) || []).length, 1, 'Deve existir um único App oficial.');
/* O import carrega `?v=` por contrato de cache (AGENTS §36); a asserção que importa é
 * "uma única autoridade de Store", não a ausência de query — a regex antiga exigia o
 * caminho sem `?v=` e ficou vermelha desde o rebump da 6.42.2. */
assert.equal((portalSource.match(/import\s*\{[\s\S]*?\bStore\b[\s\S]*?\}\s*from '\.\/core\/store\.js(?:\?v=[^']*)?';/g) || []).length, 1, 'O Portal deve importar uma única autoridade de Store.');
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
assert.equal(resolveUiMode(storageFor('classic')), 'v2');
assert.equal(resolveUiMode(storageFor('v2')), 'v2');
assert.equal(resolveUiMode({ getItem() { throw new Error('storage sintético indisponível'); } }), 'v2');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });

    for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    await page.locator('#systemStatusBar[data-status="saved"], #systemStatusBar[data-status="ready"]').waitFor({ state: 'attached' });

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
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const view of UI_V2_CANONICAL_VIEWS) await switchUiV2View(page, view);
    }
    await switchUiV2View(page, 'configuration');

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
        modeControls: document.querySelectorAll('#uiModeControl, [data-ui-mode]').length
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
    assert.equal(result.modeControls, 0);
    assert.equal(layout.navItems, UI_V2_PRIMARY_NAV_VIEWS.length);
    assert.equal(layout.navGroups, 6);
    assert.deepEqual(layout.duplicateIds, []);
    assert.deepEqual(layout.visibleOverlays, []);
    assert.equal(layout.activeViews.length, 1);

    for (const [link, view, parent] of [['monitoring', 'monitoring', 'integrations'], ['importer', 'importer', 'integrations'], ['audit', 'audit', 'configuration']]) {
      await switchUiV2View(page, parent);
      await page.locator(`#view-${parent} [data-view-link="${link}"]`).click();
      await page.locator(`#view-${view}.active`).waitFor();
      assert.equal(await page.locator(`.nav-item[data-view="${parent}"]`).evaluate(element => element.classList.contains('active')), true, `O card ${link} do hub deve manter ${parent} como destino pai ativo.`);
    }

    for (const [route, view, parent] of [['/sistema/monitoramento', 'monitoring', 'integrations'], ['/sistema/importador', 'importer', 'integrations'], ['/sistema/auditoria', 'audit', 'configuration']]) {
      await page.goto(`${session.server.baseUrl}${route}`);
      await page.locator(`#view-${view}.active`).waitFor();
      const hubNavigation = page.locator(`.nav-item[data-view="${parent}"]`);
      assert.equal(await hubNavigation.evaluate(element => element.classList.contains('active')), true, `${view} deve manter ${parent} como destino pai ativo.`);
      assert.equal(await hubNavigation.getAttribute('aria-current'), 'page', `${view} deve expor aria-current no destino pai.`);
      assert.equal(await page.locator('.nav-item.active').count(), 1, `${view} deve manter um único destino ativo na sidebar.`);
      assert.equal(await page.locator('.nav-item[data-view="monitoring"], .nav-item[data-view="importer"], [data-view="audit"]').count(), 0, `${view} não pode reintroduzir destinos diretos na sidebar.`);
    }

    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`);

    console.log(`✓ ${UI_V2_CANONICAL_VIEWS.length}/${UI_V2_CANONICAL_VIEWS.length} capacidades, ${UI_V2_PRIMARY_NAV_VIEWS.length}/${UI_V2_PRIMARY_NAV_VIEWS.length} destinos primários, 1 App, 1 Store e V2 exclusiva preservados.`);
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}
