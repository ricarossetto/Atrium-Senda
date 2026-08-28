import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createProcessesFeature } from '../js/features/processes.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE DE PROCESSOS');
console.log('===============================================================\n');

const processesSource = fs.readFileSync(new URL('../js/features/processes.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
for (const forbiddenImport of ['portal.js', 'tasks.js', 'publications.js', 'agenda.js']) {
  assert.equal(processesSource.includes(forbiddenImport), false, `Processes não pode importar ${forbiddenImport}.`);
}
for (const forbiddenConcern of ['renderFinancial', 'handleFinancialEntrySubmit', 'financialEntryForm', 'finGrossInput', 'Lançamento financeiro registrado', 'openDocumentGenerator']) {
  assert.equal(processesSource.includes(forbiddenConcern), false, `Processes não pode assumir ${forbiddenConcern}.`);
}
assert.match(processesSource, /String\(item\.number \|\| ''\)\.includes\('\.8\.21\.'\) \|\| String\(item\.court \|\| ''\)\.toUpperCase\(\)\.includes\('TJRS'\)/, 'Detecção histórica TJRS deve aceitar CNJ ou nome do tribunal.');
assert.match(portalSource, /import \{ createProcessesFeature \} from '\.\/features\/processes\.js';/);
assert.equal((portalSource.match(/createProcessesFeature\(/g) || []).length, 1, 'Portal deve instanciar Processes uma única vez.');
assert.equal(portalSource.includes('processSort:'), false, 'Sort de Processos não pode manter shadow state no App.');
assert.equal(portalSource.includes("secureFetch('/api/tjrs/consult'"), false, 'TJRS concreto não pode permanecer no portal.');
assert.equal(portalSource.includes('data-tjrs-consult'), false, 'Markup e listener TJRS concretos não podem permanecer no portal.');
assert.match(portalSource, /renderProcesses\(query = ''\) \{\s*return getProcessesFeature\(\)\.render\(query\);\s*\}/);
assert.match(portalSource, /openProcessModal\(defaults = \{\}\) \{\s*return getProcessesFeature\(\)\.openProcessModal\(defaults\);\s*\}/);
assert.match(portalSource, /modalMode\.mode === 'process'\) \{\s*getProcessesFeature\(\)\.saveProcess\(data, this\.modalMode\.defaults\);/);
assert.match(portalSource, /secureFetch: \(\.\.\.args\) => window\.KellerAuth\.secureFetch\(\.\.\.args\)/, 'Wiring deve preservar KellerAuth.secureFetch com contexto seguro.');

const listenerMap = { newProcessButton: [], processSearch: [] };
const fakeElements = {
  newProcessButton: { addEventListener: (type, listener) => listenerMap.newProcessButton.push({ type, listener }) },
  processSearch: { value: '', addEventListener: (type, listener) => listenerMap.processSearch.push({ type, listener }) }
};
const unitAudits = [];
const unitStore = {
  state: {
    processes: [{ id: 'unit-process', number: '5000000-00.2026.8.21.0001', courtUnit: 'Vara Unitária' }],
    configuration: { actionTypes: [], actionGroups: [] }
  },
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
const unitToasts = [];
const unitCopies = [];
const unitExternalOpens = [];
const unitRequests = [];
const unitFeature = createProcessesFeature({
  store: unitStore,
  documentRef: { getElementById: id => fakeElements[id] || null, querySelectorAll: () => [] },
  normalizeText: value => String(value || '').toLowerCase(),
  escapeHtml: String,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => (logs || []).reduce((total, log) => total + Number(log.minutes || 0), 0),
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => { unitOpenCount++; },
  showToast: (message, type) => unitToasts.push({ message, type }),
  secureFetch: async (url, options) => {
    unitRequests.push({ url, options });
    return { json: async () => ({ ok: true, buscaUrl: 'https://tjrs.example.test/busca', message: 'Busca unitária aberta.' }) };
  },
  openExternalUrl: (...args) => unitExternalOpens.push(args),
  copyToClipboard: async value => { unitCopies.push(value); },
  getLinkedTasks: () => [],
  getLinkedIntimations: () => [],
  isTerminalStatus: status => status === 'concluida'
});
unitFeature.openProcessModal = () => { unitOpenCount++; };
unitFeature.render = query => { unitRenders.push(query); return []; };
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(listenerMap.newProcessButton.length, 1);
assert.equal(listenerMap.processSearch.length, 1);
listenerMap.newProcessButton[0].listener();
listenerMap.processSearch[0].listener({ target: { value: 'busca unitária' } });
assert.equal(unitOpenCount, 1, 'Segundo init não pode duplicar listener de novo processo.');
assert.deepEqual(unitRenders, ['busca unitária'], 'Pesquisa deve disparar um único render.');
fakeElements.processSearch.value = 'sort preservado';
assert.deepEqual(unitFeature.handleSort('registeredAt'), { field: 'registeredAt', direction: 'asc' });
assert.deepEqual(unitFeature.handleSort('client'), { field: 'client', direction: 'asc' });
assert.deepEqual(unitFeature.handleSort('lastMovementAt'), { field: 'lastMovementAt', direction: 'desc' });
assert.deepEqual(unitRenders.slice(-3), ['sort preservado', 'sort preservado', 'sort preservado']);

const unitCreated = unitFeature.saveProcess({
  number: '5001111-00.2026.8.21.0001', client: 'Cliente Unitário', feePercentage: '30', feeAmount: '1500',
  feeMonthly: '', secrecy: 'true', lastMovement: 'Movimento unitário', lastMovementAt: '2026-08-28'
}, {});
assert.ok(unitCreated.id.startsWith('proc-'));
assert.equal(unitCreated.source, 'Interna');
assert.equal(unitCreated.feePercentage, 30);
assert.equal(unitCreated.feeAmount, 1500);
assert.equal(unitCreated.feeMonthly, null);
assert.equal(unitCreated.secrecy, true);
assert.deepEqual(unitAudits.at(-1), { action: 'Processo cadastrado', detail: '5001111-00.2026.8.21.0001 · Cliente Unitário' });
const unitEdited = unitFeature.saveProcess({
  number: unitCreated.number, client: unitCreated.client, feePercentage: '', feeAmount: '', feeMonthly: '400', secrecy: 'false'
}, { ...unitCreated, externalId: 'external-unit', unknownField: 'preservado', source: 'DataJud' });
assert.equal(unitEdited.id, unitCreated.id);
assert.equal(unitEdited.externalId, 'external-unit');
assert.equal(unitEdited.unknownField, 'preservado');
assert.equal(unitEdited.source, 'DataJud');
assert.equal(unitEdited.feePercentage, null);
assert.equal(unitEdited.feeMonthly, 400);
assert.equal(unitEdited.secrecy, false);
assert.deepEqual(unitAudits.at(-1), { action: 'Processo atualizado', detail: '5001111-00.2026.8.21.0001 · Cliente Unitário' });

const unitButton = { dataset: { tjrsConsult: '5000000-00.2026.8.21.0001' }, disabled: false };
await unitFeature.consultTjrs(unitButton);
assert.deepEqual(unitCopies, ['5000000-00.2026.8.21.0001']);
assert.equal(unitRequests.length, 1);
assert.equal(unitRequests[0].url, '/api/tjrs/consult');
assert.equal(unitRequests[0].options.method, 'POST');
assert.deepEqual(JSON.parse(unitRequests[0].options.body), { processNumber: '5000000-00.2026.8.21.0001', courtUnit: 'Vara Unitária' });
assert.deepEqual(unitExternalOpens, [['https://tjrs.example.test/busca', '_blank', 'noopener,noreferrer']]);
assert.equal(unitButton.disabled, false);
assert.deepEqual(unitToasts.at(-1), { message: 'Busca unitária aberta.', type: 'success' });

const rejectedToasts = [];
const rejectedExternalOpens = [];
const rejectedFeature = createProcessesFeature({
  store: unitStore,
  documentRef: { getElementById: () => null, querySelectorAll: () => [] },
  normalizeText: String,
  escapeHtml: String,
  formatDate: String,
  formatMinutes: String,
  totalTimeMinutes: () => 0,
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => {},
  showToast: (message, type) => rejectedToasts.push({ message, type }),
  secureFetch: async () => { throw new Error('Rede TJRS indisponível'); },
  openExternalUrl: (...args) => rejectedExternalOpens.push(args),
  copyToClipboard: async () => {},
  getLinkedTasks: () => [],
  getLinkedIntimations: () => [],
  isTerminalStatus: () => false
});
const rejectedButton = { dataset: { tjrsConsult: '5000000-00.2026.8.21.0001' }, disabled: false };
await rejectedFeature.consultTjrs(rejectedButton);
assert.equal(rejectedButton.disabled, false, 'Botão TJRS deve ser restaurado após rejeição de rede.');
assert.deepEqual(rejectedExternalOpens, [], 'Rejeição TJRS não pode navegar.');
assert.deepEqual(rejectedToasts.at(-1), { message: 'Falha na consulta ao tribunal: Rede TJRS indisponível', type: 'error' });

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/processes.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Processes deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/, 'Módulo Processes deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Processes-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_processes',
    displayName: 'Advogada Processos',
    email: 'processes@example.test',
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
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const fixture = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const app = window.portalApp;
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = localDate(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = localDate(tomorrowDate);
    const explicitDeadlineDate = new Date();
    explicitDeadlineDate.setDate(explicitDeadlineDate.getDate() + 8);
    const explicitDeadline = localDate(explicitDeadlineDate);

    store.state.settings.demoMode = false;
    store.state.processes = [
      {
        id: 'process-tjrs', number: '5001234-56.2026.8.21.0001', oldNumber: '001/1.26.0000001-0',
        protocol: 'PROTOCOLO-TJRS', nb: '000.000.000-0', client: 'Cliente Processo Modular',
        clientPosition: 'Autor(a)', opposingParty: 'Parte Contrária Sintética', court: 'TJRS',
        county: 'Comarca Sintética', courtUnit: '1ª Vara Cível Sintética', actionGroup: 'Cível',
        actionType: 'Ação Sintética', judicialPhase: 'Conhecimento', stage: 'Instrução', risk: 'possivel',
        monitoring: 'active', responsible: 'Advogada Processos', caseFolder: 'PASTA-TESTE', secrecy: true,
        feeType: 'exito', feePercentage: 30, feeStatus: 'pendente', source: 'eproc',
        registeredAt: '2026-08-20', createdAt: '2026-08-20T10:00:00.000Z',
        lastMovement: 'Despacho sintético disponibilizado', lastMovementAt: '2026-08-25'
      },
      {
        id: 'process-federal', number: '5009999-00.2026.4.04.0001', client: 'Cliente Federal Sintético',
        opposingParty: 'Autarquia Sintética', court: 'TRF4', county: 'Seção Federal Sintética',
        monitoring: 'inactive', feeType: 'fixo', feeAmount: 2500, feeStatus: 'em_dia', source: 'DataJud',
        createdAt: '2026-08-28T09:00:00.000Z', lastMovement: 'Movimento federal sintético', lastMovementAt: '2026-08-27'
      }
    ];
    store.state.tasks = [
      {
        id: 'process-task-explicit', title: 'Tarefa vinculada com prazo explícito', process: '5001234-56.2026.8.21.0001',
        status: 'andamento', deadline: explicitDeadline, fatalDeadline: tomorrow, description: 'Prazo confirmado manualmente',
        timeLogs: [{ id: 'process-time-1', minutes: 30, date: today, description: 'Estudo sintético' }]
      },
      {
        id: 'process-task-text-only', title: 'Apelação em 15 dias', process: '5001234-56.2026.8.21.0001',
        status: 'concluida', description: 'Embargos e prazo fatal citados apenas como texto',
        timeLogs: [{ id: 'process-time-2', minutes: 45, date: today, description: 'Análise sintética' }]
      }
    ];
    store.state.intimations = [{
      id: 'process-intimation', title: 'Intimação vinculada sintética', process: '5001234-56.2026.8.21.0001',
      text: 'Apelação em 15 dias, embargos e prazo fatal apenas em texto.', publishedAt: today,
      treatmentStatus: 'untreated', unread: true
    }];
    store.state.audit = [];
    app.renderAll();
    await store.flush();
    return { today, tomorrow, explicitDeadline };
  });

  await page.click('button[data-view="processes"]');
  await page.locator('#view-processes.active').waitFor();
  assert.deepEqual(
    await page.locator('#processTableBody [data-process-id]').evaluateAll(rows => rows.map(row => row.dataset.processId)),
    ['process-federal', 'process-tjrs'],
    'Ordenação inicial deve permanecer registeredAt desc.'
  );
  assert.equal(await page.locator('#processTable th[data-sort-field="registeredAt"].sorted-desc').count(), 1);

  const tjrsRow = page.locator('#processTableBody [data-process-id="process-tjrs"]');
  const tjrsText = await tjrsRow.textContent();
  for (const expected of [
    '5001234-56.2026.8.21.0001', 'Segredo de justiça', 'PASTA-TESTE', 'NB 000.000.000-0',
    'Autor(a)', 'Cliente Processo Modular', 'Parte Contrária Sintética', '30% êxito', 'pendente',
    'TJRS', 'Ação Sintética', 'Conhecimento', 'Instrução', 'Risco Médio', 'eproc',
    'Despacho sintético disponibilizado', 'Monitorando', 'Consultar TJRS'
  ]) assert.ok(tjrsText.includes(expected), `Tabela deve preservar semanticamente: ${expected}`);
  assert.equal(await page.locator('#processTableBody [data-process-id="process-federal"] [data-tjrs-consult]').count(), 0);

  const searchCases = [
    ['5001234-56.2026.8.21.0001', 'process-tjrs'],
    ['Cliente Processo Modular', 'process-tjrs'],
    ['tjrs', 'process-tjrs'],
    ['Comarca Sintética', 'process-tjrs'],
    ['Comarca Sintetica', 'process-tjrs'],
    ['000.000.000-0', 'process-tjrs'],
    ['Parte Contrária Sintética', 'process-tjrs'],
    ['2026-08-20', 'process-tjrs'],
    ['2026-08-28', 'process-federal']
  ];
  for (const [query, expectedId] of searchCases) {
    await page.locator('#processSearch').fill(query);
    await page.locator(`#processTableBody [data-process-id="${expectedId}"]`).waitFor();
    assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 1, `Busca deve localizar apenas ${expectedId} por ${query}.`);
  }
  await page.locator('#processSearch').fill('registro inexistente fase 9');
  assert.match(await page.locator('#processTableBody').textContent(), /Nenhum processo encontrado/);
  await page.locator('#processSearch').fill('');

  await page.locator('#processTable th[data-sort-field="client"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="client"].sorted-asc').count(), 1);
  await page.locator('#processTable th[data-sort-field="client"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="client"].sorted-desc').count(), 1);
  await page.locator('#processTable th[data-sort-field="lastMovementAt"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="lastMovementAt"].sorted-desc').count(), 1);

  const crossDomainBefore = await page.evaluate(() => JSON.stringify({
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations
  }));
  await page.locator('#processTableBody [data-process-id="process-tjrs"]').click();
  const summary = page.locator('[data-process-summary]');
  await summary.waitFor();
  const summaryText = await summary.textContent();
  for (const expected of ['5001234-56.2026.8.21.0001', 'Cliente Processo Modular', 'TJRS', 'Tarefas abertas', 'Intimações', '1h15m', 'Tempo apontado', 'Próximo prazo', 'Despacho sintético disponibilizado']) {
    assert.ok(summaryText.includes(expected), `Resumo deve preservar: ${expected}`);
  }
  const summaryMetrics = summary.locator('.process-summary-metrics > div');
  assert.equal(await summaryMetrics.nth(0).locator('strong').textContent(), '1', 'Tarefa terminal deve ficar fora das tarefas abertas.');
  assert.equal(await summaryMetrics.nth(1).locator('strong').textContent(), '1');
  assert.equal(await summaryMetrics.nth(2).locator('strong').textContent(), '1h15m');
  assert.equal(await summaryMetrics.nth(3).locator('strong').textContent(), fixture.tomorrow.split('-').reverse().join('/'), 'fatalDeadline explícito deve preceder deadline explícito no resumo.');
  const crossDomainAfter = await page.evaluate(() => JSON.stringify({
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations
  }));
  assert.equal(crossDomainAfter, crossDomainBefore, 'Abrir resumo não pode alterar Tasks ou Publicações.');
  const noInference = await page.evaluate(() => {
    const task = window.Atrium.Store.state.tasks.find(item => item.id === 'process-task-text-only');
    const intimation = window.Atrium.Store.state.intimations.find(item => item.id === 'process-intimation');
    return {
      taskDeadline: Object.hasOwn(task, 'deadline'), taskFatal: Object.hasOwn(task, 'fatalDeadline'),
      intimationDeadline: Object.hasOwn(intimation, 'deadline'), intimationFatal: Object.hasOwn(intimation, 'fatalDeadline')
    };
  });
  assert.deepEqual(noInference, { taskDeadline: false, taskFatal: false, intimationDeadline: false, intimationFatal: false });
  await page.click('#modalCancel');

  let requestCount = 0;
  let requestPayload = null;
  let requestMethod = null;
  let tjrsMode = 'success';
  let releaseRequest;
  let requestStartedResolve;
  let requestStarted = new Promise(resolve => { requestStartedResolve = resolve; });
  await page.route('**/api/tjrs/consult', async route => {
    requestCount++;
    requestMethod = route.request().method();
    requestPayload = route.request().postDataJSON();
    requestStartedResolve();
    if (tjrsMode === 'success') await new Promise(resolve => { releaseRequest = resolve; });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tjrsMode === 'success'
        ? { ok: true, directUrl: 'https://tjrs.example.test/consulta', message: 'Consulta sintética aberta.' }
        : { ok: false, message: 'Falha sintética controlada.' })
    });
  });
  await page.evaluate(() => {
    window.__processOpenCalls = [];
    window.open = (...args) => { window.__processOpenCalls.push(args); return null; };
  });
  assert.equal(requestCount, 0, 'Render e modal não podem consultar TJRS automaticamente.');
  const consultButton = page.locator('#processTableBody [data-process-id="process-tjrs"] [data-tjrs-consult]');
  const successClick = consultButton.click();
  await requestStarted;
  assert.equal(await consultButton.isDisabled(), true, 'Botão TJRS deve ficar desabilitado durante request.');
  releaseRequest();
  await successClick;
  await page.locator('#toastRegion .toast.success', { hasText: 'Consulta sintética aberta.' }).waitFor();
  assert.equal(requestCount, 1);
  assert.equal(requestMethod, 'POST');
  assert.deepEqual(requestPayload, { processNumber: '5001234-56.2026.8.21.0001', courtUnit: '1ª Vara Cível Sintética' });
  assert.equal(await consultButton.isDisabled(), false, 'Botão TJRS deve ser restaurado após request.');
  assert.deepEqual(await page.evaluate(() => window.__processOpenCalls), [['https://tjrs.example.test/consulta', '_blank', 'noopener,noreferrer']]);

  tjrsMode = 'failure';
  requestStarted = new Promise(resolve => { requestStartedResolve = resolve; });
  await consultButton.click();
  await page.locator('#toastRegion .toast.error', { hasText: 'Falha sintética controlada.' }).waitFor();
  assert.equal(requestCount, 2, 'Cada clique explícito deve gerar exatamente um request TJRS.');
  assert.equal(await consultButton.isDisabled(), false, 'Botão TJRS deve ser restaurado após resposta de falha.');
  assert.equal((await page.evaluate(() => window.__processOpenCalls)).length, 1, 'Falha TJRS não pode navegar.');

  const reauthenticatedOpenCount = await page.evaluate(() => {
    const app = window.portalApp;
    const originalOpenModal = app.openModal;
    let openCount = 0;
    app.openModal = function (...args) {
      openCount++;
      return originalOpenModal.apply(this, args);
    };
    window.dispatchEvent(new CustomEvent('keller:authenticated'));
    document.getElementById('newProcessButton').click();
    app.openModal = originalOpenModal;
    return openCount;
  });
  assert.equal(reauthenticatedOpenCount, 1, 'Segundo evento de autenticação não pode duplicar listeners de Processos.');
  await page.locator('#modalTitle', { hasText: 'Cadastrar processo' }).waitFor();
  await page.click('#modalCancel');

  await page.click('#newProcessButton');
  await page.locator('#modalTitle', { hasText: 'Cadastrar processo' }).waitFor();
  const expectedFields = [
    'number', 'oldNumber', 'nb', 'client', 'clientPosition', 'opposingParty', 'actionGroup', 'actionType',
    'judicialPhase', 'risk', 'stage', 'protocol', 'caseFolder', 'court', 'county', 'courtUnit', 'responsible',
    'registeredAt', 'lastMovementAt', 'lastMovement', 'feeType', 'feePercentage', 'feeAmount', 'feeMonthly',
    'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionBank', 'requisitionStatus', 'feeNotes',
    'secrecy', 'monitoring', 'notes'
  ];
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), expectedFields);
  await page.fill('#field-number', '5007777-00.2026.4.04.0001');
  await page.fill('#field-client', 'Cliente CRUD Processos');
  await page.fill('#field-court', 'TRF4');
  await page.fill('#field-county', 'Seção Sintética CRUD');
  await page.fill('#field-stage', 'Cadastro inicial');
  await page.fill('#field-registeredAt', fixture.today);
  await page.fill('#field-lastMovementAt', fixture.today);
  await page.fill('#field-lastMovement', 'Movimento inicial sintético');
  await page.selectOption('#field-feeType', 'misto');
  await page.fill('#field-feePercentage', '25');
  await page.fill('#field-feeAmount', '1250');
  await page.fill('#field-feeMonthly', '350');
  await page.selectOption('#field-secrecy', 'true');
  await page.selectOption('#field-monitoring', 'active');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const created = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.number === '5007777-00.2026.4.04.0001'));
  assert.ok(created?.id?.startsWith('proc-'));
  assert.equal(created.source, 'Interna');
  assert.equal(created.lastMovement, 'Movimento inicial sintético');
  assert.equal(created.lastMovementAt, fixture.today);
  assert.equal(created.feePercentage, 25);
  assert.equal(created.feeAmount, 1250);
  assert.equal(created.feeMonthly, 350);
  assert.equal(created.secrecy, true);
  assert.ok(Date.parse(created.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Processo cadastrado' && item.detail.includes('5007777-00.2026.4.04.0001'))), true);

  await page.locator(`#processTableBody [data-process-id="${created.id}"]`).click();
  await page.fill('#field-stage', 'Etapa editada Fase 9');
  await page.fill('#field-feePercentage', '35');
  await page.fill('#field-feeAmount', '');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(edited.id, created.id);
  assert.equal(edited.client, 'Cliente CRUD Processos');
  assert.equal(edited.court, 'TRF4');
  assert.equal(edited.stage, 'Etapa editada Fase 9');
  assert.equal(edited.feePercentage, 35);
  assert.equal(edited.feeAmount, null);
  assert.equal(edited.feeMonthly, 350);
  assert.equal(edited.secrecy, true);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Processo atualizado' && item.detail.includes('5007777-00.2026.4.04.0001'))), true);

  await page.locator('#globalSearch').fill('5007777-00.2026.4.04.0001');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.locator(`[data-search-target="process"][data-search-id="${created.id}"]`).click();
  await page.locator('#view-processes.active').waitFor();
  assert.equal(await page.locator('#processSearch').inputValue(), '5007777-00.2026.4.04.0001');
  assert.equal(await page.locator(`#processTableBody [data-process-id="${created.id}"]`).count(), 1);

  await page.click('button[data-view="dashboard"]');
  await page.locator('#view-dashboard.active').waitFor();
  assert.equal(await page.locator('#metricTasks').textContent(), '2', 'Métrica histórica deve contar monitoring diferente de inactive.');

  await page.click('button[data-view="financial"]');
  await page.locator('#view-financial.active').waitFor();
  await page.click('#newFinancialEntryButton');
  await page.selectOption('#finProcessSelect', created.id);
  await page.selectOption('#finTypeSelect', 'rpv');
  await page.selectOption('#finStatusSelect', 'aguardando_deposito');
  await page.fill('#finGrossInput', '50000');
  await page.fill('#finFeePctInput', '20');
  await page.click('#financialEntryForm button[type="submit"]');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  const financeMutation = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(financeMutation.requisitionAmount, 50000);
  assert.equal(financeMutation.feePercentage, 20);
  assert.equal(financeMutation.feeAmount, 10000);
  assert.equal(financeMutation.requisitionStatus, 'aguardando_deposito');
  assert.equal(financeMutation.feeType, 'RPV / Precatório');
  await page.click('button[data-view="processes"]');
  await page.locator('#processSearch').fill('5007777-00.2026.4.04.0001');
  await page.locator(`#processTableBody [data-process-id="${created.id}"] .fee-chip`, { hasText: 'Valor: R$ 10.000' }).waitFor();

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.click('button[data-view="processes"]');
  const persisted = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(persisted.stage, 'Etapa editada Fase 9');
  assert.equal(persisted.requisitionAmount, 50000);
  assert.equal(persisted.feeAmount, 10000);
  assert.equal(persisted.secrecy, true);
  assert.deepEqual(pageErrors, [], `Erros de página detectados: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Caracterização aprovada: pesquisa, sort, tabela, CRUD, resumo, TJRS e integrações externas.');
