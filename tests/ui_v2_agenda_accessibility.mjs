import assert from 'node:assert/strict';
import { prepareUiV2AgendaFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 AGENDA ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl);
  const fixture = await prepareUiV2AgendaFixture(page);

  const calendar = page.locator('#miniCalendar .calendar-grid');
  assert.match(await calendar.getAttribute('aria-labelledby'), /agendaCalendarMonth/);
  assert.equal(await page.locator('#calPrevMonth').getAttribute('aria-label'), 'Mostrar mês anterior');
  assert.equal(await page.locator('#calNextMonth').getAttribute('aria-label'), 'Mostrar próximo mês');

  const today = page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`);
  const todayLabel = await today.getAttribute('aria-label');
  assert.match(todayLabel, /hoje/);
  assert.match(todayLabel, /\d{4}/);
  assert.match(todayLabel, /atividades/);
  assert.equal(await today.getAttribute('aria-current'), 'date');
  assert.equal(await today.getAttribute('aria-pressed'), 'false');
  assert.equal(await today.locator('.cal-dot').first().getAttribute('aria-hidden'), 'true');
  await today.click();
  assert.equal(await page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`).getAttribute('aria-pressed'), 'true');

  const rows = page.locator('#agendaList [data-agenda-activity-type]');
  assert.ok(await rows.count() > 0);
  assert.ok((await rows.first().getAttribute('aria-label')).length > 30);
  assert.equal(await rows.first().evaluate(element => element.tagName), 'BUTTON');

  const opener = page.locator('[data-agenda-activity-id="ui-v2-agenda-hearing"]');
  await opener.focus();
  await opener.press('Enter');
  await page.locator('#modalBackdrop[data-modal-mode="agenda"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.agendaActivityId), 'ui-v2-agenda-hearing');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  const duplicateIds = await page.locator('[id]').evaluateAll(elements => {
    const ids = elements.map(element => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await prepareUiV2Page(mobile, session.server.baseUrl);
  await prepareUiV2AgendaFixture(mobilePage.page);
  const sizes = await mobilePage.page.locator('#view-agenda button:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { id: element.id || element.dataset.calDate || element.dataset.agendaActivityId || element.textContent.trim(), width: rect.width, height: rect.height };
  }));
  const undersized = sizes.filter(item => item.width < 43.5 || item.height < 43.5);
  assert.deepEqual(undersized, [], `Targets mobile abaixo de 44px: ${JSON.stringify(undersized)}`);

  await mobilePage.page.emulateMedia({ reducedMotion: 'reduce' });
  await mobilePage.page.locator('#calNextMonth').click();
  const reducedDuration = await mobilePage.page.locator('#miniCalendar .calendar-grid').evaluate(element => getComputedStyle(element).animationDuration);
  assert.ok(parseFloat(reducedDuration) <= 0.02, `Reduced motion deve neutralizar slide: ${reducedDuration}`);
  await mobilePage.page.locator('#newAgendaButton').click();
  const drawer = mobilePage.page.locator('#modalBackdrop[data-modal-mode="agenda"] .modal');
  const drawerRect = await drawer.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(drawerRect.left >= -1 && drawerRect.right <= drawerRect.width + 1);
  assert.ok(drawerRect.top >= -1 && drawerRect.bottom <= drawerRect.height + 1);
  assert.deepEqual(mobilePage.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ Calendário, datas completas, seleção, teclado, drawer e targets mobile atendem ao contrato acessível.');
