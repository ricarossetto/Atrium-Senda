import assert from 'node:assert/strict';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 METADADOS DOCUMENTAIS');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await session.createContext({ viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
      await prepareUiV2DocumentsFixture(page);
      await page.evaluate(() => {
        const { App, Store } = window.Atrium;
        Store.revision = 'rev-document-metadata-0';
        Store.state.documents = [
          {
            id: 'doc-metadata-source', name: 'contrato-sintetico.txt', originalName: 'contrato-sintetico.txt', mime: 'text/plain', size: 120,
            createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', documentDate: '2026-09-01',
            ownerType: 'contact', ownerId: 'doc-contact', documentType: '', checksum: 'a'.repeat(64), deletedAt: null,
            metadata: { origin: 'Upload local', tags: [], summary: '', context: '', entities: [], relatedDocumentIds: [], classificationStatus: 'unclassified' }
          },
          {
            id: 'doc-metadata-related', name: 'anexo-sintetico.txt', originalName: 'anexo-sintetico.txt', mime: 'text/plain', size: 80,
            createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', documentDate: '2026-09-01',
            ownerType: 'contact', ownerId: 'doc-contact', documentType: 'Anexo', checksum: 'b'.repeat(64), deletedAt: null
          }
        ];
        window.__documentMetadataRequests = [];
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => {
          if (!String(url).endsWith('/metadata')) return original(url, options);
          const body = JSON.parse(options.body || '{}');
          window.__documentMetadataRequests.push({ url: String(url), method: options.method, body });
          const source = Store.state.documents.find(item => item.id === 'doc-metadata-source');
          source.documentType = body.metadata.documentType;
          source.metadata = {
            ...body.metadata,
            tags: String(body.metadata.tags).split(',').map(value => value.trim()).filter(Boolean),
            reviewedAt: '2026-09-02T10:00:00.000Z', reviewedBy: 'Revisor Sintético'
          };
          Store.revision = 'rev-document-metadata-1';
          return {
            ok: true, status: 200,
            async json() { return { ok: true, document: structuredClone(source), documents: structuredClone(Store.state.documents), revision: Store.revision }; }
          };
        };
        App.renderDocuments();
      });

      const source = page.locator('[data-document-id="doc-metadata-source"]');
      await source.locator('[data-document-action="metadata"]').click();
      const form = page.locator('#documentMetadataForm');
      await form.waitFor();
      assert.deepEqual(await page.evaluate(() => window.__documentMetadataRequests), [], 'Abrir o organizador não pode persistir nada.');
      assert.equal(await form.locator('[name="origin"]').inputValue(), 'Upload local');
      assert.equal(await form.locator('[name="relatedDocumentIds"] option').count(), 1, 'Somente documentos do mesmo proprietário devem ser oferecidos.');
      await form.locator('[name="documentType"]').fill('Contrato sintético');
      await form.locator('[name="origin"]').fill('Cliente — canal seguro');
      await form.locator('[name="tags"]').fill('contrato, honorários');
      await form.locator('[name="summary"]').fill('Resumo exclusivamente sintético e revisado.');
      await form.locator('[name="context"]').fill('Contexto jurídico sintético para conferência humana.');
      await form.locator('[name="entities"]').fill('organization | Entidade Sintética | CNPJ-SINT\nprocess | Processo Sintético | 50000000020268210001');
      await form.locator('[name="relatedDocumentIds"]').selectOption(['doc-metadata-related']);
      await form.locator('button[type="submit"]').click();
      await page.locator('#documentIntelligencePanel').waitFor({ state: 'hidden' });

      const request = await page.evaluate(() => window.__documentMetadataRequests[0]);
      assert.equal(request.url, '/api/documents/doc-metadata-source/metadata');
      assert.equal(request.method, 'PATCH');
      assert.equal(request.body.revision, 'rev-document-metadata-0');
      assert.equal(request.body.metadata.classificationStatus, 'reviewed');
      assert.deepEqual(request.body.metadata.relatedDocumentIds, ['doc-metadata-related']);
      assert.deepEqual(request.body.metadata.entities, [
        { type: 'organization', label: 'Entidade Sintética', identifier: 'CNPJ-SINT' },
        { type: 'process', label: 'Processo Sintético', identifier: '50000000020268210001' }
      ]);

      const updatedRecord = page.locator('[data-document-id="doc-metadata-source"]');
      assert.match(await updatedRecord.textContent(), /Contrato sintético/);
      assert.match(await updatedRecord.textContent(), /Origem: Cliente — canal seguro/);
      assert.match(await updatedRecord.textContent(), /contrato/);
      assert.match(await updatedRecord.textContent(), /honorários/);
      assert.match(await updatedRecord.textContent(), /Resumo exclusivamente sintético e revisado/);
      assert.match(await updatedRecord.textContent(), /1 documento\(s\) relacionado\(s\)/);

      const evidence = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        metadata: window.Atrium.Store.state.documents.find(item => item.id === 'doc-metadata-source').metadata,
        undersized: innerWidth <= 760 ? [...document.querySelectorAll('#documentArchiveWorkspace button')].filter(button => button.getClientRects().length).filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width < 43.5 || rect.height < 43.5;
        }).map(button => button.textContent.trim()) : []
      }));
      assert.ok(evidence.overflow <= 2, `Overflow global: ${evidence.overflow}px.`);
      assert.deepEqual(evidence.undersized, []);
      assert.equal(evidence.metadata.context, 'Contexto jurídico sintético para conferência humana.');
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

console.log('✓ UI organiza tipo, origem, tags, resumo, contexto, entidades e relações com confirmação explícita.');
