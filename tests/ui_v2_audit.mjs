import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2AuditFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_AUDIT_FIXTURE
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource, storeSource, indexSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/audit.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/audit-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/core/store.js'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 AUDIT ACCOUNTABILITY LEDGER');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createAuditFeature\s*\(/g) || []).length, 1, 'A feature de Auditoria deve ter uma única instância.');
assert.equal((portalSource.match(/createAuditPresenter\s*\(/g) || []).length, 1, 'O presenter de Auditoria deve ter uma única instância.');
assert.match(featureSource, /^import \{ Store, isoDate \} from '\.\.\/core\/store\.js';/);
assert.match(portalSource, /renderAudit\(filter = 'all', query = ''\) \{ return getAuditFeature\(\)\.render\(filter, query\); \}/);
assert.doesNotMatch(featureSource, /\b(?:fetch|secureFetch)\s*\(|localStorage|sessionStorage|setInterval|setTimeout/);
assert.doesNotMatch(featureSource, /store\.audit\s*\(|\.splice\s*\(|\.sort\s*\(|\.reverse\s*\(/);
assert.doesNotMatch(presenterSource, /^\s*import\s/m);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\baudit\s*\(|localStorage|sessionStorage|setInterval|setTimeout/);
assert.doesNotMatch(presenterSource, /\.sort\s*\(|\.reverse\s*\(|innerHTML|insertAdjacentHTML/);
assert.match(storeSource, /audit\(action, detail, actor = 'Advogado'\)[\s\S]{0,1000}\.unshift\(entry\)[\s\S]{0,400}\.slice\(0,\s*250\)[\s\S]{0,400}this\.save\(\)/);

for (const id of ['view-audit', 'auditFilters', 'auditSearch', 'btnExportAuditLog', 'btnClearAuditLog', 'auditCountBadge', 'auditList']) {
  assert.equal((indexSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} deve permanecer único.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const fixture = await prepareUiV2AuditFixture(page);
  const initialIntervals = await page.evaluate(() => window.__uiV2RuntimeProbe.intervals);
  const initialMutationRequests = await page.evaluate(() => structuredClone(window.__uiV2RuntimeProbe.mutationRequests));
  const initialState = await page.evaluate(() => JSON.stringify(window.Atrium.Store.state));

  assert.equal(await page.locator('.audit-v2-header h2').textContent(), 'Auditoria');
  assert.equal(await page.locator('#auditList tbody tr').count(), fixture.length);
  assert.equal(await page.locator('#auditCountBadge').textContent(), `${fixture.length} eventos`);
  assert.deepEqual(await page.locator('#auditList tbody tr .audit-action-label').allTextContents(), fixture.map(item => item.action), 'A ordem do Store deve ser preservada.');
  assert.equal(await page.locator('#auditList script').count(), 0);
  assert.equal(await page.locator('#auditList img').count(), 0);
  assert.match(await page.locator('#auditList').textContent(), /<script>não executar<\/script>/);

  const expectedFilters = [
    ['all', fixture.length],
    ['security', 1],
    ['sync', 2],
    ['task', 1],
    ['process', 1]
  ];
  for (const [filter, count] of expectedFilters) {
    await page.locator(`#auditFilters button[data-audit-filter="${filter}"]`).click();
    await page.waitForFunction(expected => document.querySelectorAll('#auditList tbody tr').length === expected, count);
    assert.equal(await page.locator('#auditCountBadge').textContent(), `${count} evento${count === 1 ? '' : 's'}`);
    assert.equal(await page.locator(`#auditFilters button[data-audit-filter="${filter}"]`).getAttribute('aria-pressed'), 'true');
  }

  await page.locator('#auditFilters button[data-audit-filter="all"]').click();
  await page.locator('#auditSearch').fill('  ADVOGADA TESTE  ');
  await page.waitForFunction(() => document.querySelectorAll('#auditList tbody tr').length === 1);
  assert.deepEqual(await page.locator('.audit-action-label').allTextContents(), ['Tarefa criada']);

  await page.locator('#auditSearch').fill('consulta oficial sob demanda');
  await page.waitForFunction(() => document.querySelectorAll('#auditList tbody tr').length === 1);
  assert.deepEqual(await page.locator('.audit-action-label').allTextContents(), ['Sincronização DJEN concluída']);

  await page.locator('#auditSearch').fill('conteúdo inexistente');
  await page.locator('.audit-empty-state').waitFor();
  assert.equal(await page.locator('#auditCountBadge').textContent(), '0 eventos');
  assert.match(await page.locator('.audit-empty-state').textContent(), /Nenhum evento encontrado/);

  await page.locator('#btnClearAuditLog').click();
  await page.waitForFunction(expected => document.querySelectorAll('#auditList tbody tr').length === expected, fixture.length);
  assert.equal(await page.locator('#auditSearch').inputValue(), '');
  assert.equal(await page.locator('#auditFilters button[data-audit-filter="all"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => window.__uiV2AuditToasts.at(-1)), { message: 'Filtros de auditoria redefinidos.', type: 'info' });

  await page.locator('#auditFilters button[data-audit-filter="security"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#auditList tbody tr').length === 1);
  await page.locator('#btnExportAuditLog').click();
  const exported = await page.evaluate(() => window.__uiV2AuditExports.at(-1));
  assert.deepEqual(exported.data, UI_V2_AUDIT_FIXTURE, 'Exportação deve usar o registro completo, não o filtro visual.');
  assert.match(exported.filename, /^atrium-auditoria-\d{4}-\d{2}-\d{2}\.json$/);

  await page.evaluate(() => {
    document.documentElement.dataset.ui = 'classic';
    window.Atrium.App.renderAudit('all', '');
  });
  assert.equal(await page.locator('#auditList .responsive-table tbody tr').count(), fixture.length);
  await page.evaluate(() => {
    document.documentElement.dataset.ui = 'v2';
    window.Atrium.App.renderAudit('all', '');
  });
  await page.waitForFunction(expected => document.querySelectorAll('#auditList .audit-ledger-table tbody tr').length === expected, fixture.length);

  const evidence = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return {
      state: JSON.stringify(window.Atrium.Store.state),
      audit: structuredClone(window.Atrium.Store.state.audit),
      ops: structuredClone(window.__uiV2AuditOps),
      mutationRequests: structuredClone(window.__uiV2RuntimeProbe.mutationRequests),
      intervals: window.__uiV2RuntimeProbe.intervals,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
    };
  });
  assert.equal(evidence.state, initialState, 'Render, busca, filtros, reset, export e troca de modo não podem mutar o Store.');
  assert.deepEqual(evidence.audit, UI_V2_AUDIT_FIXTURE);
  assert.deepEqual(evidence.ops, [], 'Audit V2 não pode chamar save, flush ou Store.audit.');
  assert.deepEqual(evidence.mutationRequests, initialMutationRequests, 'Audit V2 não pode adicionar requests de mutação aos requests canônicos de boot.');
  assert.equal(evidence.intervals, initialIntervals, 'Audit V2 não pode criar timers.');
  assert.deepEqual(evidence.duplicateIds, []);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Auditoria: fonte única, ordem canônica, filtros, busca, export completo e imutabilidade PASS.');
