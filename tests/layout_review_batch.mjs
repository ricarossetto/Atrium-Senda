import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startUiV2Session, prepareUiV2Page, switchUiV2View } from './ui_v2_helpers.mjs';
const session = await startUiV2Session();
await mkdir('artifacts/layout-review', { recursive: true });
try {
  for (const theme of ['light', 'dark']) {
  for (const width of [1538, 1152, 390]) {
    const context = await session.createContext({ viewport: { width, height: 794 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    const screenshot = async name => {
      await page.evaluate(() => document.fonts.ready);
      return page.screenshot({ path: `artifacts/layout-review/${name}-${theme}-${width}.png`, animations: 'disabled' });
    };
    assert.equal(await page.locator('#todayLabel').textContent(), await page.evaluate(() => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())));
    await switchUiV2View(page, 'leads');
    assert.equal((await page.locator('#leadIntakeTitle').textContent()).trim(), 'Atendimentos');
    await page.evaluate(() => {
      window.Atrium.Store.state.contacts = [{ id: 'layout-contact', name: 'Contato Sintético', contactRole: 'cliente' }];
      window.Atrium.App.renderAll();
    });
    await page.locator('#newLeadButton').click();
    assert.equal(await page.locator('#field-client').getAttribute('aria-expanded'), 'false');
    await page.locator('#field-client').fill('Contato Sintético');
    await page.locator('#field-client').press('Enter');
    assert.equal(await page.locator('[name="contactId"]').inputValue(), 'layout-contact');
    assert.equal(await page.locator('#field-client').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#modalBackdrop:not(.hidden)').count(), 1, 'One Enter selects without submitting');
    await page.locator('#modalCancel').click();
    await page.locator('[data-discard-changes]').click();
    await page.locator('#newLeadButton').click();
    assert.equal(await page.locator('#field-client').getAttribute('aria-expanded'), 'false', 'Reopening does not reopen suggestions');
    await page.locator('#modalCancel').click();
    await switchUiV2View(page, 'contacts');
    const master = await page.locator('.contacts-master').boundingBox();
    const layout = await page.locator('.contacts-workspace-layout').boundingBox();
    assert.ok(Math.abs(master.width - layout.width) < 3, 'Contact list occupies the whole row');
    await page.locator('[data-contact-id="layout-contact"]').click();
    const inspector = page.locator('#contactInspector');
    assert.equal(await inspector.getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#contactSearch').evaluate(el => Boolean(el.closest('[inert]'))), true);
    assert.equal(await inspector.evaluate(el => Boolean(el.closest('[inert]'))), false);
    const box = await inspector.boundingBox();
    assert.ok(box.width >= Math.min(900, width * .9), 'Wide contact drawer');
    assert.ok(Math.abs(box.height - 794) <= 1);
    await screenshot('contact');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#contactInspector.is-open').count(), 0);
    assert.equal(await page.locator('#contactSearch').evaluate(el => Boolean(el.closest('[inert]'))), false);
    await page.locator('[data-contact-id="layout-contact"]').click();
    if (width > 760) {
      await page.locator('[data-contact-backdrop]').click({ position: { x: 15, y: 200 } });
      assert.equal(await page.locator('#contactInspector.is-open').count(), 0);
    } else await page.locator('[data-contact-inspector-close]').click();
    await page.evaluate(async () => {
      const { createSystemStatusBar } = await import('/js/views/ui-v2/system-status.js');
      const status = createSystemStatusBar();
      status.setState('syncing', 'Teste', 10);
      const first = document.querySelector('#systemStatusIcon svg');
      status.setState('syncing', 'Teste atualizado', 20);
      if (document.querySelector('#systemStatusIcon svg') !== first) throw Error('Spinner replaced during progress update');
    });
    assert.equal(await page.locator('#systemStatusProgressFill').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    await switchUiV2View(page, 'inbox');
    const filters = await page.locator('#inboxFilters').boundingBox();
    const cutoff = await page.locator('#inboxCutoffSelect').boundingBox();
    assert.ok(filters.y + filters.height <= cutoff.y || filters.x + filters.width <= cutoff.x,
      'Publication period selector must not overlap treatment filters');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('publications');
    await switchUiV2View(page, 'documents');
    await page.locator('#documentNamingTemplate').fill('{cliente} - {tipo}');
    assert.match(await page.locator('#documentNamingPreview').textContent(), /Nome do cliente - Contrato/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#documentFileInput').scrollIntoViewIfNeeded();
    await screenshot('documents');
    await switchUiV2View(page, 'financial');
    await page.locator('#newFinancialEntryButton').click();
    await page.locator('#finLinkSearch').fill('Contato Sintético');
    const searchBox = await page.locator('#finLinkResults').boundingBox();
    assert.ok(searchBox && searchBox.x >= 0 && searchBox.x + searchBox.width <= width + 1, 'Financial search fits the viewport');
    const searchInput = await page.locator('#finLinkSearch').boundingBox();
    assert.ok(Math.abs(searchInput.width - searchBox.width) <= 2, 'Search results align with the full input width');
    assert.ok(await page.locator('#finLinkResults [data-combobox-option]:visible').first().evaluate(option => {
      const name = option.querySelector('strong').getBoundingClientRect();
      const type = option.querySelector('small').getBoundingClientRect();
      return option.getBoundingClientRect().height >= 44 && type.top >= name.bottom;
    }), 'Financial results have a touch target and separate name/type lines');
    await screenshot('financial');
    await page.locator('#finLinkSearch').press('Enter');
    assert.equal(await page.locator('#finProcessSelect').inputValue(), 'contact:layout-contact');
    await page.locator('#finLinkSearch').fill('Escritório');
    assert.equal(await page.locator('#finProcessSelect').inputValue(), '', 'Typing clears the old canonical identity');
    await page.locator('#finLinkSearch').press('Enter');
    assert.equal(await page.locator('#finProcessSelect').inputValue(), 'office');
    await page.locator('#financialEntryCancel').click();
    await switchUiV2View(page, 'prompts');
    await page.locator('#promptsGrid').scrollIntoViewIfNeeded();
    const heights = await page.locator('#promptsGrid .prompt-library-card').evaluateAll(nodes => nodes.slice(0, 12).map(el => el.getBoundingClientRect().height));
    assert.ok(heights.length > 1 && Math.max(...heights) - Math.min(...heights) <= 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('prompts');
    await page.evaluate(async () => {
      const { renderPromptsV2Presentation } = await import('/js/views/ui-v2/prompts-presenter.js');
      document.querySelector('#promptsGrid').innerHTML = renderPromptsV2Presentation({
        prompts: [{ id: 'synthetic-custom', isCustom: true, category: 'Civil', type: 'Pesquisa',
          title: 'Modelo sintético personalizado', description: 'Descrição de teste.',
          tags: ['Revisão', 'Sintético'], prompt: 'Texto integral sintético. '.repeat(60) }],
        escapeHtml: value => String(value), normalizeText: value => String(value)
      }).libraryHtml;
    });
    const customCard = page.locator('#promptsGrid .custom-card');
    assert.equal(await customCard.locator('.prompt-card-actions button').count(), 4);
    assert.ok(await customCard.evaluate(card => {
      const bounds = card.getBoundingClientRect();
      return [...card.querySelectorAll('.prompt-card-actions button')].every(button => {
        const box = button.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom && box.right <= bounds.right;
      });
    }), 'Custom prompt actions must remain inside the normalized card');
    await page.evaluate(() => window.Atrium.App.openTermModal({ name: 'Termo sintético', type: 'oab', oabNumber: '123456', oabUf: 'RS' }));
    const oab = await page.locator('#field-oabNumber').boundingBox();
    const uf = await page.locator('#field-oabUf').boundingBox();
    assert.ok(Math.abs(oab.height - uf.height) <= 1, 'OAB and UF controls have equal height');
    if (width > 760) assert.ok(Math.abs(oab.y - uf.y) <= 1, 'Desktop OAB and UF align at the top');
    await screenshot('monitoring');
    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log('PASS layout review ' + theme + ' ' + width);
  }
  }
} finally { await session.stop(); }
