import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createContactsFeature } from '../js/features/contacts.js';
import { isoDate } from '../js/core/store.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE DE CONTATOS');
console.log('===============================================================\n');

const contactsSource = fs.readFileSync(new URL('../js/features/contacts.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
for (const forbiddenImport of ['portal.js', 'processes.js', 'tasks.js', 'publications.js', 'agenda.js']) {
  assert.equal(contactsSource.includes(forbiddenImport), false, `Contacts não pode importar ${forbiddenImport}.`);
}
for (const forbiddenConcern of [
  'Store.state.leads', 'store.state.leads', 'renderLeads', 'openLeadModal', 'leadStatusFilter',
  'generateProcuracaoText', 'generateContratoText', 'generateDeclaracaoHipoText', 'openDocumentGenerator'
]) assert.equal(contactsSource.includes(forbiddenConcern), false, `Contacts não pode assumir ${forbiddenConcern}.`);
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(contactsSource.includes(forbiddenSideEffect), false, `Contacts não pode introduzir ${forbiddenSideEffect}.`);
}
assert.match(contactsSource, /const roleMap = \{ cliente: 'Cliente', testemunha: 'Testemunha', perito: 'Perito Judicial', adverso: 'Adv\. Adverso', correspondente: 'Correspondente', preposto: 'Preposto', outro: 'Outro' \};/);
assert.match(portalSource, /import \{ createContactsFeature \} from '\.\/features\/contacts\.js';/);
assert.equal((portalSource.match(/createContactsFeature\(/g) || []).length, 1, 'Portal deve instanciar Contacts uma única vez.');
assert.equal(portalSource.includes('contactSort:'), false, 'Sort de Contatos não pode manter shadow state no App.');
assert.equal(portalSource.includes('this.contactSort'), false, 'Portal não pode continuar manipulando sort de Contatos.');
assert.equal(portalSource.includes("Store.upsert('contacts', record)"), false, 'Save canônico de Contatos não pode permanecer no portal.');
assert.equal(portalSource.includes("const roleMap = { cliente: 'Cliente'"), false, 'Render canônico de Contatos não pode permanecer no portal.');
assert.match(portalSource, /renderContacts\(query = ''\) \{\s*return getContactsFeature\(\)\.render\(query\);\s*\}/);
assert.match(portalSource, /openContactModal\(defaults = \{\}\) \{\s*return getContactsFeature\(\)\.openContactModal\(defaults\);\s*\}/);
assert.match(portalSource, /modalMode\.mode === 'contact'\) \{\s*getContactsFeature\(\)\.saveContact\(data, this\.modalMode\.defaults\);/);

const listenerMap = { newContactButton: [], contactSearch: [] };
const fakeElements = {
  newContactButton: { addEventListener: (type, listener) => listenerMap.newContactButton.push({ type, listener }) },
  contactSearch: { value: '', addEventListener: (type, listener) => listenerMap.contactSearch.push({ type, listener }) }
};
const unitAudits = [];
const unitStore = {
  state: { contacts: [] },
  upsert(collection, record) {
    const index = this.state[collection].findIndex(item => item.id === record.id);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].push(record);
    return record;
  },
  audit(action, detail) { unitAudits.push({ action, detail }); }
};
let unitOpenCount = 0;
const unitRenders = [];
const unitFeature = createContactsFeature({
  store: unitStore,
  documentRef: { getElementById: id => fakeElements[id] || null, querySelectorAll: () => [] },
  normalizeText: value => String(value || '').toLowerCase(),
  escapeHtml: String,
  formatDate: String,
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => { unitOpenCount++; }
});
unitFeature.openContactModal = () => { unitOpenCount++; };
unitFeature.render = query => { unitRenders.push(query); return []; };
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(listenerMap.newContactButton.length, 1);
assert.equal(listenerMap.contactSearch.length, 1);
listenerMap.newContactButton[0].listener();
listenerMap.contactSearch[0].listener({ target: { value: 'busca unitária' } });
assert.equal(unitOpenCount, 1, 'Segundo init não pode duplicar listener de novo contato.');
assert.deepEqual(unitRenders, ['busca unitária'], 'Pesquisa deve disparar um único render.');
fakeElements.contactSearch.value = 'sort preservado';
assert.deepEqual(unitFeature.handleSort('name'), { field: 'name', direction: 'desc' });
assert.deepEqual(unitFeature.handleSort('document'), { field: 'document', direction: 'asc' });
assert.deepEqual(unitFeature.handleSort('registeredAt'), { field: 'registeredAt', direction: 'desc' });
assert.deepEqual(unitRenders.slice(-3), ['sort preservado', 'sort preservado', 'sort preservado']);

const unitCreated = unitFeature.saveContact({
  name: 'Contato Unitário Sintético', contactRole: 'cliente', leadOrigin: 'indicacao',
  document: '000.000.000-10', email: 'unit.contacts@example.test'
}, { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao' });
assert.ok(unitCreated.id.startsWith('contact-'));
assert.equal(unitCreated.externalId, null);
assert.match(unitCreated.registeredAt, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(unitCreated.source, 'Interna');
assert.ok(Date.parse(unitCreated.updatedAt));
assert.deepEqual(unitAudits.at(-1), { action: 'Contato cadastrado', detail: 'Contato Unitário Sintético' });
assert.equal(JSON.stringify(unitAudits.at(-1)).includes('000.000.000-10'), false);
assert.equal(JSON.stringify(unitAudits.at(-1)).includes('unit.contacts@example.test'), false);
const unitEdited = unitFeature.saveContact({
  name: 'Contato Unitário Editado', profession: 'Profissão Editada'
}, {
  ...unitCreated, externalId: 'EXT-UNIT', registeredAt: '2026-01-02', source: 'Planilha',
  country: 'Brasil', unknownField: 'preservado'
});
assert.equal(unitEdited.id, unitCreated.id);
assert.equal(unitEdited.externalId, 'EXT-UNIT');
assert.equal(unitEdited.registeredAt, '2026-01-02');
assert.equal(unitEdited.source, 'Planilha');
assert.equal(unitEdited.country, 'Brasil');
assert.equal(unitEdited.unknownField, 'preservado');
assert.equal(unitEdited.profession, 'Profissão Editada');
assert.deepEqual(unitAudits.at(-1), { action: 'Contato atualizado', detail: 'Contato Unitário Editado' });

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/contacts.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Contacts deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/, 'Módulo Contacts deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Contacts-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_contacts',
    displayName: 'Advogada Contatos',
    email: 'contacts@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200, 'Setup administrativo da fixture deve concluir.');
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

  const fixture = await page.evaluate(async today => {
    // Exercita a compatibilidade interna legada; o bootstrap público continua exclusivamente V2.
    document.documentElement.dataset.ui = 'classic';
    const store = window.Atrium.Store;
    const app = window.portalApp;
    store.state.settings.demoMode = false;
    store.state.contacts = [
      {
        id: 'contact-alpha', externalId: 'EXT-SINT-001', name: 'Ana Contato Sintética',
        contactRole: 'perito', leadOrigin: 'parceria', origin: 'Origem textual ignorada',
        document: '000.000.000-00', rg: '00.000.000-0', birthDate: '1990-01-15',
        profession: 'Profissão Sintética', maritalStatus: 'Solteira', mobile: '(55) 90000-0001',
        phone: '(55) 3000-0001', email: 'ana.contato@example.test', city: 'Ijuí Sintética',
        state: 'RS', country: 'Brasil', address: 'Rua Sintética, 100', district: 'Bairro Teste',
        zip: '00000-000', notes: 'Anotação sintética restrita', source: 'Planilha', registeredAt: '2026-08-20'
      },
      {
        id: 'contact-zeta', name: 'Zeta Contato Sem Papel', document: '000.000.000-01',
        phone: '(55) 3000-0002', email: 'zeta.contato@example.test', city: 'Cidade Fallback',
        createdAt: '2026-08-28T09:00:00.000Z'
      }
    ];
    store.state.leads = [{
      id: 'lead-isolation', client: 'Lead Sintético Isolado', serviceType: 'Consulta Sintética',
      origin: 'Canal Sintético', responsible: 'Advogada Teste', status: 'novo', registeredAt: today
    }];
    store.state.audit = [];
    app.renderAll();
    await store.flush();
    return { today };
  }, isoDate());

  const leadsBefore = await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.leads));
  await page.evaluate(() => window.Atrium.App.switchView('contacts'));
  await page.locator('#view-contacts.active').waitFor();
  assert.equal(await page.locator('#contactCount').textContent(), '2 contatos');
  assert.deepEqual(
    await page.locator('#contactTableBody [data-contact-id]').evaluateAll(rows => rows.map(row => row.dataset.contactId)),
    ['contact-alpha', 'contact-zeta'],
    'Ordenação inicial deve permanecer name asc.'
  );
  assert.equal(await page.locator('#contactTable th[data-sort-field="name"].sorted-asc').count(), 1);

  const alphaRow = page.locator('#contactTableBody [data-contact-id="contact-alpha"]');
  const alphaText = await alphaRow.textContent();
  for (const expected of [
    'Perito Judicial', 'Ana Contato Sintética', 'Profissão Sintética', '000.000.000-00', '00.000.000-0',
    '(55) 90000-0001', 'ana.contato@example.test', 'Ijuí Sintética', 'RS · Brasil', '20/08/2026',
    'ID EXT-SINT-001', 'parceria'
  ]) assert.ok(alphaText.includes(expected), `Tabela deve preservar semanticamente: ${expected}`);
  assert.equal(await alphaRow.locator('td').last().textContent(), 'parceria', 'leadOrigin deve ter prioridade visual sobre origin.');

  const zetaRow = page.locator('#contactTableBody [data-contact-id="contact-zeta"]');
  const zetaText = await zetaRow.textContent();
  for (const expected of ['Cliente', 'Zeta Contato Sem Papel', 'Pessoa cadastrada', '(55) 3000-0002', 'Manual', 'Direta']) {
    assert.ok(zetaText.includes(expected), `Fallback histórico deve preservar: ${expected}`);
  }

  const searchCases = [
    ['Ana Contato Sintética', 'contact-alpha'],
    ['000.000.000-00', 'contact-alpha'],
    ['(55) 90000-0001', 'contact-alpha'],
    ['(55) 3000-0001', 'contact-alpha'],
    ['ana.contato@example.test', 'contact-alpha'],
    ['Origem textual ignorada', 'contact-alpha'],
    ['perito', 'contact-alpha'],
    ['parceria', 'contact-alpha'],
    ['Ijui Sintetica', 'contact-alpha'],
    ['2026-08-20', 'contact-alpha'],
    ['2026-08-28', 'contact-zeta']
  ];
  for (const [query, expectedId] of searchCases) {
    await page.locator('#contactSearch').fill(query);
    await page.locator(`#contactTableBody [data-contact-id="${expectedId}"]`).waitFor();
    assert.equal(await page.locator('#contactTableBody [data-contact-id]').count(), 1, `Busca deve localizar apenas ${expectedId} por ${query}.`);
    assert.equal(await page.locator('#contactCount').textContent(), '2 contatos', 'Count deve continuar representando o total geral.');
  }
  await page.locator('#contactSearch').fill('contato inexistente fase 10');
  assert.match(await page.locator('#contactTableBody').textContent(), /Nenhum contato encontrado/);
  assert.equal(await page.locator('#contactCount').textContent(), '2 contatos');
  await page.locator('#contactSearch').fill('');

  await page.locator('#contactTable th[data-sort-field="name"]').click();
  assert.equal(await page.locator('#contactTable th[data-sort-field="name"].sorted-desc').count(), 1);
  await page.locator('#contactTable th[data-sort-field="document"]').click();
  assert.equal(await page.locator('#contactTable th[data-sort-field="document"].sorted-asc').count(), 1);
  await page.locator('#contactTable th[data-sort-field="registeredAt"]').click();
  assert.equal(await page.locator('#contactTable th[data-sort-field="registeredAt"].sorted-desc').count(), 1);

  await page.locator('#contactTableBody [data-contact-id="contact-alpha"]').click();
  await page.locator('#modalTitle', { hasText: 'Detalhes do contato' }).waitFor();
  assert.equal(await page.locator('#modalEyebrow').textContent(), 'Cadastro de pessoas');
  const expectedFields = [
    'name', 'contactRole', 'leadOrigin', 'document', 'rg', 'birthDate', 'profession', 'maritalStatus',
    'mobile', 'phone', 'email', 'origin', 'city', 'state', 'address', 'district', 'zip', 'notes'
  ];
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), expectedFields);
  assert.deepEqual(await page.locator('#field-contactRole option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [
    ['cliente', 'Cliente / Outorgante'], ['testemunha', 'Testemunha'], ['perito', 'Perito Judicial / Assistente'],
    ['adverso', 'Advogado Adverso / Parte Contrária'], ['correspondente', 'Correspondente Jurídico'],
    ['preposto', 'Preposto / Representante'], ['outro', 'Outro Contato']
  ]);
  assert.deepEqual(await page.locator('#field-leadOrigin option').evaluateAll(options => options.map(option => [option.value, option.textContent])), [
    ['indicacao', 'Indicação de Cliente'], ['parceria', 'Parceria Profissional'], ['balcao', 'Balcão / Atendimento Direto'],
    ['redes_sociais', 'Redes Sociais / WhatsApp'], ['google_site', 'Google / Site do Escritório'],
    ['convenio', 'Convênio / Entidade Sindical'], ['outro', 'Outra Origem']
  ]);
  assert.equal(await page.locator('#field-contactRole').inputValue(), 'perito');
  assert.equal(await page.locator('#field-leadOrigin').inputValue(), 'parceria');
  await page.fill('#field-profession', 'Profissão Editada Fase 10');
  await page.fill('#field-city', 'Cidade Editada Sintética');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(() => window.Atrium.Store.state.contacts.find(item => item.id === 'contact-alpha'));
  assert.equal(edited.id, 'contact-alpha');
  assert.equal(edited.externalId, 'EXT-SINT-001');
  assert.equal(edited.registeredAt, '2026-08-20');
  assert.equal(edited.source, 'Planilha');
  assert.equal(edited.country, 'Brasil');
  assert.equal(edited.profession, 'Profissão Editada Fase 10');
  assert.equal(edited.city, 'Cidade Editada Sintética');
  assert.ok(Date.parse(edited.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Contato atualizado' && item.detail === 'Ana Contato Sintética')), true);

  await page.click('#newContactButton');
  await page.locator('#modalTitle', { hasText: 'Novo contato' }).waitFor();
  assert.equal(await page.locator('#field-contactRole').inputValue(), 'cliente');
  assert.equal(await page.locator('#field-leadOrigin').inputValue(), 'indicacao');
  const newDefaults = await page.evaluate(() => window.portalApp.modalMode.defaults);
  assert.deepEqual(newDefaults, { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao' });
  await page.fill('#field-name', 'Contato CRUD Fase 10');
  await page.fill('#field-document', '000.000.000-02');
  await page.fill('#field-rg', '00.000.000-2');
  await page.fill('#field-profession', 'Profissão CRUD');
  await page.fill('#field-maritalStatus', 'Casado(a)');
  await page.fill('#field-mobile', '(55) 90000-0002');
  await page.fill('#field-phone', '(55) 3000-0003');
  await page.fill('#field-email', 'crud.contacts@example.test');
  await page.fill('#field-origin', 'Origem CRUD Sintética');
  await page.fill('#field-city', 'Cidade CRUD');
  await page.fill('#field-state', 'RS');
  await page.fill('#field-address', 'Rua CRUD Sintética, 200');
  await page.fill('#field-district', 'Bairro CRUD');
  await page.fill('#field-zip', '00000-002');
  await page.fill('#field-notes', 'Nota sintética do CRUD');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const created = await page.evaluate(() => window.Atrium.Store.state.contacts.find(item => item.name === 'Contato CRUD Fase 10'));
  assert.ok(created?.id?.startsWith('contact-'));
  assert.equal(created.externalId, null);
  assert.equal(created.registeredAt, fixture.today);
  assert.equal(created.source, 'Interna');
  assert.equal(created.contactRole, 'cliente');
  assert.equal(created.leadOrigin, 'indicacao');
  assert.ok(Date.parse(created.updatedAt));
  const createdAudit = await page.evaluate(() => window.Atrium.Store.state.audit.find(item => item.action === 'Contato cadastrado' && item.detail === 'Contato CRUD Fase 10'));
  assert.ok(createdAudit, 'Audit de cadastro deve conter somente o nome no detalhe.');
  assert.equal(JSON.stringify(createdAudit).includes('000.000.000-02'), false);
  assert.equal(JSON.stringify(createdAudit).includes('crud.contacts@example.test'), false);
  assert.equal(await page.locator('#contactCount').textContent(), '3 contatos');

  await page.click('#btnGenDocContact');
  await page.locator('#docGeneratorBackdrop:not(.hidden)').waitFor();
  await page.selectOption('#docGenContactSelect', 'contact-alpha');
  await page.selectOption('#docGenTypeSelect', 'procuracao');
  let preview = await page.locator('#docGenPreviewText').inputValue();
  for (const expected of ['Ana Contato Sintética', '000.000.000-00', '00.000.000-0', 'Profissão Editada Fase 10', 'Solteira', 'Rua Sintética, 100', 'Cidade Editada Sintética']) {
    assert.ok(preview.includes(expected), `Procuração deve continuar recebendo o dado do contato: ${expected}`);
  }
  await page.selectOption('#docGenTypeSelect', 'contrato_honorarios');
  preview = await page.locator('#docGenPreviewText').inputValue();
  assert.ok(preview.includes('CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'));
  assert.ok(preview.includes('Ana Contato Sintética') && preview.includes('000.000.000-00'));
  await page.selectOption('#docGenTypeSelect', 'declaracao_hipo');
  preview = await page.locator('#docGenPreviewText').inputValue();
  assert.ok(preview.includes('DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA'));
  assert.ok(preview.includes('00.000.000-0') && preview.includes('Profissão Editada Fase 10'));
  await page.click('#docGenClose');
  await page.locator('#docGeneratorBackdrop').waitFor({ state: 'hidden' });

  await page.locator('#globalSearch').fill('Contato CRUD Fase 10');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.locator(`[data-search-target="contact"][data-search-id="${created.id}"]`).click();
  await page.locator('#view-contacts.active').waitFor();
  assert.equal(await page.locator('#contactSearch').inputValue(), 'Contato CRUD Fase 10');
  assert.equal(await page.locator(`#contactTableBody [data-contact-id="${created.id}"]`).count(), 1);

  const reauthenticatedOpenCount = await page.evaluate(() => {
    const app = window.portalApp;
    const originalOpenModal = app.openModal;
    let openCount = 0;
    app.openModal = function (...args) {
      openCount++;
      return originalOpenModal.apply(this, args);
    };
    window.dispatchEvent(new CustomEvent('keller:authenticated'));
    document.getElementById('newContactButton').click();
    app.openModal = originalOpenModal;
    return openCount;
  });
  assert.equal(reauthenticatedOpenCount, 1, 'Segundo evento de autenticação não pode duplicar listeners de Contatos.');
  await page.locator('#modalTitle', { hasText: 'Novo contato' }).waitFor();
  await page.click('#modalCancel');

  const leadsAfterContacts = await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.leads));
  assert.equal(leadsAfterContacts, leadsBefore, 'Render, CRUD e documentos de Contatos não podem mutar Leads.');
  await page.evaluate(() => window.Atrium.App.switchView('leads'));
  await page.locator('#view-leads.active').waitFor();
  await page.locator('#leadTableBody [data-lead-id="lead-isolation"]', { hasText: 'Lead Sintético Isolado' }).waitFor();

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.evaluate(() => window.Atrium.App.switchView('contacts'));
  const persisted = await page.evaluate(({ createdId }) => ({
    created: window.Atrium.Store.state.contacts.find(item => item.id === createdId),
    edited: window.Atrium.Store.state.contacts.find(item => item.id === 'contact-alpha'),
    leads: window.Atrium.Store.state.leads
  }), { createdId: created.id });
  assert.equal(persisted.created.name, 'Contato CRUD Fase 10');
  assert.equal(persisted.created.source, 'Interna');
  assert.equal(persisted.edited.externalId, 'EXT-SINT-001');
  assert.equal(persisted.edited.registeredAt, '2026-08-20');
  assert.equal(persisted.edited.profession, 'Profissão Editada Fase 10');
  assert.equal(persisted.leads.length, 1);
  assert.equal(persisted.leads[0].id, 'lead-isolation');
  assert.deepEqual(pageErrors, [], `Erros de página detectados: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Caracterização aprovada: busca, sort, count, tabela, CRUD, documentos, Busca Global e isolamento de Leads.');
