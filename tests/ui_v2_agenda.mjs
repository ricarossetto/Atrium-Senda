import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAgendaActivities } from '../js/features/agenda.js';
import { prepareUiV2AgendaFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource, modalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/agenda.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/agenda-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/components/modal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 AGENDA INTEGRADA');
console.log('===============================================================\n');

assert.match(featureSource, /createAgendaPresenter/);
assert.equal((portalSource.match(/createAgendaFeature\(/g) || []).length, 1, 'Agenda continua com uma única feature funcional.');
assert.doesNotMatch(presenterSource, /core\/store|\bStore\b|fetch\s*\(|\.flush\s*\(|\.save\s*\(|\.audit\s*\(|setInterval\s*\(/, 'Presenter não pode acessar persistência, rede, auditoria ou timers.');
assert.doesNotMatch(featureSource, /createAgendaV2Feature|store\.upsert\(['"]tasks|store\.upsert\(['"]intimations/);
assert.match(portalSource, /App\.currentView === ['"]agenda['"]\) App\.renderAgenda\(\)/, 'Troca de UI deve reapresentar a mesma Agenda.');
assert.match(modalSource, /mode === ['"]agenda['"] && isV2[\s\S]*renderAgendaSections/);

const legalText = { id: 'text-only', title: 'Intime-se em 15 dias' };
const publicationText = { id: 'publication', title: 'Publicação', publishedAt: '2026-09-07', text: 'Manifeste-se em 15 dias.' };
const direct = collectAgendaActivities({
  agenda: [{ id: 'event', title: 'Evento', date: '2026-09-07' }],
  tasks: [
    { id: 'deadline', title: 'Data registrada', deadline: '2026-09-10' },
    { id: 'fatal', title: 'Fatal registrado', deadline: '2026-09-10', fatalDeadline: '2026-09-08' },
    legalText
  ],
  intimations: [publicationText],
  today: '2026-09-07',
  classifyIntimation: () => ({ label: 'Publicação', css: 'rotina' }),
  getIntimationParties: () => 'Parte Sintética',
  totalTimeMinutes: () => 0
});
assert.equal(direct.tasks.find(item => item.id === 'fatal').date, '2026-09-08', 'fatalDeadline explícito deve preceder deadline.');
assert.equal(direct.tasks.some(item => item.id === 'text-only'), false, 'Texto sem data não deve virar atividade temporal.');
assert.equal(direct.intimations[0].date, '2026-09-07');
assert.equal(direct.intimations[0].time, 'Publicação', 'publishedAt deve continuar semanticamente como publicação.');
assert.equal(Object.hasOwn(legalText, 'deadline'), false);
assert.equal(Object.hasOwn(legalText, 'fatalDeadline'), false);
assert.equal(Object.hasOwn(publicationText, 'deadline'), false);
assert.equal(Object.hasOwn(publicationText, 'fatalDeadline'), false);

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  const fixture = await prepareUiV2AgendaFixture(page);
  const probeBefore = await page.evaluate(() => ({
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  assert.equal(await page.locator('#view-agenda').getAttribute('data-title'), 'Agenda integrada');
  assert.equal(await page.locator('#agendaList [data-agenda-activity-type]').count(), 7, 'Agenda V2 deve integrar 3 compromissos, 2 tarefas datadas e 2 publicações.');
  assert.equal(await page.locator('#agendaList [data-agenda-activity-id="ui-v2-agenda-text-only"]').count(), 0);
  assert.equal(await page.locator(`#miniCalendar [data-cal-date="${fixture.tomorrow}"] .cal-dot.fatal`).count(), 1);
  assert.equal(await page.locator(`#miniCalendar [data-cal-date="${fixture.afterTomorrow}"] .cal-dot.fatal`).count(), 0, 'Deadline secundário não pode duplicar tarefa fatal em outro dia.');
  assert.match(await page.locator('[data-agenda-activity-id="ui-v2-agenda-publication"]').textContent(), /Data da publicação/);
  assert.doesNotMatch(await page.locator('[data-agenda-activity-id="ui-v2-agenda-publication"]').textContent(), /vencimento|data limite/i);

  const expectedByFilter = { event: 3, task: 2, intimation: 2, all: 7 };
  for (const [filter, count] of Object.entries(expectedByFilter)) {
    await page.locator(`#agendaFilterTabs [data-agenda-filter="${filter}"]`).click();
    assert.equal(await page.locator('#agendaList [data-agenda-activity-type]').count(), count, `Filtro ${filter} deve preservar o contrato.`);
    assert.equal(await page.locator(`#agendaFilterTabs [data-agenda-filter="${filter}"]`).getAttribute('aria-pressed'), 'true');
  }

  await page.locator('#agendaTodayButton').click();
  assert.deepEqual(await page.evaluate(() => ({
    selectedDate: window.portalApp.agendaSelectedDate,
    offset: window.portalApp.agendaCalendarMonthOffset
  })), { selectedDate: fixture.today, offset: 0 });
  assert.equal(await page.locator('#agendaList [data-agenda-activity-type]').count(), 4);

  await page.locator('#agendaAllUpcomingButton').click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), null);
  assert.equal(await page.locator('#agendaList [data-agenda-activity-type]').count(), 7);

  const monthTitle = await page.locator('#agendaCalendarMonth').textContent();
  await page.locator('#calNextMonth').click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaCalendarMonthOffset), 1);
  assert.notEqual(await page.locator('#agendaCalendarMonth').textContent(), monthTitle);
  await page.locator('#calPrevMonth').click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaCalendarMonthOffset), 0);
  assert.equal(await page.locator('#agendaCalendarMonth').textContent(), monthTitle);

  await page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`).click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), fixture.today);
  assert.equal(await page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`).getAttribute('aria-pressed'), 'true');
  await page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`).click();
  assert.equal(await page.evaluate(() => window.portalApp.agendaSelectedDate), null);

  await page.evaluate(() => {
    window.__agendaV2Routes = { task: 0, intimation: 0 };
    window.portalApp.openTaskModal = () => { window.__agendaV2Routes.task += 1; };
    window.portalApp.openIntimationDetailModal = () => { window.__agendaV2Routes.intimation += 1; };
    window.portalApp.renderAgenda();
  });
  await page.locator('[data-agenda-activity-id="ui-v2-agenda-task"]').click();
  await page.locator('[data-agenda-activity-id="ui-v2-agenda-publication"]').click();
  assert.deepEqual(await page.evaluate(() => window.__agendaV2Routes), { task: 1, intimation: 1 }, 'Cada rota cross-module deve usar exatamente um callback canônico.');

  await page.locator('[data-agenda-activity-id="ui-v2-agenda-hearing"]').click();
  await page.locator('#modalBackdrop[data-modal-mode="agenda"]:not(.hidden)').waitFor();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)),
    ['title', 'date', 'time', 'client', 'process', 'location', 'source', 'description']);
  assert.equal(await page.locator('#modalForm [name="source"]').inputValue(), 'Agenda externa');
  await page.locator('#modalCancel').click();

  await page.locator('#newAgendaButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="agenda"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('.agenda-form-section').count(), 6);
  await page.locator('#modalCancel').click();

  const stateSafety = await page.evaluate(() => {
    const textOnly = window.Atrium.Store.state.tasks.find(item => item.id === 'ui-v2-agenda-text-only');
    const publication = window.Atrium.Store.state.intimations.find(item => item.id === 'ui-v2-agenda-publication');
    return {
      taskHasDeadline: Object.hasOwn(textOnly, 'deadline') || Object.hasOwn(textOnly, 'fatalDeadline'),
      publicationHasDeadline: Object.hasOwn(publication, 'deadline') || Object.hasOwn(publication, 'fatalDeadline'),
      publicationTreatment: publication.treatmentStatus,
      requests: window.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });
  assert.deepEqual(stateSafety, {
    taskHasDeadline: false,
    publicationHasDeadline: false,
    publicationTreatment: 'untreated',
    requests: probeBefore.requests,
    intervals: probeBefore.intervals
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Agenda V2 preserva estado único, datas explícitas, filtros, rotas canônicas e CRUD de oito campos.');
