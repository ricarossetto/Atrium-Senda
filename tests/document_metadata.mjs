import assert from 'node:assert/strict';
import { normalizeDocumentMetadata, normalizeStrings } from '../lib/documents/document-metadata.mjs';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\nATRIUM — METADADOS DOCUMENTAIS SUPERVISIONADOS');

assert.deepEqual(normalizeStrings(' urgente, Contrato,URGENTE,  ', { maxItems: 12, maxLength: 40 }), ['urgente', 'Contrato']);
const documents = [
  { id: 'source', ownerType: 'process', ownerId: 'process-1' },
  { id: 'same-owner', ownerType: 'process', ownerId: 'process-1' },
  { id: 'deleted', ownerType: 'process', ownerId: 'process-1', deletedAt: '2026-09-01' },
  { id: 'other-owner', ownerType: 'process', ownerId: 'process-2' }
];
const metadata = normalizeDocumentMetadata({
  documentType: '  Contrato de honorários  ',
  origin: 'Upload local',
  tags: ['Contrato', ' honorários ', 'CONTRATO'],
  summary: '  Resumo sintético revisado.  ',
  context: ' Contexto jurídico exclusivamente sintético. ',
  entities: [
    { type: 'person', label: 'Pessoa Sintética', identifier: 'ID-SINT-1' },
    { type: 'invalid', label: 'Tribunal Sintético' },
    { type: 'person', label: 'Pessoa Sintética', identifier: 'ID-SINT-1' }
  ],
  relatedDocumentIds: ['source', 'same-owner', 'deleted', 'other-owner'],
  classificationStatus: 'reviewed'
}, { documents, documentId: 'source', ownerType: 'process', ownerId: 'process-1' });

assert.equal(metadata.documentType, 'Contrato de honorários');
assert.deepEqual(metadata.tags, ['Contrato', 'honorários']);
assert.equal(metadata.summary, 'Resumo sintético revisado.');
assert.deepEqual(metadata.entities, [
  { type: 'person', label: 'Pessoa Sintética', identifier: 'ID-SINT-1' },
  { type: 'other', label: 'Tribunal Sintético' }
]);
assert.deepEqual(metadata.relatedDocumentIds, ['same-owner'], 'Relações devem excluir o próprio documento, lixeira e outro proprietário.');
assert.equal(metadata.classificationStatus, 'reviewed');
assert.equal(normalizeDocumentMetadata({ classificationStatus: 'invented' }).classificationStatus, 'unclassified');

const server = await startTestServer();
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.metadata', password: 'Senha-Metadata-Sintetica-2026!', displayName: 'Revisor Documental Sintético'
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const verified = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken };
  const state = runStateMigrations({
    schemaVersion: 9, dataVersion: 9,
    contacts: [{ id: 'contact-metadata', name: 'Cliente Metadado Sintético' }],
    processes: [], settings: {}, audit: []
  }, 'test').state;
  response = await postJson(`${server.baseUrl}/api/state`, { state, revision: null }, headers);
  let revision = (await response.json()).revision;

  const upload = async originalName => {
    const result = await postJson(`${server.baseUrl}/api/documents`, {
      revision, ownerType: 'contact', ownerId: 'contact-metadata', originalName, mime: 'text/plain',
      documentDate: '2026-09-01', contentBase64: Buffer.from(`Conteúdo sintético ${originalName}`).toString('base64')
    }, headers);
    const payload = await result.json();
    revision = payload.revision;
    return payload.document;
  };
  const source = await upload('fonte-sintetica.txt');
  const related = await upload('anexo-sintetico.txt');
  assert.equal(source.metadata.origin, 'Upload local');
  assert.equal(source.metadata.classificationStatus, 'unclassified');

  response = await fetch(`${server.baseUrl}/api/documents/${source.id}/metadata`, {
    method: 'PATCH', headers, body: JSON.stringify({ revision: 'revisao-obsoleta', metadata: { documentType: 'Contrato' } })
  });
  assert.equal(response.status, 409, 'Metadados devem respeitar concorrência otimista.');

  response = await fetch(`${server.baseUrl}/api/documents/${source.id}/metadata`, {
    method: 'PATCH', headers, body: JSON.stringify({ revision, metadata: {
      documentType: 'Contrato sintético', origin: 'Digitalização local', tags: 'contrato, urgente, CONTRATO',
      summary: 'Resumo sintético revisado.', context: 'Contexto sintético para análise humana.',
      entities: [{ type: 'organization', label: 'Entidade Sintética' }],
      relatedDocumentIds: [source.id, related.id, 'inexistente'], classificationStatus: 'reviewed'
    } })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  revision = payload.revision;
  const updated = payload.document;
  assert.equal(updated.documentType, 'Contrato sintético');
  assert.deepEqual(updated.metadata.tags, ['contrato', 'urgente']);
  assert.deepEqual(updated.metadata.entities, [{ type: 'organization', label: 'Entidade Sintética' }]);
  assert.deepEqual(updated.metadata.relatedDocumentIds, [related.id]);
  assert.equal(updated.metadata.reviewedBy, 'Revisor Documental Sintético');
  assert.match(updated.metadata.reviewedAt, /^\d{4}-\d{2}-\d{2}T/);

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const final = await response.json();
  assert.equal(final.revision, revision);
  assert.equal(final.state.audit[0].action, 'Metadados documentais revisados');
  assert.equal(final.state.audit[0].detail, source.name, 'Auditoria não deve copiar resumo, contexto ou entidades.');
} finally {
  await server.stop();
}

console.log('✓ Metadados, tags, entidades e relações são limitados, deduplicados, persistidos e supervisionados.');
