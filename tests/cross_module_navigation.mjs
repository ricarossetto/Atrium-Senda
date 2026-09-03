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
    store.state.processes = [{ id: 'nav-process', contactId: 'nav-contact', number: '5000000-00.2026.4.04.0000', client: 'Cliente Navegação Sintética', court: 'TRF Sintético', movements: [{ date: '2026-08-20', description: 'Movimento sintético preservado' }] }];
    store.state.tasks = [{ id: 'nav-task', processId: 'nav-process', process: '5000000-00.2026.4.04.0000', title: 'Tarefa Navegação Sintética', status: 'todo', deadline: '2020-01-01', responsible: 'Equipe' }];
    store.state.intimations = [{ id: 'nav-publication', processId: 'nav-process', contactId: 'nav-contact', process: '5000000-00.2026.4.04.0000', client: 'Cliente Navegação Sintética', title: 'Publicação Navegação Sintética', text: 'Conteúdo sintético sem prazo inferido.', court: 'TRF Sintético', publishedAt: '2026-09-01', treatmentStatus: 'untreated', unread: true }];
    store.state.documents = [{ id: 'nav-document', name: 'Documento Navegação Sintética.pdf', ownerType: 'process', ownerId: 'nav-process', documentType: 'Petição', documentDate: '2026-09-01', size: 512, contentType: 'application/pdf' }];
    window.Atrium.App.renderAll();
  });

  await switchUiV2View(page, 'processes');
  await page.locator('[data-process-id="nav-process"]').click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('[data-process-client]').textContent(), 'Cliente Navegação Sintética');
  assert.equal(await page.locator('[data-process-task="nav-task"]').count(), 1);
  assert.equal(await page.locator('[data-process-publication="nav-publication"]').count(), 1);

  await page.locator('#processInspectorAssistant').click();
  await page.locator('#view-assistant.active').waitFor();
  assert.equal(await page.locator('#assistantContextSelect').inputValue(), 'process:nav-process');
  await switchUiV2View(page, 'processes');
  await page.locator('[data-process-id="nav-process"]').click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();

  await page.locator('[data-process-publication="nav-publication"]').click();
  await page.locator('#view-inbox.active.publication-detail-open').waitFor();
  assert.equal(await page.locator('[data-open-process-id="nav-process"]').count(), 1);
  assert.equal(await page.locator('[data-open-contact-id="nav-contact"]').count(), 1);

  await page.locator('[data-detail-action="assistant"]').click();
  await page.locator('#view-assistant.active').waitFor();
  assert.equal(await page.locator('#assistantContextSelect').inputValue(), 'intimation:nav-publication');
  await switchUiV2View(page, 'inbox');
  await page.evaluate(() => window.Atrium.App.selectIntimation('nav-publication'));
  await page.locator('#view-inbox.publication-detail-open').waitFor();

  await page.locator('[data-open-process-id="nav-process"]').click();
  await page.locator('#view-processes.active').waitFor();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#processInspectorTitle').textContent(), '5000000-00.2026.4.04.0000');
  await page.locator('#processInspectorClose').click();

  await switchUiV2View(page, 'inbox');
  await page.evaluate(() => window.Atrium.App.selectIntimation('nav-publication'));
  await page.locator('#view-inbox.publication-detail-open').waitFor();
  await page.locator('[data-open-contact-id="nav-contact"]').click();
  await page.locator('#view-contacts.active').waitFor();
  assert.equal(await page.locator('#contactInspector.is-open').count(), 1);
  assert.match(await page.locator('#contactInspector').textContent(), /Cliente Navegação Sintética/);
  await page.locator('[data-contact-assistant]').click();
  await page.locator('#view-assistant.active').waitFor();
  assert.equal(await page.locator('#assistantContextSelect').inputValue(), 'contact:nav-contact');
  await switchUiV2View(page, 'documents');
  await page.locator('[data-document-id="nav-document"] [data-document-action="assistant"]').click();
  await page.locator('#view-assistant.active').waitFor();
  assert.equal(await page.locator('#assistantContextSelect').inputValue(), 'document:nav-document');
  await switchUiV2View(page, 'contacts');
  await page.locator('[data-contact-id="nav-contact"]').click();
  await page.locator('[data-contact-inspector-close]').click();
  await switchUiV2View(page, 'dashboard');

  await page.locator('#notificationButton').click();
  await page.locator('#notificationPanel:not(.hidden)').waitFor();
  assert.equal(await page.locator('[data-notification-target="intimation"][data-notification-id="nav-publication"]').count(), 1);
  assert.equal(await page.locator('[data-notification-target="task"][data-notification-id="nav-task"]').count(), 1);
  await page.locator('[data-notification-target="task"][data-notification-id="nav-task"]').click();
  await page.locator('#view-kanban.active').waitFor();
  await page.locator('#modalBackdrop:not(.hidden) #modalForm').waitFor();
  assert.equal(await page.locator('#field-title').inputValue(), 'Tarefa Navegação Sintética');

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Processo, Publicação, Contato, Tarefa e Notificação abrem a entidade canônica exata.');
