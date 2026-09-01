import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-core-reliability-'));
const catalogPath = new URL('../collector/portals.example.json', import.meta.url);
const catalogHashBefore = sha256(await readFile(catalogPath));
const password = 'Senha-Sintetica-Core-2026!';
let server = await startTestServer({
  dataDirectory,
  env: { JURISFLOW_CLOUD_MODE: 'true' }
});
const runtimeSecrets = { sessionSecret: server.sessionSecret, encryptionKey: server.encryptionKey };
let browser = await chromium.launch({ headless: true });

try {
  const master = await setupMaster(server.baseUrl, password);
  let context = await authenticatedContext(browser, server.baseUrl, master.cookie);
  let page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });

  let largePostBytes = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/state') {
      largePostBytes = Math.max(largePostBytes, request.postDataBuffer()?.byteLength || 0);
    }
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForFunction(() => Boolean(window.Atrium?.Store?.revision));

  const largeSave = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    store.state.customPrompts = [{ id: 'large-runtime-state', title: 'Payload grande sintético', prompt: 'x'.repeat(140 * 1024) }];
    return { saved: await store.flush(), revision: store.revision, length: store.state.customPrompts[0].prompt.length };
  });
  assert.equal(largeSave.saved, true);
  assert.equal(largeSave.length, 140 * 1024);
  assert.ok(largePostBytes > 100 * 1024, `POST real deveria exceder 100 KiB; observado ${largePostBytes} bytes.`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.customPrompts[0].prompt.length), 140 * 1024);

  const normalizedConfig = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    store.state.configuration.notificationAssignments = [
      { event: 'String legado', responsibles: ' Pessoa A, Pessoa B; Pessoa C ' },
      { event: 'Objeto malformado', responsibles: { unexpected: true } }
    ];
    return store.flush();
  });
  assert.equal(normalizedConfig, true);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.deepEqual(await page.evaluate(() => window.Atrium.Store.state.configuration.notificationAssignments.map(item => item.responsibles)), [
    ['Pessoa A', 'Pessoa B', 'Pessoa C'], []
  ]);

  const staleRevision = await page.evaluate(() => window.Atrium.Store.revision);
  assert.equal(await page.evaluate(async () => {
    window.Atrium.Store.state.settings.reliabilityRevisionMarker = 'newer';
    return window.Atrium.Store.flush();
  }), true);
  const staleStatus = await page.evaluate(async revision => {
    const response = await window.KellerAuth.secureFetch('/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: window.Atrium.Store.state, revision })
    });
    return response.status;
  }, staleRevision);
  assert.equal(staleStatus, 409, 'Revision obsoleta deve continuar retornando 409.');

  await context.setOffline(true);
  const offline = await page.evaluate(async () => {
    window.Atrium.Store.state.settings.offlineReliabilityMarker = 'pending';
    return window.Atrium.Store.flush();
  });
  assert.equal(offline, false, 'Falha offline deve ser explícita sem perder o estado em memória.');
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.settings.offlineReliabilityMarker), 'pending');
  await context.setOffline(false);
  assert.equal(await page.evaluate(() => window.Atrium.Store.flush()), true, 'Retry explícito depois da rede voltar deve persistir.');

  let response = await postJson(`${server.baseUrl}/api/ingest`, {
    sources: [
      { id: 'djen-cnj', name: 'DJEN sintético', status: 'ok', lastCheck: '2026-09-01T12:00:00.000Z', detail: '7 publicação(ões) sintéticas lida(s)' },
      { id: 'datajud-cnj', name: 'DataJud sintético', status: 'ok', lastCheck: '2026-09-01T12:01:00.000Z', detail: '3/3 processo(s) sintéticos localizado(s)' }
    ]
  }, { Authorization: `Bearer ${server.collectorToken}` });
  assert.equal(response.status, 200);

  response = await postJson(`${server.baseUrl}/api/integrations/judicial/portals`, { enabledIds: ['eproc-tjrs-1g'] }, master.headers);
  assert.equal(response.status, 200);
  let status = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: { Cookie: master.cookie } }).then(result => result.json());
  assert.equal(status.portals.find(item => item.id === 'eproc-tjrs-1g')?.enabled, true, 'Cobertura deve refletir imediatamente o POST.');
  assert.equal(status.managedCoverage.find(item => item.id === 'djen-cnj')?.authStrategy, 'public');
  assert.equal(status.managedCoverage.find(item => item.id === 'djen-cnj')?.configured, true);
  assert.equal(status.managedCoverage.find(item => item.id === 'djen-cnj')?.publicDetail, '7 publicação(ões) sintéticas lida(s)');
  assert.equal(status.managedCoverage.find(item => item.id === 'datajud-cnj')?.lastSuccessfulSyncAt, '2026-09-01T12:01:00.000Z');

  const disposableNumber = '5000000-00.2026.8.21.9999';
  response = await postJson(`${server.baseUrl}/api/ingest`, { processes: [{ id: 'external-disposable', number: disposableNumber, source: 'DataJud / CNJ' }] }, { Authorization: `Bearer ${server.collectorToken}` });
  assert.equal((await response.json()).imported, 1);
  await page.evaluate(async number => {
    window.Atrium.Store.state.settings.processDiscoverySuppressions = [{ cnj: number.replace(/\D/g, ''), reason: 'user-deleted' }];
    await window.Atrium.Store.flush();
  }, disposableNumber);
  response = await postJson(`${server.baseUrl}/api/ingest`, { processes: [{ id: 'external-disposable', number: disposableNumber, source: 'DataJud / CNJ' }] }, { Authorization: `Bearer ${server.collectorToken}` });
  assert.equal((await response.json()).imported, 0, 'Tombstone deve bloquear ingestão e remover resíduo do runtime.');
  await page.evaluate(async () => {
    window.Atrium.Store.state.settings.processDiscoverySuppressions = [];
    await window.Atrium.Store.flush();
  });
  response = await postJson(`${server.baseUrl}/api/ingest`, { processes: [{ id: 'external-disposable', number: disposableNumber, source: 'DataJud / CNJ' }] }, { Authorization: `Bearer ${server.collectorToken}` });
  assert.equal((await response.json()).imported, 1, 'Reativação deve permitir nova ingestão explícita.');

  await context.close();
  await browser.close();
  await server.stop();

  server = await startTestServer({
    dataDirectory,
    env: {
      JURISFLOW_CLOUD_MODE: 'true',
      AUTH_SESSION_SECRET: runtimeSecrets.sessionSecret,
      AUTH_ENCRYPTION_KEY: runtimeSecrets.encryptionKey
    }
  });
  const login = await loginMaster(server.baseUrl, password, master.totpSecret);
  const envelope = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: login.cookie } }).then(result => result.json());
  assert.equal(envelope.state.customPrompts[0].prompt.length, 140 * 1024, 'Estado >100 KiB deve sobreviver ao restart do Node.');
  assert.equal(envelope.state.settings.offlineReliabilityMarker, 'pending');
  status = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: { Cookie: login.cookie } }).then(result => result.json());
  assert.equal(status.portals.find(item => item.id === 'eproc-tjrs-1g')?.enabled, true, 'Cobertura deve sobreviver ao restart do Node.');
  assert.equal(sha256(await readFile(catalogPath)), catalogHashBefore, 'Preferência local não pode modificar o catálogo rastreado.');
  assert.deepEqual(pageErrors, []);

  console.log('Core legal workflow reliability: large state, reload, restart, 409, offline retry, configuration normalization and portal coverage PASS.');
} finally {
  await browser?.close().catch(() => {});
  await server?.stop().catch(() => {});
  await rm(dataDirectory, { recursive: true, force: true });
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function authenticatedContext(browserInstance, baseUrl, cookie) {
  const context = await browserInstance.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 800 } });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  return context;
}

async function setupMaster(baseUrl, userPassword) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, { username: 'master.reliability', displayName: 'Master Reliability Sintética', password: userPassword });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const verified = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken }, totpSecret: setup.manualSecret };
}

async function loginMaster(baseUrl, userPassword, totpSecret) {
  const response = await postJson(`${baseUrl}/api/auth/login`, { username: 'master.reliability', password: userPassword, code: generateTotp(totpSecret) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
