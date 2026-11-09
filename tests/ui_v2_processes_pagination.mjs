import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/processes.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/processes-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 PROCESSES PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação é apresentação local, sem Store paralelo,
// request, auditoria ou timer; presenter sem acesso a dados ou rede.
assert.match(featureSource, /export const PROCESS_PAGE_SIZES/);
assert.match(featureSource, /export const PROCESS_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /PROCESS_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setPageSize\(value\)/);
assert.match(featureSource, /setPage\(value\)/);
assert.match(featureSource, /handlePaginationClick\(event\)/);
assert.match(featureSource, /get pagination\(\)/);
assert.match(featureSource, /resetPage/);
assert.match(presenterSource, /renderPagination\(\{ pagination/);
assert.match(presenterSource, /data-process-page/);
assert.match(presenterSource, /data-process-page-size/);
assert.match(presenterSource, /aria-label="Paginação de processos"/);
assert.doesNotMatch(presenterSource, /\bStore\b|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\/api\//);
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(featureSource.includes(forbiddenSideEffect), false, `Processes não pode introduzir ${forbiddenSideEffect}.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await page.evaluate(() => {
    const processes = [];
    for (let i = 0; i < 250; i++) {
      processes.push({
        id: `vproc-${i}`,
        number: `5000${String(i).padStart(3, '0')}-11.2026.8.21.0001`,
        client: `Cliente Volume ${String(i).padStart(3, '0')}`,
        court: 'TJRS',
        registeredAt: '2026-08-10',
        monitoring: 'active'
      });
    }
    window.Atrium.Store.state.processes = processes;
    window.Atrium.Store.state.audit = [];
  });
  await switchUiV2View(page, 'processes');

  const initial = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-process-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-process-page-size="100"]').click();
  // Com 100 por página, primeira de três, contador do recorte preservado.
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 100);
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.equal(await page.locator('#processResultCount').textContent(), '250 processos');
  assert.equal(await page.locator('[data-process-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-process-page="first"]').isDisabled(), true);
  assert.equal(await page.locator('[data-process-page="prev"]').isDisabled(), true);

  // Navegação: 2, 3 e volta.
  await page.locator('[data-process-page="next"]').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 100);
  await page.locator('[data-process-page="next"]').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 50);
  assert.equal(await page.locator('#processTableBody [data-process-id="vproc-249"]').count(), 1);
  assert.equal(await page.locator('[data-process-page="next"]').isDisabled(), true);
  await page.locator('[data-process-page="prev"]').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-process-page-size="500"]').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 250);

  // Busca reseta para a primeira página e preserva o contador do recorte.
  await page.locator('[data-process-page-size="100"]').click();
  await page.locator('[data-process-page="next"]').click();
  await page.locator('#processSearch').fill('Volume 001');
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 1 de 1 · 1 no filtro/);
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 1);
  assert.equal(await page.locator('#processResultCount').textContent(), '1 de 250 processos');
  await page.locator('#processSearch').fill('');
  assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 100);

  // Ordenação reseta para a primeira página.
  await page.locator('[data-process-page="next"]').click();
  await page.locator('#processTable th[data-sort-field="number"] button').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 1 de 3/);

  // Inspector aberto bloqueia o fundo (backdrop); fechar e navegar preserva a página.
  await page.locator('#processTableBody [data-process-id] [data-process-details]').first().click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#processInspector').getAttribute('role'), 'dialog');
  await page.keyboard.press('Escape');
  await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
  await page.locator('[data-process-page="next"]').click();
  assert.match(await page.locator('.process-pagination-status').textContent(), /Página 2 de 3/);
  await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });

  // Segurança de apresentação: sem auditoria, request ou timer da paginação.
  const safety = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(safety, initial, 'Paginação não pode auditar, requisitar ou criar timer.');

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.process-pagination button:visible').evaluateAll(elements => elements.map(element => {
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

console.log('✓ Processos V2 pagina 100/500/1000 sem travar, com reset, recorte e segurança de apresentação.');
