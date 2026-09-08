import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { startUiV2Session, prepareUiV2Page } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(async () => {
    const { Store, App } = window.Atrium;
    Store.state.contacts.push(
      { id: 'publication-contact-linked', name: 'Cliente Publicação Contextual', contactRole: 'cliente', city: 'Cidade Sintética' },
      { id: 'publication-contact-other', name: 'Cliente Alternativo Contextual', contactRole: 'cliente', email: 'alternativo@example.test' }
    );
    Store.state.processes.push({
      id: 'publication-process-linked',
      number: '5000000-00.2026.8.21.0001',
      client: 'Cliente Publicação Contextual',
      contactId: 'publication-contact-linked',
      actionType: 'Ação Contextual Sintética',
      court: 'Câmara Contextual Sintética',
      monitoring: 'active'
    });
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    App.openIntimationModal();
  });

  const processInput = page.locator('#field-process');
  const clientInput = page.locator('#field-client');
  assert.equal(await processInput.getAttribute('role'), 'combobox');
  assert.equal(await clientInput.getAttribute('role'), 'combobox');

  await processInput.fill('Câmara Contextual');
  await page.locator('#field-process-listbox:not(.hidden)').waitFor();
  assert.equal(await page.locator('#field-process-listbox [data-combobox-option]:visible').count(), 1);
  await processInput.press('Enter');
  assert.equal(await processInput.inputValue(), '5000000-00.2026.8.21.0001');
  assert.equal(await page.locator('#modalForm [name="processId"]').inputValue(), 'publication-process-linked');
  assert.equal(await clientInput.inputValue(), 'Cliente Publicação Contextual');
  assert.equal(await page.locator('#modalForm [name="contactId"]').inputValue(), 'publication-contact-linked');
  assert.equal(await page.locator('#field-court').inputValue(), 'Câmara Contextual Sintética');

  await clientInput.fill('Alternativo Contextual');
  await clientInput.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await clientInput.inputValue(), 'Cliente Alternativo Contextual');
  assert.equal(await page.locator('#modalForm [name="contactId"]').inputValue(), 'publication-contact-other');

  await page.locator('#field-title').fill('Intimação contextual sintética');
  await page.locator('#field-text').fill('Conteúdo sintético para validar vínculos canônicos.');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForFunction(() => window.Atrium?.Store?.state?.intimations?.some(item => item.title === 'Intimação contextual sintética'));
  const saved = await page.evaluate(() => window.Atrium.Store.state.intimations.find(item => item.title === 'Intimação contextual sintética'));
  assert.equal(saved.processId, 'publication-process-linked');
  assert.equal(saved.process, '5000000-00.2026.8.21.0001');
  assert.equal(saved.contactId, 'publication-contact-other');
  assert.equal(saved.client, 'Cliente Alternativo Contextual');
  assert.equal(saved.court, 'Câmara Contextual Sintética');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Publication process/client contextual search, autofill, canonical links and backend reload');
} finally {
  await session.stop();
}
