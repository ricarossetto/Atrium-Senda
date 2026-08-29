import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { collectAgendaActivities, createAgendaFeature } from '../js/features/agenda.js';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featurePath = path.join(ROOT, 'js', 'features', 'agenda.js');
const portalPath = path.join(ROOT, 'js', 'portal.js');
const [featureSource, portalSource] = await Promise.all([
  readFile(featurePath, 'utf8'),
  readFile(portalPath, 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — SUÍTE DA FEATURE MODULAR DE AGENDA INTEGRADA');
console.log('===============================================================\n');

assert.doesNotMatch(featureSource, /from\s+['"][^'"]*portal\.js['"]/, 'Agenda não pode importar portal.js.');
assert.doesNotMatch(featureSource, /from\s+['"][^'"]*publications\.js['"]/, 'Agenda não pode importar Publications.');
assert.doesNotMatch(featureSource, /from\s+['"][^'"]*(?:kanban|tasks?)[^'"]*['"]/, 'Agenda não pode importar Kanban/Tarefas.');
assert.match(featureSource, /from ['"]\.\.\/core\/store\.js['"]/, 'Agenda deve consumir o Store canônico.');
assert.match(portalSource, /from ['"]\.\/features\/agenda\.js['"]/, 'portal.js deve importar a feature Agenda.');
assert.doesNotMatch(featureSource, /window\.(?:Agenda|AtriumAgenda)\s*=/, 'Agenda não pode criar global próprio.');
assert.doesNotMatch(featureSource, /store\.upsert\(['"]tasks['"]|store\.state\.tasks\.(?:push|unshift|splice)|store\.state\.tasks\s*=/, 'Agenda não pode mutar tarefas.');
assert.doesNotMatch(featureSource, /store\.upsert\(['"]intimations['"]|store\.state\.intimations\.(?:push|unshift|splice)|store\.state\.intimations\s*=/, 'Agenda não pode mutar publicações.');
assert.doesNotMatch(featureSource, /\.fatalDeadline\s*=(?!=)|\.deadline\s*=(?!=)/, 'Agenda não pode criar ou inferir prazos.');

const wrapperContracts = [
  ['renderAgenda', 'render'],
  ['renderMiniCalendar', 'renderMiniCalendar'],
  ['openAgendaModal', 'openModal']
];
for (const [wrapper, target] of wrapperContracts) {
  assert.match(
    portalSource,
    new RegExp(`${wrapper}\\([^)]*\\)\\s*\\{\\s*return getAgendaFeature\\(\\)\\.${target}\\(`),
    `App.${wrapper} deve ser somente um wrapper fino.`
  );
}
assert.match(portalSource, /modalMode\.mode === ['"]agenda['"]\)\s*\{\s*getAgendaFeature\(\)\.saveRecord\(data, this\.modalMode\.defaults\);\s*\}/, 'Dispatcher genérico deve delegar somente o branch Agenda.');
assert.equal((portalSource.match(/createAgendaFeature\(/g) || []).length, 1, 'Deve existir uma única instância canônica da Agenda.');
assert.equal((featureSource.match(/render\(\)\s*\{/g) || []).length, 1, 'A implementação concreta de render deve existir uma única vez.');
assert.match(portalSource, /get agendaSelectedDate\(\) \{ return getAgendaFeature\(\)\.selectedDate; \}/);
assert.match(portalSource, /get agendaCalendarMonthOffset\(\) \{ return getAgendaFeature\(\)\.calendarMonthOffset; \}/);
assert.match(portalSource, /get agendaTypeFilter\(\) \{ return getAgendaFeature\(\)\.typeFilter; \}/);
assert.doesNotMatch(portalSource, /agendaSelectedDate:\s*null|agendaCalendarMonthOffset:\s*0|agendaTypeFilter:\s*['"]all['"]/, 'portal.js não pode manter shadow state da Agenda.');
assert.match(portalSource, /agendaSyncButton['"]\)\?\.addEventListener\(['"]click['"], \(\) => this\.syncAll\(\)\)/, 'Sync global deve permanecer no portal.');

const referenceToday = '2026-08-28';
const legalTextTask = { id: 'legal-text', title: 'Apelação — prazo fatal em 15 dias — embargos', client: 'Cliente Texto' };
const synthetic = {
  agenda: [
    { id: 'past-event', title: 'Passado', date: '2026-08-27' },
    { id: 'event', title: 'Audiência', date: referenceToday, time: '09:30', client: 'Cliente Evento', source: 'ADVBOX' }
  ],
  tasks: [
    { id: 'task', title: 'Tarefa', deadline: referenceToday, time: '10:00', points: 5, timeLogs: [{ minutes: 35 }] },
    { id: 'fatal', title: 'Fatal explícito', deadline: '2026-09-02', fatalDeadline: '2026-08-29' },
    legalTextTask
  ],
  intimations: [
    { id: 'intimation', title: 'Contestação', publishedAt: referenceToday, process: '5000', client: 'Parte Teste' }
  ]
};
const collectOptions = {
  ...synthetic,
  today: referenceToday,
  classifyIntimation: () => ({ label: 'Contestação', css: 'contestacao' }),
  getIntimationParties: item => item.client,
  totalTimeMinutes: logs => (logs || []).reduce((sum, entry) => sum + Number(entry.minutes || 0), 0)
};

const allActivities = collectAgendaActivities(collectOptions);
assert.deepEqual(new Set(allActivities.activities.map(item => item.id)), new Set(['event', 'task', 'fatal', 'intimation']), 'Agenda deve excluir passado e não representar tarefa sem data como compromisso de hoje.');
assert.equal(allActivities.tasks.find(item => item.id === 'task').timeMins, 35, 'Time logs devem permanecer visíveis.');
assert.equal(allActivities.tasks.find(item => item.id === 'fatal').date, '2026-08-29', 'Prazo fatal deve usar apenas fatalDeadline explícito.');
assert.equal(allActivities.tasks.some(item => item.id === 'legal-text'), false, 'Tarefa sem data explícita não deve ser projetada visualmente na Agenda.');
assert.equal(Object.hasOwn(legalTextTask, 'deadline'), false);
assert.equal(Object.hasOwn(legalTextTask, 'fatalDeadline'), false);
assert.deepEqual(collectAgendaActivities({ ...collectOptions, typeFilter: 'event' }).activities.map(item => item.type), ['event']);
assert.ok(collectAgendaActivities({ ...collectOptions, typeFilter: 'task' }).activities.every(item => item.type === 'task'));
assert.deepEqual(collectAgendaActivities({ ...collectOptions, typeFilter: 'intimation' }).activities.map(item => item.type), ['intimation']);
assert.deepEqual(
  collectAgendaActivities({ ...collectOptions, selectedDate: referenceToday }).activities.map(item => item.id),
  ['event', 'task', 'intimation'],
  'Data selecionada deve mostrar somente atividades daquela data na ordenação histórica date + time.'
);
const localNoon = new Date(`${referenceToday}T12:00:00`);
assert.equal(localNoon.getDate(), 28, 'Data date-only deve ser renderizada ao meio-dia local, sem deslocamento UTC.');

let listenerRegistrations = 0;
const fakeElements = new Map(['newAgendaButton', 'agendaFilterTabs', 'agendaTodayButton', 'agendaAllUpcomingButton'].map(id => [id, {
  addEventListener() { listenerRegistrations += 1; }
}]));
const fakeDocument = { getElementById(id) { return fakeElements.get(id) || null; } };
const fakeStore = {
  state: { agenda: [], tasks: [], intimations: [] },
  upserts: [],
  audits: [],
  upsert(collection, record) { this.upserts.push({ collection, record }); },
  audit(action, detail) { this.audits.push({ action, detail }); }
};
let modalContract;
const isolatedFeature = createAgendaFeature({
  store: fakeStore,
  documentRef: fakeDocument,
  escapeHtml: String,
  formatDate: value => `DATA:${value}`,
  formatMinutes: String,
  totalTimeMinutes: () => 0,
  classifyIntimation: () => ({ label: 'Publicação', css: 'rotina' }),
  getIntimationParties: () => '',
  openModal: (...args) => { modalContract = args; }
});
assert.equal(isolatedFeature.init(), true, 'Primeiro init deve registrar listeners.');
assert.equal(isolatedFeature.init(), false, 'Segundo init deve ser ignorado.');
assert.equal(listenerRegistrations, 4, 'Init idempotente deve registrar cada listener exclusivo uma única vez.');
isolatedFeature.selectedDate = referenceToday;
isolatedFeature.calendarMonthOffset = 2;
isolatedFeature.typeFilter = 'task';
assert.equal(isolatedFeature.selectedDate, referenceToday);
assert.equal(isolatedFeature.calendarMonthOffset, 2);
assert.equal(isolatedFeature.typeFilter, 'task');

isolatedFeature.openModal({ id: 'agenda-existing', externalId: 'ext-1', title: 'Existente' });
assert.equal(modalContract[0], 'agenda');
assert.equal(modalContract[1], 'Detalhes do compromisso');
assert.equal(modalContract[2], 'Agenda jurídica');
assert.deepEqual(modalContract[3].map(field => field.name), ['title', 'date', 'time', 'client', 'process', 'location', 'source', 'description']);
assert.deepEqual(modalContract[3].find(field => field.name === 'source').options.map(option => option.value), ['Interna', 'ADVBOX', 'Agenda ADVBOX']);

const created = isolatedFeature.saveRecord({ title: 'Novo compromisso', date: referenceToday }, {});
assert.match(created.id, /^agenda-/);
assert.equal(created.externalId, null);
assert.ok(Date.parse(created.updatedAt));
assert.equal(fakeStore.upserts.at(-1).collection, 'agenda');
assert.deepEqual(fakeStore.audits.at(-1), { action: 'Compromisso cadastrado', detail: `Novo compromisso · DATA:${referenceToday}` });
const updated = isolatedFeature.saveRecord({ title: 'Compromisso atualizado', date: '2026-08-29' }, { id: 'agenda-existing', externalId: 'ext-1', description: 'Anterior' });
assert.equal(updated.id, 'agenda-existing');
assert.equal(updated.externalId, 'ext-1');
assert.equal(updated.description, 'Anterior');
assert.deepEqual(fakeStore.audits.at(-1), { action: 'Compromisso atualizado', detail: 'Compromisso atualizado · DATA:2026-08-29' });

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/agenda.js`);
  assert.equal(moduleResponse.status, 200, 'O módulo Agenda deve responder HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /^(text|application)\/javascript\b/i, 'O módulo deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Agenda-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_agenda',
    displayName: 'Advogada Agenda',
    email: 'agenda@example.test',
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

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR' });
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
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const today = localDate(now);
    const tomorrow = localDate(next);
    store.state.agenda = [{
      id: 'agenda-seed', externalId: 'agenda-ext-1', title: 'Audiência Agenda Modular', date: today,
      time: '09:30', client: 'Cliente Agenda', process: '5000000-00.2026.8.21.0001', location: 'Sala 1',
      source: 'ADVBOX', description: 'Fixture Agenda', updatedAt: new Date().toISOString()
    }];
    store.state.tasks = [
      { id: 'task-explicit', title: 'Tarefa com deadline explícito', deadline: today, time: '10:00', client: 'Cliente Tarefa', points: 8, timeLogs: [{ minutes: 45 }] },
      { id: 'task-fatal', title: 'Tarefa fatal explícita', deadline: tomorrow, fatalDeadline: tomorrow, client: 'Cliente Fatal' },
      { id: 'task-legal-text', title: 'Apelação, embargos e prazo fatal em 15 dias', client: 'Cliente Sem Prazo' }
    ];
    store.state.intimations = [{
      id: 'intimation-agenda', title: 'Contestação publicada', publishedAt: today, createdAt: `${today}T08:00:00.000Z`,
      process: '5000000-00.2026.8.21.0001', client: 'Parte Publicação', text: 'Intimação: conteste no prazo assinalado.',
      unread: true, treatmentStatus: 'untreated', revision: 'revision-intimation-test'
    }];
    store.state.audit = [];
    app.renderAgenda();
    assertNoInferredDeadline();
    await store.flush();
    return { today, tomorrow };

    function assertNoInferredDeadline() {
      const textOnly = store.state.tasks.find(task => task.id === 'task-legal-text');
      if (Object.hasOwn(textOnly, 'deadline') || Object.hasOwn(textOnly, 'fatalDeadline')) throw new Error('Agenda inferiu prazo indevido.');
    }
  });

  await page.click('button[data-view="agenda"]');
  await page.locator('#view-agenda.active').waitFor();
  await page.locator('#agendaList [data-agenda-activity-id="agenda-seed"]').waitFor();
  assert.equal(await page.locator('#agendaList [data-agenda-activity-id="agenda-seed"] .agenda-date strong').textContent(), fixture.today.slice(-2), 'Date-only deve manter o dia local exibido.');

  const activityCounts = async () => page.locator('#agendaList [data-agenda-activity-type]').count();
  await page.click('#agendaFilterTabs button[data-agenda-filter="event"]');
  assert.equal(await activityCounts(), 1, 'Filtro event deve mostrar apenas compromissos.');
  await page.click('#agendaFilterTabs button[data-agenda-filter="task"]');
  assert.equal(await activityCounts(), 2, 'Filtro task deve mostrar apenas tarefas com data explicitamente confirmada.');
  await page.click('#agendaFilterTabs button[data-agenda-filter="intimation"]');
  assert.equal(await activityCounts(), 1, 'Filtro intimation deve mostrar apenas publicação.');
  assert.match(await page.locator('#agendaList [data-agenda-activity-id="intimation-agenda"]').textContent(), /Parte Publicação/);
  assert.match(await page.locator('#agendaList [data-agenda-activity-id="intimation-agenda"] .act-chip').textContent(), /Contestação/);
  await page.click('#agendaFilterTabs button[data-agenda-filter="all"]');
  assert.equal(await activityCounts(), 4, 'Filtro all deve integrar evento, tarefas datadas e publicação sem inventar data para texto jurídico.');

  const todayButton = page.locator(`#miniCalendar .calendar-day[data-cal-date="${fixture.today}"]`);
  const tomorrowButton = page.locator(`#miniCalendar .calendar-day[data-cal-date="${fixture.tomorrow}"]`);
  assert.equal(await todayButton.locator('.cal-dot.event').count(), 1, 'Event dot ausente.');
  assert.equal(await todayButton.locator('.cal-dot.task').count(), 1, 'Task dot ausente.');
  assert.equal(await todayButton.locator('.cal-dot.intimation').count(), 1, 'Intimation dot ausente.');
  assert.equal(await tomorrowButton.locator('.cal-dot.fatal').count(), 1, 'Fatal dot explícito ausente.');
  assert.equal(await todayButton.evaluate(element => element.classList.contains('today')), true, 'Dia atual deve manter classe today.');

  await todayButton.click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), fixture.today);
  assert.equal(await page.locator(`#miniCalendar .calendar-day[data-cal-date="${fixture.today}"]`).evaluate(element => element.classList.contains('selected')), true);
  await page.locator(`#miniCalendar .calendar-day[data-cal-date="${fixture.today}"]`).click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), null, 'Segundo clique deve desmarcar a data.');
  await page.click('#agendaTodayButton');
  assert.deepEqual(await page.evaluate(() => ({ selected: window.portalApp.agendaSelectedDate, offset: window.portalApp.agendaCalendarMonthOffset })), { selected: fixture.today, offset: 0 });
  await page.click('#agendaAllUpcomingButton');
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), null);

  const initialMonth = await page.locator('#miniCalendar .calendar-header h3').textContent();
  await page.click('#calNextMonth');
  assert.equal(await page.evaluate(() => window.portalApp.agendaCalendarMonthOffset), 1);
  assert.notEqual(await page.locator('#miniCalendar .calendar-header h3').textContent(), initialMonth, 'Próximo mês deve atualizar cabeçalho.');
  await page.click('#calPrevMonth');
  assert.equal(await page.evaluate(() => window.portalApp.agendaCalendarMonthOffset), 0);
  assert.equal(await page.locator('#miniCalendar .calendar-header h3').textContent(), initialMonth, 'Mês anterior deve restaurar cabeçalho.');

  const intimationBefore = await page.evaluate(() => {
    const item = window.Atrium.Store.state.intimations.find(record => record.id === 'intimation-agenda');
    return { unread: item.unread, treatmentStatus: item.treatmentStatus, revision: item.revision };
  });
  await page.locator('#agendaList [data-agenda-activity-id="intimation-agenda"]').click();
  await page.locator('#modalTitle', { hasText: 'Detalhes da intimação' }).waitFor();
  assert.match(await page.locator('#modalForm [name="actInfo"]').inputValue(), /CONTESTAÇÃO/);
  await page.click('#modalCancel');
  const intimationAfter = await page.evaluate(() => {
    const item = window.Atrium.Store.state.intimations.find(record => record.id === 'intimation-agenda');
    return { unread: item.unread, treatmentStatus: item.treatmentStatus, revision: item.revision };
  });
  assert.deepEqual(intimationAfter, intimationBefore, 'Render/clique da Agenda não pode alterar workflow da publicação.');

  await page.evaluate(() => {
    window.__agendaRouteCounts = { task: 0, intimation: 0 };
    window.portalApp.openTaskModal = () => { window.__agendaRouteCounts.task += 1; };
    window.portalApp.openIntimationDetailModal = () => { window.__agendaRouteCounts.intimation += 1; };
    window.portalApp.renderAgenda();
  });
  await page.locator('#agendaList [data-agenda-activity-id="task-explicit"]').click();
  await page.locator('#agendaList [data-agenda-activity-id="intimation-agenda"]').click();
  assert.deepEqual(await page.evaluate(() => window.__agendaRouteCounts), { task: 1, intimation: 1 }, 'Callbacks cross-domain devem disparar exatamente uma vez.');

  await page.locator('#agendaList [data-agenda-activity-id="agenda-seed"]').click();
  await page.locator('#modalTitle', { hasText: 'Detalhes do compromisso' }).waitFor();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), ['title', 'date', 'time', 'client', 'process', 'location', 'source', 'description']);
  assert.equal(await page.locator('#modalForm [name="source"]').inputValue(), 'ADVBOX');
  await page.locator('#modalForm [name="title"]').fill('Audiência Agenda Modular Editada');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.Atrium.Store.flush());
  const editedRecord = await page.evaluate(() => window.Atrium.Store.state.agenda.find(record => record.id === 'agenda-seed'));
  assert.equal(editedRecord.id, 'agenda-seed');
  assert.equal(editedRecord.externalId, 'agenda-ext-1');
  assert.ok(Date.parse(editedRecord.updatedAt));

  await page.click('#newAgendaButton');
  await page.locator('#modalTitle', { hasText: 'Novo compromisso' }).waitFor();
  await page.locator('#modalForm [name="title"]').fill('Novo Compromisso Agenda Modular');
  await page.locator('#modalForm [name="date"]').fill(fixture.today);
  await page.locator('#modalForm [name="time"]').fill('14:20');
  await page.locator('#modalForm [name="client"]').fill('Novo Cliente Agenda');
  await page.locator('#modalForm [name="process"]').fill('6000000-00.2026.8.21.0001');
  await page.locator('#modalForm [name="location"]').fill('Sala 2');
  await page.locator('#modalForm [name="source"]').selectOption('Interna');
  await page.locator('#modalForm [name="description"]').fill('Descrição preservada');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.Atrium.Store.flush());
  const persistedSummary = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const created = store.state.agenda.find(record => record.title === 'Novo Compromisso Agenda Modular');
    const legal = store.state.tasks.find(record => record.id === 'task-legal-text');
    return {
      created,
      legalHasDeadline: Object.hasOwn(legal, 'deadline'),
      legalHasFatal: Object.hasOwn(legal, 'fatalDeadline'),
      audits: store.state.audit.filter(item => item.action.startsWith('Compromisso ')).map(item => item.action)
    };
  });
  assert.match(persistedSummary.created.id, /^agenda-/);
  assert.equal(persistedSummary.created.externalId, null);
  assert.ok(Date.parse(persistedSummary.created.updatedAt));
  assert.equal(persistedSummary.legalHasDeadline, false);
  assert.equal(persistedSummary.legalHasFatal, false);
  assert.ok(persistedSummary.audits.includes('Compromisso cadastrado'));
  assert.ok(persistedSummary.audits.includes('Compromisso atualizado'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.click('button[data-view="agenda"]');
  await page.locator('#agendaList [data-agenda-activity-id="agenda-seed"]', { hasText: 'Audiência Agenda Modular Editada' }).waitFor();
  await page.locator('#agendaList .agenda-item', { hasText: 'Novo Compromisso Agenda Modular' }).waitFor();
  const reloaded = await page.evaluate(() => ({
    edited: window.Atrium.Store.state.agenda.find(record => record.id === 'agenda-seed'),
    created: window.Atrium.Store.state.agenda.find(record => record.title === 'Novo Compromisso Agenda Modular')
  }));
  assert.equal(reloaded.edited.externalId, 'agenda-ext-1');
  assert.ok(reloaded.created.id && reloaded.created.updatedAt, 'CRUD deve sobreviver ao reload real.');
  assert.deepEqual(pageErrors, [], `Erros de página detectados: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Arquitetura sem ciclos, Store único e wrappers finos');
console.log('✓ Estado efêmero único e init idempotente');
console.log('✓ CRUD/audit persistentes com reload real');
console.log('✓ Filtros, date-only, hoje, próximas e mini calendário');
console.log('✓ Tarefas/publicações somente leitura e callbacks exatos');
console.log('✓ Nenhuma inferência de deadline ou fatalDeadline');
console.log('\nSUÍTE AGENDA FEATURE APROVADA.');
