import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import {
  DOCUMENT_STORAGE_PROVIDER_METHODS,
  EncryptedLocalDocumentStorageProvider,
  assertDocumentStorageProvider
} from '../lib/documents/document-storage-provider.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DOCUMENT STORAGE PROVIDER CONTRACT');
console.log('===============================================================\n');

assert.deepEqual(DOCUMENT_STORAGE_PROVIDER_METHODS, ['put', 'get', 'exists', 'delete', 'metadata', 'health']);
assert.throws(() => assertDocumentStorageProvider({ put() {} }), /Provider documental incompleto/);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-document-provider-test-'));
try {
  const security = new SecurityManager({
    dataDirectory: path.join(tempRoot, 'security'),
    sessionSecret: randomBytes(32).toString('base64url'),
    encryptionKey: randomBytes(32).toString('base64'),
    secureCookies: false
  });
  await security.init();
  const provider = assertDocumentStorageProvider(new EncryptedLocalDocumentStorageProvider({
    dataDirectory: tempRoot,
    securityManager: security
  }));

  assert.deepEqual(await provider.health(), { ok: true, provider: 'encrypted-local' });
  const original = Buffer.from('CONTEUDO DOCUMENTAL SINTETICO DO PROVIDER 26E', 'utf8');
  const first = await provider.put(original);
  assert.equal(first.created, true);
  assert.match(first.checksum, /^[a-f0-9]{64}$/);
  assert.equal(await provider.exists(first.checksum), true);
  assert.deepEqual(await provider.get(first.checksum), original);

  const duplicate = await provider.put(original);
  assert.deepEqual(duplicate, { checksum: first.checksum, created: false });
  assert.equal((await readdir(provider.directory)).length, 1, 'Deduplicação deve preservar um único blob físico.');

  const raw = await readFile(provider.blobPath(first.checksum), 'utf8');
  assert.equal(raw.includes(original.toString('utf8')), false, 'Provider nunca persiste conteúdo em claro.');
  assert.match(raw, /"algorithm":"aes-256-gcm"/);
  const metadata = await provider.metadata(first.checksum);
  assert.equal(metadata.checksum, first.checksum);
  assert.equal(metadata.provider, 'encrypted-local');
  assert.equal(metadata.encrypted, true);
  assert.equal(metadata.algorithm, 'aes-256-gcm');
  assert.ok(metadata.size > 0);

  for (const unsafe of ['../segredo', 'A'.repeat(64), `${first.checksum}/outro`, '']) {
    assert.throws(() => provider.blobPath(unsafe), error => error.statusCode === 400);
  }

  const corruptedChecksum = 'f'.repeat(64);
  await writeFile(provider.blobPath(corruptedChecksum), '{"version":1,"algorithm":"plain"}', 'utf8');
  await assert.rejects(() => provider.get(corruptedChecksum), error => error.statusCode === 500);
  await provider.delete(corruptedChecksum);

  const failingRoot = path.join(tempRoot, 'failure-case');
  const failingProvider = new EncryptedLocalDocumentStorageProvider({
    dataDirectory: failingRoot,
    securityManager: { encrypt() { throw new Error('synthetic encryption failure'); }, decrypt() {} }
  });
  await assert.rejects(() => failingProvider.put(Buffer.from('falha sintética')), /synthetic encryption failure/);
  const failureFiles = await readdir(failingProvider.directory).catch(() => []);
  assert.equal(failureFiles.some(name => name.includes('.tmp-')), false, 'Falha não pode deixar escrita parcial.');

  assert.equal(await provider.delete(first.checksum), true);
  assert.equal(await provider.delete(first.checksum), false);
  assert.equal(await provider.exists(first.checksum), false);
  assert.equal(await provider.metadata(first.checksum), null);
  await assert.rejects(() => provider.get(first.checksum), error => error.statusCode === 404);

  console.log('✓ Contrato do provider, cifragem, deduplicação, traversal, metadata, health e atomicidade aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-document-provider-test-')) {
    throw new Error('Diretório temporário documental inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true });
}
