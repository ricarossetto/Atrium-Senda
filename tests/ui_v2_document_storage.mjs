import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, serviceSource, serverSource, migrationSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/documents.js'), 'utf8'),
  readFile(path.join(ROOT, 'lib/documents/document-service.mjs'), 'utf8'),
  readFile(path.join(ROOT, 'server.mjs'), 'utf8'),
  readFile(path.join(ROOT, 'lib/state-migrations.mjs'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 DOCUMENT STORAGE');
console.log('===============================================================\n');

assert.match(featureSource, /secureFetch\('\/api\/documents'/);
assert.match(serviceSource, /aes-256-gcm/);
assert.match(serviceSource, /sha256/);
assert.match(serverSource, /Confirmação explícita obrigatória para exclusão permanente/);
assert.match(migrationSource, /export function migrate9To10/);
const generatorRegistrySource = featureSource.slice(featureSource.indexOf('const DOCUMENT_GENERATORS'), featureSource.indexOf('function resolveDocumentType'));
assert.doesNotMatch(generatorRegistrySource, /secureFetch|store\.|fetch\s*\(/, 'Geradores jurídicos não podem executar rede ou persistência.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await prepareUiV2DocumentsFixture(page);

  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    window.__documentStorageRequests = [];
    window.__documentStorageRecords = [];
    window.__documentStorageRevision = 'rev-storage-0';
    Store.revision = window.__documentStorageRevision;
    const response = (payload, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      async json() { return structuredClone(payload); },
      async blob() { return new Blob(['arquivo sintético']); }
    });
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      if (!String(url).startsWith('/api/documents')) return original(url, options);
      const body = options.body ? JSON.parse(options.body) : undefined;
      window.__documentStorageRequests.push({ url: String(url), method: options.method || 'GET', body });
      const nextRevision = () => `rev-storage-${window.__documentStorageRequests.length}`;
      if (url === '/api/documents' && options.method === 'POST') {
        const record = {
          id: `doc-ui-${window.__documentStorageRecords.length + 1}`,
          name: `${body.documentType || 'documento'}-${body.documentDate}.pdf`,
          originalName: body.originalName,
          mime: body.mime,
          size: 18,
          createdAt: '2026-09-01T12:00:00.000Z',
          updatedAt: '2026-09-01T12:00:00.000Z',
          documentDate: body.documentDate,
          ownerType: body.ownerType,
          ownerId: body.ownerId,
          documentType: body.documentType,
          deletedAt: null,
          deletedBy: null,
          checksum: 'a'.repeat(64)
        };
        window.__documentStorageRecords.unshift(record);
        window.__documentStorageRevision = nextRevision();
        return response({ ok: true, document: record, documents: window.__documentStorageRecords, revision: window.__documentStorageRevision }, 201);
      }
      if (url === '/api/documents/settings') {
        window.__documentStorageRevision = nextRevision();
        return response({ ok: true, settings: { documentNamingTemplate: body.template }, revision: window.__documentStorageRevision });
      }
      if (String(url).endsWith('/content')) return response({});
      const id = decodeURIComponent(String(url).split('/')[3] || '');
      const record = window.__documentStorageRecords.find(item => item.id === id);
      if (String(url).endsWith('/delete')) {
        record.deletedAt = '2026-09-01T13:00:00.000Z'; record.deletedBy = 'Advogada Teste';
      } else if (String(url).endsWith('/restore')) {
        record.deletedAt = null; record.deletedBy = null;
      } else if (options.method === 'DELETE') {
        window.__documentStorageRecords = window.__documentStorageRecords.filter(item => item.id !== id);
      }
      window.__documentStorageRevision = nextRevision();
      return response({ ok: true, document: record, documents: window.__documentStorageRecords, revision: window.__documentStorageRevision });
    };
    App.renderDocuments();
  });

  assert.equal(await page.locator('#documentOwnerType').inputValue(), 'contact');
  assert.deepEqual(await page.locator('#documentOwnerId option').allTextContents(), ['Selecione', 'Cliente Documental Sintética']);
  await page.locator('#documentOwnerType').selectOption('process');
  assert.equal(await page.locator('#documentOwnerId option').count(), 6);
  await page.locator('#documentOwnerType').selectOption('contact');
  await page.locator('#documentOwnerId').selectOption('doc-contact');
  await page.locator('#documentTypeInput').fill('identidade');
  await page.locator('#documentDateInput').fill('2026-09-01');
  await page.locator('#documentFileInput').setInputFiles({ name: 'identidade.pdf', mimeType: 'application/pdf', buffer: Buffer.from('arquivo sintético') });
  await page.locator('#documentUploadButton').click();
  await page.locator('[data-document-id="doc-ui-1"]').waitFor();

  const upload = await page.evaluate(() => ({
    request: window.__documentStorageRequests[0],
    revision: window.Atrium.Store.revision,
    stored: window.Atrium.Store.state.documents[0]
  }));
  assert.equal(upload.request.url, '/api/documents');
  assert.equal(upload.request.method, 'POST');
  assert.deepEqual(Object.keys(upload.request.body).sort(), ['contentBase64', 'documentDate', 'documentType', 'mime', 'originalName', 'ownerId', 'ownerType', 'revision']);
  assert.equal(Buffer.from(upload.request.body.contentBase64, 'base64').toString(), 'arquivo sintético');
  assert.equal(Object.hasOwn(upload.stored, 'contentBase64'), false);
  assert.equal(upload.revision, 'rev-storage-1');

  await page.locator('[data-document-id="doc-ui-1"] [data-document-action="delete"]').click();
  await page.locator('[data-document-filter="deleted"]').click();
  assert.equal(await page.locator('[data-document-id="doc-ui-1"] [data-document-action="restore"]').count(), 1);
  await page.locator('[data-document-id="doc-ui-1"] [data-document-action="restore"]').click();
  assert.equal(await page.locator('[data-document-id="doc-ui-1"]').count(), 0, 'Restaurado sai imediatamente da visão da lixeira.');

  await page.locator('[data-document-filter="active"]').click();
  await page.locator('[data-document-id="doc-ui-1"] [data-document-action="delete"]').click();
  await page.locator('[data-document-filter="deleted"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-document-id="doc-ui-1"] [data-document-action="purge"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-document-id="doc-ui-1"]').length === 0);

  await page.locator('#documentNamingTemplate').fill('{cliente} - {tipo} - {data}');
  await page.locator('#documentNamingSave').click();
  await page.waitForFunction(() => window.Atrium.Store.state.settings.documentNamingTemplate === '{cliente} - {tipo} - {data}');

  await page.evaluate(() => window.Atrium.App.openOwnerDocuments('process', 'doc-process'));
  assert.equal(await page.locator('#documentOwnerType').inputValue(), 'process');
  assert.equal(await page.locator('#documentOwnerId').inputValue(), 'doc-process');

  const evidence = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    const workspace = document.getElementById('documentArchiveWorkspace');
    const rect = workspace.getBoundingClientRect();
    return {
      active: document.getElementById('view-documents').classList.contains('active'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      withinViewport: rect.left >= -2 && rect.right <= innerWidth + 2,
      requests: window.__documentStorageRequests.map(item => ({ url: item.url, method: item.method }))
    };
  });
  assert.equal(evidence.active, true);
  assert.ok(evidence.overflow <= 2);
  assert.deepEqual(evidence.duplicateIds, []);
  assert.equal(evidence.withinViewport, true);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(evidence.requests, [
    { url: '/api/documents', method: 'POST' },
    { url: '/api/documents/doc-ui-1/delete', method: 'POST' },
    { url: '/api/documents/doc-ui-1/restore', method: 'POST' },
    { url: '/api/documents/doc-ui-1/delete', method: 'POST' },
    { url: '/api/documents/doc-ui-1', method: 'DELETE' },
    { url: '/api/documents/settings', method: 'PATCH' }
  ]);

  console.log('✓ UI documental: upload explícito, owner context, lixeira, restore, purge, naming e layout aprovados.');
  await context.close();
} finally {
  await session.stop();
}
