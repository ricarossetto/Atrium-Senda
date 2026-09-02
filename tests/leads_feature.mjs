import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createLeadsFeature } from '../js/features/leads.js';
import { isoDate } from '../js/core/store.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE DE LEADS / CRM');
console.log('===============================================================\n');

const visualArtifactsDir = fileURLToPath(new URL('../artifacts/leads-feature/', import.meta.url));
fs.mkdirSync(visualArtifactsDir, { recursive: true });

const leadsSource = fs.readFileSync(new URL('../js/features/leads.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
for (const forbiddenImport of ['portal.js', 'contacts.js', 'processes.js', 'tasks.js', 'publications.js', 'agenda.js']) {
  assert.equal(leadsSource.includes(forbiddenImport), false, `Leads não pode importar ${forbiddenImport}.`);
}
for (const forbiddenConcern of ['state.contacts', "upsert('contacts'", 'state.processes', "upsert('processes'", 'renderFinancial', 'renderDashboard']) {
  assert.equal(leadsSource.includes(forbiddenConcern), false, `Leads não pode assumir ${forbiddenConcern}.`);
}
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(leadsSource.includes(forbiddenSideEffect), false, `Leads não pode introduzir ${forbiddenSideEffect}.`);
}
assert.match(leadsSource, /^import \{ Store, isoDate, uid \} from '\.\.\/core\/store\.js';/);
assert.match(portalSource, /import \{ createLeadsFeature \} from '\.\/features\/leads\.js';/);
assert.equal((portalSource.match(/createLeadsFeature\(/g) || []).length, 1, 'Portal deve instanciar Leads uma única vez.');
assert.equal(portalSource.includes('this.leadStatusFilter'), false, 'Portal não pode manter shadow state de filtro de Leads.');
assert.equal(portalSource.includes("Store.upsert('leads', record)"), false, 'Save canônico não pode permanecer no portal.');
assert.equal(portalSource.includes("const statusMap = {\n          novo: '<span class=\"lead-status-chip"), false, 'Render canônico não pode permanecer no portal.');
assert.match(portalSource, /renderLeads\(query = ''\) \{\s*return getLeadsFeature\(\)\.render\(query\);\s*\}/);
assert.match(portalSource, /openLeadModal\(defaults = \{\}\) \{\s*return getLeadsFeature\(\)\.openLeadModal\(defaults\);\s*\}/);
assert.match(portalSource, /modalMode\.mode === 'lead'\) \{\s*getLeadsFeature\(\)\.saveLead\(data, this\.modalMode\.defaults\);/);

const listenerMap = { newLeadButton: [], leadStatusFilters: [], leadSearch: [] };
const filterButtons = ['all', 'novo', 'em_analise', 'proposta', 'fechado', 'declinado'].map(value => ({
  dataset: { leadFilter: value },
  classList: { toggle() {} }
}));
const fakeElements = {
  newLeadButton: { addEventListener: (type, listener) => listenerMap.newLeadButton.push({ type, listener }) },
  leadStatusFilters: {
    addEventListener: (type, listener) => listenerMap.leadStatusFilters.push({ type, listener }),
    querySelectorAll: () => filterButtons
  },
  leadSearch: { addEventListener: (type, listener) => listenerMap.leadSearch.push({ type, listener }) }
};
const unitAudits = [];
const unitStore = {
  state: { leads: [] },
  upsert(collection, record) {
    const index = this.state[collection].findIndex(item => item.id === record.id);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].push(record);
  },
  audit(action, detail) { unitAudits.push({ action, detail }); }
};
let unitOpenCount = 0;
const unitRenders = [];
const unitFeature = createLeadsFeature({
  store: unitStore,
  documentRef: { getElementById: id => fakeElements[id] || null },
  normalizeText: value => String(value || '').toLowerCase(),
  escapeHtml: String,
  formatDate: String,
  formatCurrency: String,
  openModal: () => { unitOpenCount++; },
  getCurrentUserName: () => 'Advogada Unitária'
});
unitFeature.openLeadModal = () => { unitOpenCount++; };
unitFeature.render = query => { unitRenders.push(query); return []; };
assert.equal(unitFeature.statusFilter, 'all');
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(listenerMap.newLeadButton.length, 1);
assert.equal(listenerMap.leadStatusFilters.length, 1);
assert.equal(listenerMap.leadSearch.length, 1);
listenerMap.newLeadButton[0].listener();
listenerMap.leadSearch[0].listener({ target: { value: 'busca unitária' } });
for (const button of filterButtons) {
  listenerMap.leadStatusFilters[0].listener({ target: { closest: () => button } });
  assert.equal(unitFeature.statusFilter, button.dataset.leadFilter);
}
assert.equal(unitOpenCount, 1);
assert.deepEqual(unitRenders, ['busca unitária', undefined, undefined, undefined, undefined, undefined, undefined]);

const unitCreated = unitFeature.saveLead({ client: 'Lead Unitário', serviceType: 'Serviço Unitário', estimatedFee: '2500' });
assert.ok(unitCreated.id.startsWith('lead-'));
assert.match(unitCreated.registeredAt, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(unitCreated.estimatedFee, 2500);
assert.ok(Date.parse(unitCreated.updatedAt));
assert.deepEqual(unitAudits.at(-1), { action: 'Novo atendimento registrado', detail: 'Lead Unitário · Serviço Unitário' });
const unitEdited = unitFeature.saveLead({ client: 'Lead Unitário Editado', serviceType: 'Serviço Unitário', estimatedFee: '' }, unitCreated);
assert.equal(unitEdited.id, unitCreated.id);
assert.equal(unitEdited.registeredAt, unitCreated.registeredAt);
assert.equal(unitEdited.estimatedFee, null);
assert.deepEqual(unitAudits.at(-1), { action: 'Atendimento atualizado', detail: 'Lead Unitário Editado · Serviço Unitário' });

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/leads.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Leads deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/);

  const password = 'Senha-Teste-Leads-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_leads',
    displayName: 'Advogada Leads',
    email: 'leads@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  const cookiePair = response.headers.get('set-cookie').split(';')[0];
  const separator = cookiePair.indexOf('=');

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.addCookies([{
    name: cookiePair.slice(0, separator),
    value: cookiePair.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('atrium:ui:mode', 'classic');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const today = await page.evaluate(async todayValue => {
    // Exercita a compatibilidade interna legada; o bootstrap público continua exclusivamente V2.
    document.documentElement.dataset.ui = 'classic';
    const store = window.Atrium.Store;
    store.state.settings.demoMode = false;
    store.state.leads = [
      { id: 'lead-novo', client: 'Ágata Cliente Sintética', serviceType: 'Aposentadoria Sintética', status: 'novo', origin: 'Indicação de Cliente', estimatedFee: 5000, responsible: 'Advogada Alfa', notes: 'Relato secreto alfa', registeredAt: '2026-08-20' },
      { id: 'lead-analise', client: 'Bruna Análise Sintética', serviceType: 'Revisão Documental', status: 'em_analise', origin: 'Google / Site', estimatedFee: null, responsible: 'Advogada Beta', registeredAt: '2026-08-21' },
      { id: 'lead-proposta', client: 'Caio Proposta Sintético', serviceType: 'Benefício Previdenciário', status: 'proposta', origin: 'Instagram / Redes Sociais', estimatedFee: 7500, responsible: 'Advogada Gama', registeredAt: '2026-08-22' },
      { id: 'lead-fechado', client: 'Dora Fechada Sintética', serviceType: 'Contrato Fechado', status: 'fechado', origin: 'Parceiro / Correspondente', estimatedFee: 9000, responsible: 'Advogada Delta', registeredAt: '2026-08-23' },
      { id: 'lead-declinado', client: 'Eva Declinada Sintética', serviceType: 'Consulta Inviável', status: 'declinado', origin: 'Sindicato / Associação', estimatedFee: null, responsible: 'Advogada Épsilon', registeredAt: '2026-08-24' }
    ];
    store.state.contacts = [{ id: 'contact-isolation', name: 'Contato Sintético Intacto', document: '000.000.000-90', source: 'Fixture' }];
    store.state.processes = [{ id: 'process-isolation', number: '0000000-00.2026.8.21.0000', client: 'Processo Sintético Intacto', feeAmount: 1234, feeType: 'fixo' }];
    store.state.audit = [];
    window.portalApp.renderAll();
    await store.flush();
    return todayValue;
  }, isoDate());

  const isolationBefore = await page.evaluate(() => ({
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    processes: JSON.stringify(window.Atrium.Store.state.processes)
  }));

  await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
  assert.equal(await page.locator('#widgetActiveLeads').textContent(), '3', 'Dashboard deve contar apenas novo, em análise e proposta.');

  await page.evaluate(() => window.Atrium.App.switchView('leads'));
  await page.locator('#view-leads.active').waitFor();
  assert.equal(await page.locator('#leadCount').textContent(), '5 atendimentos');
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(visualArtifactsDir, 'leads-desktop-dark.png'), fullPage: true });
  await page.click('#themeToggleButton');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.screenshot({ path: path.join(visualArtifactsDir, 'leads-desktop-light.png'), fullPage: true });
  await page.click('#themeToggleButton');
  assert.equal(await page.locator('html').getAttribute('data-theme'), null);
  await page.waitForFunction(() => document.querySelectorAll('#toastRegion .toast').length === 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#leadStatusFilters').isVisible(), true);
  assert.equal(await page.locator('#leadSearch').isVisible(), true);
  assert.equal(await page.locator('#leadTable').isVisible(), true);
  await page.screenshot({ path: path.join(visualArtifactsDir, 'leads-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual(await page.locator('#leadStatusFilters button').evaluateAll(buttons => buttons.map(button => [button.dataset.leadFilter, button.textContent.trim()])), [
    ['all', 'Todos'], ['novo', 'Novos'], ['em_analise', 'Em Análise'], ['proposta', 'Proposta Enviada'], ['fechado', 'Fechados'], ['declinado', 'Declinados']
  ]);

  const novoRow = page.locator('#leadTableBody [data-lead-id="lead-novo"]');
  const novoText = await novoRow.textContent();
  for (const expected of ['Ágata Cliente Sintética', 'Aposentadoria Sintética', 'Indicação de Cliente', '5.000,00', 'Advogada Alfa', '20/08/2026', 'Novo']) {
    assert.ok(novoText.includes(expected), `Tabela deve preservar: ${expected}`);
  }
  assert.equal(await novoRow.locator('.lead-status-chip.novo').textContent(), 'Novo');
  assert.ok((await page.locator('#leadTableBody [data-lead-id="lead-analise"]').textContent()).includes('A definir'));
  await page.evaluate(() => {
    window.Atrium.Store.state.leads.push({ id: 'lead-fallback', status: 'status_desconhecido' });
    window.portalApp.renderLeads();
  });
  const fallbackText = await page.locator('#leadTableBody [data-lead-id="lead-fallback"]').textContent();
  for (const expected of ['Interessado', 'Consulta Inicial', 'Direto', 'A definir', 'Advogado(a)', 'Novo']) {
    assert.ok(fallbackText.includes(expected), `Fallback histórico deve preservar: ${expected}`);
  }
  assert.equal(await page.locator('#leadTableBody [data-lead-id="lead-fallback"] .lead-status-chip.novo').textContent(), 'Novo');
  await page.evaluate(() => {
    window.Atrium.Store.state.leads = window.Atrium.Store.state.leads.filter(item => item.id !== 'lead-fallback');
    window.portalApp.renderLeads();
  });
  const statusExpectations = { novo: 'Novo', em_analise: 'Em Análise', proposta: 'Proposta Enviada', fechado: 'Fechado', declinado: 'Declinado' };
  for (const [status, label] of Object.entries(statusExpectations)) {
    const button = page.locator(`#leadStatusFilters [data-lead-filter="${status}"]`);
    await button.click();
    assert.equal(await button.evaluate(element => element.classList.contains('active')), true);
    assert.equal(await page.locator('#leadStatusFilters button.active').count(), 1);
    assert.equal(await page.locator('#leadTableBody [data-lead-id]').count(), 1);
    assert.equal(await page.locator('#leadCount').textContent(), '1 atendimentos');
    assert.equal(await page.locator(`#leadTableBody .lead-status-chip.${status}`).textContent(), label);
  }
  await page.locator('#leadStatusFilters [data-lead-filter="all"]').click();

  const searchCases = [
    ['Agata Cliente Sintetica', 'lead-novo'],
    ['Aposentadoria Sintética', 'lead-novo'],
    ['Google / Site', 'lead-analise'],
    ['Advogada Gama', 'lead-proposta']
  ];
  for (const [query, id] of searchCases) {
    await page.locator('#leadSearch').fill(query);
    await page.locator(`#leadTableBody [data-lead-id="${id}"]`).waitFor();
    assert.equal(await page.locator('#leadTableBody [data-lead-id]').count(), 1);
  }
  for (const excluded of ['Relato secreto alfa', 'declinado', '7500']) {
    await page.locator('#leadSearch').fill(excluded);
    assert.match(await page.locator('#leadTableBody').textContent(), /Nenhum atendimento ou oportunidade registrada/);
  }
  await page.locator('#leadSearch').fill('sem resultado fase onze');
  assert.match(await page.locator('#leadTableBody').textContent(), /Nenhum atendimento ou oportunidade registrada/);
  await page.locator('#leadSearch').fill('');

  await page.locator('#leadTableBody [data-lead-id="lead-proposta"]').click();
  await page.locator('#modalTitle', { hasText: 'Editar Atendimento' }).waitFor();
  await page.screenshot({ path: path.join(visualArtifactsDir, 'leads-modal-dark.png'), fullPage: true });
  assert.equal(await page.locator('#modalEyebrow').textContent(), 'CRM Jurídico');
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), ['client', 'contactId', 'serviceType', 'status', 'origin', 'estimatedFee', 'responsible', 'notes']);
  assert.deepEqual(await page.locator('#field-status option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [
    ['novo', 'Novo Lead / Contato Inicial'], ['em_analise', 'Em Análise Documental'], ['proposta', 'Proposta de Honorários Enviada'], ['fechado', 'Contrato Fechado (Virou Cliente)'], ['declinado', 'Declinado / Não Viável']
  ]);
  assert.deepEqual(await page.locator('#field-origin option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [
    ['Indicação de Cliente', 'Indicação de Cliente'], ['Google / Site', 'Google / Site'], ['Instagram / Redes Sociais', 'Instagram / Redes Sociais'],
    ['Parceiro / Correspondente', 'Parceiro / Correspondente'], ['Sindicato / Associação', 'Sindicato / Associação'],
    ['Passante / Balcão', 'Passante / Balcão'], ['Outro', 'Outro']
  ]);
  assert.equal(await page.locator('#field-status').inputValue(), 'proposta');
  await page.fill('#field-client', 'Caio Proposta Editado');
  await page.fill('#field-estimatedFee', '');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(() => window.Atrium.Store.state.leads.find(item => item.id === 'lead-proposta'));
  assert.equal(edited.id, 'lead-proposta');
  assert.equal(edited.registeredAt, '2026-08-22');
  assert.equal(edited.client, 'Caio Proposta Editado');
  assert.equal(edited.estimatedFee, null);
  assert.ok(Date.parse(edited.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Atendimento atualizado' && item.detail === 'Caio Proposta Editado · Benefício Previdenciário')), true);

  await page.click('#newLeadButton');
  await page.locator('#modalTitle', { hasText: 'Novo Atendimento / Oportunidade' }).waitFor();
  assert.equal(await page.locator('#field-status').inputValue(), 'novo');
  assert.equal(await page.locator('#field-origin').inputValue(), 'Indicação de Cliente');
  assert.equal(await page.locator('#field-responsible').inputValue(), 'Advogada Leads');
  await page.fill('#field-client', 'Lead CRUD Fechado Sintético');
  await page.fill('#field-serviceType', 'Serviço CRUD Sintético');
  await page.selectOption('#field-status', 'fechado');
  await page.selectOption('#field-origin', 'Passante / Balcão');
  await page.fill('#field-estimatedFee', '4321');
  await page.fill('#field-notes', 'Relato jurídico sintético não logável');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const createdClosed = await page.evaluate(() => window.Atrium.Store.state.leads.find(item => item.client === 'Lead CRUD Fechado Sintético'));
  assert.ok(createdClosed.id.startsWith('lead-'));
  assert.equal(createdClosed.registeredAt, today);
  assert.equal(createdClosed.estimatedFee, 4321);
  assert.ok(Date.parse(createdClosed.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Novo atendimento registrado' && item.detail === 'Lead CRUD Fechado Sintético · Serviço CRUD Sintético')), true);
  assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.audit).includes('Relato jurídico sintético não logável')), false);

  await page.click('#newLeadButton');
  await page.fill('#field-client', 'Lead CRUD Declinado Sintético');
  await page.fill('#field-serviceType', 'Serviço Declinável Sintético');
  await page.selectOption('#field-status', 'declinado');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  const isolationAfter = await page.evaluate(() => ({
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    processes: JSON.stringify(window.Atrium.Store.state.processes)
  }));
  assert.deepEqual(isolationAfter, isolationBefore, 'Leads não pode criar/mutar Contatos, Processos ou lançamentos financeiros derivados.');

  await page.locator('#globalSearch').fill('Lead CRUD Fechado Sintético');
  const leadSearchResult = page.locator('[data-search-target="lead"]');
  await leadSearchResult.waitFor();
  assert.equal(await leadSearchResult.count(), 1, 'Global Search deve localizar o atendimento canônico pelo novo domínio CRM.');
  await page.locator('#globalSearch').fill('');

  const duplicateOpenCount = await page.evaluate(() => {
    const app = window.portalApp;
    const original = app.openModal;
    let count = 0;
    app.openModal = function (...args) { count++; return original.apply(this, args); };
    window.dispatchEvent(new CustomEvent('keller:authenticated'));
    document.getElementById('newLeadButton').click();
    app.openModal = original;
    return count;
  });
  assert.equal(duplicateOpenCount, 1, 'Segundo auth não pode duplicar listener de novo Lead.');
  await page.click('#modalCancel');

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  const persisted = await page.evaluate(({ closedId }) => ({
    closed: window.Atrium.Store.state.leads.find(item => item.id === closedId),
    edited: window.Atrium.Store.state.leads.find(item => item.id === 'lead-proposta'),
    contacts: window.Atrium.Store.state.contacts,
    processes: window.Atrium.Store.state.processes
  }), { closedId: createdClosed.id });
  assert.equal(persisted.closed.estimatedFee, 4321);
  assert.equal(persisted.closed.status, 'fechado');
  assert.equal(persisted.edited.client, 'Caio Proposta Editado');
  assert.equal(JSON.stringify(persisted.contacts), JSON.parse(JSON.stringify(isolationBefore.contacts)));
  assert.equal(JSON.stringify(persisted.processes), JSON.parse(JSON.stringify(isolationBefore.processes)));
  assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Caracterização aprovada: filtros, busca, tabela, modal, CRUD, isolamento, Dashboard e reload.');
