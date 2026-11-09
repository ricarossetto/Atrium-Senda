import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureSource = await readFile(path.join(ROOT, 'js/features/documents.js'), 'utf8');

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 DOCUMENTS PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação do acervo é apresentação local, sem bytes
// no estado, sem OCR/preview automático e sem side effects novos.
assert.match(featureSource, /export const DOCUMENT_PAGE_SIZES/);
assert.match(featureSource, /export const DOCUMENT_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /DOCUMENT_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setArchivePageSize\(value\)/);
assert.match(featureSource, /setArchivePage\(value\)/);
assert.match(featureSource, /handleArchivePaginationClick\(event\)/);
assert.match(featureSource, /get archivePagination\(\)/);
assert.match(featureSource, /renderArchive\(\{ resetPage/);
assert.match(featureSource, /data-document-page/);
assert.match(featureSource, /data-document-page-size/);
assert.match(featureSource, /aria-label="Paginação de documentos"/);
for (const forbiddenSideEffect of [
  'fetch(', 'XMLHttpRequest', 'WebSocket', 'Store.save', 'Store.flush',
  'store.save', 'store.flush', 'window.Atrium', 'window.portalApp'
]) {
  assert.equal(featureSource.includes(forbiddenSideEffect), false, `Documents não pode conter ${forbiddenSideEffect}.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(() => {
    const documents = [];
    for (let i = 0; i < 250; i++) {
      documents.push({
        id: `vdoc-${i}`,
        name: `Peca volumetrica ${String(i).padStart(3, '0')}.pdf`,
        ownerType: 'process',
        ownerId: `vp-${i % 10}`,
        documentType: 'Petição',
        documentDate: '2026-08-10',
        size: 1024,
        createdAt: '2026-08-10T10:00:00.000Z'
      });
    }
    window.Atrium.Store.state.documents = documents;
  });
  await switchUiV2View(page, 'documents');
  await page.locator('#documentArchiveList .document-record').first().waitFor();

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-document-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-document-page-size="100"]').click();
  // Com 100 por página, primeira de três, total do recorte preservado.
  assert.equal(await page.locator('#documentArchiveList .document-record').count(), 100);
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.match(await page.locator('#documentArchiveStatus').textContent(), /250 documentos ativos/);
  assert.equal(await page.locator('[data-document-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-document-page="first"]').isDisabled(), true);

  // Navegação: 2, 3 e volta.
  await page.locator('[data-document-page="next"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#documentArchiveList .document-record').count(), 100);
  await page.locator('[data-document-page="next"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#documentArchiveList .document-record').count(), 50);
  assert.equal(await page.locator('#documentArchiveList [data-document-id="vdoc-249"]').count(), 1);
  await page.locator('[data-document-page="prev"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-document-page-size="500"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#documentArchiveList .document-record').count(), 250);

  // Filtro Lixeira reseta para a primeira página; voltar restaura.
  await page.locator('[data-document-page-size="100"]').click();
  await page.locator('[data-document-page="next"]').click();
  await page.locator('[data-document-filter="deleted"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 1 de 1 · 0 no filtro/);
  assert.match(await page.locator('#documentArchiveStatus').textContent(), /0 documentos na lixeira/);
  await page.locator('[data-document-filter="active"]').click();
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 1 de 3/);

  // Foco profundo ajusta a página do documento.
  await page.evaluate(() => window.Atrium.App.switchView('documents'));
  await page.evaluate(() => window.portalApp.handleGlobalSearchSelection({ target: 'document', id: 'vdoc-249' }));
  assert.match(await page.locator('.document-pagination-status').textContent(), /Página 3 de 3/);
  assert.ok(await page.locator('#documentArchiveList [data-document-id="vdoc-249"].is-search-match').count(), 1);

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.document-pagination button:visible').evaluateAll(elements => elements.map(element => {
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

console.log('✓ Documentos V2 pagina o acervo em 100/500/1000 sem travar, com filtros e foco preservados.');
