import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 800 } });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);

  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });

  let firstPostContract = null;
  page.on('request', request => {
    if (firstPostContract || request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/state') return;
    const payload = request.postDataJSON();
    firstPostContract = {
      version: payload?.state?.version ?? null,
      schemaVersion: payload?.state?.schemaVersion ?? null,
      dataVersion: payload?.state?.dataVersion ?? null,
      revision: payload?.revision ?? null
    };
  });

  const firstGetPromise = page.waitForResponse(response => (
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/state'
  ));
  const firstPostPromise = page.waitForResponse(response => (
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/state'
  ));

  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const firstGetResponse = await firstGetPromise;
  const firstGet = await firstGetResponse.json();
  const firstPostResponse = await firstPostPromise;
  const firstPost = await firstPostResponse.json().catch(() => ({}));

  console.log([
    'Caracterização NEW_INSTALL:',
    `GET=${firstGetResponse.status()}`,
    `stateStatus=${firstGet.stateStatus}`,
    `serverSchema=${firstGet.schemaVersion}`,
    `POST=${firstPostResponse.status()}`,
    `sentSchema=${firstPostContract?.schemaVersion ?? 'ausente'}`,
    `sentDataVersion=${firstPostContract?.dataVersion ?? 'ausente'}`,
    `revision=${firstPost.revision ? 'criada' : 'ausente'}`
  ].join(' '));

  assert.equal(firstGetResponse.status(), 200, 'Primeiro GET deve responder 200.');
  assert.equal(firstGet.stateStatus, 'NEW_INSTALL', 'Diretório vazio deve iniciar como NEW_INSTALL.');
  assert.equal(firstPostResponse.status(), 200, 'Primeiro POST deve responder 200.');
  assert.ok(firstPost.revision, 'Primeiro POST deve criar revision.');
  assert.equal(firstPostContract?.schemaVersion, firstGet.schemaVersion, 'Fresh state deve enviar o schemaVersion informado pelo servidor.');
  assert.equal(firstPostContract?.dataVersion, firstGet.dataVersion, 'Fresh state deve enviar o dataVersion informado pelo servidor.');

  const firstConfigurationSave = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    store.state.configuration.taskDefinitions.push({
      id: 'config-new-install-synthetic',
      name: 'Configuração Sintética de Primeira Instalação',
      points: 37,
      phase: 'Teste funcional'
    });
    const saved = await store.flush();
    return { saved, revisionPresent: Boolean(store.revision) };
  });
  assert.deepEqual(firstConfigurationSave, { saved: true, revisionPresent: true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  const afterReload = await page.evaluate(() => ({
    stateStatus: window.Atrium.Store.stateStatus,
    taskDefinition: window.Atrium.Store.state.configuration.taskDefinitions.find(item => item.id === 'config-new-install-synthetic') || null
  }));
  assert.equal(afterReload.stateStatus, 'READY', 'Reload depois do primeiro save deve retornar READY.');
  assert.equal(afterReload.taskDefinition?.points, 37, 'Configuração criada antes do reload deve ser preservada.');

  const repeatedSave = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const item = store.state.configuration.taskDefinitions.find(entry => entry.id === 'config-new-install-synthetic');
    item.points = 41;
    const saved = await store.flush();
    return { saved, revisionPresent: Boolean(store.revision) };
  });
  assert.deepEqual(repeatedSave, { saved: true, revisionPresent: true }, 'Segundo save deve permanecer revision-safe.');

  const syncResult = await page.evaluate(() => window.portalApp.syncAll({ silent: true }));
  assert.equal(syncResult, true, 'Sincronização real deve concluir e persistir sem apagar a configuração local.');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  const repeatedReloadPoints = await page.evaluate(() => (
    window.Atrium.Store.state.configuration.taskDefinitions.find(item => item.id === 'config-new-install-synthetic')?.points
  ));
  assert.equal(repeatedReloadPoints, 41, 'Segundo save deve sobreviver a novo reload.');

  console.log('✓ Primeira persistência real aprovada: NEW_INSTALL, schema canônico, revision, reload e segundo save.');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.new.install',
    displayName: 'Administradora Nova Instalação',
    password: 'Senha-Nova-Instalacao-Sintetica-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
