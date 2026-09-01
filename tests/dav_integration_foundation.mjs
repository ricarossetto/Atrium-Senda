import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import {
  DAV_INTEGRATION_TYPES,
  DAV_MATURITY,
  DavIntegrationService
} from '../lib/dav/dav-integration-service.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DAV INTEGRATION FOUNDATION');
console.log('===============================================================\n');

assert.deepEqual(DAV_INTEGRATION_TYPES, ['webdav', 'caldav', 'carddav']);
assert.equal(DAV_MATURITY, 'experimental');

const requests = [];
const mock = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: Buffer.concat(chunks) });
  if (req.url === '/same-origin-redirect') {
    res.writeHead(307, { Location: '/dav/' });
    return res.end();
  }
  if (req.url === '/cross-origin-redirect') {
    res.writeHead(307, { Location: 'https://example.test/dav/' });
    return res.end();
  }
  if (req.url === '/oversized' || req.url === '/dav/oversized') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    return res.end(Buffer.alloc(2_048, 1));
  }
  if (req.url === '/unsafe.xml' || req.url === '/dav/unsafe.xml') {
    res.writeHead(207, { 'Content-Type': 'application/xml' });
    return res.end('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><d:multistatus xmlns:d="DAV:"/>');
  }
  if (req.method === 'PUT') {
    res.writeHead(201, { 'Content-Length': '0' });
    return res.end();
  }
  if (req.method === 'GET') {
    const payload = Buffer.from('RECURSO DAV SINTETICO', 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) });
    return res.end(payload);
  }
  const xml = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href></d:response></d:multistatus>';
  res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Length': String(Buffer.byteLength(xml)) });
  return res.end(xml);
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const address = mock.address();
const baseUrl = `http://127.0.0.1:${address.port}/dav/`;

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-dav-foundation-test-'));
try {
  const security = new SecurityManager({
    dataDirectory: path.join(tempRoot, 'security'),
    sessionSecret: randomBytes(32).toString('base64url'),
    encryptionKey: randomBytes(32).toString('base64'),
    secureCookies: false
  });
  await security.init();
  const service = new DavIntegrationService({
    dataDirectory: tempRoot,
    securityManager: security,
    allowLocalTestEndpoints: true,
    responseLimit: 1_024,
    timeoutMs: 5_000
  });
  await service.init();

  const secretMarkers = {
    webdav: 'SYNTHETIC-WEBDAV-PASSWORD',
    caldav: 'SYNTHETIC-CALDAV-PASSWORD',
    carddav: 'SYNTHETIC-CARDDAV-PASSWORD'
  };
  for (const type of DAV_INTEGRATION_TYPES) {
    const status = await service.configure(type, { baseUrl, username: `${type}-user`, password: secretMarkers[type] });
    assert.equal(status.maturity, 'experimental');
    assert.equal(status.configured, true);
    assert.equal(status.verified, false);
    assert.equal(Object.hasOwn(status, 'password'), false);
  }

  const rawVault = await readFile(path.join(tempRoot, 'dav-integrations.json'), 'utf8');
  for (const marker of Object.values(secretMarkers)) assert.equal(rawVault.includes(marker), false, 'Credencial DAV vazou no arquivo cifrado.');
  assert.match(rawVault, /"algorithm":"aes-256-gcm"/);

  for (const type of DAV_INTEGRATION_TYPES) {
    const status = await service.probe(type);
    assert.equal(status.lastProbeOk, true);
    assert.equal(status.status, 'endpoint_responded_unverified');
    assert.equal(status.verified, false, 'Mock local não pode promover integração DAV a verificada/produção.');
  }

  const beforeGet = requests.length;
  const downloaded = await service.getResource('webdav', 'arquivo.bin');
  assert.equal(downloaded.binary.toString('utf8'), 'RECURSO DAV SINTETICO');
  assert.equal(requests.length, beforeGet + 1, 'Download deve exigir uma operação explícita.');

  const upload = Buffer.from('UPLOAD DAV SINTETICO', 'utf8');
  const beforePut = requests.length;
  const uploaded = await service.putResource('webdav', 'novo.bin', upload);
  assert.equal(uploaded.status, 201);
  assert.equal(requests.length, beforePut + 1, 'Upload deve exigir uma operação explícita.');
  assert.deepEqual(requests.at(-1).body, upload);

  const authHeaders = requests.map(item => item.authorization).filter(Boolean);
  assert.ok(authHeaders.length >= 5);
  assert.equal(authHeaders.every(value => value.startsWith('Basic ')), true);

  await service.configure('webdav', { baseUrl: `http://127.0.0.1:${address.port}/same-origin-redirect`, username: 'redirect-user', password: 'SYNTHETIC-REDIRECT-PASSWORD' });
  assert.equal((await service.probe('webdav')).lastProbeOk, true, 'Redirect same-origin limitado deve funcionar.');

  await service.configure('webdav', { baseUrl: `http://127.0.0.1:${address.port}/cross-origin-redirect`, username: 'redirect-user', password: 'SYNTHETIC-REDIRECT-PASSWORD' });
  const failedProbe = await service.probe('webdav');
  assert.equal(failedProbe.lastProbeOk, false, 'Redirect cross-origin deve falhar sem vazar credencial.');
  assert.equal(requests.some(item => item.url?.includes('example.test')), false);

  await service.configure('webdav', { baseUrl, username: 'limit-user', password: 'SYNTHETIC-LIMIT-PASSWORD' });
  await assert.rejects(() => service.getResource('webdav', '/oversized'), error => error.statusCode === 413);
  await assert.rejects(() => service.propfind('webdav', '/unsafe.xml'), /XML DAV insegura/);
  await assert.rejects(() => service.request('webdav', '', { method: 'DELETE' }), error => error.statusCode === 405);

  const productionPolicy = new DavIntegrationService({
    dataDirectory: path.join(tempRoot, 'production-policy'),
    securityManager: security,
    lookupFn: async () => [{ address: '127.0.0.1' }]
  });
  await assert.rejects(() => productionPolicy.validateUrl('http://public.example.test/dav'), /exigem HTTPS/);
  await assert.rejects(() => productionPolicy.validateUrl('https://public.example.test/dav'), /endereço público seguro/);
  await assert.rejects(() => productionPolicy.validateUrl('https://user:secret@public.example.test/dav'), /credenciais embutidas/);

  const source = await readFile(new URL('../lib/dav/dav-integration-service.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Store\.|store\.state|createAgendaFeature|createContactsFeature|setInterval/, 'Foundation DAV não pode mutar autoridades canônicas ou criar sync automático.');
  assert.equal((await readdir(tempRoot)).some(name => name.includes('.tmp-')), false, 'Cofre DAV não pode deixar temporários.');

  console.log('✓ DAV foundation: cofre cifrado, status experimental, mock local, SSRF, redirects, limites e transferências explícitas PASS.');
} finally {
  await new Promise(resolve => mock.close(resolve));
  const resolved = path.resolve(tempRoot);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('atrium-dav-foundation-test-')) {
    throw new Error('Diretório temporário DAV inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true });
}
