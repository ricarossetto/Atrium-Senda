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
      {
        id: 'task-contact-linked',
        name: 'Cliente Tarefa Contextual',
        contactRole: 'cliente',
        document: 'DOCUMENTO-SINTETICO-TAREFA-001',
        city: 'Cidade Sintética'
      },
      {
        id: 'task-contact-other',
        name: 'Cliente Alternativo da Tarefa',
        contactRole: 'cliente',
        email: 'alternativo-tarefa@example.test'
      }
    );
    Store.state.processes.push({
      id: 'task-process-linked',
      number: '5000000-00.2026.8.21.0002',
      client: 'Cliente Tarefa Contextual',
      contactId: 'task-contact-linked',
      actionType: 'Ação Contextual da Tarefa',
      court: 'Tribunal Contextual Sintético'
    });
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    App.openTaskModal();
  });

  const processInput = page.locator('#field-process');
  const clientInput = page.locator('#field-client');
  assert.equal(await processInput.getAttribute('role'), 'combobox');
  assert.equal(await clientInput.getAttribute('role'), 'combobox');

  await processInput.fill('Tribunal Contextual');
  await page.locator('#field-process-listbox:not(.hidden)').waitFor();
  assert.equal(await page.locator('#field-process-listbox [data-combobox-option]:visible').count(), 1);
  await processInput.press('Enter');
  assert.equal(await processInput.inputValue(), '5000000-00.2026.8.21.0002');
  assert.equal(await page.locator('#modalForm [name="processId"]').inputValue(), 'task-process-linked');
  assert.equal(await clientInput.inputValue(), 'Cliente Tarefa Contextual');
  assert.equal(await page.locator('#modalForm [name="contactId"]').inputValue(), 'task-contact-linked');
  assert.equal(await page.locator('#field-actionType').inputValue(), 'Ação Contextual da Tarefa');

  await clientInput.fill('alternativo-tarefa@example.test');
  await clientInput.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await clientInput.inputValue(), 'Cliente Alternativo da Tarefa');
  assert.equal(await page.locator('#modalForm [name="contactId"]').inputValue(), 'task-contact-other');

  await page.locator('#field-title').fill('Tarefa contextual sintética');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForFunction(() => window.Atrium?.Store?.state?.tasks?.some(item => item.title === 'Tarefa contextual sintética'));
  const saved = await page.evaluate(() => window.Atrium.Store.state.tasks.find(item => item.title === 'Tarefa contextual sintética'));
  assert.equal(saved.processId, 'task-process-linked');
  assert.equal(saved.process, '5000000-00.2026.8.21.0002');
  assert.equal(saved.contactId, 'task-contact-other');
  assert.equal(saved.client, 'Cliente Alternativo da Tarefa');
  assert.equal(saved.actionType, 'Ação Contextual da Tarefa');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Task process/client contextual search, autofill, canonical links and backend reload');
} finally {
  await session.stop();
}
