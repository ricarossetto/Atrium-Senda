import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';
import {
  prepareUiV2AssistantFixture,
  prepareUiV2JudicialFixture,
  prepareUiV2LeadsFixture,
  prepareUiV2Page,
  prepareUiV2ProcessesFixture,
  prepareUiV2PromptsFixture,
  prepareUiV2PublicationsFixture,
  startUiV2Session,
  UI_V2_JUDICIAL_STATUS
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'human-visual-acceptance');
fs.mkdirSync(OUTPUT, { recursive: true });
const hashes = new Set();
let assertions = 0;

async function capture(page, file, locator = null) {
  const output = path.join(OUTPUT, file);
  if (locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.screenshot({ path: output });
  } else await page.screenshot({ path: output, fullPage: false });
  hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
}

async function settle(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('body *')]
    .flatMap(element => element.getAnimations?.({ subtree: false }) || [])
    .every(animation => animation.playState === 'finished'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('systemStatusBar')?.classList.contains('is-transient-hidden'), null, { timeout: 5000 }).catch(() => {});
}

const authServer = await startTestServer();
const authBrowser = await chromium.launch({ headless: true });
try {
  const context = await authBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(authServer.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#authSetupForm:not(.hidden)').waitFor();
  await page.locator('#authSetupForm [name="password"]').fill('Synthetic-Visual-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Synthetic-Visual-2026!');
  const passwordGeometry = await page.locator('#authSetupForm input[type="password"]').evaluateAll(inputs => inputs.map(input => {
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return { height: rect.height, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, lineHeight: style.lineHeight };
  }));
  assert.equal(passwordGeometry.length, 2); assertions++;
  assert.deepEqual(passwordGeometry.map(item => item.height), [46, 46]); assertions++;
  await capture(page, 'A-login-password-closeup.png', page.locator('#authSetupForm'));
  await context.close();
} finally {
  await authBrowser.close();
  await authServer.stop();
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2PublicationsFixture(page);
  await settle(page);
  assert.equal(await page.locator('#systemStatusBar').evaluate(element => element.classList.contains('is-transient-hidden')), true); assertions++;
  const metricAlignment = await page.locator('.pub-metric-card').evaluateAll(cards => cards.map(card => {
    const dot = card.querySelector('.pub-metric-dot').getBoundingClientRect();
    const content = card.querySelector('.pub-metric-content').getBoundingClientRect();
    return Math.abs((dot.top + dot.height / 2) - (content.top + content.height / 2));
  }));
  assert.ok(metricAlignment.every(delta => delta <= 1), `Bolinhas das métricas fora do centro: ${metricAlignment.join(', ')}`); assertions++;
  const actionHeights = await page.locator('.publication-primary-actions > button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  assert.ok(
    actionHeights.every(height => Math.abs(height - actionHeights[0]) <= .5 && height >= 44),
    `Ações primárias devem ter a mesma altura e no mínimo 44px: ${actionHeights.join(', ')}`
  ); assertions++;
  await capture(page, 'B-publication-metrics-dots-closeup.png', page.locator('#publicationsMetrics'));
  await capture(page, 'C-publication-row-status-dot-closeup.png', page.locator('#inboxList [data-intimation-id="ui-v2-publication-review"]'));
  await capture(page, 'D-publication-workspace-fullscreen.png');
  await page.locator('[data-intimation-id="ui-v2-publication-review"]').click();
  await page.locator('#view-inbox.publication-detail-open').waitFor();
  await settle(page);
  const reader = await page.locator('#intimationDetail').boundingBox();
  assert.ok(reader.width >= 1000 && reader.height >= 760, `Leitor deveria ocupar a maior parte do viewport: ${JSON.stringify(reader)}`); assertions++;
  await capture(page, 'E-publication-action-footer.png', page.locator('#intimationDetail .detail-actions'));
  await capture(page, 'F-full-publication-text.png');
  await page.locator('#publicationDetailClose').click();

  await prepareUiV2AssistantFixture(page, { configured: true, withContext: true });
  await settle(page);
  assert.ok((await page.locator('#view-assistant').evaluate(element => element.scrollWidth - element.clientWidth)) <= 2); assertions++;
  await capture(page, 'G-ai-drafting.png');

  await page.evaluate(() => { window.Atrium.App.selectedIntimation = null; });
  await prepareUiV2PromptsFixture(page);
  await settle(page);
  const promptPriority = await page.locator('.prompt-library-card').first().evaluate(card => {
    const text = card.querySelector('.prompt-box')?.getBoundingClientRect();
    const action = card.querySelector('[data-use-prompt]')?.getBoundingClientRect();
    return { textHeight: text?.height || 0, actionHeight: action?.height || 0 };
  });
  assert.ok(promptPriority.actionHeight <= 33, `Ações de prompt devem permanecer compactas: ${promptPriority.actionHeight}px.`); assertions++;
  assert.ok(promptPriority.textHeight > promptPriority.actionHeight, `O resumo do prompt deve continuar visualmente prioritário: ${promptPriority.textHeight}px.`); assertions++;
  const promptSearchAlignment = await page.locator('.prompts-search-box').evaluate(box => {
    const input = box.querySelector('#promptsSearchInput').getBoundingClientRect();
    const icon = box.querySelector('.search-icon').getBoundingClientRect();
    return Math.abs((input.top + input.height / 2) - (icon.top + icon.height / 2));
  });
  assert.ok(promptSearchAlignment <= 1, `A lupa deve ficar no centro óptico do campo (${promptSearchAlignment}px).`); assertions++;
  assert.equal(await page.locator('.prompt-text').first().evaluate(element => getComputedStyle(element).backgroundImage), 'none'); assertions++;
  assert.equal(await page.locator('.prompt-text').first().evaluate(element => getComputedStyle(element).borderTopWidth), '0px'); assertions++;
  await capture(page, 'H-prompt-card-and-search.png');

  const unconfigured = {
    ...UI_V2_JUDICIAL_STATUS,
    certificate: { valid: false, accessible: false, status: 'missing' },
    pjeOffice: { available: false },
    portals: UI_V2_JUDICIAL_STATUS.portals.map(portal => ({ ...portal, enabled: false, totpConfigured: false }))
  };
  await prepareUiV2JudicialFixture(page, unconfigured);
  await page.locator('#certificateGuideButton').click();
  await page.locator('#judicialSetupBackdrop:not(.hidden)').waitFor();
  await settle(page);
  const uploadSurface = await page.locator('#a1SetupSection .file-picker small').evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(uploadSurface, 'rgb(0, 0, 0)'); assertions++;
  await capture(page, 'I-a1-upload-light.png', page.locator('#a1SetupSection'));
  const qrSurface = await page.locator('#totpSetupSection .file-picker small').evaluate(element => getComputedStyle(element).backgroundColor);
  assert.notEqual(qrSurface, 'rgb(0, 0, 0)'); assertions++;
  await capture(page, 'K-qr-upload-light.png', page.locator('#totpSetupSection'));
  assert.match(await page.locator('.portal-auth-guide').textContent(), /certificado válido não significa sessão autenticada/i); assertions++;
  await page.locator('#judicialSetupClose').click();

  await prepareUiV2JudicialFixture(page, UI_V2_JUDICIAL_STATUS);
  const tileRows = await page.locator('.judicial-integration-card, .importer-integration-card').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().top)));
  assert.equal(tileRows[0], tileRows[1], 'Cobertura judicial e Importador devem ocupar a mesma linha no desktop.'); assertions++;
  assert.equal(await page.locator('.architecture-card, .legacy-architecture-note').count(), 0); assertions++;
  await capture(page, 'M-integrations-grid.png');

  await page.evaluate(() => { window.Atrium.App.switchView('dashboard'); window.Atrium.App.renderDashboard(); window.scrollTo(0, 0); });
  await settle(page);
  await capture(page, 'N-dashboard-above-fold.png');
  const sidebarHitState = await page.locator('#sidebarToggleBtn').evaluate(toggle => {
    const toggleRect = toggle.getBoundingClientRect();
    const center = { x: toggleRect.left + toggleRect.width / 2, y: toggleRect.top + toggleRect.height / 2 };
    const shell = document.getElementById('appShell');
    const target = document.elementFromPoint(center.x, center.y);
    const computed = element => {
      const style = getComputedStyle(element);
      return {
        position: style.position,
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        visibility: style.visibility,
        opacity: style.opacity
      };
    };
    return {
      toggle: { rect: { x: toggleRect.x, y: toggleRect.y, width: toggleRect.width, height: toggleRect.height }, ...computed(toggle) },
      shell: { inert: shell?.hasAttribute('inert') || false, ...computed(shell) },
      hit: { id: target?.id || '', className: typeof target?.className === 'string' ? target.className : '', tagName: target?.tagName || '' },
      visibleBackdrops: [...document.querySelectorAll('[id$="Backdrop"]')].filter(element => !element.classList.contains('hidden') && getComputedStyle(element).display !== 'none').map(element => element.id),
      openDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(element => element.getClientRects().length > 0).map(element => element.id || element.className),
      activeElement: document.activeElement?.id || document.activeElement?.tagName || '',
      sidebarCollapsed: document.getElementById('sidebar')?.classList.contains('collapsed') || false
    };
  });
  assert.equal(sidebarHitState.shell.inert, false, 'O appShell não pode permanecer inerte depois que o assistente judicial fecha.'); assertions++;
  assert.deepEqual(sidebarHitState.visibleBackdrops, [], 'Nenhum backdrop pode bloquear o controle lateral.'); assertions++;
  assert.equal(sidebarHitState.hit.id, 'sidebarToggleBtn', `O controle lateral precisa ser o alvo real do ponteiro: ${JSON.stringify(sidebarHitState.hit)}`); assertions++;
  await page.locator('#sidebarToggleBtn').click();
  await page.locator('#sidebar.collapsed').waitFor();
  await settle(page);
  const sidebarGap = await page.evaluate(() => {
    const logo = document.querySelector('.brand-emblem')?.getBoundingClientRect() || document.querySelector('.brand')?.getBoundingClientRect();
    const toggle = document.getElementById('sidebarToggleBtn')?.getBoundingClientRect();
    return logo && toggle ? toggle.top - logo.bottom : 0;
  });
  assert.ok(sidebarGap >= 8, `Logo e botão recolhido precisam de respiro visual (${sidebarGap}px).`); assertions++;
  await capture(page, 'O-sidebar-collapsed-logo.png', page.locator('#sidebar'));
  await context.close();

  const darkContext = await session.createContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const { page: darkPage, pageErrors: darkErrors } = await prepareUiV2Page(darkContext, session.server.baseUrl, { theme: 'dark' });
  await prepareUiV2JudicialFixture(darkPage, unconfigured);
  await darkPage.locator('#certificateGuideButton').click();
  await darkPage.locator('#judicialSetupBackdrop:not(.hidden)').waitFor();
  await settle(darkPage);
  await capture(darkPage, 'J-a1-upload-dark.png', darkPage.locator('#a1SetupSection'));
  await capture(darkPage, 'L-qr-upload-dark.png', darkPage.locator('#totpSetupSection'));
  assert.deepEqual(darkErrors, []); assertions++;
  await darkContext.close();

  const crmContext = await session.createContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const { page: crmPage, pageErrors: crmErrors } = await prepareUiV2Page(crmContext, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2LeadsFixture(crmPage);
  await crmPage.locator('#newLeadButton').click();
  await crmPage.locator('#field-client').fill('Contato');
  await crmPage.locator('.modal-combobox-listbox:not(.hidden)').waitFor();
  assert.equal(await crmPage.locator('#field-client').getAttribute('role'), 'combobox'); assertions++;
  assert.ok(await crmPage.locator('[data-combobox-option]:visible').count() >= 1); assertions++;
  assert.match(await crmPage.locator('[data-combobox-option]:visible small').first().textContent(), /Cliente.*90000-0000.*synthetic\.example\.test/); assertions++;
  await capture(crmPage, 'P-crm-client-picker-open.png', crmPage.locator('#modalBackdrop .modal'));
  assert.deepEqual(crmErrors, []); assertions++;
  await crmContext.close();

  const geminiContext = await session.createContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const { page: geminiPage, pageErrors: geminiErrors } = await prepareUiV2Page(geminiContext, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2AssistantFixture(geminiPage, { configured: false });
  await settle(geminiPage);
  const geminiSurface = await geminiPage.locator('#aiOnboardingBanner').evaluate(element => {
    const style = getComputedStyle(element);
    const channels = (style.backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [])
      .map(channel => channel <= 1 ? channel * 255 : channel);
    return { backgroundImage: style.backgroundImage, channels };
  });
  assert.equal(geminiSurface.backgroundImage, 'none'); assertions++;
  assert.ok(geminiSurface.channels.length === 3 && geminiSurface.channels.every(channel => channel >= 220), `Onboarding Gemini deve usar superfície clara: ${JSON.stringify(geminiSurface)}`); assertions++;
  await capture(geminiPage, 'Q-gemini-setup-light.png');
  assert.deepEqual(geminiErrors, []); assertions++;
  await geminiContext.close();

  const processContext = await session.createContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const { page: processPage, pageErrors: processErrors } = await prepareUiV2Page(processContext, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2ProcessesFixture(processPage);
  await processPage.locator('[data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
  await processPage.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  await settle(processPage);
  assert.equal(await processPage.locator('[data-process-client]').getAttribute('type'), 'button'); assertions++;
  assert.equal(await processPage.locator('[data-process-task]').count(), 3); assertions++;
  assert.ok(await processPage.locator('.process-movement-list li, .process-movement-list article').count() >= 3); assertions++;
  await capture(processPage, 'R-process-inspector-client.png', processPage.locator('#processInspectorContent .process-inspector-identity'));
  await capture(processPage, 'S-process-tasks.png', processPage.locator('[aria-labelledby="processTasksHeading"]'));
  await capture(processPage, 'T-process-movements.png', processPage.locator('[aria-labelledby="processMovementsHeading"]'));
  assert.deepEqual(processErrors, []); assertions++;
  await processContext.close();

  const notificationContext = await session.createContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const { page: notificationPage, pageErrors: notificationErrors } = await prepareUiV2Page(notificationContext, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2PublicationsFixture(notificationPage);
  await notificationPage.locator('#notificationButton').click();
  await notificationPage.locator('#notificationPanel:not(.hidden)').waitFor();
  assert.equal(await notificationPage.locator('#notificationButton').getAttribute('aria-expanded'), 'true'); assertions++;
  assert.ok((await notificationPage.locator('#notificationPanelBody button').count()) >= 1); assertions++;
  const notificationGeometry = await notificationPage.evaluate(() => {
    const panel = document.getElementById('notificationPanel').getBoundingClientRect();
    const sidebar = document.getElementById('sidebar').getBoundingClientRect();
    return { panelLeft: panel.left, panelRight: panel.right, sidebarRight: sidebar.right, viewportWidth: innerWidth };
  });
  assert.ok(notificationGeometry.panelLeft >= notificationGeometry.sidebarRight, `Painel não pode ficar sob a sidebar: ${JSON.stringify(notificationGeometry)}`); assertions++;
  assert.ok(notificationGeometry.panelRight <= notificationGeometry.viewportWidth, `Painel precisa ficar dentro do viewport: ${JSON.stringify(notificationGeometry)}`); assertions++;
  await capture(notificationPage, 'U-notification-panel.png', notificationPage.locator('#notificationPanel'));
  assert.deepEqual(notificationErrors, []); assertions++;
  await notificationContext.close();

  assert.deepEqual(pageErrors, []); assertions++;
  assert.equal(hashes.size, 21, 'Cada evidência A–U deve ser visualmente distinta.'); assertions++;
  console.log(`✓ Human Visual Acceptance: 21 screenshots, ${hashes.size}/21 hashes, ${assertions}/${assertions} assertions.`);
  console.log(`✓ Artefatos: ${OUTPUT}`);
} finally {
  await session.stop();
}
