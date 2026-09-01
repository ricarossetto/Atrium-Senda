import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2LinksFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssSource = await readFile(path.join(ROOT, 'css/views/ui-v2/links.css'), 'utf8');
assert.match(cssSource, /html\[data-ui="v2"\]\s+#view-links/);
assert.match(cssSource, /@media \(max-width: 720px\)/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(cssSource, /translateY\s*\(|linear-gradient|radial-gradient|animation:\s*[^;]*(?:infinite|linear)|backdrop-filter/);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LINKS ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2LinksFixture(page);

  assert.equal(await page.locator('.links-v2-header h2').textContent(), 'Links úteis');
  assert.deepEqual(await page.locator('#view-links .links-collection > .links-section-header h3').allTextContents(), [
    'Meus Links Personalizados',
    'Legislação & Códigos Fundamentais (Planalto)',
    'Jurisprudência & Precedentes Oficiais',
    'Ferramentas Gratuitas com Inteligência Artificial & Repositório'
  ]);
  assert.match(await page.locator('#btnNewLink').getAttribute('type'), /button/);
  assert.match((await page.locator('#btnNewLink').textContent()).replace(/\s+/g, ' ').trim(), /Novo Link Útil/);

  const staticLinks = page.locator('[data-links-group]:not([data-links-group="custom"]) > a.link-card');
  assert.equal(await staticLinks.count(), 10);
  for (let index = 0; index < await staticLinks.count(); index++) {
    const link = staticLinks.nth(index);
    assert.match(await link.getAttribute('aria-label'), /^Abrir .+ em nova guia$/);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  }

  const customCards = page.locator('#customLinksGrid .custom-link-card');
  assert.equal(await customCards.count(), 3);
  assert.match(await customCards.first().getAttribute('aria-label'), /Pesquisa interna de legislação sintética, Legislação/);
  assert.equal(await customCards.first().locator('a[aria-label="Abrir Pesquisa interna de legislação sintética em nova guia"]').count(), 2);
  assert.equal(await customCards.first().locator('button[aria-label="Excluir link Pesquisa interna de legislação sintética"]').count(), 1);
  assert.equal(await customCards.nth(2).locator('a').count(), 0);
  assert.equal(await customCards.nth(2).locator('[aria-label="Endereço inválido"]').count(), 1);

  for (const selector of ['#btnNewLink', '[data-links-group="legislation"] > a:first-child', '#customLinksGrid .custom-link-card:first-child .link-tag', '#customLinksGrid .custom-link-card:first-child .btn-delete-link']) {
    await page.locator(selector).focus();
    assert.notEqual(await page.locator(selector).evaluate(element => getComputedStyle(element).outlineStyle), 'none');
  }

  await page.locator('#btnNewLink').focus();
  await page.keyboard.press('Enter');
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#modalTitle').textContent(), 'Adicionar novo link útil');
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), ['title', 'url', 'category', 'description']);
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#modalBackdrop .modal').evaluate(modal => modal.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'btnNewLink');

  const desktopDuplicates = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(desktopDuplicates, []);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
  const mobilePage = mobileResult.page;
  await prepareUiV2LinksFixture(mobilePage);
  const mobileLayout = await mobilePage.locator('#view-links').evaluate(view => {
    const critical = [...view.querySelectorAll('#btnNewLink, .links-commandbar [data-view-link], .link-card[href], .custom-link-card a, .custom-link-card button, .prompts-banner-card button')]
      .filter(element => element.getClientRects().length);
    const firstGrid = view.querySelector('[data-links-group="legislation"]');
    const firstCard = firstGrid?.querySelector('.link-card');
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      viewOverflow: view.scrollWidth - view.clientWidth,
      gridColumns: firstGrid ? getComputedStyle(firstGrid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      cardContained: Boolean(firstCard && firstCard.getBoundingClientRect().right <= innerWidth + 1),
      undersized: critical.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(element => element.getAttribute('aria-label') || element.id || element.textContent.trim()),
      duplicates: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index)
    };
  });
  assert.ok(mobileLayout.pageOverflow <= 2, `Overflow global mobile: ${mobileLayout.pageOverflow}px`);
  assert.ok(mobileLayout.viewOverflow <= 2, `Overflow da view mobile: ${mobileLayout.viewOverflow}px`);
  assert.equal(mobileLayout.gridColumns, 1);
  assert.equal(mobileLayout.cardContained, true);
  assert.deepEqual(mobileLayout.undersized, []);
  assert.deepEqual(mobileLayout.duplicates, []);

  await mobilePage.locator('#btnNewLink').click();
  await mobilePage.locator('#modalBackdrop:not(.hidden)').waitFor();
  const mobileModal = await mobilePage.locator('#modalBackdrop .modal').evaluate(modal => {
    const rect = modal.getBoundingClientRect();
    const controls = [...modal.querySelectorAll('button, input, select, textarea')].filter(element => element.getClientRects().length);
    return {
      withinViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      undersized: controls.filter(element => {
        const controlRect = element.getBoundingClientRect();
        return controlRect.height < 43.5;
      }).map(element => element.name || element.id || element.textContent.trim())
    };
  });
  assert.equal(mobileModal.withinViewport, true);
  assert.deepEqual(mobileModal.undersized, []);

  await mobilePage.keyboard.press('Escape');
  await mobilePage.evaluate(() => {
    document.documentElement.dataset.ui = 'classic';
    window.Atrium.App.renderLinks();
  });
  assert.equal(await mobilePage.locator('#view-links .v2-only').evaluateAll(elements => elements.filter(element => element.getClientRects().length).length), 0);
  assert.equal(await mobilePage.locator('[data-links-group="legislation"] > .link-card').first().isVisible(), true);
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Links: hierarquia, nomes externos, teclado, modal compartilhado, 44px e contenção mobile PASS.');
