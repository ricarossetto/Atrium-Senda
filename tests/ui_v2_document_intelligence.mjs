import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, serverSource, intelligenceSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/documents.js'), 'utf8'),
  readFile(path.join(ROOT, 'server.mjs'), 'utf8'),
  readFile(path.join(ROOT, 'lib/documents/document-intelligence.mjs'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 DOCUMENT INTELLIGENCE');
console.log('===============================================================\n');

assert.match(featureSource, /data-document-action="preview"/);
assert.match(featureSource, /text\.textContent = await response\.text\(\)/, 'Preview textual deve usar textContent, nunca HTML ativo.');
assert.doesNotMatch(featureSource, /innerHTML\s*=\s*await response\.text/);
assert.match(serverSource, /documentIdFromPath\(url\.pathname, 'preview'\)/);
assert.match(serverSource, /Content-Security-Policy/);
assert.match(intelligenceSource, /shell:\s*false/);
assert.doesNotMatch(intelligenceSource, /https?:\/\//, 'Pipeline não pode conter endpoint cloud.');

const session = await startUiV2Session();
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await session.createContext({ viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
      await prepareUiV2DocumentsFixture(page);
      await page.evaluate(() => {
        const { App, Store } = window.Atrium;
        window.__intelligenceRequests = [];
        window.__scriptExecuted = 0;
        Store.revision = 'rev-intelligence-0';
        Store.state.documents = [{
          id: 'doc-intelligence-ui',
          name: 'relatorio-sintetico.md',
          originalName: 'relatorio-sintetico.md',
          mime: 'text/markdown',
          size: 48,
          createdAt: '2026-09-01T12:00:00.000Z',
          updatedAt: '2026-09-01T12:00:00.000Z',
          documentDate: '2026-09-01',
          ownerType: 'contact',
          ownerId: 'doc-contact',
          documentType: 'Relatório',
          deletedAt: null,
          deletedBy: null,
          checksum: 'c'.repeat(64)
        }];
        const makeResponse = ({ status = 200, contentType = 'application/json', payload = {}, text = '', blob = null } = {}) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? contentType : null; } },
          async json() { return structuredClone(payload); },
          async text() { return text; },
          async blob() { return blob || new Blob([text], { type: contentType }); }
        });
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => {
          if (!String(url).startsWith('/api/documents/')) return original(url, options);
          const method = options.method || 'GET';
          const body = options.body ? JSON.parse(options.body) : undefined;
          window.__intelligenceRequests.push({ url: String(url), method, body });
          const source = Store.state.documents.find(item => item.id === 'doc-intelligence-ui');
          if (String(url).endsWith('/preview')) {
            return makeResponse({ contentType: 'text/plain; charset=utf-8', text: 'Prévia sintética.\n<script>window.__scriptExecuted = 1</script>' });
          }
          if (String(url).endsWith('/ocr') && method === 'POST') {
            source.intelligence = { ocr: { engine: 'atrium-text-extractor', characterCount: 72, supervised: true, checksum: 'd'.repeat(64) } };
            Store.revision = 'rev-intelligence-1';
            return makeResponse({ payload: { ok: true, documents: Store.state.documents, revision: Store.revision } });
          }
          if (String(url).endsWith('/ocr')) {
            return makeResponse({ contentType: 'text/plain; charset=utf-8', text: 'Texto extraído sintético.\nRevisão humana necessária.' });
          }
          if (String(url).endsWith('/pdf')) {
            const derived = {
              ...source,
              id: 'doc-intelligence-pdf',
              name: 'relatorio-sintetico-convertido.pdf',
              originalName: 'relatorio-sintetico-convertido.pdf',
              mime: 'application/pdf',
              sourceDocumentId: source.id,
              checksum: 'e'.repeat(64),
              intelligence: undefined,
              derivation: { kind: 'pdf-conversion', supervised: true }
            };
            Store.state.documents.unshift(derived);
            Store.revision = 'rev-intelligence-2';
            return makeResponse({ status: 201, payload: { ok: true, document: derived, documents: Store.state.documents, revision: Store.revision } });
          }
          return makeResponse({ status: 404, payload: { message: 'Rota sintética ausente.' } });
        };
        App.renderDocuments();
      });

      assert.deepEqual(await page.evaluate(() => window.__intelligenceRequests), [], 'Render não pode iniciar preview, OCR ou conversão.');
      const record = page.locator('[data-document-id="doc-intelligence-ui"]');
      await record.locator('[data-document-action="preview"]').click();
      await page.locator('#documentIntelligencePanel:not(.hidden)').waitFor();
      assert.match(await page.locator('#documentIntelligenceBody pre').textContent(), /<script>window\.__scriptExecuted/);
      assert.equal(await page.locator('#documentIntelligenceBody script').count(), 0);
      assert.equal(await page.evaluate(() => window.__scriptExecuted), 0);
      await page.locator('#documentIntelligenceClose').click();
      assert.equal(await page.locator('#documentIntelligencePanel.hidden').count(), 1);

      await record.locator('[data-document-action="ocr"]').click();
      await page.locator('#documentIntelligenceBody pre').waitFor();
      assert.match(await page.locator('#documentIntelligenceBody pre').textContent(), /Revisão humana necessária/);
      assert.match(await page.locator('[data-document-id="doc-intelligence-ui"] .document-intelligence-status').textContent(), /72 caracteres/);
      await page.locator('#documentIntelligenceClose').click();

      await page.locator('[data-document-id="doc-intelligence-ui"] [data-document-action="pdf"]').click();
      await page.locator('[data-document-id="doc-intelligence-pdf"]').waitFor();
      const evidence = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const buttons = [...document.querySelectorAll('#documentArchiveWorkspace button')].filter(button => button.getClientRects().length);
        return {
          requests: window.__intelligenceRequests,
          originalCount: window.Atrium.Store.state.documents.filter(item => item.id === 'doc-intelligence-ui').length,
          derived: window.Atrium.Store.state.documents.find(item => item.id === 'doc-intelligence-pdf'),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          undersized: innerWidth <= 760 ? buttons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.textContent.trim()) : []
        };
      });
      assert.deepEqual(evidence.requests.map(item => [item.method, item.url]), [
        ['GET', '/api/documents/doc-intelligence-ui/preview'],
        ['POST', '/api/documents/doc-intelligence-ui/ocr'],
        ['GET', '/api/documents/doc-intelligence-ui/ocr'],
        ['POST', '/api/documents/doc-intelligence-ui/pdf']
      ]);
      assert.equal(evidence.requests[1].body.revision, 'rev-intelligence-0');
      assert.equal(evidence.requests[3].body.revision, 'rev-intelligence-1');
      assert.equal(evidence.originalCount, 1);
      assert.equal(evidence.derived.sourceDocumentId, 'doc-intelligence-ui');
      assert.ok(evidence.overflow <= 2, `Overflow global: ${evidence.overflow}px.`);
      assert.deepEqual(evidence.duplicateIds, []);
      assert.deepEqual(evidence.undersized, []);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }

  console.log('✓ UI documental: ações explícitas, preview inerte, OCR supervisionado, PDF derivado e mobile aprovados.');
} finally {
  await session.stop();
}
