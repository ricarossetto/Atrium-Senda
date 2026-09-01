import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import {
  DOCUMENT_NAMING_PLACEHOLDERS,
  normalizeDocumentFilename,
  resolveDocumentName,
  sanitizeDocumentFilename
} from '../lib/documents/document-service.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DOCUMENT MATURITY CORE');
console.log('===============================================================\n');

assert.deepEqual(DOCUMENT_NAMING_PLACEHOLDERS, ['processo', 'cliente', 'tipo', 'data', 'tribunal', 'oab']);
assert.equal(sanitizeDocumentFilename('../../segredo?.pdf'), 'segredo-.pdf');
assert.equal(sanitizeDocumentFilename('CON'), 'documento-CON');
assert.equal(normalizeDocumentFilename('  Petição FINAL.PDF '), 'petição final.pdf');
assert.equal(resolveDocumentName({
  template: '{cliente} - {tipo} - {data}',
  originalName: 'entrada.pdf',
  values: { cliente: 'Cliente A', tipo: 'Identidade', data: '2026-09-01' }
}), 'Cliente A - Identidade - 2026-09-01.pdf');
assert.throws(
  () => resolveDocumentName({ template: '{cliente}-{nao_suportado}', originalName: 'a.pdf' }),
  /Placeholder de nome não suportado/
);

const server = await startTestServer();
try {
  const auth = await setupMaster(server.baseUrl);
  const state = runStateMigrations({
    schemaVersion: 9,
    dataVersion: 9,
    contacts: [{ id: 'contact-1', name: 'Cliente Um' }, { id: 'contact-2', name: 'Cliente Dois' }],
    processes: [{ id: 'process-1', number: '5000000-00.2026.8.21.0001', client: 'Cliente Um', contactId: 'contact-1', court: 'TJRS · Vara Cível' }],
    settings: { officeName: 'Escritório Teste', lawyerOab: 'OAB/RS 12345' },
    audit: []
  }, 'test').state;
  let response = await postJson(`${server.baseUrl}/api/state`, { state, revision: null }, auth.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  response = await fetch(`${server.baseUrl}/api/documents`);
  assert.equal(response.status, 401, 'Acervo não pode ser consultado sem autenticação.');

  const secretBytes = Buffer.from('CONTEUDO DOCUMENTAL ULTRASSECRETO 26B', 'utf8');
  let upload = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact',
    ownerId: 'contact-1',
    originalName: '../../identidade?.pdf',
    mime: 'application/pdf',
    documentType: 'identidade',
    documentDate: '2026-09-01',
    contentBase64: secretBytes.toString('base64')
  });
  assert.equal(upload.response.status, 201);
  assert.equal(upload.payload.document.originalName, 'identidade-.pdf');
  assert.equal(upload.payload.document.name, 'identidade-.pdf');
  assert.equal(upload.payload.document.ownerType, 'contact');
  assert.equal(upload.payload.document.ownerId, 'contact-1');
  assert.equal(upload.payload.document.size, secretBytes.length);
  assert.match(upload.payload.document.checksum, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(upload.payload.document, 'contentBase64'), false);
  const first = upload.payload.document;
  revision = upload.payload.revision;

  const blobDirectory = path.join(server.dataDirectory, 'documents', 'blobs');
  let blobFiles = await readdir(blobDirectory);
  assert.equal(blobFiles.length, 1, 'Primeiro conteúdo deve criar um blob criptografado.');
  const rawBlob = await readFile(path.join(blobDirectory, blobFiles[0]), 'utf8');
  assert.equal(rawBlob.includes(secretBytes.toString('utf8')), false, 'Bytes em claro não podem aparecer no storage.');
  assert.match(rawBlob, /"algorithm":"aes-256-gcm"/);

  response = await fetch(`${server.baseUrl}/api/documents/${first.id}/content`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), secretBytes);

  upload = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact', ownerId: 'contact-1', originalName: 'outra.pdf', mime: 'application/pdf',
    contentBase64: secretBytes.toString('base64')
  });
  assert.equal(upload.response.status, 409, 'Mesmo conteúdo no mesmo proprietário deve ser rejeitado.');

  upload = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact', ownerId: 'contact-1', originalName: first.name, mime: 'application/pdf',
    contentBase64: Buffer.from('conteúdo diferente').toString('base64')
  });
  assert.equal(upload.response.status, 409, 'Mesmo nome no mesmo proprietário não pode sobrescrever silenciosamente.');

  upload = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact', ownerId: 'contact-2', originalName: 'identidade-dois.pdf', mime: 'application/pdf',
    contentBase64: secretBytes.toString('base64')
  });
  assert.equal(upload.response.status, 201, 'Mesmo conteúdo pode ser referenciado por outro proprietário.');
  const second = upload.payload.document;
  revision = upload.payload.revision;
  assert.equal(second.checksum, first.checksum);
  blobFiles = await readdir(blobDirectory);
  assert.equal(blobFiles.length, 1, 'Conteúdo idêntico não pode duplicar bytes físicos.');

  let mutation = await mutateDocument(server.baseUrl, auth.headers, first.id, 'delete', { revision });
  assert.equal(mutation.response.status, 200);
  revision = mutation.payload.revision;
  assert.ok(mutation.payload.document.deletedAt);
  assert.equal(mutation.payload.document.deletedBy, 'Administrador Documental');

  response = await fetch(`${server.baseUrl}/api/documents/${first.id}/content`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 410, 'Documento na lixeira não deve ser baixado antes da restauração.');

  response = await fetch(`${server.baseUrl}/api/documents?includeDeleted=true`, { headers: { Cookie: auth.cookie } });
  const withTrash = await response.json();
  assert.equal(withTrash.documents.length, 2);
  assert.equal(withTrash.documents.filter(item => item.deletedAt).length, 1);

  mutation = await mutateDocument(server.baseUrl, auth.headers, first.id, 'restore', { revision });
  assert.equal(mutation.response.status, 200);
  revision = mutation.payload.revision;
  assert.equal(mutation.payload.document.deletedAt, null);

  mutation = await mutateDocument(server.baseUrl, auth.headers, first.id, 'delete', { revision });
  revision = mutation.payload.revision;
  response = await fetch(`${server.baseUrl}/api/documents/${first.id}`, {
    method: 'DELETE', headers: auth.headers, body: JSON.stringify({ revision })
  });
  assert.equal(response.status, 400, 'Exclusão permanente exige confirmação explícita.');
  response = await fetch(`${server.baseUrl}/api/documents/${first.id}`, {
    method: 'DELETE', headers: auth.headers, body: JSON.stringify({ revision, confirm: true })
  });
  assert.equal(response.status, 200);
  let purge = await response.json();
  revision = purge.revision;
  assert.equal((await readdir(blobDirectory)).length, 1, 'Blob deve permanecer enquanto outra referência existir.');

  mutation = await mutateDocument(server.baseUrl, auth.headers, second.id, 'delete', { revision });
  revision = mutation.payload.revision;
  response = await fetch(`${server.baseUrl}/api/documents/${second.id}`, {
    method: 'DELETE', headers: auth.headers, body: JSON.stringify({ revision, confirm: true })
  });
  assert.equal(response.status, 200);
  purge = await response.json();
  revision = purge.revision;
  assert.equal((await readdir(blobDirectory)).length, 0, 'Última referência removida deve liberar o blob.');

  response = await fetch(`${server.baseUrl}/api/documents/settings`, {
    method: 'PATCH', headers: auth.headers, body: JSON.stringify({ revision, template: '{cliente}-{desconhecido}' })
  });
  assert.equal(response.status, 400);
  response = await fetch(`${server.baseUrl}/api/documents/settings`, {
    method: 'PATCH', headers: auth.headers, body: JSON.stringify({ revision, template: '{processo} - {cliente} - {tipo} - {data}' })
  });
  assert.equal(response.status, 200);
  const settingsPayload = await response.json();
  revision = settingsPayload.revision;

  upload = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'process', ownerId: 'process-1', originalName: 'original.DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    documentType: 'petição', documentDate: '2026-09-01', contentBase64: Buffer.from('docx sintético').toString('base64')
  });
  assert.equal(upload.response.status, 201);
  assert.equal(upload.payload.document.name, '5000000-00.2026.8.21.0001 - Cliente Um - petição - 2026-09-01.DOCX');
  revision = upload.payload.revision;

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const finalState = await response.json();
  assert.equal(finalState.state.documents.length, 1);
  assert.equal(JSON.stringify(finalState.state).includes(secretBytes.toString('base64')), false, 'Estado não pode conter bytes base64.');
  const actions = finalState.state.audit.map(item => item.action);
  assert.ok(actions.includes('Documento adicionado'));
  assert.ok(actions.includes('Documento movido para a lixeira'));
  assert.ok(actions.includes('Documento restaurado'));
  assert.ok(actions.includes('Documento excluído permanentemente'));

  const bypassState = structuredClone(finalState.state);
  bypassState.documents = [];
  bypassState.settings.documentNamingTemplate = '{cliente}-BYPASS';
  response = await postJson(`${server.baseUrl}/api/state`, { state: bypassState, revision: finalState.revision }, auth.headers);
  assert.equal(response.status, 200);
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const afterBypass = await response.json();
  assert.equal(afterBypass.state.documents.length, 1, 'Save genérico não pode remover metadata documental server-authoritative.');
  assert.equal(afterBypass.state.settings.documentNamingTemplate, '{processo} - {cliente} - {tipo} - {data}', 'Save genérico não pode alterar naming server-authoritative.');

  console.log('✓ Núcleo documental: ownership, naming, deduplicação, criptografia, lixeira, restore e purge aprovados.');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.docs', password: 'SenhaForte!123', displayName: 'Administrador Documental'
  });
  assert.equal(response.status, 200);
  const setup = await response.json();
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  const verified = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    cookie,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken }
  };
}

async function uploadDocument(baseUrl, headers, body) {
  const response = await postJson(`${baseUrl}/api/documents`, body, headers);
  return { response, payload: await response.json() };
}

async function mutateDocument(baseUrl, headers, id, action, body) {
  const response = await postJson(`${baseUrl}/api/documents/${encodeURIComponent(id)}/${action}`, body, headers);
  return { response, payload: await response.json() };
}
