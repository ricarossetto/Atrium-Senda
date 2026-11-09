import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prepareUiV2AssistantFixture,
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2ContactsFixture,
  prepareUiV2EmailCalendarFixture,
  prepareUiV2FinancialFixture,
  prepareUiV2Page,
  prepareUiV2ProcessesFixture,
  prepareUiV2PublicationsFixture,
  startUiV2Session
} from './ui_v2_helpers.mjs';

async function waitPanelSizeSettled(page, panelSelector, maximized) {
  await page.waitForFunction(({ selector, isMaximized }) => {
    const panel = document.querySelector(selector);
    if (!panel) return false;
    return isMaximized
      ? panel.getAttribute('data-panel-size') === 'maximized'
      : !panel.hasAttribute('data-panel-size');
  }, { selector: panelSelector, isMaximized: maximized });
  await page.waitForFunction(selector => !document.querySelector(selector)?.classList.contains('is-panel-size-shifting'), panelSelector);
}

async function waitPanelEntrySettled(page, panelSelector) {
  await page.waitForFunction(
    selector => [...(document.querySelector(selector)?.getAnimations?.() || [])].every(animation => animation.playState === 'finished'),
    panelSelector
  );
}

const modalSource = readFileSync(new URL('../js/components/modal.js', import.meta.url), 'utf8');
const lateralList = modalSource.match(/const LATERAL_MODAL_MODES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
for (const mode of ['task', 'agenda', 'contact', 'lead', 'prompt', 'term', 'source', 'datajud', 'configuration', 'feedback']) {
  assert.match(lateralList, new RegExp(`'${mode}'`), `Modo lateral ${mode} deve receber o controle de tamanho.`);
}
for (const centered of ['reauth', 'process', 'taskModel', 'kanbanColumns']) {
  assert.doesNotMatch(lateralList, new RegExp(`'${centered}'`), `Modo centrado/fluxo ${centered} não pode receber o controle de tamanho.`);
}

console.log('\n===============================================================');
console.log('  ATRIUM — PAINÉIS: MAXIMIZAR/RESTAURAR (PILOTO PUBLICAÇÕES)   ');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2PublicationsFixture(page);

    let requests = 0;
    page.on('request', request => {
      if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') requests += 1;
    });

    await page.locator('[data-intimation-id="ui-v2-publication-urgent"] .publication-record-open').click();
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');

    console.log('[M1] O controle existe, é acessível e começa em "Maximizar"...');
    const toggle = page.locator('#intimationDetail [data-panel-size-toggle]');
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    assert.match(await toggle.getAttribute('aria-label'), /Maximizar painel/);
    assert.equal(await toggle.getAttribute('title'), 'Maximizar painel');
    const iconBefore = await page.evaluate(() => document.querySelector('#intimationDetail [data-panel-size-toggle] use')?.getAttribute('href') || '');
    assert.match(iconBefore, /#atrium-icon-maximize$/);
    console.log('  ✓ Nome acessível, estado e ícone iniciais corretos.');

    console.log('[M2] Maximizar ocupa a viewport sem perder edição, foco ou provocar request...');
    await page.evaluate(() => { document.querySelector('[data-conference-days]').closest('details').open = true; });
    await page.locator('[data-conference-days]').fill('17');
    const before = await page.evaluate(() => {
      const panel = document.getElementById('intimationDetail');
      const rect = panel.getBoundingClientRect();
      return {
        width: rect.width,
        viewport: innerWidth,
        maximized: panel.getAttribute('data-panel-size'),
        overflow: document.documentElement.scrollWidth - innerWidth,
        overflowY: document.documentElement.scrollHeight - innerHeight
      };
    });
    assert.notEqual(before.maximized, 'maximized');
    assert.ok(before.width < before.viewport, `O painel normal não ocupa toda a largura (${before.width}/${before.viewport}).`);
    assert.ok(before.overflow <= 2);

    await page.waitForTimeout(1500);
    const requestsBeforeToggle = requests;
    await toggle.click();
    await page.waitForFunction(() => document.getElementById('intimationDetail').getAttribute('data-panel-size') === 'maximized');
    await page.waitForFunction(() => !document.getElementById('intimationDetail')?.classList.contains('is-panel-size-shifting'));
    const after = await page.evaluate(() => {
      const panel = document.getElementById('intimationDetail');
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        overflowY: document.documentElement.scrollHeight - innerHeight,
        label: button?.getAttribute('aria-label'),
        pressed: button?.getAttribute('aria-pressed'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        focusOnToggle: document.activeElement === button,
        days: document.querySelector('[data-conference-days]')?.value
      };
    });
    assert.ok(Math.abs(after.width - after.viewport) <= 2, `Maximizado deve ocupar a viewport (${after.width} x ${after.viewport}).`);
    assert.ok(Math.abs(after.height - after.viewportHeight) <= 2, `Maximizado deve ocupar a altura (${after.height} x ${after.viewportHeight}).`);
    assert.ok(after.left <= 1 && after.top <= 1, 'Maximizado deve ancorar no canto superior esquerdo.');
    assert.ok(after.overflowX <= 2, 'Maximizar não pode criar overflow horizontal.');
    assert.ok(
      after.overflowY <= before.overflowY + 2,
      `Maximizar não pode aumentar o overflow vertical global (${after.overflowY} vs ${before.overflowY}).`
    );
    assert.match(after.label, /Restaurar painel/);
    assert.equal(after.pressed, 'true');
    assert.match(after.icon, /#atrium-icon-restore$/);
    assert.equal(after.days, '17', 'Maximizar não pode perder edição em andamento.');
    assert.equal(after.focusOnToggle, true, 'O foco permanece no controle de tamanho.');
    assert.equal(requests, requestsBeforeToggle, 'Alternar tamanho não pode disparar request.');
    console.log('  ✓ Viewport preenchida, edição, foco e silêncio de rede preservados.');

    console.log('[M3] Restaurar devolve a largura original sem perder estado...');
    await toggle.click();
    await page.waitForFunction(() => !document.getElementById('intimationDetail').hasAttribute('data-panel-size'));
    const restored = await page.evaluate(() => {
      const panel = document.getElementById('intimationDetail');
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        pressed: button?.getAttribute('aria-pressed'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        days: document.querySelector('[data-conference-days]')?.value,
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert.ok(Math.abs(restored.width - before.width) <= 2, `Restaurar deve devolver a largura original (${restored.width} vs ${before.width}).`);
    assert.equal(restored.pressed, 'false');
    assert.match(restored.icon, /#atrium-icon-maximize$/);
    assert.equal(restored.days, '17');
    assert.ok(restored.overflow <= 2);
    console.log('  ✓ Largura restaurada e estado preservado.');

    console.log('[M4] Fechar o painel redefine o tamanho (reabrir começa normal)...');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#publicationDetailClose').click();
    await page.waitForFunction(() => !document.getElementById('view-inbox').classList.contains('publication-detail-open'));
    const closed = await page.evaluate(() => document.getElementById('intimationDetail').hasAttribute('data-panel-size'));
    assert.equal(closed, false, 'Fechar deve limpar o estado maximizado.');
    assert.deepEqual(pageErrors, [], `Piloto gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Estado efêmero limpo no fechamento.');
  } finally {
    await desktop.close();
  }

  console.log('[M5] Em tela estreita o controle fica oculto (o painel já é fullscreen)...');
  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2PublicationsFixture(page);
    await page.locator('[data-intimation-id="ui-v2-publication-urgent"] .publication-record-open').click();
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    const mobileState = await page.evaluate(() => {
      const button = document.querySelector('#intimationDetail [data-panel-size-toggle]');
      const panel = document.getElementById('intimationDetail');
      const rect = panel.getBoundingClientRect();
      return { display: button ? getComputedStyle(button).display : 'ausente', width: rect.width, viewport: innerWidth };
    });
    assert.equal(mobileState.display, 'none', 'O controle deve ficar oculto no mobile já fullscreen.');
    assert.ok(Math.abs(mobileState.width - mobileState.viewport) <= 2, 'O painel mobile já ocupa a viewport.');
    assert.deepEqual(pageErrors, [], `Piloto mobile gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Controle oculto onde não há diferença de tamanho.');
  } finally {
    await mobile.close();
  }

  console.log('[M6] Tarefas: o painel lateral do modal compartilhado maximiza e preserva o formulário...');
  const tasks = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(tasks, session.server.baseUrl, { theme: 'light' });
    await page.evaluate(() => window.Atrium.App.switchView('kanban'));
    await page.locator('#newTaskButton').click();
    await page.locator('#modalBackdrop:not(.hidden)').waitFor();
    const modalToggle = page.locator('#modalSizeToggle');
    assert.equal(await modalToggle.isVisible(), true, 'O modo lateral de tarefa deve exibir o controle de tamanho.');
    assert.equal(await modalToggle.getAttribute('aria-pressed'), 'false');
    const longTitle = 'Tarefa sintética com título longo para conferência de layout';
    await page.locator('#field-title').fill(longTitle);
    const modalBefore = await page.evaluate(() => {
      const modal = document.querySelector('#modalBackdrop .modal');
      const rect = modal.getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    });
    await modalToggle.click();
    await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.getAttribute('data-panel-size') === 'maximized');
    await page.waitForFunction(() => !document.querySelector('#modalBackdrop .modal')?.classList.contains('is-panel-size-shifting'));
    const modalAfter = await page.evaluate(() => {
      const modal = document.querySelector('#modalBackdrop .modal');
      const rect = modal.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        title: document.querySelector('#field-title')?.value,
        pressed: document.querySelector('#modalSizeToggle')?.getAttribute('aria-pressed'),
        icon: document.querySelector('#modalSizeToggle use')?.getAttribute('href') || ''
      };
    });
    assert.ok(Math.abs(modalAfter.width - modalAfter.viewport) <= 2, `Modal maximizado deve ocupar a largura (${modalAfter.width}/${modalAfter.viewport}).`);
    assert.ok(Math.abs(modalAfter.height - modalAfter.viewportHeight) <= 2, `Modal maximizado deve ocupar a altura (${modalAfter.height}/${modalAfter.viewportHeight}).`);
    assert.ok(modalAfter.left <= 1 && modalAfter.top <= 1, 'Modal maximizado deve ancorar no canto.');
    assert.ok(modalAfter.overflowX <= 2, 'Modal maximizado não pode criar overflow horizontal.');
    assert.equal(modalAfter.title, longTitle, 'Maximizar não pode perder o formulário em edição.');
    assert.equal(modalAfter.pressed, 'true');
    assert.match(modalAfter.icon, /#atrium-icon-restore$/);
    assert.ok(modalBefore.width < modalAfter.width, 'O painel normal era mais estreito que o maximizado.');
    await modalToggle.click();
    await page.waitForFunction(() => !document.querySelector('#modalBackdrop .modal')?.hasAttribute('data-panel-size'));
    assert.equal(await page.locator('#field-title').inputValue(), longTitle);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#modalCancel').click();
    const discard = page.locator('dialog.unsaved-changes-dialog [data-discard-changes]');
    if (await discard.count()) await discard.click();
    await page.waitForFunction(() => document.getElementById('modalBackdrop').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal').hasAttribute('data-panel-size')), false, 'Fechar deve limpar o tamanho.');
    assert.deepEqual(pageErrors, [], `Tarefas gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Modal lateral maximiza, preserva formulário e limpa o estado ao fechar.');
  } finally {
    await tasks.close();
  }

  console.log('[M7] Processos: o inspetor maximiza e restaura...');
  const processes = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(processes, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2ProcessesFixture(page);
    await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    const inspectorToggle = page.locator('#processInspector [data-panel-size-toggle]');
    assert.equal(await inspectorToggle.isVisible(), true, 'O inspetor de processo deve exibir o controle de tamanho.');
    const inspectorBefore = await page.evaluate(() => {
      const rect = document.getElementById('processInspector').getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    });
    await inspectorToggle.click();
    await page.waitForFunction(() => document.getElementById('processInspector')?.getAttribute('data-panel-size') === 'maximized');
    await page.waitForFunction(() => !document.getElementById('processInspector')?.classList.contains('is-panel-size-shifting'));
    const inspectorAfter = await page.evaluate(() => {
      const panel = document.getElementById('processInspector');
      const rect = panel.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: panel.querySelector('[data-panel-size-toggle]')?.getAttribute('aria-pressed'),
        title: document.getElementById('processInspectorTitle')?.textContent?.trim()
      };
    });
    assert.ok(Math.abs(inspectorAfter.width - inspectorAfter.viewport) <= 2, `Inspetor maximizado deve ocupar a largura (${inspectorAfter.width}/${inspectorAfter.viewport}).`);
    assert.ok(Math.abs(inspectorAfter.height - inspectorAfter.viewportHeight) <= 2, `Inspetor maximizado deve ocupar a altura (${inspectorAfter.height}/${inspectorAfter.viewportHeight}).`);
    assert.ok(inspectorAfter.left <= 1);
    assert.ok(inspectorAfter.overflowX <= 2, 'Inspetor maximizado não pode criar overflow horizontal.');
    assert.equal(inspectorAfter.pressed, 'true');
    assert.ok(inspectorAfter.title, 'O título do processo permanece visível.');
    assert.ok(inspectorBefore.width < inspectorAfter.width, 'O inspetor normal era mais estreito.');
    await inspectorToggle.click();
    await page.waitForFunction(() => !document.getElementById('processInspector')?.hasAttribute('data-panel-size'));
    assert.equal(await page.evaluate(() => document.getElementById('processInspector').hasAttribute('data-panel-size')), false);

    await page.locator('#processInspectorDocuments').click();
    await page.locator('#processDocumentsBackdrop:not(.hidden)').waitFor();
    const documentsToggle = page.locator('#processDocumentsDrawer [data-panel-size-toggle]');
    assert.equal(await documentsToggle.isVisible(), true, 'O drawer de documentos deve exibir o controle de tamanho.');
    await documentsToggle.click();
    await page.waitForFunction(() => document.getElementById('processDocumentsDrawer')?.getAttribute('data-panel-size') === 'maximized');
    await page.waitForFunction(() => !document.getElementById('processDocumentsDrawer')?.classList.contains('is-panel-size-shifting'));
    const documentsAfter = await page.evaluate(() => {
      const panel = document.getElementById('processDocumentsDrawer');
      const rect = panel.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: panel.querySelector('[data-panel-size-toggle]')?.getAttribute('aria-pressed')
      };
    });
    assert.ok(Math.abs(documentsAfter.width - documentsAfter.viewport) <= 2, `Documentos maximizado deve ocupar a largura (${documentsAfter.width}/${documentsAfter.viewport}).`);
    assert.ok(Math.abs(documentsAfter.height - documentsAfter.viewportHeight) <= 2, 'Documentos maximizado deve ocupar a altura.');
    assert.ok(documentsAfter.left <= 1);
    assert.ok(documentsAfter.overflowX <= 2, 'Documentos maximizado não pode criar overflow horizontal.');
    assert.equal(documentsAfter.pressed, 'true');
    await documentsToggle.click();
    await page.waitForFunction(() => !document.getElementById('processDocumentsDrawer')?.hasAttribute('data-panel-size'));
    await page.locator('#processDocumentsBackToProcess').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
    assert.deepEqual(pageErrors, [], `Processos gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Inspetor e drawer de documentos maximizam, restauram e limpam ao fechar.');
  } finally {
    await processes.close();
  }

  console.log('[M8] Contatos: o inspetor maximiza, sobrevive à re-render e restaura...');
  const contacts = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(contacts, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2ContactsFixture(page);
    await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
    await page.locator('#contactInspector.is-open').waitFor();
    const contactToggle = page.locator('#contactInspector [data-panel-size-toggle]');
    assert.equal(await contactToggle.isVisible(), true, 'O inspetor de contato deve exibir o controle de tamanho.');
    await contactToggle.click();
    await page.waitForFunction(() => document.getElementById('contactInspector')?.getAttribute('data-panel-size') === 'maximized');
    await page.waitForFunction(() => !document.getElementById('contactInspector')?.classList.contains('is-panel-size-shifting'));
    const contactMaximized = await page.evaluate(() => {
      const panel = document.getElementById('contactInspector');
      const rect = panel.getBoundingClientRect();
      return { width: rect.width, left: rect.left, viewport: innerWidth, pressed: panel.querySelector('[data-panel-size-toggle]')?.getAttribute('aria-pressed') };
    });
    assert.ok(Math.abs(contactMaximized.width - contactMaximized.viewport) <= 2, `Inspetor de contato maximizado deve ocupar a largura (${contactMaximized.width}/${contactMaximized.viewport}).`);
    assert.ok(contactMaximized.left <= 1);
    assert.equal(contactMaximized.pressed, 'true');
    await page.locator('#contactSearch').fill('a');
    await page.waitForTimeout(250);
    const afterRerender = await page.evaluate(() => {
      const panel = document.getElementById('contactInspector');
      const rect = panel?.getBoundingClientRect();
      return {
        present: Boolean(panel?.classList.contains('is-open')),
        maximized: panel?.getAttribute('data-panel-size'),
        pressed: panel?.querySelector('[data-panel-size-toggle]')?.getAttribute('aria-pressed'),
        width: rect?.width,
        viewport: innerWidth
      };
    });
    assert.equal(afterRerender.present, true, 'A busca não pode fechar o inspetor selecionado.');
    assert.equal(afterRerender.maximized, 'maximized', 'O re-render do inspetor deve preservar o tamanho maximizado.');
    assert.equal(afterRerender.pressed, 'true', 'Após re-render, o controle continua coerente.');
    assert.ok(Math.abs(afterRerender.width - afterRerender.viewport) <= 2, 'Após re-render, o inspetor continua maximizado.');
    assert.deepEqual(pageErrors, [], `Contatos gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Inspetor de contato maximiza e mantém a coerência após re-render.');
  } finally {
    await contacts.close();
  }

  console.log('[M9] Mail preferências: o drawer maximiza, preserva a seleção e limpa ao fechar...');
  const mailPreferences = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mailPreferences, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2EmailCalendarFixture(page);
    await page.locator('#btnConfigureMailPreferences').click();
    await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor();
    await waitPanelEntrySettled(page, '.mail-preferences-drawer');
    const drawerSelector = '.mail-preferences-drawer';
    const drawerToggle = page.locator(`${drawerSelector} [data-panel-size-toggle]`);
    assert.equal(await drawerToggle.isVisible(), true, 'O drawer de preferências deve exibir o controle de tamanho.');
    assert.equal(await drawerToggle.getAttribute('aria-pressed'), 'false');
    assert.match(await drawerToggle.getAttribute('aria-label'), /Maximizar painel/);
    await page.locator('#mailPrefPublication').selectOption('IMMEDIATE');
    const drawerBefore = await page.evaluate(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    }, drawerSelector);
    await drawerToggle.click();
    await waitPanelSizeSettled(page, drawerSelector, true);
    const drawerAfter = await page.evaluate(selector => {
      const panel = document.querySelector(selector);
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: button?.getAttribute('aria-pressed'),
        label: button?.getAttribute('aria-label'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        preference: document.querySelector('#mailPrefPublication')?.value
      };
    }, drawerSelector);
    assert.ok(Math.abs(drawerAfter.width - drawerAfter.viewport) <= 2, `Drawer maximizado deve ocupar a largura (${drawerAfter.width}/${drawerAfter.viewport}).`);
    assert.ok(Math.abs(drawerAfter.height - drawerAfter.viewportHeight) <= 2, `Drawer maximizado deve ocupar a altura (${drawerAfter.height}/${drawerAfter.viewportHeight}).`);
    assert.ok(drawerAfter.left <= 2 && drawerAfter.top <= 2, 'Drawer maximizado deve ancorar no canto superior esquerdo.');
    assert.ok(drawerAfter.overflowX <= 2, 'Maximizar o drawer não pode criar overflow horizontal.');
    assert.equal(drawerAfter.pressed, 'true');
    assert.match(drawerAfter.label, /Restaurar painel/);
    assert.match(drawerAfter.icon, /#atrium-icon-restore$/);
    assert.equal(drawerAfter.preference, 'IMMEDIATE', 'Maximizar não pode perder a seleção em andamento.');
    assert.ok(drawerBefore.width < drawerAfter.width, 'O drawer normal era mais estreito que o maximizado.');
    await page.keyboard.press('Escape');
    await page.locator('#mailPreferencesBackdrop').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(selector => document.querySelector(selector).hasAttribute('data-panel-size'), drawerSelector), false, 'Fechar deve limpar o estado maximizado.');
    assert.deepEqual(pageErrors, [], `Mail preferências gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Drawer maximiza, preserva seleção e limpa ao fechar.');
  } finally {
    await mailPreferences.close();
  }

  console.log('[M10] Financeiro: o lançamento maximiza, preserva o formulário e limpa ao fechar...');
  const financial = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(financial, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2FinancialFixture(page);
    await page.locator('#newFinancialEntryButton').click();
    await page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
    const financialSelector = '#financialEntryBackdrop .financial-entry-modal';
    await waitPanelEntrySettled(page, financialSelector);
    const financialToggle = page.locator(`${financialSelector} [data-panel-size-toggle]`);
    assert.equal(await financialToggle.isVisible(), true, 'O lançamento financeiro deve exibir o controle de tamanho.');
    await page.locator('#finGrossInput').fill('4321.00');
    const financialBefore = await page.evaluate(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    }, financialSelector);
    await financialToggle.click();
    await waitPanelSizeSettled(page, financialSelector, true);
    const financialAfter = await page.evaluate(selector => {
      const panel = document.querySelector(selector);
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: button?.getAttribute('aria-pressed'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        gross: document.querySelector('#finGrossInput')?.value
      };
    }, financialSelector);
    assert.ok(Math.abs(financialAfter.width - financialAfter.viewport) <= 2, `Lançamento maximizado deve ocupar a largura (${financialAfter.width}/${financialAfter.viewport}).`);
    assert.ok(Math.abs(financialAfter.height - financialAfter.viewportHeight) <= 2, `Lançamento maximizado deve ocupar a altura (${financialAfter.height}/${financialAfter.viewportHeight}).`);
    assert.ok(financialAfter.left <= 2 && financialAfter.top <= 2, 'Lançamento maximizado deve ancorar no canto superior esquerdo.');
    assert.ok(financialAfter.overflowX <= 2, 'Maximizar o lançamento não pode criar overflow horizontal.');
    assert.equal(financialAfter.pressed, 'true');
    assert.match(financialAfter.icon, /#atrium-icon-restore$/);
    assert.equal(financialAfter.gross, '4321.00', 'Maximizar não pode perder o formulário em edição.');
    assert.ok(financialBefore.width < financialAfter.width, 'O lançamento normal era mais estreito.');
    await financialToggle.click();
    await waitPanelSizeSettled(page, financialSelector, false);
    assert.equal(await page.locator('#finGrossInput').inputValue(), '4321.00');
    const financialRestored = await page.evaluate(selector => document.querySelector(selector).getBoundingClientRect().width, financialSelector);
    assert.ok(Math.abs(financialRestored - financialBefore.width) <= 2, `Restaurar deve devolver a largura original (${financialRestored} vs ${financialBefore.width}).`);
    await financialToggle.click();
    await waitPanelSizeSettled(page, financialSelector, true);
    await page.keyboard.press('Escape');
    await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(selector => document.querySelector(selector).hasAttribute('data-panel-size'), financialSelector), false, 'Fechar deve limpar o estado maximizado.');
    assert.deepEqual(pageErrors, [], `Financeiro gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Lançamento maximiza, preserva formulário, restaura e limpa ao fechar.');
  } finally {
    await financial.close();
  }

  console.log('[M11] Conexões: os sheets compact e regular maximizam e limpam ao fechar...');
  const connections = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(connections, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2EmailCalendarFixture(page);
    for (const [triggerId, backdropId, panelSelector] of [
      ['btnTestAtriumMail', 'emailTestBackdrop', '#emailTestBackdrop .email-test-modal'],
      ['configureCalendarButton', 'calendarConfigBackdrop', '#calendarConfigBackdrop .calendar-config-modal']
    ]) {
      await page.locator(`#${triggerId}`).click();
      await page.locator(`#${backdropId}:not(.hidden)`).waitFor();
      await waitPanelEntrySettled(page, panelSelector);
      const toggle = page.locator(`${panelSelector} [data-panel-size-toggle]`);
      assert.equal(await toggle.isVisible(), true, `${backdropId}: o controle de tamanho deve estar visível.`);
      await toggle.click();
      await waitPanelSizeSettled(page, panelSelector, true);
      const geometry = await page.evaluate(selector => {
        const panel = document.querySelector(selector);
        const rect = panel.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          viewport: innerWidth,
          viewportHeight: innerHeight,
          overflowX: document.documentElement.scrollWidth - innerWidth,
          pressed: panel.querySelector('[data-panel-size-toggle]')?.getAttribute('aria-pressed')
        };
      }, panelSelector);
      assert.ok(Math.abs(geometry.width - geometry.viewport) <= 2, `${backdropId}: o sheet maximizado deve ocupar a largura (${geometry.width}/${geometry.viewport}).`);
      assert.ok(Math.abs(geometry.height - geometry.viewportHeight) <= 2, `${backdropId}: o sheet maximizado deve ocupar a altura (${geometry.height}/${geometry.viewportHeight}).`);
      assert.ok(geometry.left <= 2 && geometry.top <= 2, `${backdropId}: o sheet maximizado deve ancorar no canto superior esquerdo.`);
      assert.ok(geometry.overflowX <= 2, `${backdropId}: maximizar não pode criar overflow horizontal.`);
      assert.equal(geometry.pressed, 'true');
      await page.keyboard.press('Escape');
      await page.locator(`#${backdropId}`).waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(selector => document.querySelector(selector).hasAttribute('data-panel-size'), panelSelector), false, `${backdropId}: fechar deve limpar o estado maximizado.`);
    }
    assert.deepEqual(pageErrors, [], `Conexões gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Sheets compact e regular maximizam e limpam ao fechar.');
  } finally {
    await connections.close();
  }

  console.log('[M12] Assistente: a chave de IA maximiza, preserva o campo e limpa ao fechar...');
  const assistant = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(assistant, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2AssistantFixture(page, { configured: true });
    await page.locator('#btnOpenGeminiKeyModal').click();
    await page.locator('#geminiKeyBackdrop:not(.hidden)').waitFor();
    const geminiSelector = '#geminiKeyBackdrop .gemini-key-modal';
    await waitPanelEntrySettled(page, geminiSelector);
    const geminiToggle = page.locator(`${geminiSelector} [data-panel-size-toggle]`);
    assert.equal(await geminiToggle.isVisible(), true, 'O modal da chave de IA deve exibir o controle de tamanho.');
    await page.locator('#geminiApiKeyInput').fill('synthetic-key-000000000000000000');
    const geminiBefore = await page.evaluate(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    }, geminiSelector);
    await geminiToggle.click();
    await waitPanelSizeSettled(page, geminiSelector, true);
    const geminiAfter = await page.evaluate(selector => {
      const panel = document.querySelector(selector);
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: button?.getAttribute('aria-pressed'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        keyValue: document.querySelector('#geminiApiKeyInput')?.value
      };
    }, geminiSelector);
    assert.ok(Math.abs(geminiAfter.width - geminiAfter.viewport) <= 2, `Chave de IA maximizada deve ocupar a largura (${geminiAfter.width}/${geminiAfter.viewport}).`);
    assert.ok(Math.abs(geminiAfter.height - geminiAfter.viewportHeight) <= 2, `Chave de IA maximizada deve ocupar a altura (${geminiAfter.height}/${geminiAfter.viewportHeight}).`);
    assert.ok(geminiAfter.left <= 2 && geminiAfter.top <= 2, 'Chave de IA maximizada deve ancorar no canto superior esquerdo.');
    assert.ok(geminiAfter.overflowX <= 2, 'Maximizar a chave de IA não pode criar overflow horizontal.');
    assert.equal(geminiAfter.pressed, 'true');
    assert.match(geminiAfter.icon, /#atrium-icon-restore$/);
    assert.equal(geminiAfter.keyValue, 'synthetic-key-000000000000000000', 'Maximizar não pode perder o campo preenchido.');
    assert.ok(geminiBefore.width < geminiAfter.width, 'O modal normal era mais estreito.');
    await page.keyboard.press('Escape');
    await page.locator('#geminiKeyBackdrop').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(selector => document.querySelector(selector).hasAttribute('data-panel-size'), geminiSelector), false, 'Fechar deve limpar o estado maximizado.');
    assert.deepEqual(pageErrors, [], `Assistente gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Chave de IA maximiza, preserva o campo e limpa ao fechar.');
  } finally {
    await assistant.close();
  }

  console.log('[M13] Identidade do escritório: o painel maximiza, preserva o formulário e limpa ao fechar...');
  const office = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(office, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2ConfigurationAdminFixture(page);
    await page.locator('#openOfficeIdentityFromConfiguration').click();
    await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
    const officeSelector = '#officeSetupBackdrop .office-setup-modal';
    await waitPanelEntrySettled(page, officeSelector);
    const officeToggle = page.locator(`${officeSelector} [data-panel-size-toggle]`);
    assert.equal(await officeToggle.isVisible(), true, 'O painel de identidade deve exibir o controle de tamanho.');
    await page.locator('#officeInputName').fill('Escritório Sintético M13');
    const officeBefore = await page.evaluate(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { width: rect.width, viewport: innerWidth };
    }, officeSelector);
    await officeToggle.click();
    await waitPanelSizeSettled(page, officeSelector, true);
    const officeAfter = await page.evaluate(selector => {
      const panel = document.querySelector(selector);
      const rect = panel.getBoundingClientRect();
      const button = panel.querySelector('[data-panel-size-toggle]');
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        viewport: innerWidth,
        viewportHeight: innerHeight,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        pressed: button?.getAttribute('aria-pressed'),
        icon: button?.querySelector('use')?.getAttribute('href') || '',
        name: document.querySelector('#officeInputName')?.value
      };
    }, officeSelector);
    assert.ok(Math.abs(officeAfter.width - officeAfter.viewport) <= 2, `Identidade maximizada deve ocupar a largura (${officeAfter.width}/${officeAfter.viewport}).`);
    assert.ok(Math.abs(officeAfter.height - officeAfter.viewportHeight) <= 2, `Identidade maximizada deve ocupar a altura (${officeAfter.height}/${officeAfter.viewportHeight}).`);
    assert.ok(officeAfter.left <= 2 && officeAfter.top <= 2, 'Identidade maximizada deve ancorar no canto superior esquerdo.');
    assert.ok(officeAfter.overflowX <= 2, 'Maximizar a identidade não pode criar overflow horizontal.');
    assert.equal(officeAfter.pressed, 'true');
    assert.match(officeAfter.icon, /#atrium-icon-restore$/);
    assert.equal(officeAfter.name, 'Escritório Sintético M13', 'Maximizar não pode perder o formulário em edição.');
    assert.ok(officeBefore.width < officeAfter.width, 'O painel normal era mais estreito.');
    await page.keyboard.press('Escape');
    await page.locator('#officeSetupBackdrop').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(selector => document.querySelector(selector).hasAttribute('data-panel-size'), officeSelector), false, 'Fechar deve limpar o estado maximizado.');
    assert.deepEqual(pageErrors, [], `Identidade gerou pageerror: ${pageErrors.join(' | ')}`);
    console.log('  ✓ Identidade maximiza, preserva formulário e limpa ao fechar.');
  } finally {
    await office.close();
  }

  console.log('\n>>> PAINÉIS: MAXIMIZAR/RESTAURAR (PILOTO): PASS <<<\n');
} finally {
  await session.stop();
}
