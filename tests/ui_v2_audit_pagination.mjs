import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureSource = await readFile(path.join(ROOT, 'js/features/audit.js'), 'utf8');

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 AUDIT PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação do ledger é apresentação local, sem reordenar,
// sem apagar, sem mutar e sem side effects novos. Export segue integral.
assert.match(featureSource, /export const AUDIT_PAGE_SIZES/);
assert.match(featureSource, /export const AUDIT_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /AUDIT_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setPageSize\(value\)/);
assert.match(featureSource, /setPage\(value\)/);
assert.match(featureSource, /handlePaginationClick\(event\)/);
assert.match(featureSource, /get pagination\(\)/);
assert.match(featureSource, /renderAuditPagination/);
assert.match(featureSource, /data-audit-page/);
assert.match(featureSource, /data-audit-page-size/);
assert.match(featureSource, /aria-label="Paginação de auditoria"/);
assert.doesNotMatch(featureSource, /store\.audit\s*\(|\.splice\s*\(|\b(?:fetch|secureFetch)\s*\(/);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(() => {
    const audit = [];
    for (let i = 0; i < 250; i++) {
      audit.push({ id: `vaudit-${i}`, at: '2026-08-29T10:00:00.000Z', actor: 'Sistema', action: `Evento volumetrico ${String(i).padStart(3, '0')}`, detail: 'Detalhe sintetico' });
    }
    window.Atrium.Store.state.audit = audit;
  });
  await switchUiV2View(page, 'audit');
  await page.locator('#auditList tbody tr').first().waitFor();

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-audit-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-audit-page-size="100"]').click();
  // Com 100 por página, primeira de três, total e ordem preservados.
  assert.equal(await page.locator('#auditList tbody tr').count(), 100);
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.equal(await page.locator('#auditCountBadge').textContent(), '250 eventos');
  assert.match(await page.locator('#auditList tbody tr').first().textContent(), /Evento volumetrico 000/);
  assert.equal(await page.locator('[data-audit-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-audit-page="first"]').isDisabled(), true);

  // Navegação: 2, 3 e volta, sem reordenar.
  await page.locator('[data-audit-page="next"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 2 de 3/);
  assert.match(await page.locator('#auditList tbody tr').first().textContent(), /Evento volumetrico 100/);
  await page.locator('[data-audit-page="next"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#auditList tbody tr').count(), 50);
  await page.locator('[data-audit-page="prev"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-audit-page-size="500"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#auditList tbody tr').count(), 250);

  // Busca reseta para a primeira página.
  await page.locator('[data-audit-page-size="100"]').click();
  await page.locator('[data-audit-page="next"]').click();
  await page.locator('#auditSearch').fill('volumetrico 001');
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 1 de 1 · 1 no filtro/);
  assert.equal(await page.locator('#auditList tbody tr').count(), 1);
  await page.locator('#auditSearch').fill('');
  assert.equal(await page.locator('#auditList tbody tr').count(), 100);

  // Filtro reseta para a primeira página (sem resultados neste recorte).
  await page.locator('[data-audit-page="next"]').click();
  await page.locator('[data-audit-filter="security"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 1 de 1 · 0 no filtro/);
  await page.locator('[data-audit-filter="all"]').click();
  assert.match(await page.locator('.audit-pagination-status').textContent(), /Página 1 de 3/);

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.audit-pagination button:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent.trim(), height: rect.height };
  }));
  const undersized = targets.filter(item => item.height < 43.5);
  assert.deepEqual(undersized, [], `Paginação mobile abaixo de 44px: ${JSON.stringify(undersized)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 2, `Paginação mobile não pode gerar overflow global: ${overflow}px.`);

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Auditoria V2 pagina o ledger em 100/500/1000 sem travar, sem reordenar e sem mutar.');
