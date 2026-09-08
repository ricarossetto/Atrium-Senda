import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { CNJ, snapshot } from './fixtures/omni-network.mjs';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
await mkdir('artifacts/omni-ui', { recursive: true });
try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await session.createContext({ viewport: { width, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    let releaseSync;
    const gate = new Promise(resolve => { releaseSync = resolve; });
    await page.route('**/api/sync', async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ events: [], tasks: [], intimations: [], processes: [], contacts: [], sources: [], imported: 0 }) });
    });
    await page.evaluate(() => { window.omniSyncPromise = window.Atrium.App.syncAll({ silent: true }); });
    await page.locator('#syncButton[disabled][aria-busy="true"]').waitFor();
    assert.equal(await page.locator('#syncButton svg').first().evaluate(el => getComputedStyle(el).animationName), 'v2-sync-spin');
    releaseSync();
    assert.equal(await page.evaluate(() => window.omniSyncPromise), true);
    assert.equal(await page.locator('#syncButton').isDisabled(), false);
    await page.unroute('**/api/sync');
    await page.evaluate(({ number, judicial }) => {
      const { Store, App } = window.Atrium;
      Store.state.processes = [{ id: 'omni-ui', number, client: 'Cliente Sintético', contactId: 'omni-contact',
        court: 'TJRS', judicialSnapshot: { ...judicial, source: 'TJRS_PUBLIC', court: 'TJRS', syncedAt: '2099-01-02', movementsCount: 1 } },
        { id: 'omni-empty', number: '', client: 'Registro Sintético sem consulta' }];
      Store.state.contacts = [{ id: 'omni-contact', name: 'Cliente Sintético', contactRole: 'cliente' }];
      Store.state.tasks = [{ id: 'omni-task', title: 'Tarefa Sintética', status: 'triagem' }];
      App.renderAll();
    }, { number: CNJ, judicial: snapshot() });
    await page.evaluate(async () => {
      const { createSystemStatusBar } = await import('/js/views/ui-v2/system-status.js');
      window.omniStatus = createSystemStatusBar();
      window.omniStatus.setState('syncing', 'Consultando fontes oficiais: descrição sintética longa para verificar o comportamento em telas compactas.', 63);
    });
    assert.equal(await page.locator('#systemStatusProgressTrack').getAttribute('aria-valuenow'), '63');
    const statusLayout = await page.locator('#systemStatusBar').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth }));
    assert.ok(statusLayout.scroll <= statusLayout.width + 1, JSON.stringify(statusLayout));
    await page.screenshot({ path: `artifacts/omni-ui/status-${theme}-${width}.png` });
    await page.evaluate(() => window.omniStatus.setState('saved'));
    await page.locator('#systemStatusBar.is-transient-hidden').waitFor({ state: 'attached' });
    await switchUiV2View(page, 'processes');
    const before = await page.locator('.topbar').boundingBox();
    await page.locator('[data-process-id="omni-ui"]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await page.locator('#processJudicialHeading').scrollIntoViewIfNeeded();
    assert.match(await page.locator('#processInspectorContent').textContent(), /Parte Adversa Sintética/);
    const inspector = await page.locator('#processInspectorContent').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth }));
    assert.ok(inspector.scroll <= inspector.width + 1, JSON.stringify(inspector));
    await page.screenshot({ path: `artifacts/omni-ui/inspector-${theme}-${width}.png` });
    const during = await page.locator('.topbar').boundingBox();
    assert.ok(Math.abs(before.x - during.x) <= 1 && Math.abs(before.width - during.width) <= 1, 'Opening drawer must not shift the shell');
    await page.locator('#processInspectorClose').click();
    await page.locator('[data-process-id="omni-empty"]').click();
    assert.match(await page.locator('#processInspectorContent').textContent(), /Nenhuma consulta judicial incorporada/);
    await page.locator('#processInspectorClose').click();
    await page.evaluate(() => window.Atrium.App.handleGlobalSearchSelection({ target: 'task', id: 'omni-task' }));
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    const taskShell = await page.locator('.topbar').boundingBox();
    assert.ok(Math.abs(before.width - taskShell.width) <= 1, 'Task drawer must not shift shell');
    await page.evaluate(() => window.Atrium.App.closeModal());
    await page.evaluate(() => window.Atrium.App.handleGlobalSearchSelection({ target: 'contact', id: 'omni-contact' }));
    await page.locator('#contactInspector.is-open').waitFor();
    await page.locator('[data-contact-edit]').click();
    await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
    await page.evaluate(() => window.Atrium.App.closeModal());
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log(`PASS Omni UI ${theme} ${width}px: status, inspector, task/contact drawers`);
  }
} finally { await session.stop(); }
