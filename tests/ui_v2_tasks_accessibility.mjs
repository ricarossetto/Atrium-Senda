import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const cssSource = readFileSync(new URL('../css/views/ui-v2/tasks.css', import.meta.url), 'utf8');
assert.match(cssSource, /@media \(max-width: 767px\)/, 'RecordList mobile deve possuir breakpoint explícito.');
assert.match(cssSource, /#modalBackdrop\[data-modal-mode="task"\]/, 'Drawer deve ser escopado ao modal de tarefa.');
assert.match(cssSource, /min-height:\s*44px/, 'Alvos mobile devem declarar ao menos 44px.');
assert.match(cssSource, /align-items:\s*start/, 'Formulário de tarefa deve alinhar campos pelo topo.');
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
    const darkAlignment = await page.evaluate(() => {
      const top = id => document.getElementById(id)?.getBoundingClientRect().top;
      return { fatal: top('field-fatalDeadline'), internal: top('field-deadline'), date: top('field-date'), time: top('field-time') };
    });
    assert.ok(Math.abs(darkAlignment.fatal - darkAlignment.internal) <= 2, `Prazo fatal e interno devem alinhar no tema escuro: ${darkAlignment.fatal} × ${darkAlignment.internal}.`);
    assert.ok(Math.abs(darkAlignment.date - darkAlignment.time) <= 2, `Data e horário devem alinhar no tema escuro: ${darkAlignment.date} × ${darkAlignment.time}.`);
    await page.locator('#modalForm button[type="submit"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'modalSizeToggle',
      'Tab deve circular no Drawer, retornando ao primeiro controle do cabeçalho (tamanho do painel).'
    );
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'modalClose', 'Depois do tamanho, o Tab alcança o fechar.');
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

    await page.locator('#taskListViewButton').click();
    await page.evaluate(() => document.getElementById('view-kanban').classList.add('filters-expanded'));
    await page.locator('#taskListStatusFilter').selectOption('all');
    const listLayout = await page.locator('#taskListPanel').evaluate(panel => {
      const targets = [...panel.querySelectorAll('input, select, button')]
        .filter(element => element.getClientRects().length > 0)
        .map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, name: element.getAttribute('aria-label') || element.textContent.trim() }));
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        panelOverflow: panel.scrollWidth - panel.clientWidth,
        rows: panel.querySelectorAll('[data-task-list-id]').length,
        targets
      };
    });
    assert.ok(listLayout.overflow <= 2, `Overflow global da Lista mobile: ${listLayout.overflow}px.`);
    assert.ok(listLayout.panelOverflow <= 2, `Lista mobile não pode depender de scroll horizontal: ${listLayout.panelOverflow}px.`);
    assert.equal(listLayout.rows, 6);
    for (const target of listLayout.targets) assert.ok(target.width + 0.01 >= 44 && target.height + 0.01 >= 44, `Alvo da Lista abaixo de 44px: ${JSON.stringify(target)}`);
    await page.locator('#taskKanbanViewButton').click();

    await page.waitForTimeout(280);
    const settledViewSwitch = await page.locator('#taskViewSwitch').evaluate(element => {
      const buttons = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      const indicator = getComputedStyle(element, '::before');
      const transform = new DOMMatrixReadOnly(indicator.transform);
      return {
        buttonWidth: buttons[0].width,
        secondButtonLeft: buttons[1].left,
        firstButtonLeft: buttons[0].left,
        indicatorWidth: Number.parseFloat(indicator.width),
        indicatorTranslateX: transform.m41
      };
    });
    assert.ok(Math.abs(settledViewSwitch.indicatorWidth - settledViewSwitch.buttonWidth) <= 0.1, 'Indicador mobile deve ter a mesma largura da coluna interna.');
    assert.ok(Math.abs(settledViewSwitch.indicatorTranslateX - (settledViewSwitch.indicatorWidth + 8)) <= 0.1, 'Indicador Kanban mobile deve deslocar uma coluna mais o gap de 8px.');
    assert.ok(Math.abs(settledViewSwitch.secondButtonLeft - settledViewSwitch.firstButtonLeft - (settledViewSwitch.buttonWidth + 8)) <= 0.1, 'Switch mobile deve usar duas colunas 50/50 separadas por 8px.');

    const kanbanCard = await page.evaluate(() => {
      const card = document.querySelector('#kanbanBoard .task-card');
      const label = card.querySelector('.task-card-checkbox-label').getBoundingClientRect();
      const checkbox = card.querySelector('.task-card-checkbox').getBoundingClientRect();
      const source = card.querySelector('.task-source').getBoundingClientRect();
      const hint = document.getElementById('taskBoardInstructions');
      const hintRect = hint.getBoundingClientRect();
      return {
        label: { width: label.width, height: label.height, top: label.top, bottom: label.bottom, right: label.right },
        checkbox: { width: checkbox.width, height: checkbox.height },
        source: { top: source.top, bottom: source.bottom, left: source.left },
        hint: { width: hintRect.width, height: hintRect.height }
      };
    });
    assert.ok(kanbanCard.label.width + 0.01 >= 44 && kanbanCard.label.height + 0.01 >= 44, `Área de toque do checkbox do cartão abaixo de 44px: ${JSON.stringify(kanbanCard.label)}`);
    assert.ok(kanbanCard.checkbox.width <= 22 && kanbanCard.checkbox.height <= 22, `Checkbox do cartão não pode esticar: ${JSON.stringify(kanbanCard.checkbox)}`);
    assert.ok(kanbanCard.source.left + 0.01 >= kanbanCard.label.right, 'Origem deve ficar ao lado do checkbox, não abaixo.');
    assert.ok(Math.abs((kanbanCard.source.top + kanbanCard.source.bottom) / 2 - (kanbanCard.label.top + kanbanCard.label.bottom) / 2) <= 2, 'Origem e checkbox devem compartilhar a mesma faixa.');
    assert.ok(kanbanCard.hint.width <= 2 && kanbanCard.hint.height <= 2, `Instrução de arrastar deve permanecer apenas para leitor de tela: ${JSON.stringify(kanbanCard.hint)}`);

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

    const mobileAlignment = await page.evaluate(() => {
      const gap = id => {
        const input = document.getElementById(id);
        const field = input?.closest('.field');
        const label = field?.querySelector('label');
        return input && label ? input.getBoundingClientRect().top - label.getBoundingClientRect().bottom : null;
      };
      return { fatal: gap('field-fatalDeadline'), internal: gap('field-deadline') };
    });
    assert.ok(Math.abs(mobileAlignment.fatal - mobileAlignment.internal) <= 2, `A nota de campo não pode deslocar o input no mobile: ${mobileAlignment.fatal} × ${mobileAlignment.internal}.`);

    const modelInputBox = await page.locator('#field-taskDefinition').boundingBox();
    assert.ok(modelInputBox.height + 0.01 >= 44, `Combobox de modelo abaixo de 44px no mobile: ${modelInputBox.height}.`);
    await page.fill('#field-taskDefinition', 'MODELO MOBILE INEXISTENTE');
    await page.locator('#field-taskDefinition-listbox [data-combobox-create]:not(.hidden)').click();
    await page.locator('#modalFields [data-task-model-create]:not(.hidden)').waitFor();
    const createTargets = await page.locator('#modalFields [data-task-model-create]:not(.hidden) input, #modalFields [data-task-model-create]:not(.hidden) select, #modalFields [data-task-model-create]:not(.hidden) button')
      .evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, name: element.id || element.textContent.trim() };
      }));
    for (const target of createTargets) assert.ok(target.width + 0.01 >= 44 && target.height + 0.01 >= 44, `Alvo do sub-form abaixo de 44px: ${JSON.stringify(target)}`);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(mobileOverflow <= 2, `Overflow global do sub-form mobile: ${mobileOverflow}px.`);

    await page.locator('#modalClose').click();
    await page.locator('.unsaved-changes-dialog [data-discard-changes]').click();
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    assert.deepEqual(pageErrors, []);
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Acessibilidade de Tarefas V2 aprovada: Kanban contido, RecordList mobile, Drawer, foco e alvos táteis.');
