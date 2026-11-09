import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/financial.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/financial-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINANCIAL PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação da carteira é apresentação local; métricas,
// edição por índice global, CRUD e auditoria seguem intactos.
assert.match(featureSource, /export const FINANCIAL_PAGE_SIZES/);
assert.match(featureSource, /export const FINANCIAL_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /FINANCIAL_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setPageSize\(value\)/);
assert.match(featureSource, /setPage\(value\)/);
assert.match(featureSource, /handlePaginationClick\(event\)/);
assert.match(featureSource, /get pagination\(\)/);
assert.match(presenterSource, /renderFinancialPagination\(\{ pagination/);
assert.match(presenterSource, /data-fin-page/);
assert.match(presenterSource, /data-fin-page-size/);
assert.match(presenterSource, /aria-label="Paginação financeira"/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval|state\./);
assert.doesNotMatch(`${featureSource}`, /state\.(?:financial|financialEntries|payments|ledger)|financialStore/);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await page.evaluate(() => {
    const processes = [];
    for (let i = 0; i < 120; i++) {
      processes.push({ id: `vf-${i}`, number: `5000${String(i).padStart(3, '0')}-11.2026.8.21.0001`, client: `Cliente Fin ${String(i).padStart(3, '0')}`, court: 'TJRS', feeType: 'fixo', feeAmount: 1000 });
    }
    for (let i = 120; i < 250; i++) {
      processes.push({ id: `vf-${i}`, number: `5000${String(i).padStart(3, '0')}-11.2026.8.21.0001`, client: `Cliente Fin ${String(i).padStart(3, '0')}`, court: 'TJRS', feePercentage: 30, requisitionAmount: 2000, requisitionStatus: 'requisitado' });
    }
    window.Atrium.Store.state.processes = processes;
    window.Atrium.Store.state.audit = [];
  });
  await switchUiV2View(page, 'financial');
  await page.locator('.financial-v2-table [data-financial-record]').first().waitFor();

  const initial = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-fin-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-fin-page-size="100"]').click();
  // Com 100 por página, primeira de três; métricas usam a coleção integral.
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 100);
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.equal(await page.locator('#finMetricRpvCount').textContent(), '130 requisições');
  assert.equal(await page.locator('[data-fin-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-fin-page="first"]').isDisabled(), true);

  // Navegação: 2, 3 e volta; índice de edição segue global.
  await page.locator('[data-fin-page="next"]').click();
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').first().getAttribute('data-financial-edit'), '100');
  await page.locator('[data-fin-page="next"]').click();
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 50);
  await page.locator('[data-fin-page="prev"]').click();
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-fin-page-size="500"]').click();
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 250);

  // Filtro reseta para a primeira página.
  await page.locator('[data-fin-page-size="100"]').click();
  await page.locator('[data-fin-page="next"]').click();
  await page.locator('[data-fin-filter="honorarios"]').click();
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 1 de 2 · 120 no filtro/);
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 100);
  await page.locator('[data-fin-filter="all"]').click();

  // Busca reseta para a primeira página.
  await page.locator('[data-fin-page="next"]').click();
  await page.locator('#financialSearch').fill('Fin 001');
  assert.match(await page.locator('.financial-pagination-status').textContent(), /Página 1 de 1 · 1 no filtro/);
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 1);
  await page.locator('#financialSearch').fill('');
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 100);

  // Segurança de apresentação: sem auditoria, request ou timer da paginação.
  const safety = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(safety, initial, 'Paginação não pode auditar, requisitar ou criar timer.');

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.financial-pagination button:visible').evaluateAll(elements => elements.map(element => {
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

console.log('✓ Financeiro V2 pagina a carteira em 100/500/1000 sem travar, com métricas e edição preservadas.');
