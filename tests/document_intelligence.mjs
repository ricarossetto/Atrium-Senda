import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import {
  DOCUMENT_OCR_MAX_PAGES,
  DocumentIntelligenceService,
  createDeterministicTextPdf,
  detectDocumentContent
} from '../lib/documents/document-intelligence.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DOCUMENT INTELLIGENCE, SAFE PREVIEW & PDF');
console.log('===============================================================\n');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');

assert.deepEqual(detectDocumentContent(PNG, { mime: 'text/html', name: 'fraude.html' }), { kind: 'image', format: 'png', mime: 'image/png', extension: '.png' });
assert.equal(detectDocumentContent(JPEG, { mime: 'application/octet-stream' }).format, 'jpeg');
assert.equal(detectDocumentContent(PDF, { mime: 'text/plain' }).kind, 'pdf');
assert.equal(detectDocumentContent(Buffer.from('Texto jurídico UTF-8: ação.'), { mime: 'text/plain', name: 'nota.txt' }).kind, 'text');
assert.throws(() => detectDocumentContent(Buffer.from('<svg><script>alert(1)</script></svg>'), { mime: 'image/svg+xml', name: 'ativo.svg' }), /HTML e SVG ativos/);
assert.throws(() => detectDocumentContent(Buffer.from('<html>ativo</html>'), { mime: 'text/plain', name: 'fraude.txt' }), /HTML e SVG ativos/);
assert.throws(() => detectDocumentContent(Buffer.from([0, 1, 2, 3]), { mime: 'application/octet-stream' }), /Formato não suportado/);

const pdfA = createDeterministicTextPdf('Linha jurídica com acentuação.\nSegunda linha.');
const pdfB = createDeterministicTextPdf('Linha jurídica com acentuação.\nSegunda linha.');
assert.equal(pdfA.binary.subarray(0, 8).toString('ascii'), '%PDF-1.4');
assert.equal(createHash('sha256').update(pdfA.binary).digest('hex'), createHash('sha256').update(pdfB.binary).digest('hex'), 'Conversão textual deve ser determinística.');
assert.match(pdfA.binary.toString('latin1'), /\/WinAnsiEncoding/);
assert.equal(pdfA.pageCount, 1);
const pdfText = pdfA.binary.toString('latin1');
const xrefOffset = Number(pdfText.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
assert.equal(pdfText.slice(xrefOffset, xrefOffset + 4), 'xref', 'startxref deve apontar para a tabela de referências.');
for (const match of pdfText.matchAll(/(\d{10}) 00000 n/g)) {
  const offset = Number(match[1]);
  assert.match(pdfText.slice(offset, offset + 12), /^\d+ 0 obj\n/, `Objeto PDF ausente no offset ${offset}.`);
}

const commandCalls = [];
const commandRunner = async (executable, args) => {
  commandCalls.push({ executable, args: [...args] });
  if (args[0] === '--version') return { stdout: 'tesseract 5.4.1\n' };
  if (executable === 'pdftoppm') {
    const prefix = args.at(-1);
    await writeFile(`${prefix}-1.png`, PNG);
    if (args[args.indexOf('-l') + 1] !== '1') await writeFile(`${prefix}-2.png`, PNG);
    return { stdout: '', stderr: '' };
  }
  const source = path.basename(args[0]);
  return { stdout: `Texto reconhecido de ${source}.`, stderr: '' };
};
const intelligence = new DocumentIntelligenceService({ commandRunner, tesseractPath: 'tesseract', pdftoppmPath: 'pdftoppm', languages: 'por', maxPages: 4 });
const textExtraction = await intelligence.extractText(Buffer.from('  Conteúdo já textual.  '), { mime: 'text/plain', name: 'nota.txt' });
assert.equal(textExtraction.text, 'Conteúdo já textual.');
assert.equal(textExtraction.engine, 'atrium-text-extractor');
assert.equal(commandCalls.length, 0, 'Texto nativo não deve iniciar processo externo.');

const imageExtraction = await intelligence.extractText(PNG, { mime: 'image/png', name: 'scan.png' });
assert.match(imageExtraction.text, /Texto reconhecido de page-001\.png/);
assert.equal(imageExtraction.engine, 'tesseract-local');
assert.equal(imageExtraction.pageCount, 1);
assert.equal(commandCalls.some(call => call.args.includes('stdout') && call.args.includes('-l') && call.args.includes('por')), true);

commandCalls.length = 0;
const pdfExtraction = await intelligence.extractText(PDF, { mime: 'application/pdf', name: 'autos.pdf' });
assert.equal(pdfExtraction.pageCount, 2);
assert.match(pdfExtraction.text, /page-001\.png/);
assert.match(pdfExtraction.text, /page-002\.png/);
const renderCall = commandCalls.find(call => call.executable === 'pdftoppm');
assert.deepEqual(renderCall.args.slice(0, 8), ['-png', '-f', '1', '-l', '5', '-r', '150', renderCall.args[7]]);
assert.equal(renderCall.args.some(argument => /[;&|`]/.test(argument)), false, 'Argumentos do processo local não podem conter metacaracteres de shell.');
assert.equal(DOCUMENT_OCR_MAX_PAGES, 25);

const preview = await intelligence.createPreview(PDF, { mime: 'application/pdf', name: 'autos.pdf' });
assert.equal(preview.mime, 'image/png');
assert.deepEqual(preview.binary, PNG);
const converted = intelligence.convertTextToPdf(Buffer.from('Minuta temporária.'), { mime: 'text/markdown', name: 'minuta.md' });
assert.equal(converted.engine, 'atrium-text-pdf');
assert.equal(converted.binary.subarray(0, 5).toString('ascii'), '%PDF-');
assert.throws(() => intelligence.convertTextToPdf(PNG, { mime: 'image/png', name: 'scan.png' }), /somente texto UTF-8/);

const unavailable = new DocumentIntelligenceService({
  commandRunner: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
  tesseractPath: 'tesseract',
  pdftoppmPath: 'pdftoppm'
});
await assert.rejects(() => unavailable.extractText(PNG, { mime: 'image/png', name: 'scan.png' }), error => error.statusCode === 503 && /Tesseract OCR local/.test(error.message));

const server = await startTestServer();
try {
  const auth = await setupMaster(server.baseUrl);
  const state = runStateMigrations({
    schemaVersion: 9,
    dataVersion: 9,
    contacts: [{ id: 'contact-intelligence', name: 'Cliente Sintético de OCR' }],
    processes: [],
    settings: {},
    audit: []
  }, 'test').state;
  let response = await postJson(`${server.baseUrl}/api/state`, { state, revision: null }, auth.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  const originalText = Buffer.from('Relatório jurídico sintético.\nValor informado: R$ 100,00.\n', 'utf8');
  let uploaded = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact',
    ownerId: 'contact-intelligence',
    originalName: 'relatorio.md',
    mime: 'text/markdown',
    documentType: 'relatório',
    documentDate: '2026-09-01',
    contentBase64: originalText.toString('base64')
  });
  assert.equal(uploaded.response.status, 201);
  const source = uploaded.payload.document;
  revision = uploaded.payload.revision;

  response = await fetch(`${server.baseUrl}/api/documents/${source.id}/preview`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/plain/);
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), originalText.toString('utf8'));

  response = await postJson(`${server.baseUrl}/api/documents/${source.id}/ocr`, { revision }, auth.headers);
  assert.equal(response.status, 200);
  let payload = await response.json();
  revision = payload.revision;
  const updatedSource = payload.documents.find(item => item.id === source.id);
  assert.equal(updatedSource.intelligence.ocr.sourceDocumentId, source.id);
  assert.equal(updatedSource.intelligence.ocr.sourceChecksum, source.checksum);
  assert.equal(updatedSource.intelligence.ocr.engine, 'atrium-text-extractor');
  assert.equal(updatedSource.intelligence.ocr.supervised, true);
  assert.equal(Object.hasOwn(updatedSource.intelligence.ocr, 'text'), false, 'Texto extraído não deve inflar metadata pública.');

  response = await fetch(`${server.baseUrl}/api/documents/${source.id}/ocr`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'none'/);
  assert.equal(await response.text(), originalText.toString('utf8').trim());

  response = await fetch(`${server.baseUrl}/api/documents/${source.id}/content`, { headers: { Cookie: auth.cookie } });
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), originalText, 'OCR não pode substituir ou normalizar o original.');

  response = await postJson(`${server.baseUrl}/api/documents/${source.id}/pdf`, { revision }, auth.headers);
  assert.equal(response.status, 201);
  payload = await response.json();
  revision = payload.revision;
  const derived = payload.document;
  assert.equal(derived.sourceDocumentId, source.id);
  assert.equal(derived.derivation.kind, 'pdf-conversion');
  assert.equal(derived.derivation.supervised, true);
  assert.equal(derived.mime, 'application/pdf');
  assert.equal(payload.documents.filter(item => item.id === source.id).length, 1, 'Conversão não duplica nem substitui o registro original.');
  response = await fetch(`${server.baseUrl}/api/documents/${derived.id}/content`, { headers: { Cookie: auth.cookie } });
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 8).toString('ascii'), '%PDF-1.4');

  response = await postJson(`${server.baseUrl}/api/documents/${source.id}/pdf`, { revision }, auth.headers);
  assert.equal(response.status, 409, 'Colisão de PDF derivado deve falhar sem overwrite.');

  uploaded = await uploadDocument(server.baseUrl, auth.headers, {
    revision,
    ownerType: 'contact',
    ownerId: 'contact-intelligence',
    originalName: 'ativo.svg',
    mime: 'image/svg+xml',
    documentType: 'não suportado',
    documentDate: '2026-09-01',
    contentBase64: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')
  });
  assert.equal(uploaded.response.status, 201, 'Acervo preserva original ainda que preview não seja suportado.');
  revision = uploaded.payload.revision;
  const active = uploaded.payload.document;
  response = await fetch(`${server.baseUrl}/api/documents/${active.id}/preview`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 415);
  response = await postJson(`${server.baseUrl}/api/documents/${active.id}/ocr`, { revision }, auth.headers);
  assert.equal(response.status, 415);
  response = await fetch(`${server.baseUrl}/api/documents/${active.id}/content`, { headers: { Cookie: auth.cookie } });
  assert.match(Buffer.from(await response.arrayBuffer()).toString(), /<script>/, 'Original não suportado permanece disponível somente como download autenticado.');

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const publicState = (await response.json()).state;
  const auditText = JSON.stringify(publicState.audit);
  assert.doesNotMatch(auditText, /Valor informado: R\$ 100,00/, 'Conteúdo extraído não pode vazar para audit.');
  assert.match(auditText, /Extração documental supervisionada/);
  assert.match(auditText, /PDF documental derivado/);

  console.log('✓ Inteligência documental: local/supervisionada, preview inerte, OCR derivado e conversão PDF segura aprovados.');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'ocr.master',
    password: 'Senha-Sintetica-26C!123',
    displayName: 'Advogada OCR Teste'
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
  return { cookie, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken } };
}

async function uploadDocument(baseUrl, headers, body) {
  const response = await postJson(`${baseUrl}/api/documents`, body, headers);
  return { response, payload: await response.json() };
}
