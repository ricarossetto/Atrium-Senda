import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { DocumentIntelligenceService } from '../lib/documents/document-intelligence.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — ANEXOS DO ASSISTENTE (PDF/TXT + OCR LOCAL)');
console.log('===============================================================\n');

const services = new DocumentIntelligenceService({});
const TEXT_SAMPLE = 'Documento sintético de teste.\nContrato fictício entre Alfa Ltda. e Beta S.A.\nCláusula de multa fictícia de 10%.';

const binary = {
  pdf: Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.from('conteudo sintetico sem texto extraivel', 'latin1')]),
  text: Buffer.from(TEXT_SAMPLE, 'utf8')
};
assert.equal(await services.extractText(binary.text, { mime: 'text/plain', name: 'anexo.txt' }).then(result => result.engine), 'atrium-text-extractor');
console.log('  [1] Extração de texto UTF-8 é server-side e não depende de binário externo.');

const server = await startTestServer({ env: { ATRIUM_AI_ATTACHMENT_TTL_MS: '1200' } });
const auth = {};
try {
  const anonymous = await postJson(`${server.baseUrl}/api/ai/attachments`, { name: 'x.txt', contentBase64: binary.text.toString('base64') });
  assert.equal(anonymous.status, 401);
  const anonymousChat = await postJson(`${server.baseUrl}/api/ai/chat`, { message: 'oi', attachments: [{ id: 'att-00000000-deadbeef' }] });
  assert.equal(anonymousChat.status, 401);
  console.log('  [2] Upload e chat com anexo rejeitam requisição anônima.');

  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.ai.attachments',
    displayName: 'Administradora Anexos Sintética',
    password: 'Ai-Attachments-2026!'
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  auth.headers = { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': (await response.json()).csrfToken };
  auth.cookie = auth.headers.Cookie;

  const withoutCsrf = await postJson(`${server.baseUrl}/api/ai/attachments`, {
    name: 'anexo.txt', contentBase64: binary.text.toString('base64')
  }, { Cookie: auth.cookie });
  assert.equal(withoutCsrf.status, 403);
  console.log('  [3] Upload sem CSRF retorna 403.');

  const unsupported = await postJson(`${server.baseUrl}/api/ai/attachments`, {
    name: 'malicioso.bin', contentBase64: Buffer.from([0x00, 0x01, 0x02, 0x00]).toString('base64')
  }, auth.headers);
  assert.equal(unsupported.status, 415);
  const oversize = await postJson(`${server.baseUrl}/api/ai/attachments`, {
    name: 'grande.txt', contentBase64: Buffer.alloc(20_000_001, 0x41).toString('base64')
  }, auth.headers);
  assert.equal(oversize.status, 413);
  console.log('  [4] Upload rejeita formato sem texto e arquivo acima de 20 MB.');

  const uploaded = await postJson(`${server.baseUrl}/api/ai/attachments`, {
    name: 'contrato-ficticio.txt', contentBase64: binary.text.toString('base64')
  }, auth.headers);
  const uploadedBody = await uploaded.json();
  assert.equal(uploaded.status, 200);
  assert.equal(uploadedBody.ok, true);
  assert.match(uploadedBody.id, /^att-/);
  assert.equal(uploadedBody.name, 'contrato-ficticio.txt');
  assert.ok(uploadedBody.chars > 40);
  assert.ok(!('text' in uploadedBody), 'resposta não pode devolver o texto extraído');
  assert.ok(!JSON.stringify(uploadedBody).includes('Cláusula de multa'));
  console.log('  [5] Upload processa o arquivo e devolve apenas metadados, sem o texto extraído.');

  const attachmentsDir = path.join(server.dataDirectory, 'ai-attachments');
  const files = fs.readdirSync(attachmentsDir);
  assert.ok(files.includes(`${uploadedBody.id}.json`));
  const envelope = JSON.parse(fs.readFileSync(path.join(attachmentsDir, `${uploadedBody.id}.json`), 'utf8'));
  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, 'aes-256-gcm');
  assert.ok(!fs.readFileSync(path.join(attachmentsDir, `${uploadedBody.id}.json`), 'utf8').includes('Cláusula de multa'), 'texto do anexo deve ficar cifrado em disco');
  console.log('  [6] O anexo fica em diretório dedicado e o texto é persistido cifrado (AES-256-GCM).');

  const expired = await postJson(`${server.baseUrl}/api/ai/chat`, {
    message: 'resuma o anexo', attachments: [{ id: 'att-00000000-deadbeef' }]
  }, auth.headers);
  const expiredBody = await expired.json();
  assert.equal(expired.status, 400);
  assert.match(expiredBody.message, /Anexo não encontrado ou expirado/i);
  console.log('  [7] Anexo inexistente/expirado gera 400 explícito antes de qualquer provedor.');

  await new Promise(resolve => setTimeout(resolve, 1600));
  const expiredReal = await postJson(`${server.baseUrl}/api/ai/chat`, {
    message: 'resuma o anexo', attachments: [{ id: uploadedBody.id }]
  }, auth.headers);
  assert.equal(expiredReal.status, 400);
  assert.match((await expiredReal.json()).message, /Anexo não encontrado ou expirado/i);
  console.log('  [8] Anexo além do TTL é descartado e rejeitado no chat.');

  const remaining = fs.readdirSync(attachmentsDir);
  assert.ok(!remaining.includes(`${uploadedBody.id}.json`), 'anexo expirado deve ser removido');
  console.log('  [9] Anexo expirado é removido do disco (sem resíduo).');
} finally {
  await server.stop();
}

console.log('\n>>> AI ATTACHMENTS: PASS <<<\n');
