import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2AgendaFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-agenda');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-upcoming.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'upcoming' },
  { file: '02-dark-1440x900-upcoming.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'upcoming' },
  { file: '03-light-1280x800-month.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'upcoming' },
  { file: '04-light-1024x768-month.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'upcoming' },
  { file: '05-light-1440x900-selected-day.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'selected' },
  { file: '06-dark-1440x900-busy-day.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'selected' },
  { file: '07-light-1280x800-fatal-task.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'fatal' },
  { file: '08-dark-1280x800-publications.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'publication' },
  { file: '09-light-1440x900-new-event-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'new' },
  { file: '10-dark-1440x900-edit-event-drawer.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'edit' },
  { file: '11-light-390x844-mobile-agenda.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'selected' },
  { file: '12-dark-390x844-mobile-event-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'mobile-sheet' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      const fixture = await prepareUiV2AgendaFixture(page);

      if (scenario.state === 'selected') {
        await page.locator(`#miniCalendar [data-cal-date="${fixture.today}"]`).click();
      } else if (scenario.state === 'fatal') {
        const [todayYear, todayMonth] = fixture.today.split('-').map(Number);
        const [targetYear, targetMonth] = fixture.tomorrow.split('-').map(Number);
        const monthOffset = ((targetYear - todayYear) * 12) + targetMonth - todayMonth;
        for (let offset = 0; offset < monthOffset; offset++) await page.locator('#calNextMonth').click();
        for (let offset = 0; offset > monthOffset; offset--) await page.locator('#calPrevMonth').click();
        await page.locator(`#miniCalendar [data-cal-date="${fixture.tomorrow}"]`).waitFor();
        await page.locator(`#miniCalendar [data-cal-date="${fixture.tomorrow}"]`).click();
      } else if (scenario.state === 'publication') {
        await page.locator('#agendaFilterTabs [data-agenda-filter="intimation"]').click();
      } else if (scenario.state === 'new' || scenario.state === 'mobile-sheet') {
        await page.locator('#newAgendaButton').click();
      } else if (scenario.state === 'edit') {
        await page.locator('[data-agenda-activity-id="ui-v2-agenda-hearing"]').click();
      }

      if (['new', 'edit', 'mobile-sheet'].includes(scenario.state)) {
        await page.locator('#modalBackdrop[data-modal-mode="agenda"]:not(.hidden)').waitFor();
      }
      await page.waitForTimeout(280);

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const calendar = document.querySelector('#miniCalendar .calendar-grid');
        const calendarRect = calendar?.getBoundingClientRect();
        const drawer = document.querySelector('#modalBackdrop[data-modal-mode="agenda"]:not(.hidden) .modal');
        const drawerRect = drawer?.getBoundingClientRect();
        const dayButtons = [...document.querySelectorAll('#miniCalendar .calendar-day[data-cal-date]')];
        return {
          active: document.getElementById('view-agenda').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          activityCount: document.querySelectorAll('#agendaList [data-agenda-activity-type]').length,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          calendar: calendarRect ? { left: calendarRect.left, right: calendarRect.right, width: innerWidth } : null,
          unreadableDays: dayButtons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 42 || rect.height < 43 || getComputedStyle(button).visibility !== 'visible';
          }).length,
          drawer: drawerRect ? {
            left: drawerRect.left, right: drawerRect.right, top: drawerRect.top, bottom: drawerRect.bottom,
            width: innerWidth, height: innerHeight,
            formOverflow: drawer.querySelector('form').scrollWidth - drawer.querySelector('form').clientWidth
          } : null,
          hasTemporalLanguage: document.getElementById('view-agenda').textContent.includes('Publicação')
            || document.getElementById('view-agenda').textContent.includes('Próximas atividades')
        };
      });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.pageOverflow <= 2, `Overflow global em ${scenario.file}: ${layout.pageOverflow}px.`); assertions++;
      assert.ok(layout.activityCount > 0 || layout.drawer, `Atividades ausentes em ${scenario.file}.`); assertions++;
      assert.deepEqual(layout.duplicateIds, []); assertions++;
      assert.ok(layout.calendar && layout.calendar.left >= -2 && layout.calendar.right <= layout.calendar.width + 2, `Calendário fora do viewport em ${scenario.file}: ${JSON.stringify(layout.calendar)}.`); assertions++;
      assert.equal(layout.unreadableDays, 0, `Células críticas ilegíveis em ${scenario.file}.`); assertions++;
      assert.equal(layout.hasTemporalLanguage, true); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.drawer) {
        assert.ok(layout.drawer.left >= -2 && layout.drawer.right <= layout.drawer.width + 2, `${scenario.file}: drawer horizontal ${JSON.stringify(layout.drawer)}`); assertions++;
        assert.ok(layout.drawer.top >= -2 && layout.drawer.bottom <= layout.drawer.height + 2, `${scenario.file}: drawer vertical ${JSON.stringify(layout.drawer)}`); assertions++;
        assert.ok(layout.drawer.formOverflow <= 2); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os 12 estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 AGENDA VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
