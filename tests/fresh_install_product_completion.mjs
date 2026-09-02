import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\nATRIUM — FRESH INSTALL / PRIMEIRO DIA SINTÉTICO');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'first.day.admin', displayName: 'Administradora Primeiro Dia', email: 'first-day@example.test', password: 'Senha-Primeiro-Dia-Sintetica-2026!'
  });
  assert.equal(response.status, 200);
  const setup = await response.json();
  assert.ok(setup.manualSecret && setup.setupToken, 'Setup deve oferecer MFA TOTP sem persistir segredo no frontend jurídico.');
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const separator = cookie.indexOf('=');

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: server.baseUrl }]);
  await context.addInitScript(() => {
    localStorage.setItem('atrium:ui:mode', 'v2');
    localStorage.setItem('atrium_theme', 'light');
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.equal(await page.evaluate(() => window.Atrium.Store.stateStatus), 'NEW_INSTALL');

  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor({ timeout: 2500 });
  assert.match(await page.locator('.tour-slide.active').textContent(), /Atrium|escritório|trabalho/i);
  await page.locator('#tourSkipButton').click();
  await page.locator('#guidedTourBackdrop').waitFor({ state: 'hidden' });

  const emptyViews = [
    ['contacts', /Nenhum contato cadastrado/i],
    ['processes', /Nenhum processo cadastrado/i],
    ['leads', /Nenhum atendimento|Nenhuma oportunidade|Nenhum lead/i]
  ];
  for (const [view, expected] of emptyViews) {
    await page.evaluate(selected => window.Atrium.App.switchView(selected), view);
    await page.locator(`#view-${view}.active`).waitFor();
    assert.match(await page.locator(`#view-${view}`).textContent(), expected, `Estado vazio de ${view} deve orientar o primeiro uso.`);
  }

  await page.evaluate(() => window.Atrium.App.switchView('contacts'));
  await page.locator('#newContactButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  await page.locator('#field-name').fill('CLIENTE SINTÉTICA PRIMEIRO DIA');
  await page.locator('#field-document').fill('111.444.777-35');
  await page.locator('#field-email').fill('cliente.primeiro-dia@example.test');
  await page.locator('#field-city').fill('Cidade Sintética');
  await page.locator('#field-state').fill('RS');
  const saveResponse = page.waitForResponse(item => item.url().endsWith('/api/state') && item.request().method() === 'POST' && item.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await saveResponse;
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const createdId = await page.evaluate(() => window.Atrium.Store.state.contacts.find(item => item.name === 'CLIENTE SINTÉTICA PRIMEIRO DIA')?.id);
  assert.ok(createdId);

  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  await page.locator('#newProcessButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="process"]:not(.hidden)').waitFor();
  await page.locator('#field-number').fill('5000000-00.2026.8.21.0001');
  await page.locator('#field-client').fill('CLIENTE SINTÉTICA PRIMEIRO DIA');
  await page.locator('#field-court').fill('TRIBUNAL SINTÉTICO');
  await page.locator('#field-lastMovement').fill('Movimentação sintética sem inferência de prazo.');
  await submitModalAndWaitState(page);
  const processId = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.number === '5000000-00.2026.8.21.0001')?.id);
  assert.ok(processId);

  await page.evaluate(() => window.Atrium.App.switchView('kanban'));
  await page.locator('#newTaskButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
  await page.locator('#field-title').fill('TAREFA SINTÉTICA PRIMEIRO DIA');
  await page.locator('#field-process').fill('5000000-00.2026.8.21.0001');
  await page.locator('#field-client').fill('CLIENTE SINTÉTICA PRIMEIRO DIA');
  await page.locator('#field-description').fill('Conferência humana de fluxo sintético.');
  await submitModalAndWaitState(page);
  const taskId = await page.evaluate(() => window.Atrium.Store.state.tasks.find(item => item.title === 'TAREFA SINTÉTICA PRIMEIRO DIA')?.id);
  assert.ok(taskId);

  await page.evaluate(() => window.Atrium.App.switchView('leads'));
  await page.locator('#newLeadButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="lead"]:not(.hidden)').waitFor();
  await page.locator('#field-client').fill('CLIENTE SINTÉTICA');
  await page.locator('[data-combobox-option]', { hasText: 'CLIENTE SINTÉTICA PRIMEIRO DIA' }).click();
  await page.locator('#field-serviceType').fill('ATENDIMENTO JURÍDICO SINTÉTICO');
  await page.locator('#field-notes').fill('Relato sintético sem dados reais.');
  await submitModalAndWaitState(page);
  const leadId = await page.evaluate(() => window.Atrium.Store.state.leads.find(item => item.serviceType === 'ATENDIMENTO JURÍDICO SINTÉTICO')?.id);
  assert.ok(leadId);
  assert.equal(await page.evaluate(id => window.Atrium.Store.state.leads.find(item => item.id === id)?.contactId, leadId), createdId);

  await page.evaluate(() => window.Atrium.App.switchView('documents'));
  await page.locator('#btnOpenDocGenModal').click();
  await page.locator('#docGeneratorBackdrop:not(.hidden)').waitFor();
  await page.locator('#docGenContactSelect').selectOption(createdId);
  await page.locator('#docGenProcessSelect').selectOption(processId);
  assert.match(await page.locator('#docGenPreviewText').inputValue(), /CLIENTE SINTÉTICA PRIMEIRO DIA/);
  assert.match(await page.locator('#docGenPreviewText').inputValue(), /5000000-00\.2026\.8\.21\.0001/);
  await page.locator('#docGenClose').click();

  await page.evaluate(() => window.Atrium.App.switchView('financial'));
  await page.locator('#newFinancialEntryButton').click();
  await page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
  await page.locator('#finProcessSelect').selectOption(processId);
  await page.locator('#finTypeSelect').selectOption('fixo');
  await page.locator('#finGrossInput').fill('1500');
  const financialSave = page.waitForResponse(item => item.url().endsWith('/api/state') && item.request().method() === 'POST' && item.status() === 200);
  await page.locator('#financialEntryForm button[type="submit"]').click();
  await financialSave;
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id)?.feeAmount, processId), 1500);

  await page.evaluate(() => window.Atrium.App.switchView('configuration'));
  await page.locator('[data-config-section="taskDefinitions"]').click();
  await page.locator('#newConfigurationButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="configuration"]:not(.hidden)').waitFor();
  await page.locator('#field-name').fill('DEFINIÇÃO SINTÉTICA PRIMEIRO DIA');
  await page.locator('#field-points').fill('13');
  await submitModalAndWaitState(page);

  for (let reload = 1; reload <= 2; reload++) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#appShell:not(.hidden)').waitFor();
    const persisted = await page.evaluate(id => ({
      stateStatus: window.Atrium.Store.stateStatus,
      contact: window.Atrium.Store.state.contacts.find(item => item.id === id),
      revision: window.Atrium.Store.revision
    }), createdId);
    assert.equal(persisted.stateStatus, 'READY');
    assert.equal(persisted.contact.name, 'CLIENTE SINTÉTICA PRIMEIRO DIA');
    assert.equal(persisted.contact.email, 'cliente.primeiro-dia@example.test');
    assert.ok(persisted.revision, `Reload ${reload} deve manter revision canônica.`);
  }

  const safety = await page.evaluate(() => ({
    appRuntime: Number(Boolean(window.Atrium?.App)),
    storeRuntime: Number(Boolean(window.Atrium?.Store)),
    activeViews: document.querySelectorAll('.view.active').length,
    contacts: window.Atrium.Store.state.contacts.length,
    processes: window.Atrium.Store.state.processes.length,
    tasks: window.Atrium.Store.state.tasks.length,
    leads: window.Atrium.Store.state.leads.length,
    publications: window.Atrium.Store.state.intimations.length,
    feeAmount: window.Atrium.Store.state.processes[0]?.feeAmount,
    configuration: window.Atrium.Store.state.configuration.taskDefinitions.some(item => item.name === 'DEFINIÇÃO SINTÉTICA PRIMEIRO DIA')
  }));
  assert.deepEqual(safety, { appRuntime: 1, storeRuntime: 1, activeViews: 1, contacts: 1, processes: 1, tasks: 1, leads: 1, publications: 0, feeAmount: 1500, configuration: true });
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Conta, MFA, onboarding, empty states, primeiro CRUD, revision e dois reloads aprovados.');

async function submitModalAndWaitState(page) {
  const persisted = page.waitForResponse(item => item.url().endsWith('/api/state') && item.request().method() === 'POST' && item.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await persisted;
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
}
