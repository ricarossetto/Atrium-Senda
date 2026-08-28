import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createFinancialFeature } from '../js/features/financial.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE FINANCEIRO / RPV');
console.log('===============================================================\n');

const visualArtifactsDir = fileURLToPath(new URL('../artifacts/financial-feature/', import.meta.url));
fs.mkdirSync(visualArtifactsDir, { recursive: true });

const financialSource = fs.readFileSync(new URL('../js/features/financial.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
const processesSource = fs.readFileSync(new URL('../js/features/processes.js', import.meta.url), 'utf8');

for (const forbiddenImport of [
  'portal.js', 'processes.js', 'documents.js', 'agenda.js', 'publications.js',
  'tasks.js', 'contacts.js', 'leads.js'
]) {
  assert.equal(financialSource.includes(forbiddenImport), false, 'Financeiro não pode importar ' + forbiddenImport + '.');
}
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(financialSource.includes(forbiddenSideEffect), false, 'Financeiro não pode introduzir ' + forbiddenSideEffect + '.');
}
for (const forbiddenCollection of [
  'state.financial', 'state.financialEntries', 'state.payments', 'state.ledger',
  "upsert('financial", "upsert('payments", "upsert('ledger"
]) {
  assert.equal(financialSource.includes(forbiddenCollection), false, 'Financeiro não pode criar coleção: ' + forbiddenCollection + '.');
}
assert.match(financialSource, /^import \{ Store \} from '\.\.\/core\/store\.js';/);
assert.equal((financialSource.match(/^import /gm) || []).length, 1, 'Financeiro deve importar somente o Store canônico.');
assert.match(portalSource, /import \{ createFinancialFeature \} from '\.\/features\/financial\.js';/);
assert.equal((portalSource.match(/createFinancialFeature\(/g) || []).length, 1, 'Portal deve instanciar Financeiro uma única vez.');
assert.equal(portalSource.includes('this.financialFilter'), false, 'Portal não pode manter shadow state do filtro financeiro.');
assert.equal(portalSource.includes("Store.upsert('processes', process)"), false, 'Mutation financeira concreta não pode permanecer no portal.');
assert.equal((portalSource.match(/Lançamento financeiro registrado/g) || []).length, 0, 'Audit financeiro concreto não pode permanecer no portal.');
assert.match(portalSource, /renderFinancial\(query = ''\) \{\s*return getFinancialFeature\(\)\.render\(query\);\s*\}/);
assert.match(portalSource, /openFinancialEntryModal\(\) \{\s*return getFinancialFeature\(\)\.openEntryModal\(\);\s*\}/);
assert.match(portalSource, /closeFinancialEntryModal\(\) \{\s*return getFinancialFeature\(\)\.closeEntryModal\(\);\s*\}/);
assert.match(portalSource, /updateFinancialModalSummary\(\) \{\s*return getFinancialFeature\(\)\.updateModalSummary\(\);\s*\}/);
assert.match(portalSource, /handleFinancialEntrySubmit\(event\) \{\s*return getFinancialFeature\(\)\.handleEntrySubmit\(event\);\s*\}/);
assert.equal((portalSource.match(/btnGenDocPrestacao'\)\?\.addEventListener/g) || []).length, 1, 'Bridge de prestação de contas deve permanecer único.');
assert.match(portalSource, /btnGenDocPrestacao'\)\?\.addEventListener\('click', \(\) => this\.openDocumentGenerator\(\{ type: 'prestacao_contas' \}\)\)/);
assert.equal(financialSource.includes('generatePrestacaoContasRpvText'), false);
assert.equal(financialSource.includes('prestacao de contas'), false);
assert.match(processesSource, /store\.upsert\('processes', record\)/, 'Processos deve conservar seu CRUD canônico.');
assert.match(processesSource, /item\.feeAmount/, 'Processos deve conservar a exibição financeira histórica.');

const listeners = {};
const addListener = id => (type, listener) => {
  listeners[id] ||= [];
  listeners[id].push({ type, listener });
};
const makeClassList = initial => {
  const values = new Set(initial || []);
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
    toggle(value, force) {
      if (force === undefined ? !values.has(value) : force) values.add(value);
      else values.delete(value);
    }
  };
};
const filterButtons = ['all', 'rpv', 'honorarios'].map((value, index) => ({
  dataset: { finFilter: value },
  classList: makeClassList(index === 0 ? ['active'] : [])
}));
const unitElements = {
  financialFilters: {
    addEventListener: addListener('financialFilters'),
    querySelectorAll: () => filterButtons
  },
  financialSearch: { value: '', addEventListener: addListener('financialSearch') },
  newFinancialEntryButton: { addEventListener: addListener('newFinancialEntryButton') },
  financialEntryClose: { addEventListener: addListener('financialEntryClose') },
  financialEntryCancel: { addEventListener: addListener('financialEntryCancel') },
  financialEntryBackdrop: { classList: makeClassList(['hidden']), addEventListener: addListener('financialEntryBackdrop') },
  financialEntryForm: { addEventListener: addListener('financialEntryForm'), reset() {} },
  finGrossInput: { value: '', addEventListener: addListener('finGrossInput') },
  finFeePctInput: { value: '30', addEventListener: addListener('finFeePctInput') },
  finTypeSelect: { addEventListener: addListener('finTypeSelect') },
  financialTableBody: { innerHTML: '' },
  finMetricHonorarios: { textContent: '' },
  finMetricRpvCount: { textContent: '' }
};
const unitStore = {
  state: {
    processes: [
      { id: 'zero', number: 'RPV-ZERO', client: 'Cliente Zero Sintético', requisitionStatus: 'requisitado', requisitionAmount: 0, rpvAmount: 999, economicValue: 888, feePercentage: 0 },
      { id: 'rpv', number: 'RPV-FALLBACK', client: 'Cliente RPV Sintético', requisitionStatus: 'aguardando_deposito', rpvAmount: 1000, feePercentage: 20 },
      { id: 'economic', number: 'RPV-ECONOMIC', client: 'Cliente Econômico Sintético', requisitionStatus: 'disponivel_saque', economicValue: 2000, feePercentage: 25, feeAmount: 600 },
      { id: 'repassado', number: 'RPV-REPASSADO', client: 'Cliente Repassado Sintético', requisitionStatus: 'repassado', requisitionAmount: 300, feePercentage: 10 },
      { id: 'pago', number: 'RPV-PAGO', client: 'Cliente Pago Sintético', requisitionStatus: 'pago', requisitionAmount: 400, feePercentage: 10 },
      { id: 'quitado', number: 'RPV-QUITADO', client: 'Cliente Quitado Sintético', requisitionStatus: 'quitado', requisitionAmount: 500, feePercentage: 10 },
      { id: 'unknown', number: 'RPV-UNKNOWN', client: 'Cliente Desconhecido Sintético', requisitionStatus: 'status_sintetico', requisitionAmount: 100, feePercentage: 200 },
      { id: 'fee', number: 'HON-FIXO', client: 'Cliente Fixo Sintético', feeType: 'fixo', feeAmount: 400 },
      { id: 'monthly', number: 'HON-MENSAL', client: 'Cliente Mensal Sintético', feeType: 'mensalidade sintética', feeMonthly: 200 },
      { id: 'paid-fee', number: 'HON-PAGO', client: 'Cliente Honorário Pago', feeType: 'fixo', feeAmount: 500, feeStatus: 'pago' }
    ]
  }
};
const unitDocument = {
  body: { style: { overflow: '' } },
  getElementById: id => unitElements[id] || null
};
const unitFeature = createFinancialFeature({
  store: unitStore,
  documentRef: unitDocument,
  normalizeText: value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  escapeHtml: value => String(value ?? ''),
  formatCurrency: value => 'BRL ' + Number(value).toFixed(2)
});

let renderCalls = 0;
const realRender = unitFeature.render.bind(unitFeature);
unitFeature.render = (...args) => {
  renderCalls++;
  return realRender(...args);
};
assert.equal(unitFeature.filter, 'all');
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
for (const id of [
  'financialFilters', 'financialSearch', 'newFinancialEntryButton', 'financialEntryClose',
  'financialEntryCancel', 'financialEntryBackdrop', 'financialEntryForm', 'finGrossInput',
  'finFeePctInput', 'finTypeSelect'
]) {
  assert.equal(listeners[id].length, 1, id + ' deve ter exatamente um listener após dois init().');
}

for (const button of filterButtons) {
  const before = renderCalls;
  listeners.financialFilters[0].listener({ target: { closest: () => button } });
  assert.equal(unitFeature.filter, button.dataset.finFilter);
  assert.equal(renderCalls, before + 1, 'Filtro deve disparar um único render.');
  assert.equal(filterButtons.filter(item => item.classList.contains('active')).length, 1);
  assert.equal(button.classList.contains('active'), true);
}
listeners.financialFilters[0].listener({ target: { closest: () => filterButtons[0] } });
unitFeature.render();
assert.equal(unitElements.finMetricHonorarios.textContent, 'BRL 1600.00');
assert.equal(unitElements.finMetricRpvCount.textContent, '7 requisições');
const allHtml = unitElements.financialTableBody.innerHTML;
for (const expected of [
  'Requisitado / Expedido', 'status-chip muted',
  'Aguardando Depósito', 'status-chip warning',
  'Disponível para Saque', 'status-chip info',
  'Repassado & Quitado', 'status-chip connected',
  'status_sintetico', 'BRL 0.00', 'BRL 1000.00', 'BRL 2000.00',
  'BRL 600.00', 'BRL 1400.00', 'BRL 200.00'
]) {
  assert.ok(allHtml.includes(expected), 'Render histórico deve preservar: ' + expected);
}
assert.match(allHtml, /RPV-ZERO[\s\S]*RPV \/ Alvará \(0%\)[\s\S]*BRL 0\.00[\s\S]*BRL 0\.00[\s\S]*BRL 0\.00/);
assert.match(allHtml, /RPV-FALLBACK[\s\S]*RPV \/ Alvará \(20%\)[\s\S]*BRL 1000\.00[\s\S]*BRL 200\.00[\s\S]*BRL 800\.00/);
assert.match(allHtml, /RPV-ECONOMIC[\s\S]*RPV \/ Alvará \(25%\)[\s\S]*BRL 2000\.00[\s\S]*BRL 600\.00[\s\S]*BRL 1400\.00/);
assert.match(allHtml, /RPV-UNKNOWN[\s\S]*BRL 100\.00[\s\S]*BRL 200\.00[\s\S]*BRL 0\.00/);

listeners.financialFilters[0].listener({ target: { closest: () => filterButtons[1] } });
assert.ok(unitElements.financialTableBody.innerHTML.includes('RPV-FALLBACK'));
assert.equal(unitElements.financialTableBody.innerHTML.includes('HON-FIXO'), false);
listeners.financialSearch[0].listener({ target: { value: 'cliente economico sintetico' } });
assert.ok(unitElements.financialTableBody.innerHTML.includes('RPV-ECONOMIC'));
assert.equal(unitElements.financialTableBody.innerHTML.includes('RPV-FALLBACK'), false);
listeners.financialFilters[0].listener({ target: { closest: () => filterButtons[2] } });
listeners.financialSearch[0].listener({ target: { value: 'mensalidade sintetica' } });
assert.ok(unitElements.financialTableBody.innerHTML.includes('HON-MENSAL'));
assert.equal(unitElements.financialTableBody.innerHTML.includes('HON-FIXO'), false);
listeners.financialSearch[0].listener({ target: { value: 'busca sem resultado' } });
assert.match(unitElements.financialTableBody.innerHTML, /Nenhum lançamento financeiro ou requisição RPV localizada/);

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(server.baseUrl + '/js/features/financial.js');
  assert.equal(moduleResponse.status, 200, 'Módulo Financeiro deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/);

  const password = 'Senha-Teste-Financeiro-2026!';
  let response = await postJson(server.baseUrl + '/api/auth/setup', {
    username: 'admin_financeiro',
    displayName: 'Advogada Financeira',
    email: 'financeiro@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(server.baseUrl + '/api/auth/setup/verify', {
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
  const observedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => observedRequests.push({ url: request.url(), method: request.method() }));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const processIds = ['target-rpv', 'target-exito', 'target-fixo', 'target-mensal', 'target-custas'];
  await page.evaluate(ids => {
    const store = window.Atrium.Store;
    store.state.settings.demoMode = false;
    store.state.tasks = [];
    store.state.leads = [];
    store.state.audit = [];
    store.state.processes = [
      {
        id: 'dashboard-divergence', number: 'RPV-DASH-SINTETICO', client: 'Cliente Dashboard Sintético',
        court: 'Tribunal Sintético', feeType: 'exito', feePercentage: 30, feeAmount: 2500,
        requisitionAmount: 10000, requisitionStatus: 'requisitado', customField: 'preservar-dashboard'
      },
      {
        id: 'honor-pending', number: 'HON-SINTETICO', client: 'Cliente Honorário Sintético',
        court: 'Tribunal Honorário Sintético', feeType: 'fixo', feeAmount: 400,
        customField: 'preservar-honorario'
      },
      ...ids.map((id, index) => ({
        id,
        number: 'PROC-FIN-' + (index + 1),
        client: 'Cliente Lançamento ' + (index + 1),
        court: 'Tribunal Sintético ' + (index + 1),
        customField: 'campo-intacto-' + (index + 1),
        monitoring: 'active'
      }))
    ];
    window.portalApp.renderAll();
    return store.flush();
  }, processIds);

  await page.click('button[data-view="dashboard"]');
  assert.equal(await page.locator('#widgetHonorariosPending').textContent(), 'R$\u00a03.400,00', 'Dashboard deve preservar seu cálculo histórico próprio.');

  await page.click('button[data-view="financial"]');
  await page.locator('#view-financial.active').waitFor();
  assert.deepEqual(await page.locator('#financialFilters button').evaluateAll(buttons => buttons.map(button => [button.dataset.finFilter, button.textContent.trim()])), [
    ['all', 'Todos'], ['rpv', 'RPVs / Alvarás'], ['honorarios', 'Honorários']
  ]);
  assert.equal(await page.locator('#finMetricHonorarios').textContent(), 'R$\u00a02.900,00', 'Métrica financeira pode divergir historicamente do Dashboard.');
  assert.equal(await page.locator('#finMetricRpvCount').textContent(), '1 requisições');
  assert.equal(await page.locator('#financialTableBody tr').count(), 2);
  const initialText = await page.locator('#financialTableBody').textContent();
  for (const expected of ['RPV-DASH-SINTETICO', 'Cliente Dashboard Sintético', 'RPV / Alvará (30%)', '10.000,00', '2.500,00', '7.500,00', 'Requisitado / Expedido', 'HON-SINTETICO', 'A Faturar']) {
    assert.ok(initialText.includes(expected), 'Tabela financeira deve preservar: ' + expected);
  }

  const requestsBeforeReadOnly = observedRequests.length;
  await page.locator('#financialFilters [data-fin-filter="rpv"]').click();
  assert.equal(await page.locator('#financialTableBody tr').count(), 1);
  assert.equal(await page.locator('#financialFilters button.active').count(), 1);
  await page.locator('#financialFilters [data-fin-filter="honorarios"]').click();
  assert.equal(await page.locator('#financialTableBody tr').count(), 1);
  await page.locator('#financialSearch').fill('cliente honorario sintetico');
  assert.ok((await page.locator('#financialTableBody').textContent()).includes('HON-SINTETICO'));
  await page.locator('#financialSearch').fill('busca financeira inexistente');
  assert.match(await page.locator('#financialTableBody').textContent(), /Nenhum lançamento financeiro ou requisição RPV localizada/);
  await page.locator('#financialSearch').fill('');
  await page.locator('#financialFilters [data-fin-filter="all"]').click();

  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(visualArtifactsDir, 'financial-desktop-dark.png'), fullPage: true });
  await page.click('#themeToggleButton');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.screenshot({ path: path.join(visualArtifactsDir, 'financial-desktop-light.png'), fullPage: true });
  await page.click('#themeToggleButton');
  assert.equal(await page.locator('html').getAttribute('data-theme'), null);
  await page.waitForFunction(() => document.querySelectorAll('#toastRegion .toast').length === 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#financialFilters').isVisible(), true);
  assert.equal(await page.locator('#financialSearch').isVisible(), true);
  assert.equal(await page.locator('#financialTable').isVisible(), true);
  await page.screenshot({ path: path.join(visualArtifactsDir, 'financial-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.click('#newFinancialEntryButton');
  await page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.deepEqual(await page.locator('#finProcessSelect option').evaluateAll(options => options.map(option => option.value)), ['', 'dashboard-divergence', 'honor-pending', ...processIds]);
  assert.equal(await page.locator('#finProcessSelect').inputValue(), '');
  assert.equal(await page.locator('#finTypeSelect').inputValue(), 'rpv');
  assert.equal(await page.locator('#finStatusSelect').inputValue(), 'requisitado');
  assert.equal(await page.locator('#finFeePctInput').inputValue(), '30');
  assert.deepEqual(await page.locator('#finSumGross, #finSumFee, #finSumNet').allTextContents(), ['R$\u00a00,00', 'R$\u00a00,00', 'R$\u00a00,00']);
  await page.fill('#finGrossInput', '0');
  await page.fill('#finFeePctInput', '0');
  assert.deepEqual(await page.locator('#finSumGross, #finSumFee, #finSumNet').allTextContents(), ['R$\u00a00,00', 'R$\u00a00,00', 'R$\u00a00,00']);
  await page.fill('#finGrossInput', '1234.56');
  await page.fill('#finFeePctInput', '12.5');
  assert.deepEqual(await page.locator('#finSumGross, #finSumFee, #finSumNet').allTextContents(), ['R$\u00a01.234,56', 'R$\u00a0154,32', 'R$\u00a01.080,24']);
  await page.selectOption('#finTypeSelect', 'exito');
  assert.deepEqual(await page.locator('#finSumGross, #finSumFee, #finSumNet').allTextContents(), ['R$\u00a01.234,56', 'R$\u00a0154,32', 'R$\u00a01.080,24']);
  await page.screenshot({ path: path.join(visualArtifactsDir, 'financial-modal-dark.png'), fullPage: true });
  await page.locator('#finModalTitle').click();
  assert.equal(await page.locator('#financialEntryBackdrop').evaluate(element => element.classList.contains('hidden')), false, 'Click interno não deve fechar o modal.');
  await page.click('#financialEntryClose');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await page.click('#newFinancialEntryButton');
  await page.click('#financialEntryCancel');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  await page.click('#newFinancialEntryButton');
  await page.locator('#financialEntryBackdrop', { has: page.locator('.financial-entry-modal') }).click({ position: { x: 3, y: 3 } });
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(observedRequests.length, requestsBeforeReadOnly, 'Render, filtros, busca e modal não devem criar requests.');

  await page.click('#newFinancialEntryButton');
  await page.evaluate(() => {
    const option = document.createElement('option');
    option.value = 'processo-inexistente';
    option.textContent = 'Processo sintético inexistente';
    document.getElementById('finProcessSelect').appendChild(option);
    const store = window.Atrium.Store;
    window.__financialOriginalMethods = { upsert: store.upsert, audit: store.audit, save: store.save };
    window.__financialInvalidCounts = { upsert: 0, audit: 0, save: 0 };
    store.upsert = function (...args) { window.__financialInvalidCounts.upsert++; return window.__financialOriginalMethods.upsert.apply(this, args); };
    store.audit = function (...args) { window.__financialInvalidCounts.audit++; return window.__financialOriginalMethods.audit.apply(this, args); };
    store.save = function (...args) { window.__financialInvalidCounts.save++; return window.__financialOriginalMethods.save.apply(this, args); };
  });
  await page.selectOption('#finProcessSelect', 'processo-inexistente');
  await page.fill('#finGrossInput', '500');
  await page.fill('#finFeePctInput', '10');
  await page.click('#financialEntryForm button[type="submit"]');
  assert.deepEqual(await page.evaluate(() => window.__financialInvalidCounts), { upsert: 0, audit: 0, save: 0 });
  assert.equal(await page.locator('#financialEntryBackdrop').evaluate(element => element.classList.contains('hidden')), false);
  assert.equal(await page.locator('#toastRegion .toast.error').last().textContent(), 'Selecione um processo válido para vincular o lançamento.');
  await page.evaluate(() => {
    const store = window.Atrium.Store;
    Object.assign(store, window.__financialOriginalMethods);
    delete window.__financialOriginalMethods;
    delete window.__financialInvalidCounts;
  });
  await page.click('#financialEntryCancel');

  const initialTargets = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const process = window.Atrium.Store.state.processes.find(item => item.id === id);
    return [id, JSON.parse(JSON.stringify(process))];
  })), processIds);
  const submitCases = [
    { id: 'target-rpv', type: 'rpv', gross: '1000', percentage: '10', status: 'requisitado', expectedType: 'RPV / Precatório', expectedPct: 10, expectedFee: 100 },
    { id: 'target-exito', type: 'exito', gross: '2000', percentage: '20', status: 'aguardando_deposito', expectedType: 'Quota Litis', expectedPct: 20, expectedFee: 400 },
    { id: 'target-fixo', type: 'fixo', gross: '3000', percentage: '0', status: 'disponivel_saque', expectedType: 'Honorários', expectedPct: 30, expectedFee: 900 },
    { id: 'target-mensal', type: 'mensal', gross: '4000', percentage: '25', status: 'requisitado', expectedType: 'Honorários', expectedPct: 25, expectedFee: 1000 },
    { id: 'target-custas', type: 'custas', gross: '5000', percentage: '15', status: 'requisitado', expectedType: 'Honorários', expectedPct: 15, expectedFee: 750 }
  ];
  const requestsBeforeSaves = observedRequests.length;
  for (const item of submitCases) {
    await page.click('#newFinancialEntryButton');
    await page.selectOption('#finProcessSelect', item.id);
    await page.selectOption('#finTypeSelect', item.type);
    await page.selectOption('#finStatusSelect', item.status);
    await page.fill('#finGrossInput', item.gross);
    await page.fill('#finFeePctInput', item.percentage);
    await page.click('#financialEntryForm button[type="submit"]');
    await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  }
  await page.evaluate(() => window.Atrium.Store.flush());

  const submittedState = await page.evaluate(ids => ({
    processes: Object.fromEntries(ids.map(id => {
      const process = window.Atrium.Store.state.processes.find(item => item.id === id);
      return [id, JSON.parse(JSON.stringify(process))];
    })),
    audits: window.Atrium.Store.state.audit.filter(item => item.action === 'Lançamento financeiro registrado')
  }), processIds);
  assert.equal(submittedState.audits.length, 5, 'Cinco submits devem produzir cinco audits.');
  for (const item of submitCases) {
    const before = initialTargets[item.id];
    const after = submittedState.processes[item.id];
    assert.equal(after.requisitionAmount, Number(item.gross));
    assert.equal(after.feePercentage, item.expectedPct);
    assert.equal(after.feeAmount, item.expectedFee);
    assert.equal(after.requisitionStatus, item.status);
    assert.equal(after.feeType, item.expectedType);
    assert.ok(Date.parse(after.updatedAt));
    assert.equal(after.number, before.number);
    assert.equal(after.client, before.client);
    assert.equal(after.court, before.court);
    assert.equal(after.customField, before.customField);
    assert.equal(after.monitoring, before.monitoring);
  }
  assert.deepEqual(submittedState.audits.map(item => item.detail), [
    'PROC-FIN-5: R$\u00a05.000,00 (requisitado)',
    'PROC-FIN-4: R$\u00a04.000,00 (requisitado)',
    'PROC-FIN-3: R$\u00a03.000,00 (disponivel_saque)',
    'PROC-FIN-2: R$\u00a02.000,00 (aguardando_deposito)',
    'PROC-FIN-1: R$\u00a01.000,00 (requisitado)'
  ]);
  assert.equal(JSON.stringify(submittedState.audits).includes('Tribunal Sintético'), false, 'Audit não deve incluir dado pessoal extra.');
  const saveRequests = observedRequests.slice(requestsBeforeSaves);
  assert.ok(saveRequests.length >= 1, 'Save deve usar a persistência normal do Store.');
  assert.equal(saveRequests.every(request => new URL(request.url).pathname === '/api/state'), true, 'Save financeiro só pode usar /api/state.');
  assert.equal(await page.locator('#finMetricHonorarios').textContent(), 'R$\u00a06.050,00');
  assert.equal(await page.locator('#finMetricRpvCount').textContent(), '6 requisições');
  assert.equal(await page.locator('#widgetHonorariosPending').textContent(), 'R$\u00a06.550,00', 'Callback deve atualizar o widget sem alterar sua regra histórica.');
  assert.equal(await page.locator('#toastRegion .toast.success').last().textContent(), 'Lançamento financeiro salvo com sucesso!');

  await page.click('button[data-view="processes"]');
  await page.locator('#view-processes.active').waitFor();
  const processRowText = await page.locator('#processTableBody [data-process-id="target-fixo"]').textContent();
  assert.ok(processRowText.includes('PROC-FIN-3'));
  assert.ok(processRowText.includes('900'));

  await page.click('button[data-view="financial"]');
  const documentBridge = await page.evaluate(() => {
    const app = window.portalApp;
    const original = app.openDocumentGenerator;
    const calls = [];
    app.openDocumentGenerator = function (options) {
      calls.push(options);
      return original.call(this, options);
    };
    document.getElementById('btnGenDocPrestacao').click();
    app.openDocumentGenerator = original;
    return calls;
  });
  assert.deepEqual(documentBridge, [{ type: 'prestacao_contas' }]);
  assert.equal(await page.locator('#docGeneratorBackdrop').evaluate(element => element.classList.contains('hidden')), false);
  await page.evaluate(() => window.portalApp.closeDocumentGenerator());

  const auditsBeforeSecondAuth = await page.evaluate(() => window.Atrium.Store.state.audit.filter(item => item.action === 'Lançamento financeiro registrado').length);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('keller:authenticated')));
  await page.click('#newFinancialEntryButton');
  await page.selectOption('#finProcessSelect', 'target-custas');
  await page.selectOption('#finTypeSelect', 'custas');
  await page.selectOption('#finStatusSelect', 'requisitado');
  await page.fill('#finGrossInput', '5000');
  await page.fill('#finFeePctInput', '15');
  await page.click('#financialEntryForm button[type="submit"]');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.filter(item => item.action === 'Lançamento financeiro registrado').length), auditsBeforeSecondAuth + 1, 'Segundo auth não pode duplicar submit/audit.');

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  const persisted = await page.evaluate(() => {
    const process = window.Atrium.Store.state.processes.find(item => item.id === 'target-fixo');
    return {
      requisitionAmount: process.requisitionAmount,
      feePercentage: process.feePercentage,
      feeAmount: process.feeAmount,
      requisitionStatus: process.requisitionStatus,
      feeType: process.feeType,
      customField: process.customField
    };
  });
  assert.deepEqual(persisted, {
    requisitionAmount: 3000,
    feePercentage: 30,
    feeAmount: 900,
    requisitionStatus: 'disponivel_saque',
    feeType: 'Honorários',
    customField: 'campo-intacto-3'
  });
  assert.deepEqual(pageErrors, [], 'Erros de página: ' + pageErrors.join(' | '));

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Caracterização aprovada: arquitetura, fórmulas, modal, submit, isolamento, Dashboard, Processos, Documentos e reload.');
