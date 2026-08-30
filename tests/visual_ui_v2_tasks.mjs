import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-tasks');
const SCENARIOS = [
  { file: '01-light-1440x900-board.png', theme: 'light', width: 1440, height: 900, state: 'board' },
  { file: '02-dark-1440x900-board.png', theme: 'dark', width: 1440, height: 900, state: 'board' },
  { file: '03-light-1280x800-active-timer.png', theme: 'light', width: 1280, height: 800, state: 'timer' },
  { file: '04-dark-1280x800-urgent-overdue.png', theme: 'dark', width: 1280, height: 800, state: 'overdue' },
  { file: '05-light-1024x768-fatal-deadline.png', theme: 'light', width: 1024, height: 768, state: 'fatal' },
  { file: '06-dark-1024x768-drag-state.png', theme: 'dark', width: 1024, height: 768, state: 'drag' },
  { file: '07-light-1024x768-drop-target.png', theme: 'light', width: 1024, height: 768, state: 'drop' },
  { file: '08-light-1440x900-new-drawer.png', theme: 'light', width: 1440, height: 900, state: 'new' },
  { file: '09-dark-1440x900-edit-drawer.png', theme: 'dark', width: 1440, height: 900, state: 'edit' },
  { file: '10-dark-1280x800-publication-linked-drawer.png', theme: 'dark', width: 1280, height: 800, state: 'publication' },
  { file: '11-light-1280x800-completed.png', theme: 'light', width: 1280, height: 800, state: 'completed' },
  { file: '12-light-390x844-mobile-list.png', theme: 'light', width: 390, height: 844, state: 'mobile-list' },
  { file: '13-dark-390x844-mobile-sheet.png', theme: 'dark', width: 390, height: 844, state: 'mobile-sheet' }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: { width: scenario.width, height: scenario.height } });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2TasksFixture(page);

      if (scenario.state === 'timer') {
        await page.locator('[data-timesheet-start="ui-v2-task-active"]').click();
        await page.waitForTimeout(1100);
      } else if (scenario.state === 'drag') {
        await page.locator('[data-task-id="ui-v2-task-overdue"]').evaluate(element => {
          element.classList.add('dragging');
          element.dataset.dragging = 'true';
        });
      } else if (scenario.state === 'drop') {
        await page.locator('[data-column="revisao"]').evaluate(element => element.classList.add('drag-over'));
        await page.locator('[data-column="revisao"]').scrollIntoViewIfNeeded();
      } else if (scenario.state === 'new') {
        await page.evaluate(() => window.Atrium.App.openTaskModal());
      } else if (scenario.state === 'edit') {
        await page.locator('[data-task-id="ui-v2-task-fatal"] [data-task-open]').click();
      } else if (scenario.state === 'publication') {
        await page.locator('[data-task-id="ui-v2-task-publication"] [data-task-open]').click();
      } else if (scenario.state === 'completed') {
        await page.locator('[data-column="concluida"]').scrollIntoViewIfNeeded();
      } else if (scenario.state === 'mobile-sheet') {
        await page.locator('[data-task-id="ui-v2-task-publication"] [data-task-open]').click();
      }

      if (['new', 'edit', 'publication', 'mobile-sheet'].includes(scenario.state)) {
        await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
      }
      await page.waitForTimeout(280);

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const board = document.getElementById('kanbanBoard');
        const drawer = document.querySelector('#modalBackdrop[data-modal-mode="task"]:not(.hidden) .modal');
        const drawerRect = drawer?.getBoundingClientRect();
        return {
          active: document.getElementById('view-kanban').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          boardOverflow: innerWidth < 768 ? board.scrollWidth - board.clientWidth : 0,
          cards: board.querySelectorAll('[data-task-id]').length,
          columns: board.querySelectorAll('.kanban-column').length,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          drawer: drawerRect ? {
            left: drawerRect.left, right: drawerRect.right, top: drawerRect.top, bottom: drawerRect.bottom,
            viewportWidth: innerWidth, viewportHeight: innerHeight,
            formOverflow: drawer.querySelector('form').scrollWidth - drawer.querySelector('form').clientWidth
          } : null,
          hasCritical: ['Revisar contestação sintética', 'Preparar recurso com prazo confirmado', 'Prazo fatal', 'Providência sintética concluída']
            .every(text => document.getElementById('view-kanban').textContent.includes(text))
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.pageOverflow <= 2, `Overflow global em ${scenario.file}: ${layout.pageOverflow}px.`); assertions++;
      assert.ok(layout.boardOverflow <= 2, `Overflow mobile do RecordList em ${scenario.file}: ${layout.boardOverflow}px.`); assertions++;
      assert.equal(layout.cards, 6); assertions++;
      assert.equal(layout.columns, 6); assertions++;
      assert.deepEqual(layout.duplicateIds, []); assertions++;
      assert.equal(layout.hasCritical, true); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.drawer) {
        assert.ok(layout.drawer.left >= -2 && layout.drawer.right <= layout.drawer.viewportWidth + 2, `${scenario.file}: ${JSON.stringify(layout.drawer)}`); assertions++;
        assert.ok(layout.drawer.top >= -2 && layout.drawer.bottom <= layout.drawer.viewportHeight + 2, `${scenario.file}: ${JSON.stringify(layout.drawer)}`); assertions++;
        assert.ok(layout.drawer.formOverflow <= 2); assertions++;
      }

      const outputFile = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: outputFile, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os 13 estados visuais selecionados devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 TAREFAS / KANBAN VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
