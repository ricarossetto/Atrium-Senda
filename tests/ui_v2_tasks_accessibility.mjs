import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const cssSource = readFileSync(new URL('../css/views/ui-v2/tasks.css', import.meta.url), 'utf8');
assert.match(cssSource, /@media \(max-width: 767px\)/, 'RecordList mobile deve possuir breakpoint explícito.');
assert.match(cssSource, /#modalBackdrop\[data-modal-mode="task"\]/, 'Drawer deve ser escopado ao modal de tarefa.');
assert.match(cssSource, /min-height:\s*44px/, 'Alvos mobile devem declarar ao menos 44px.');
assert.match(cssSource, /prefers-reduced-motion:\s*reduce/);

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2TasksFixture(page);
    const board = await page.locator('#kanbanBoard').evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      columns: element.querySelectorAll('.kanban-column').length
    }));
    assert.equal(board.columns, 6);
    assert.ok(board.scrollWidth >= board.clientWidth, 'Scroll horizontal deve estar contido no quadro.');
    assert.ok(board.pageOverflow <= 2, `Overflow global desktop: ${board.pageOverflow}px.`);

    const openButton = page.locator('[data-task-id="ui-v2-task-overdue"] [data-task-open]');
    await openButton.focus();
    await page.keyboard.press('Enter');
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    await page.waitForTimeout(280);
    assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const drawer = await page.locator('#modalBackdrop .modal').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(drawer.left >= -2 && drawer.right <= drawer.width + 2);
    assert.ok(drawer.top >= -2 && drawer.bottom <= drawer.height + 2);
    await page.locator('#modalForm button[type="submit"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'modalClose', 'Tab deve circular no Drawer.');
    await page.keyboard.press('Escape');
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.taskOpen), 'ui-v2-task-overdue', 'Escape deve devolver foco ao invocador.');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
    assert.deepEqual(pageErrors, []);
  } finally {
    await desktop.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2TasksFixture(page);
    const layout = await page.evaluate(() => {
      const board = document.getElementById('kanbanBoard');
      const cards = [...board.querySelectorAll('[data-task-id]')];
      const targets = [...board.querySelectorAll('[data-task-open], [data-timesheet-start], [data-task-move]')]
        .map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
      const styles = getComputedStyle(board);
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        boardOverflow: board.scrollWidth - board.clientWidth,
        gridColumns: styles.gridTemplateColumns,
        cards: cards.length,
        targets,
        duplicates: ids.filter((id, index) => ids.indexOf(id) !== index)
      };
    });
    assert.ok(layout.overflow <= 2, `Overflow global mobile: ${layout.overflow}px.`);
    assert.ok(layout.boardOverflow <= 2, `RecordList não pode depender de scroll horizontal: ${layout.boardOverflow}px.`);
    assert.equal(layout.cards, 6);
    assert.deepEqual(layout.duplicates, []);
    for (const target of layout.targets) assert.ok(target.width + 0.01 >= 44 && target.height + 0.01 >= 44, `Alvo abaixo de 44px: ${JSON.stringify(target)}`);

    const recordText = await page.locator('[data-task-id="ui-v2-task-fatal"]').textContent();
    for (const expected of ['Preparar recurso', 'Cliente Recursal Sintético', '5012345-67.2026.4.04.7100', 'Prazo fatal', 'Advogada Recursal Sintética']) {
      assert.ok(recordText.includes(expected), `RecordList deve expor: ${expected}`);
    }

    await page.locator('[data-task-id="ui-v2-task-fatal"] [data-task-open]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    await page.waitForTimeout(280);
    const sheet = await page.locator('#modalBackdrop .modal').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const form = element.querySelector('form');
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: innerWidth, height: innerHeight, formOverflow: form.scrollWidth - form.clientWidth
      };
    });
    assert.ok(sheet.left >= -2 && sheet.right <= sheet.width + 2);
    assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.height + 2);
    assert.ok(sheet.formOverflow <= 2);
    assert.equal(await page.locator('.task-form-section .form-grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);
    await page.locator('#modalClose').click();
    assert.deepEqual(pageErrors, []);
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Acessibilidade de Tarefas V2 aprovada: Kanban contido, RecordList mobile, Drawer, foco e alvos táteis.');
