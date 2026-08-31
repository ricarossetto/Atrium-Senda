import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ImporterFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssSource = await readFile(path.join(ROOT, 'css/views/ui-v2/importer.css'), 'utf8');
assert.match(cssSource, /html\[data-ui="v2"\]\s+#view-importer/);
assert.match(cssSource, /@media \(max-width: 560px\)/);
assert.doesNotMatch(cssSource, /translateY\s*\(|linear-gradient|radial-gradient|animation:\s*[^;]*(?:infinite|linear)/);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 IMPORTER ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2ImporterFixture(page, { preview: true });

  assert.equal(await page.locator('.importer-template-grid').getAttribute('aria-label'), 'Modelos de planilha');
  for (const type of ['processes', 'contacts', 'tasks']) {
    const link = page.locator(`a[href="/api/import/template?type=${type}"]`);
    assert.ok((await link.textContent()).trim().length > 20);
    assert.notEqual(await link.getAttribute('download'), null);
  }
  assert.equal(await page.locator('#importerFileInput').getAttribute('aria-label'), 'Selecionar planilha para importação');
  assert.equal(await page.locator('#importerDropzone').getAttribute('aria-describedby'), 'importerDropzoneDescription');
  assert.match(await page.locator('#importerDropzoneDescription').textContent(), /\.XLS[\s\S]*\.XLSX[\s\S]*\.CSV/i);
  assert.equal(await page.locator('#btnSelectSpreadsheet').getAttribute('type'), 'button');
  assert.equal(await page.locator('[data-importer-step="review"]').getAttribute('aria-current'), 'step');
  assert.equal(await page.locator('#importerPreviewCard').getAttribute('aria-labelledby'), 'importerSummaryTitle');
  assert.equal(await page.locator('#importerBadges').getAttribute('aria-label'), 'Registros identificados na importação');
  assert.equal(await page.locator('.importer-preview-scroll').getAttribute('role'), 'region');
  assert.equal(await page.locator('.importer-preview-scroll').getAttribute('aria-label'), 'Prévia tabular da planilha');
  assert.equal(await page.locator('#importerPreviewHead th').count(), 4);
  assert.ok((await page.locator('#importerCancelButton').textContent()).trim().length > 3);
  assert.match(await page.locator('#importerCommitButton').textContent(), /Confirmar importação/);
  await page.locator('#btnSelectSpreadsheet').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnSelectSpreadsheet');
  const focusStyle = await page.locator('#btnSelectSpreadsheet').evaluate(element => getComputedStyle(element).outlineStyle);
  assert.notEqual(focusStyle, 'none');

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
  await prepareUiV2ImporterFixture(mobilePage, { preview: true });
  const mobileLayout = await mobilePage.locator('#view-importer').evaluate(view => {
    const tableRegion = view.querySelector('.importer-preview-scroll');
    const critical = [...view.querySelectorAll('.importer-template-card, #btnSelectSpreadsheet, #importerCancelButton, #importerCommitButton')]
      .filter(element => element.getClientRects().length);
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      viewOverflow: view.scrollWidth - view.clientWidth,
      tableOverflow: tableRegion.scrollWidth - tableRegion.clientWidth,
      tableContained: tableRegion.getBoundingClientRect().right <= innerWidth + 2,
      undersized: critical.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(element => element.id || element.textContent.trim())
    };
  });
  assert.ok(mobileLayout.pageOverflow <= 2, `Overflow global mobile: ${mobileLayout.pageOverflow}px`);
  assert.ok(mobileLayout.viewOverflow <= 2, `Overflow da view mobile: ${mobileLayout.viewOverflow}px`);
  assert.ok(mobileLayout.tableOverflow > 0, 'Tabela ampla deve usar scroll confinado no mobile.');
  assert.equal(mobileLayout.tableContained, true);
  assert.deepEqual(mobileLayout.undersized, []);

  await mobilePage.evaluate(() => { document.documentElement.dataset.ui = 'classic'; });
  const classicContamination = await mobilePage.locator('#view-importer .v2-only').evaluateAll(elements => elements.filter(element => element.getClientRects().length).length);
  assert.equal(classicContamination, 0);
  assert.equal(await mobilePage.locator('#importerDropzone').isVisible(), true);
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Importador: nomes, semântica, foco, alvos mobile e overflow confinado PASS.');
