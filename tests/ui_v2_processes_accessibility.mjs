import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, prepareUiV2ProcessesFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const cssSource = readFileSync(new URL('../css/views/ui-v2/processes.css', import.meta.url), 'utf8');
assert.match(cssSource, /@media \(max-width: 1023px\)/, 'O breakpoint DataTable para RecordList deve estar declarado no CSS.');
assert.match(cssSource, /min-height: 44px/, 'Alvos mobile devem ter contrato mínimo de 44px.');
assert.match(cssSource, /#modalBackdrop\[data-modal-mode="process"\]/, 'O formulário V2 deve ser estilizado sem alterar outros modais.');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1024, height: 768 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2ProcessesFixture(page);

    assert.equal(await page.locator('#processTable thead').evaluate(element => getComputedStyle(element).position !== 'absolute'), true, '1024px deve manter DataTable.');
    assert.equal(await page.locator('#processTable th').count(), 6);
    assert.equal(await page.locator('#processTable th button').count(), 6, 'Cada cabeçalho ordenável deve possuir semântica de botão.');
    assert.equal(await page.locator('#processTable th[data-sort-field="registeredAt"]').getAttribute('aria-sort'), 'descending');
    await page.locator('#processTable th[data-sort-field="client"] button').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#processTable th[data-sort-field="client"]').getAttribute('aria-sort'), 'ascending');

    const origin = page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]');
    await origin.focus();
    await page.keyboard.press('Enter');
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.locator('#processInspector').getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#processInspector').getAttribute('aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'processInspectorClose', 'O foco inicial deve entrar no inspector.');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), '', 'A aplicação atrás do drawer deve ficar inerte.');

    await page.locator('#processInspectorEdit').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'processInspectorClose', 'Tab no último controle deve retornar ao primeiro.');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'processInspectorEdit', 'Shift+Tab no primeiro controle deve retornar ao último.');
    await page.keyboard.press('Escape');
    await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.processId), 'ui-v2-process-tjrs', 'Fechar deve devolver foco à linha de origem.');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
    assert.deepEqual(pageErrors, []);
  } finally {
    await desktop.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2ProcessesFixture(page);

    const layout = await page.evaluate(() => {
      const table = document.getElementById('processTable');
      const row = document.querySelector('#processTableBody [data-process-id="ui-v2-process-tjrs"]');
      const details = [...document.querySelectorAll('.process-details-button')];
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        tableOverflow: table.scrollWidth - table.clientWidth,
        theadPosition: getComputedStyle(document.querySelector('#processTable thead')).position,
        rowDisplay: getComputedStyle(row).display,
        detailsTargets: details.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, name: button.textContent.trim() })),
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
      };
    });
    assert.ok(layout.overflow <= 2, `Overflow global mobile: ${layout.overflow}px.`);
    assert.ok(layout.tableOverflow <= 2, `RecordList não pode manter overflow destrutivo: ${layout.tableOverflow}px.`);
    assert.equal(layout.theadPosition, 'absolute', 'Cabeçalho visual deve ceder à RecordList em mobile.');
    assert.equal(layout.rowDisplay, 'block');
    assert.deepEqual(layout.duplicateIds, []);
    for (const target of layout.detailsTargets) {
      assert.ok(target.height >= 44, `Alvo "${target.name}" abaixo de 44px: ${target.height}px.`);
      assert.ok(target.width >= 44, `Alvo "${target.name}" estreito demais: ${target.width}px.`);
    }

    const rowText = await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').textContent();
    for (const expected of ['5004321-12.2026.8.21.0001', 'Cliente Sintética Processos', 'TJRS', 'Despacho sintético integral', '29/08/2026', 'Monitorando', 'Segredo de justiça']) {
      assert.ok(rowText.includes(expected), `RecordList mobile deve expor: ${expected}`);
    }
    const detailsButton = page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]');
    assert.match(await detailsButton.getAttribute('aria-label') || await detailsButton.textContent(), /Ver detalhes/);
    await detailsButton.click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await page.locator('#processInspector').evaluate(element => Promise.all(
      element.getAnimations().map(animation => animation.finished)
    ));
    const drawerBounds = await page.locator('#processInspector').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(drawerBounds.left >= -2 && drawerBounds.right <= drawerBounds.viewportWidth + 2);
    assert.ok(drawerBounds.top >= -2 && drawerBounds.bottom <= drawerBounds.viewportHeight + 2);
    assert.ok(drawerBounds.width >= 386, 'Drawer mobile deve usar largura integral.');
    assert.ok(await page.locator('#processInspectorClose').evaluate(element => element.getBoundingClientRect().height >= 44));
    await page.locator('#processInspectorEdit').click();
    await page.locator('#modalBackdrop[data-modal-mode="process"]:not(.hidden)').waitFor();

    const form = await page.evaluate(() => {
      const modal = document.querySelector('#modalBackdrop[data-modal-mode="process"] .modal');
      const firstGrid = document.querySelector('.process-form-section .form-grid');
      const required = [...document.querySelectorAll('#modalForm [required]')];
      const labels = [...document.querySelectorAll('#modalForm label[for]')];
      const rect = modal.getBoundingClientRect();
      return {
        columns: getComputedStyle(firstGrid).gridTemplateColumns.split(' ').length,
        legends: [...document.querySelectorAll('.process-form-section legend')].map(element => element.textContent.trim()),
        disconnectedLabels: labels.filter(label => !document.getElementById(label.htmlFor)).map(label => label.htmlFor),
        hiddenRequired: required.filter(element => element.getClientRects().length === 0).map(element => element.name),
        bounds: { left: rect.left, right: rect.right, viewport: innerWidth },
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert.equal(form.columns, 1, 'Formulário mobile deve usar uma coluna.');
    assert.deepEqual(form.legends, ['Identificação', 'Partes', 'Classificação', 'Órgão e responsabilidade', 'Movimentação', 'Honorários', 'Requisições', 'Privacidade e acompanhamento']);
    assert.deepEqual(form.disconnectedLabels, []);
    assert.deepEqual(form.hiddenRequired, []);
    assert.ok(form.bounds.left >= -2 && form.bounds.right <= form.bounds.viewport + 2);
    assert.ok(form.overflow <= 2, `Formulário criou overflow global: ${form.overflow}px.`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Acessibilidade de Processos V2 aprovada: sort semântico, foco contido/devolvido, RecordList e formulário mobile íntegros.');
