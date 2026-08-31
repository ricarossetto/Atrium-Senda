import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ImporterFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_IMPORTER_FIXTURE
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource, indexSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/importer.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/importer-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 SPREADSHEET IMPORTER');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createImporterFeature\s*\(/g) || []).length, 1);
assert.equal((portalSource.match(/createImporterPresenter\s*\(/g) || []).length, 1);
assert.equal((featureSource.match(/let importedSpreadsheetData\s*=\s*null/g) || []).length, 1);
assert.doesNotMatch(featureSource, /^\s*import\s/m);
assert.doesNotMatch(featureSource, /\bfetch\s*\(|Gemini|telemetry|localStorage|sessionStorage|setInterval|setTimeout/);
assert.doesNotMatch(featureSource, /fatalDeadline\s*=|deadline\s*=/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\baudit\s*\(|localStorage|sessionStorage/);
assert.doesNotMatch(presenterSource, /importedSpreadsheetData|handleUpload|arrayBuffer|base64|btoa|upsert|commit\s*\(/);

for (const id of ['view-importer', 'importerDropzone', 'importerFileInput', 'btnSelectSpreadsheet', 'importerPreviewCard', 'importerFileLabel', 'importerSummaryTitle', 'importerBadges', 'importerPreviewHead', 'importerPreviewBody', 'importerCancelButton', 'importerCommitButton', 'importerPreviewTable']) {
  assert.equal((indexSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} deve permanecer único.`);
}

for (const [type, label] of [['processes', 'Modelo de processos'], ['contacts', 'Modelo de contatos'], ['tasks', 'Modelo de tarefas']]) {
  assert.match(indexSource, new RegExp(`href="/api/import/template\\?type=${type}"[\\s\\S]{0,500}${label}`));
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  await prepareUiV2ImporterFixture(page);

  assert.equal(await page.locator('.importer-v2-header h2').textContent(), 'Importar dados para o ATRIUM');
  assert.equal(await page.locator('.importer-template-card').count(), 3);
  assert.equal(await page.locator('.importer-steps [data-importer-step]').count(), 4);
  assert.equal(await page.locator('[data-importer-step="select"]').getAttribute('aria-current'), 'step');
  assert.equal(await page.locator('#importerFileInput').getAttribute('accept'), '.xlsx,.xls,.csv');
  assert.equal(await page.locator('#importerPreviewCard').getAttribute('class').then(value => value.includes('hidden')), true);
  assert.equal(await page.evaluate(() => window.__uiV2ImporterRequests.length), 0);
  const initialIntervals = await page.evaluate(() => window.__uiV2RuntimeProbe.intervals);

  const stateBeforePreview = await page.evaluate(() => JSON.stringify(window.Atrium.Store.state));
  await page.locator('#importerFileInput').setInputFiles({
    name: 'lote-supervisionado-sintetico.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Nome,Tipo\nPessoa Sintética,Contato')
  });
  await page.locator('#importerPreviewCard:not(.hidden)').waitFor();
  await page.waitForFunction(() => window.__uiV2ImporterRequests.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__uiV2ImporterRequests[0]), {
    url: '/api/import/spreadsheet',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { filename: 'lote-supervisionado-sintetico.csv', content: 'Nome,Tipo\nPessoa Sintética,Contato' }
  });
  assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state)), stateBeforePreview, 'Preview V2 não pode mutar o Store.');
  assert.equal(await page.locator('#importerSummaryTitle').textContent(), '4 linha(s) identificada(s)');
  assert.deepEqual(await page.locator('.importer-count strong').allTextContents(), ['1', '1', '1']);
  assert.equal(await page.locator('#importerPreviewHead th').count(), 4);
  assert.equal(await page.locator('#importerPreviewBody tr').count(), 4);
  assert.equal(await page.locator('#importerPreviewCard script').count(), 0);
  assert.equal(await page.locator('#importerPreviewCard img').count(), 0);
  assert.equal(await page.locator('[data-importer-step="review"]').getAttribute('aria-current'), 'step');

  await page.locator('#importerCancelButton').click();
  assert.equal(await page.locator('#importerPreviewCard').getAttribute('class').then(value => value.includes('hidden')), true);
  assert.equal(await page.locator('#importerFileInput').inputValue(), '');
  assert.equal(await page.evaluate(() => window.Atrium.App.importedSpreadsheetData), null);
  assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state)), stateBeforePreview);

  await page.evaluate(fixture => {
    window.__uiV2ImporterOps.length = 0;
    window.__uiV2ImporterToasts.length = 0;
    window.Atrium.App.importedSpreadsheetData = structuredClone(fixture);
    window.Atrium.App.renderSpreadsheetPreview(structuredClone(fixture));
  }, UI_V2_IMPORTER_FIXTURE);
  await page.locator('#importerCommitButton').click();
  await page.waitForFunction(() => window.__uiV2ImporterOps.some(operation => operation.type === 'flush'));
  const commitEvidence = await page.evaluate(() => ({
    ops: window.__uiV2ImporterOps,
    toasts: window.__uiV2ImporterToasts,
    state: {
      processes: window.Atrium.Store.state.processes.length,
      contacts: window.Atrium.Store.state.contacts.length,
      tasks: window.Atrium.Store.state.tasks.length
    }
  }));
  assert.deepEqual(commitEvidence.state, { processes: 1, contacts: 1, tasks: 1 });
  assert.deepEqual(commitEvidence.ops.find(operation => operation.type === 'audit'), {
    type: 'audit', action: 'Importação de planilha concluída', detail: '1 processos, 1 contatos e 1 tarefas consolidados.'
  });
  const flushIndex = commitEvidence.ops.findIndex(operation => operation.type === 'flush');
  const renderIndex = commitEvidence.ops.findIndex(operation => operation.type === 'render');
  const successIndex = commitEvidence.ops.findIndex(operation => operation.type === 'toast' && operation.toastType === 'success' && operation.message.startsWith('Importação concluída:'));
  const navigationIndex = commitEvidence.ops.findIndex(operation => operation.type === 'switch' && operation.view === 'processes');
  assert.ok(flushIndex >= 0 && renderIndex > flushIndex && successIndex > flushIndex && navigationIndex > flushIndex);

  await page.evaluate(fixture => {
    const taskOnly = { ...structuredClone(fixture), filename: 'tarefas-sinteticas.csv', totalRows: 1, preview: [], processes: [], contacts: [], tasks: [fixture.tasks[0]] };
    window.Atrium.App.switchView('importer');
    window.__uiV2ImporterOps.length = 0;
    window.Atrium.App.importedSpreadsheetData = taskOnly;
    window.Atrium.App.renderSpreadsheetPreview(taskOnly);
  }, UI_V2_IMPORTER_FIXTURE);
  assert.equal(await page.locator('#importerPreviewEmpty').getAttribute('class').then(value => value.includes('hidden')), false);
  await page.locator('#importerCommitButton').click();
  await page.waitForFunction(() => window.__uiV2ImporterOps.some(operation => operation.type === 'flush'));
  assert.equal(await page.evaluate(() => window.__uiV2ImporterOps.some(operation => operation.type === 'switch')), false, 'Lote somente de tarefas não deve navegar automaticamente.');

  await page.evaluate(fixture => {
    window.__uiV2ImporterOps.length = 0;
    window.__uiV2ImporterToasts.length = 0;
    window.__uiV2ImporterFlushResult = false;
    window.Atrium.App.importedSpreadsheetData = structuredClone(fixture);
    window.Atrium.App.renderSpreadsheetPreview(structuredClone(fixture));
  }, UI_V2_IMPORTER_FIXTURE);
  assert.equal(await page.evaluate(() => window.Atrium.App.commitSpreadsheetImport()), false);
  const failureEvidence = await page.evaluate(() => ({
    render: window.__uiV2ImporterOps.some(operation => operation.type === 'render'),
    navigation: window.__uiV2ImporterOps.some(operation => operation.type === 'switch'),
    success: window.__uiV2ImporterToasts.some(toast => toast.type === 'success' && toast.message.startsWith('Importação concluída:')),
    recoverable: window.Atrium.App.importedSpreadsheetData?.filename
  }));
  assert.deepEqual(failureEvidence, { render: false, navigation: false, success: false, recoverable: 'lote-supervisionado-sintetico.csv' });

  const runtimeEvidence = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return {
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });
  assert.deepEqual(runtimeEvidence.duplicateIds, []);
  assert.equal(runtimeEvidence.intervals, initialIntervals, 'Importer V2 não pode adicionar timers.');
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Importador: arquitetura única, preview transitório, commit canônico e flush-before-success PASS.');
