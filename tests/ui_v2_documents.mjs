import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENT_CATALOG, DOCUMENT_TYPE_ALIASES, DOCUMENT_TYPES } from '../js/features/documents.js';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/documents.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/documents-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 DOCUMENT WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createDocumentsFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Documents Feature.');
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|DOCUMENT_GENERATORS|generateProcuracao|generateContrato|setInterval/);
assert.doesNotMatch(featureSource, /\bfetch\s*\(|store\.save|store\.flush|store\.audit|store\.upsert|setInterval/);
assert.equal(DOCUMENT_TYPES.length, 9);
assert.deepEqual(DOCUMENT_TYPES, [
  'procuracao', 'procuracao_prev', 'contrato_honorarios', 'declaracao_hipo', 'quesitos_prev',
  'prestacao_contas_rpv', 'requerimento_inss', 'termo_renuncia', 'substabelecimento'
]);
assert.deepEqual(DOCUMENT_TYPE_ALIASES, {
  contrato: 'contrato_honorarios',
  hipossuficiencia: 'declaracao_hipo',
  quesitos: 'quesitos_prev',
  prestacao_contas: 'prestacao_contas_rpv'
});
assert.equal(DOCUMENT_CATALOG.length, 5, 'O catálogo visual deve permanecer com cinco modelos principais.');

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  await context.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = NativeDate.parse('2026-08-29T12:00:00-03:00');
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    globalThis.Date = FixedDate;
  });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await prepareUiV2DocumentsFixture(page);

  const requests = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  const before = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const counts = { upsert: 0, audit: 0, save: 0, flush: 0 };
    for (const method of Object.keys(counts)) {
      const original = store[method];
      store[method] = (...args) => {
        counts[method]++;
        return original?.apply(store, args);
      };
    }
    window.__documentsV2Counts = counts;
    return {
      state: JSON.stringify(store.state),
      requests: window.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });

  const cards = page.locator('#documentsTemplateGrid .document-template-card');
  assert.equal(await cards.count(), 5);
  assert.deepEqual(
    await cards.locator('[data-generate-doc-type]').evaluateAll(buttons => buttons.map(button => button.dataset.generateDocType)),
    DOCUMENT_CATALOG.map(item => item.id)
  );
  assert.equal(await cards.locator('.document-template-origin').allTextContents().then(items => items.every(item => item === 'Modelo interno')), true);

  for (const type of DOCUMENT_CATALOG.map(item => item.id)) {
    await page.locator(`[data-generate-doc-type="${type}"]`).click();
    assert.equal(await page.locator('#docGenTypeSelect').inputValue(), type);
    await page.locator('#docGenClose').click();
  }

  const resolution = await page.evaluate(aliases => {
    const app = window.portalApp;
    const aliasResults = {};
    for (const alias of Object.keys(aliases)) {
      aliasResults[alias] = app.openDocumentGenerator({ type: alias }) && document.getElementById('docGenTypeSelect').value;
      app.closeDocumentGenerator();
    }
    app.openDocumentGenerator();
    const defaultType = document.getElementById('docGenTypeSelect').value;
    app.closeDocumentGenerator();
    const preview = document.getElementById('docGenPreviewText');
    preview.value = 'SENTINELA — NÃO ALTERAR';
    const unknownOpened = app.openDocumentGenerator({ type: 'tipo-inexistente' });
    return { aliasResults, defaultType, unknownOpened, preview: preview.value, hidden: document.getElementById('docGeneratorBackdrop').classList.contains('hidden') };
  }, DOCUMENT_TYPE_ALIASES);
  assert.deepEqual(resolution.aliasResults, DOCUMENT_TYPE_ALIASES);
  assert.equal(resolution.defaultType, 'procuracao');
  assert.deepEqual({ opened: resolution.unknownOpened, preview: resolution.preview, hidden: resolution.hidden }, { opened: false, preview: 'SENTINELA — NÃO ALTERAR', hidden: true });

  const selections = await page.evaluate(() => {
    const app = window.portalApp;
    const read = () => ({ contact: document.getElementById('docGenContactSelect').value, process: document.getElementById('docGenProcessSelect').value });
    app.openDocumentGenerator({ contactId: 'doc-contact', processId: 'doc-process' });
    const valid = read();
    app.closeDocumentGenerator();
    app.openDocumentGenerator({ contactId: 'missing', processId: 'missing' });
    const invalid = read();
    app.closeDocumentGenerator();
    return { valid, invalid };
  });
  assert.deepEqual(selections, { valid: { contact: 'doc-contact', process: 'doc-process' }, invalid: { contact: '', process: '' } });

  const financial = await page.evaluate(() => {
    const app = window.portalApp;
    const open = (type, processId) => {
      const opened = app.openDocumentGenerator({ type, contactId: 'doc-contact', processId });
      const preview = document.getElementById('docGenPreviewText').value;
      app.closeDocumentGenerator();
      return { opened, preview };
    };
    return {
      zeroPercent: open('contrato_honorarios', 'doc-zero-percent'),
      zeroAmount: open('contrato_honorarios', 'doc-zero-fixed'),
      invalid: open('contrato_honorarios', 'doc-invalid-fee'),
      rpv: open('prestacao_contas_rpv', 'doc-rpv')
    };
  });
  assert.match(financial.zeroPercent.preview, /Honorários contratuais de 0%/);
  assert.doesNotMatch(financial.zeroPercent.preview, /Honorários contratuais de 30%/);
  assert.match(financial.zeroAmount.preview, /Honorários fixos no valor de R\$ 0/);
  assert.deepEqual(financial.invalid, { opened: false, preview: '' });
  assert.match(financial.rpv.preview, /R\$ 10\.000,00/);
  assert.equal(financial.rpv.preview.includes('R$ 999'), false);

  await page.evaluate(() => window.portalApp.openDocumentGenerator({ type: 'procuracao', contactId: 'doc-contact' }));
  await page.locator('#docGenPreviewText').fill('EDIÇÃO TEMPORÁRIA SINTÉTICA');
  const preferredCopy = await page.evaluate(async () => {
    const calls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => calls.push(text) } });
    await window.portalApp.copyDocToClipboard();
    return calls;
  });
  assert.deepEqual(preferredCopy, ['EDIÇÃO TEMPORÁRIA SINTÉTICA']);

  const fallback = await page.evaluate(async () => {
    const textarea = document.getElementById('docGenPreviewText');
    textarea.value = 'EDIÇÃO TEMPORÁRIA FALLBACK';
    let selected = 0;
    let executed = 0;
    textarea.select = () => { selected++; };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('indisponível'); } } });
    const original = document.execCommand;
    document.execCommand = command => { if (command === 'copy') executed++; return true; };
    await window.portalApp.copyDocToClipboard();
    document.execCommand = original;
    return { selected, executed };
  });
  assert.deepEqual(fallback, { selected: 1, executed: 1 });

  await page.locator('#docGenPreviewText').fill('EDIÇÃO TEMPORÁRIA PARA DOWNLOAD');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#docGenDownloadButton').click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'procuracao-2026-08-29.md');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'EDIÇÃO TEMPORÁRIA PARA DOWNLOAD');
  await page.locator('#docGenClose').click();

  const shortcuts = await page.evaluate(() => {
    const app = window.portalApp;
    const original = app.openDocumentGenerator;
    const calls = [];
    app.openDocumentGenerator = options => { calls.push(options || {}); return true; };
    document.getElementById('btnGenDocProcess').click();
    document.getElementById('btnGenDocContact').click();
    document.getElementById('btnGenDocPrestacao').click();
    app.openDocumentGenerator = original;
    return calls;
  });
  assert.deepEqual(shortcuts, [{ type: 'contrato_honorarios' }, { type: 'procuracao' }, { type: 'prestacao_contas_rpv' }]);

  const after = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    counts: window.__documentsV2Counts,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.equal(after.state, before.state, 'Catálogo e gerador V2 devem permanecer read-only.');
  assert.deepEqual(after.counts, { upsert: 0, audit: 0, save: 0, flush: 0 });
  assert.equal(after.requests, before.requests);
  assert.equal(after.intervals, before.intervals);
  assert.deepEqual(requests, []);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Documentos V2: catálogo, registry, gerador, semântica financeira e preview read-only aprovados.');
