import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('\nATRIUM — NAVEGAÇÃO CANÔNICA ENTRE MÓDULOS');
const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await page.evaluate(() => {
    const store = window.Atrium.Store;
    store.state.contacts = [{ id: 'nav-contact', name: 'Cliente Navegação Sintética', contactRole: 'cliente', city: 'Ijuí', state: 'RS' }];
    store.state.processes = [{ id: 'nav-process', contactId: 'nav-contact', number: '5000000-00.2026.4.04.0000', client: 'Cliente Navegação Sintética', court: 'TRF Sintético', feeType: 'fixo', feeAmount: 1200, feeStatus: 'pendente', notes: 'Contexto processual sintético', movements: [{ date: '2026-08-20', description: 'Movimento sintético preservado' }] }];
    store.state.tasks = [{ id: 'nav-task', processId: 'nav-process', process: '5000000-00.2026.4.04.0000', intimationId: 'nav-publication', title: 'Tarefa Navegação Sintética', status: 'todo', deadline: '2020-01-01', responsible: 'Equipe' }];
    store.state.intimations = [{ id: 'nav-publication', processId: 'nav-process', contactId: 'nav-contact', process: '5000000-00.2026.4.04.0000', client: 'Cliente Navegação Sintética', title: 'Publicação Navegação Sintética', text: 'Conteúdo sintético sem prazo inferido.', court: 'TRF Sintético', publishedAt: '2026-09-01', treatmentStatus: 'untreated', unread: true }];
    store.state.documents = [{ id: 'nav-document', name: 'Documento Navegação Sintética.pdf', ownerType: 'process', ownerId: 'nav-process', documentType: 'Petição', documentDate: '2026-09-01', size: 512, contentType: 'application/pdf' }];
    store.state.agenda = [{ id: 'nav-agenda', processId: 'nav-process', process: '5000000-00.2026.4.04.0000', title: 'Compromisso Navegação Sintética', date: '2026-09-10', time: '14:00' }];
    window.Atrium.App.renderAll();
  });


  await switchUiV2View(page, 'contacts');
  await page.locator('[data-contact-id=nav-contact]').click();
  await page.locator('[data-contact-process="nav-process"]').click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#view-contacts.active').count(), 1);
  assert.equal(await page.locator('#contactInspector.is-open').count(), 1);
  const nestedInspectorLayers = await page.evaluate(() => ({
    contact: Number.parseInt(getComputedStyle(document.getElementById('contactInspector')).zIndex, 10),
    process: Number.parseInt(getComputedStyle(document.getElementById('processInspectorBackdrop')).zIndex, 10),
    processAtPointer: document.elementFromPoint(innerWidth - 20, innerHeight / 2)?.closest('#processInspectorBackdrop')?.id
  }));
  assert.ok(nestedInspectorLayers.process > nestedInspectorLayers.contact);
  assert.equal(nestedInspectorLayers.processAtPointer, 'processInspectorBackdrop');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('[data-process-publication="nav-publication"]').click();
      await page.locator('#linkedPublicationReader[open]').waitFor();
      assert.equal(await page.locator('#view-contacts.active').count(), 1);
      assert.equal(await page.locator('#linkedPublicationReader article').textContent(), 'Conteúdo sintético sem prazo inferido.');
      assert.equal(await page.locator('#linkedPublicationReader').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      if (process.env.ATRIUM_CONTEXTUAL_SCREENSHOTS) await page.screenshot({ path: `artifacts/layout-review/contextual-${theme}-${width}.png` });
      await page.keyboard.press('Escape');
      await page.locator('#linkedPublicationReader').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#linkedPublicationReader').count(), 0);
      assert.equal(await page.locator('#processInspectorBackdrop:not(.hidden)').count(), 1);
    }
  }
  await page.locator('#processInspectorClose').click();
  assert.equal(await page.locator('#contactInspector.is-open').count(), 1);
  assert.equal(await page.locator('[data-contact-process="nav-process"]').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.intimations[0].treatmentStatus), 'untreated');
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.intimations[0].unread), true);
  assert.deepEqual(pageErrors, []);
  console.log('PASS contextual contact > process > publication, return focus, themes and mobile');
  await context.close();
} finally { await session.stop(); }
