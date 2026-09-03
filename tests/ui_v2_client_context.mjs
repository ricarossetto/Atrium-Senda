import assert from 'node:assert/strict';
import { prepareUiV2ContactsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CLIENT 360 E NAVEGAÇÃO RELACIONAL');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await prepareUiV2ContactsFixture(page);
  const before = await page.evaluate(() => JSON.stringify({
    contacts: window.Atrium.Store.state.contacts,
    processes: window.Atrium.Store.state.processes,
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations,
    agenda: window.Atrium.Store.state.agenda,
    documents: window.Atrium.Store.state.documents,
    financial: window.Atrium.Store.state.financial
  }));

  const openClient = async () => {
    await page.evaluate(() => {
      const input = document.getElementById('contactSearch');
      if (input) input.value = '';
      window.Atrium.App.switchView('contacts');
      window.Atrium.App.renderContacts('');
    });
    await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
    await page.locator('#contactLegalSummaryHeading').waitFor();
  };

  await openClient();
  const summary = await page.locator('.contact-legal-summary').textContent();
  for (const expected of ['Visão 360', 'Contexto jurídico', '2Processos', '1Providências', '1Publicações', '1Documentos', '1Agenda', '2Financeiro']) {
    assert.ok(summary.replace(/\s+/g, '').includes(expected.replace(/\s+/g, '')), `Resumo 360 deve exibir ${expected}.`);
  }
  assert.match(summary, /Somente vínculos canônicos ou relações processuais registradas/);
  assert.equal(await page.locator('[data-contact-process]').count(), 2);
  assert.equal(await page.locator('[data-contact-process="ui-v2-contact-process"]').textContent().then(text => text.includes('Cliente canônico')), true);
  assert.equal(await page.locator('[data-contact-process="ui-v2-contact-related-process"]').textContent().then(text => text.includes('Relação registrada')), true);
  assert.doesNotMatch(await page.locator('#contactInspector').textContent(), /Processo sem vínculo explícito/, 'Nome coincidente não pode entrar no CRM derivado.');
  assert.match(await page.locator('#contactInspector').textContent(), /Linha do tempo consolidada/);
  assert.match(await page.locator('#contactInspector').textContent(), /Movimentação sintética do processo vinculado/);

  await page.locator('[data-contact-process="ui-v2-contact-process"]').click();
  await page.locator('#view-processes.active').waitFor();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  assert.match(await page.locator('#processInspectorContent').textContent(), /5000000-00\.2026\.8\.21\.0001/);
  await page.locator('#processInspectorClose').click();

  await openClient();
  await page.locator('[data-contact-task="ui-v2-contact-task"]').click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  assert.match(await page.locator('#modalTitle').textContent(), /Editar tarefa/);
  await page.locator('#modalCancel').click();

  await openClient();
  await page.locator('[data-contact-agenda="ui-v2-contact-appointment"]').click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  assert.match(await page.locator('#modalTitle').textContent(), /Detalhes do compromisso/);
  await page.locator('#modalCancel').click();

  await openClient();
  await page.locator('[data-contact-context-event]', { hasText: 'Publicação sintética vinculada' }).click();
  await page.locator('#view-inbox.active').waitFor();
  await page.locator('#intimationDetail:not(.hidden)').waitFor();
  assert.match(await page.locator('#intimationDetail').textContent(), /Publicação sintética vinculada/);

  await openClient();
  await page.locator('[data-contact-document="ui-v2-contact-document"]').click();
  await page.locator('#view-documents.active').waitFor();
  await page.locator('[data-document-id="ui-v2-contact-document"].is-search-match').waitFor();

  await openClient();
  await page.locator('[data-contact-context-event]', { hasText: 'Dados financeiros registrados' }).click();
  await page.locator('#view-financial.active').waitFor();
  assert.equal(await page.locator('#financialSearch').inputValue(), '5000000-00.2026.8.21.0001');

  const after = await page.evaluate(() => JSON.stringify({
    contacts: window.Atrium.Store.state.contacts,
    processes: window.Atrium.Store.state.processes,
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations,
    agenda: window.Atrium.Store.state.agenda,
    documents: window.Atrium.Store.state.documents,
    financial: window.Atrium.Store.state.financial
  }));
  assert.equal(after, before, 'Consulta e navegação do Client 360 não podem alterar dados canônicos.');
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Client 360 integra contexto jurídico e navegação sem estado paralelo ou inferência por nome.');
