import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const cssSource = readFileSync(new URL('../css/views/ui-v2/publications.css', import.meta.url), 'utf8');
assert.match(cssSource, /Gate 17: lista full-width/);
assert.match(cssSource, /#publicationInspectorBackdrop/);
assert.match(cssSource, /position:\s*fixed/);
assert.match(cssSource, /@media \(max-width: 767px\)/);
assert.match(cssSource, /min-height:\s*44px/);
assert.match(cssSource, /white-space:\s*pre-wrap/);

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2PublicationsFixture(page);
    const initial = await page.evaluate(() => {
      const queue = document.querySelector('.inbox-list-card').getBoundingClientRect();
      const layout = document.querySelector('.inbox-layout').getBoundingClientRect();
      return {
        queue: queue.width,
        layout: layout.width,
        detailVisible: getComputedStyle(document.getElementById('intimationDetail')).visibility !== 'hidden',
        open: document.getElementById('view-inbox').classList.contains('publication-detail-open'),
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert.ok(initial.queue / initial.layout >= .98, `A lista deve ocupar o workspace: ${initial.queue / initial.layout}.`);
    assert.equal(initial.detailVisible, false);
    assert.equal(initial.open, false);
    assert.ok(initial.overflow <= 2);

    const record = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    const openControl = record.locator('.publication-record-open');
    await record.locator('.publication-row-quick').waitFor();
    await page.evaluate(() => {
      const firstOpen = document.querySelector('#inboxList .publication-record-shell .publication-record-open');
      firstOpen?.focus();
    });
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.rowAction || null),
      'mark_treated',
      'Tab deve alcançar a ação rápida da mesma linha após o controle de abrir.'
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => Boolean(document.activeElement?.classList.contains('publication-record-open'))),
      true,
      'Tab deve avançar para o controle de abrir da próxima linha.'
    );
    await openControl.focus();
    await page.keyboard.press('Enter');
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
    assert.equal(await page.locator('#intimationDetail').getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#intimationDetail').getAttribute('aria-modal'), 'true');
    assert.equal(await page.locator('#publicationInspectorBackdrop').isVisible(), true);
    assert.equal(await page.locator('.inbox-list-card').getAttribute('inert'), '');
    assert.equal(await page.locator('#sidebar').getAttribute('inert'), '');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const drawer = await page.locator('#intimationDetail').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    assert.ok(drawer.left >= -4 && drawer.right <= drawer.width + 4, JSON.stringify(drawer));
    assert.ok(drawer.top >= -4 && drawer.bottom <= drawer.height + 4, JSON.stringify(drawer));

    await page.locator('#intimationDetail').evaluate(detail => {
      const focusable = [...detail.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
      focusable.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'publicationDetailClose');
    await page.keyboard.press('Escape');
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-intimation-id]')?.dataset.intimationId), 'ui-v2-publication-urgent');
    assert.equal(await page.locator('.inbox-list-card').getAttribute('inert'), null);
    assert.equal(await page.locator('#sidebar').getAttribute('inert'), null);

    await openControl.click();
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    await page.locator('#publicationInspectorBackdrop').click({ position: { x: 12, y: 12 } });
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-intimation-id]')?.dataset.intimationId), 'ui-v2-publication-urgent');

    const filter = page.locator('#inboxFilters button[data-filter="treated"]');
    await filter.focus();
    await page.keyboard.press('Enter');
    assert.equal(await filter.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 1);
    assert.deepEqual(pageErrors, []);
  } finally {
    await desktop.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2PublicationsFixture(page);
    const before = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const records = [...document.querySelectorAll('#inboxList [data-intimation-id]')];
      const quickActions = [...document.querySelectorAll('#inboxList .publication-row-quick')];
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
        targets: records.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
        quickTargets: quickActions.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
        quickCount: quickActions.length
      };
    });
    assert.ok(before.overflow <= 2, `Overflow mobile: ${before.overflow}px.`);
    assert.deepEqual(before.duplicates, []);
    for (const target of before.targets) assert.ok(target.width >= 44 && target.height >= 44);
    assert.equal(before.quickCount, 2, 'Somente publicações não tratadas/em análise expõem a ação rápida.');
    for (const target of before.quickTargets) assert.ok(target.width >= 44 && target.height >= 44, `Alvo da ação rápida deve ter 44px: ${JSON.stringify(target)}`);

    const origin = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    const originText = await origin.textContent();
    for (const expected of ['Intimação sintética', '5004321-12.2026.8.21.0001', 'DJEN sintético', 'Não tratada', 'Não lida']) {
      assert.ok(originText.includes(expected), `RecordList deve expor: ${expected}`);
    }
    await origin.locator('.publication-record-open').focus();
    await page.keyboard.press('Enter');
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
    await page.locator('[data-fold="conference"] > summary').click();
    await page.locator('[data-conference-days]').fill('23');
    await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
    assert.equal(await page.locator('[data-conference-days]').inputValue(), '23');
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-conference-days')), true);
    await page.locator('[data-conference-counting]').selectOption('calendar');
    await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
    assert.equal(await page.locator('[data-conference-counting]').inputValue(), 'calendar');
    if (await page.locator('[data-detail-more]').isVisible()) await page.locator('[data-detail-more]').click();
    await page.locator('[data-detail-action="assistant"]').focus();
    await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.detailAction), 'assistant');
    await page.evaluate(() => {
      document.activeElement.blur();
      window.Atrium.App.renderIntimationDetail();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BODY');
    await page.locator('#btnSendIntimationEmail').click();
    await page.locator('#publicationEmailBackdrop:not(.hidden)').waitFor();
    const overlayFocus = await page.evaluate(() => document.activeElement?.id);
    await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
    assert.equal(await page.evaluate(() => document.activeElement?.id), overlayFocus);
    await page.keyboard.press('Escape');
    await page.locator('#publicationEmailBackdrop.hidden').waitFor({ state: 'attached' });
    await page.locator('#publicationDetailClose').focus();
    page.once('dialog', async dialog => {
      assert.match(dialog.message(), /alterações não salvas/);
      await dialog.accept();
    });
    const sheet = await page.locator('#intimationDetail').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const actions = [...element.querySelectorAll('.detail-actions .button')].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }));
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, actions };
    });
    assert.ok(sheet.left >= -4 && sheet.right <= sheet.viewportWidth + 4, JSON.stringify(sheet));
    assert.ok(sheet.top >= -4 && sheet.bottom <= sheet.viewportHeight + 4, JSON.stringify(sheet));
    for (const target of sheet.actions) assert.ok(target.width >= 44 && target.height >= 44);
    await page.keyboard.press('Escape');
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-intimation-id]')?.dataset.intimationId), 'ui-v2-publication-urgent');

    await page.locator('[data-intimation-id="ui-v2-publication-review"] .publication-record-open').click();
    await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
    assert.equal(await page.locator('[data-conference-days]').inputValue(), '15');
    assert.equal(await page.locator('[data-conference-counting]').inputValue(), 'business');
    await page.keyboard.press('Escape');
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    const emailButton = page.locator('#btnEmailPublications');
    await emailButton.focus();
    if (await page.locator('#inboxFiltersToggle').isVisible() && await page.locator('#inboxFiltersToggle').getAttribute('aria-expanded') === 'false') await page.locator('#inboxFiltersToggle').click();
    await emailButton.click();
    await page.locator('#publicationsEmailModalBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'emailTargetAddress');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
    await page.locator('#publicationsEmailCancel').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'publicationsEmailClose');
    await page.keyboard.press('Escape');
    await page.locator('#publicationsEmailModalBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnEmailPublications');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
    assert.deepEqual(pageErrors, []);
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Acessibilidade de Publicações V2 aprovada: lista full-width, inspector desktop/mobile, foco, Escape e backdrop.');
