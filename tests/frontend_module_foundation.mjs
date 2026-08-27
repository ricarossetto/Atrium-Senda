import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await requestRawPath('/js/app/bootstrap.js');
  assert.equal(moduleResponse.status, 200, 'O bootstrap ES module deve ser servido por allowlist explícita.');
  assert.match(moduleResponse.contentType, /^(text|application)\/javascript\b/i, 'O bootstrap deve usar MIME JavaScript válido.');
  assert.match(moduleResponse.body, /MODULE_FOUNDATION_READY_EVENT/, 'A resposta do módulo não contém o entrypoint esperado.');

  const missingResponse = await requestRawPath('/js/app/arquivo-inexistente.js');
  assert.equal(missingResponse.status, 404, 'Módulo inexistente deve permanecer oculto com 404.');

  const privatePaths = [
    '/js/app/../office-data.js',
    '/js/app/%2e%2e/office-data.js',
    '/js/app/../../server.mjs',
    '/js/app/%2e%2e/%2e%2e/server.mjs',
    '/js/app/%252e%252e/%252e%252e/server.mjs',
    '/lib/security.mjs',
    '/data/app-state.json',
    '/tests/security.mjs',
    '/scripts/state-doctor.mjs',
    '/.env',
    '/package.json',
    '/pnpm-lock.yaml'
  ];

  for (const requestPath of privatePaths) {
    const response = await requestRawPath(requestPath);
    assert.notEqual(response.status, 200, `Caminho privado foi exposto: ${requestPath}`);
    assert.doesNotMatch(response.body, /OFFICE_DEFAULT_DATA|SecurityManager|startTestServer|const mimeTypes|AUTH_SESSION_SECRET/, `Conteúdo protegido vazou em ${requestPath}`);
  }

  const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  const failedScripts = [];
  const moduleResponses = [];

  await page.addInitScript(() => {
    document.addEventListener('atrium:module-foundation-ready', event => {
      document.documentElement.dataset.atriumModuleFoundation = event.detail?.entrypoint || 'ready';
    }, { once: true });
  });

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.resourceType() === 'script') failedScripts.push(`${request.url()} — ${request.failure()?.errorText || 'falha'}`);
  });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname === '/js/app/bootstrap.js') {
      moduleResponses.push({ status: response.status(), contentType: response.headers()['content-type'] || '' });
    }
    if (requestIsScript(response) && response.status() === 404) failedScripts.push(`${response.url()} — HTTP 404`);
  });

  const navigation = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(navigation?.ok(), 'A aplicação deve continuar carregando após a inclusão do ES module.');
  await page.locator('html[data-atrium-module-foundation="js/app/bootstrap.js"]').waitFor();

  assert.deepEqual(pageErrors, [], `ES module gerou pageerror: ${pageErrors.join(' | ')}`);
  assert.deepEqual(failedScripts, [], `Script ou import falhou: ${failedScripts.join(' | ')}`);
  assert.equal(moduleResponses.length, 1, 'O navegador deve carregar o bootstrap uma única vez.');
  assert.equal(moduleResponses[0].status, 200, 'O request real do ES module deve retornar 200.');
  assert.match(moduleResponses[0].contentType, /^(text|application)\/javascript\b/i, 'O navegador recebeu MIME inválido para o ES module.');
  assert.equal(await page.evaluate(() => Boolean(window.KellerAuth && window.Atrium && window.KellerCentral && window.portalApp)), true, 'A aplicação legada e seus globals devem continuar inicializando.');

  console.log('✓ Fundação ES module aprovada: browser real, MIME, allowlist, globals legados e caminhos privados protegidos.');
} finally {
  await browser.close();
  await server.stop();
}

function requestIsScript(response) {
  return response.request().resourceType() === 'script';
}

function requestRawPath(requestPath) {
  const base = new URL(server.baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: base.hostname,
      port: base.port,
      method: 'GET',
      path: requestPath,
      headers: { Host: base.host }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        contentType: String(response.headers['content-type'] || ''),
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.end();
  });
}
