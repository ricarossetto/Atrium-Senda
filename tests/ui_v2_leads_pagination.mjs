import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/leads.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/leads-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LEADS PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação do funil é apresentação local, sem Store
// paralelo, sem mutar Contatos/Processos e sem side effects novos.
assert.match(featureSource, /export const LEAD_PAGE_SIZES/);
assert.match(featureSource, /export const LEAD_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /LEAD_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setPageSize\(value\)/);
assert.match(featureSource, /setPage\(value\)/);
assert.match(featureSource, /handlePaginationClick\(event\)/);
assert.match(featureSource, /get pagination\(\)/);
assert.match(featureSource, /renderClassicPagination/);
assert.match(presenterSource, /export function renderLeadPagination/);
assert.match(presenterSource, /export function renderLeadPagination/);
assert.match(presenterSource, /data-lead-page/);
assert.match(presenterSource, /data-lead-page-size/);
assert.match(presenterSource, /aria-label="Paginação de atendimentos"/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval|state\.leads/);
assert.doesNotMatch(featureSource, /state\.contacts|state\.processes|upsert\(['"]contacts|upsert\(['"]processes|\bfetch\s*\(|setInterval/);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await page.evaluate(() => {
    const leads = [];
    for (let i = 0; i < 250; i++) {
      leads.push({
        id: `vlead-${i}`,
        client: `Interessado Volume ${String(i).padStart(3, '0')}`,
        serviceType: 'Consulta Inicial',
        origin: 'Indicação de Cliente',
        responsible: 'Advogada Teste',
        status: i % 5 === 0 ? 'proposta' : 'novo'
      });
    }
    window.Atrium.Store.state.leads = leads;
    window.Atrium.Store.state.audit = [];
  });
  await switchUiV2View(page, 'leads');
  await page.locator('#leadsV2Workspace [data-lead-id]').first().waitFor();

  const initial = await page.evaluate(() => ({
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    processes: JSON.stringify(window.Atrium.Store.state.processes),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-lead-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-lead-page-size="100"]').click();
  // Com 100 por página, primeira de três, total do recorte preservado.
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 100);
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.equal(await page.locator('#leadCount').textContent(), '250 atendimentos');
  assert.equal(await page.locator('[data-lead-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-lead-page="first"]').isDisabled(), true);

  // Navegação: 2, 3 e volta.
  await page.locator('[data-lead-page="next"]').click();
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 100);
  await page.locator('[data-lead-page="next"]').click();
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 50);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id="vlead-249"]').count(), 1);
  await page.locator('[data-lead-page="prev"]').click();
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-lead-page-size="500"]').click();
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 250);

  // Busca reseta para a primeira página e preserva o total do recorte.
  await page.locator('[data-lead-page-size="100"]').click();
  await page.locator('[data-lead-page="next"]').click();
  await page.locator('#leadSearch').fill('Volume 001');
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 1 de 1 · 1 no filtro/);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 1);
  assert.equal(await page.locator('#leadCount').textContent(), '1 atendimentos');
  await page.locator('#leadSearch').fill('');
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 100);

  // Estágio reseta para a primeira página.
  await page.locator('[data-lead-page="next"]').click();
  await page.locator('[data-lead-filter="proposta"]').click();
  assert.match(await page.locator('.lead-pagination-status').textContent(), /Página 1 de 1 · 50 no filtro/);
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 50);
  await page.locator('[data-lead-filter="all"]').click();

  // Segurança de apresentação: Leads não muta Contatos/Processos, sem request/timer.
  const safety = await page.evaluate(() => ({
    leads: JSON.stringify(window.Atrium.Store.state.leads),
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    processes: JSON.stringify(window.Atrium.Store.state.processes),
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(safety, initial, 'Paginação não pode mutar Stores, auditar, requisitar ou criar timer.');

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.lead-pagination button:visible').evaluateAll(elements => elements.map(element => {
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

console.log('✓ Leads V2 pagina o funil em 100/500/1000 sem travar, com CRUD isolado e segurança de apresentação.');
