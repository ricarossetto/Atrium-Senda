import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2AuditFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssSource = await readFile(path.join(ROOT, 'css/views/ui-v2/audit.css'), 'utf8');
assert.match(cssSource, /html\[data-ui="v2"\]\s+#view-audit/);
assert.match(cssSource, /@media \(max-width: 720px\)/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(cssSource, /translateY\s*\(|linear-gradient|radial-gradient|animation:\s*[^;]*(?:infinite|linear)|backdrop-filter/);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 AUDIT ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2AuditFixture(page);

  assert.equal(await page.locator('.audit-v2-header h2').textContent(), 'Auditoria');
  assert.equal(await page.locator('#auditFilters').getAttribute('role'), 'group');
  assert.equal(await page.locator('#auditFilters').getAttribute('aria-label'), 'Filtrar registro de auditoria');
  assert.equal(await page.locator('#auditSearch').getAttribute('aria-label'), 'Pesquisar no registro de auditoria');
  assert.equal(await page.locator('#btnExportAuditLog').getAttribute('aria-label'), 'Exportar registro completo de auditoria em JSON');
  assert.equal(await page.locator('#btnClearAuditLog').getAttribute('aria-label'), 'Redefinir filtros de auditoria');
  assert.equal(await page.locator('#auditList').getAttribute('role'), 'region');
  assert.equal(await page.locator('#auditList').getAttribute('aria-labelledby'), 'auditLedgerHeading');
  assert.equal(await page.locator('.audit-ledger-table caption').textContent(), 'Registro cronológico de atividades do sistema');
  assert.deepEqual(await page.locator('.audit-ledger-table th').allTextContents(), ['Data e hora', 'Ator', 'Ação', 'Detalhes', 'Status']);
  assert.deepEqual(await page.locator('.audit-ledger-table th').evaluateAll(nodes => nodes.map(node => node.getAttribute('scope'))), ['col', 'col', 'col', 'col', 'col']);
  assert.equal(await page.locator('.audit-status-label').first().textContent(), 'Registrado');
  assert.match(await page.locator('.audit-export-note').textContent(), /registro completo/i);

  for (const selector of ['#auditSearch', '#btnExportAuditLog', '#btnClearAuditLog', '#auditFilters button[data-audit-filter="security"]']) {
    await page.locator(selector).focus();
    assert.notEqual(await page.locator(selector).evaluate(element => getComputedStyle(element).outlineStyle), 'none');
  }
  await page.locator('#auditFilters button[data-audit-filter="security"]').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#auditList tbody tr').length === 1);
  assert.equal(await page.locator('#auditFilters button[data-audit-filter="security"]').getAttribute('aria-pressed'), 'true');

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
  await prepareUiV2AuditFixture(mobilePage);
  const mobileLayout = await mobilePage.locator('#view-audit').evaluate(view => {
    const rows = [...view.querySelectorAll('.audit-ledger-table tbody tr')];
    const critical = [...view.querySelectorAll('#auditFilters button, #auditSearch, #btnExportAuditLog, #btnClearAuditLog')]
      .filter(element => element.getClientRects().length);
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      viewOverflow: view.scrollWidth - view.clientWidth,
      rowCount: rows.length,
      tableDisplay: getComputedStyle(view.querySelector('.audit-ledger-table')).display,
      rowDisplay: getComputedStyle(rows[0]).display,
      labels: [...rows[0].querySelectorAll('td')].map(cell => cell.dataset.label),
      undersized: critical.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(element => element.id || element.textContent.trim())
    };
  });
  assert.ok(mobileLayout.pageOverflow <= 2, `Overflow global mobile: ${mobileLayout.pageOverflow}px`);
  assert.ok(mobileLayout.viewOverflow <= 2, `Overflow da view mobile: ${mobileLayout.viewOverflow}px`);
  assert.equal(mobileLayout.rowCount, 6);
  assert.equal(mobileLayout.tableDisplay, 'block');
  assert.equal(mobileLayout.rowDisplay, 'flex');
  assert.deepEqual(mobileLayout.labels, ['Data e hora', 'Ator', 'Ação', 'Detalhes', 'Status']);
  assert.deepEqual(mobileLayout.undersized, []);

  await mobilePage.evaluate(() => {
    document.documentElement.dataset.ui = 'classic';
    window.Atrium.App.renderAudit('all', '');
  });
  assert.equal(await mobilePage.locator('#view-audit .v2-only').evaluateAll(elements => elements.filter(element => element.getClientRects().length).length), 0);
  assert.equal(await mobilePage.locator('#auditList .responsive-table').isVisible(), true);
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Auditoria: nomes acessíveis, teclado, semântica tabular, RecordList mobile e Classic isolado PASS.');
