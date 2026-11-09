import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const PASSWORD = 'Senha-Reauth-Runtime-2026!';
const USERNAME = 'admin_reauth_runtime';
const server = await startTestServer({ env: { ATRIUM_FRONTEND_ORIGINS: 'https://atrium.adv.br' } });
let browser;

try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: USERNAME,
    displayName: 'Administradora Sintética Reauth',
    email: 'admin-reauth@example.test',
    password: PASSWORD
  });
  assert.equal(response.status, 200, 'setup sintético deve iniciar');
  const setup = await response.json();

  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200, 'setup com MFA deve autenticar');
  const setupResult = await response.json();
  const reauthOriginResponse = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: USERNAME,
    password: PASSWORD,
    code: generateTotp(setup.manualSecret, Math.floor(Date.now() / 30_000) + 1)
  });
  assert.equal(reauthOriginResponse.status, 200, 'sessão auxiliar do teste deve validar');
  const reauthCookies = typeof reauthOriginResponse.headers.getSetCookie === 'function'
    ? reauthOriginResponse.headers.getSetCookie()
    : [reauthOriginResponse.headers.get('set-cookie') || ''];
  const reauthSessionCookie = reauthCookies.find(cookie => cookie.startsWith('keller_session='));
  const reauthCookieValue = reauthSessionCookie.split(';')[0].split('=')[1];
  const reauthCsrf = (await reauthOriginResponse.json()).csrfToken;

  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const sessionCookie = cookies.find(cookie => cookie.startsWith('keller_session='));
  assert.ok(sessionCookie, 'cookie sintético de sessão deve existir');
  const [cookieName, cookieValue] = sessionCookie.split(';')[0].split('=');

  const authHeaders = {
    Cookie: sessionCookie,
    'x-atrium-csrf': setupResult.csrfToken,
    'x-csrf-token': setupResult.csrfToken,
    'x-csrf': setupResult.csrfToken
  };

  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'colab_reauth',
    displayName: 'Colaboradora Reauth',
    email: 'colab-reauth@example.test',
    password: 'Senha-Colab-Reauth-2026!'
  }, authHeaders);
  assert.equal(response.status, 200, 'master deve cadastrar colaborador');
  const reg = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: reg.setupToken,
    code: generateTotp(reg.manualSecret)
  });
  assert.equal(response.status, 200, 'registro do colaborador deve concluir');
  const usersPayload = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: authHeaders })).json();
  const colabUser = (usersPayload.users || []).find(user => user.username === 'colab_reauth');
  assert.ok(colabUser?.id, 'colaborador deve constar na listagem de usuários');
  const colabUserId = colabUser.id;
  // Prova CORS: chamada cross-origin permitida recebe os headers corretos
  const corsProbe = await fetch(`${server.baseUrl}/api/admin/users/role`, {
    method: 'POST',
    headers: {
      Origin: 'https://atrium.adv.br',
      Cookie: `keller_session=${reauthCookieValue}`,
      'X-CSRF-Token': reauthCsrf,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: colabUserId, role: 'admin' })
  });
  assert.equal(corsProbe.status, 403, 'cross-origin 403 sem step-up');
  assert.equal(corsProbe.headers.get('x-atrium-reauth'), 'required', 'header X-Atrium-Reauth deve trafegar e ser legível');
  const exposeHeader = corsProbe.headers.get('access-control-expose-headers') || '';
  assert.match(exposeHeader, /X-Atrium-Reauth/i, 'Access-Control-Expose-Headers deve conter X-Atrium-Reauth');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.addCookies([{ name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/' }]);
  await context.addInitScript(() => {
    localStorage.setItem('atrium:ui:mode', 'v2');
    localStorage.setItem('atrium_theme', 'light');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_completed', 'true');
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), 'portal deve carregar');
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.evaluate(() => window.Atrium.App.switchView('admin'));
  await page.locator('#view-admin.active').waitFor();
  await page.locator('.admin-nav-tab[data-admin-tab="users"]').click();
  const editButton = page.locator(`.btn-admin-edit-user[data-user-id="${colabUserId}"]`);
  await editButton.waitFor();
  await editButton.click();
  await page.locator('#modalBackdrop[data-modal-mode="adminEditUser"]:not(.hidden)').waitFor();

  const editRole = await page.locator('#modalForm [name="role"]').inputValue();
  const editStatus = await page.locator('#modalForm [name="status"]').inputValue();
  const firstSubmit = page.waitForRequest(request => request.url().endsWith('/api/admin/users/role') && request.method() === 'POST');
  await page.locator('#modalForm button[type="submit"]').click();
  await firstSubmit;

  await page.locator('#modalBackdrop[data-modal-mode="reauth"]:not(.hidden)').waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('#modalForm button[type="submit"]').isEnabled(), true, 'submit do modal step-up deve estar habilitado após encerrar o modal de edição');
  await page.locator('#modalForm [name="password"]').fill(PASSWORD);
  await page.locator('#modalForm [name="code"]').fill(generateTotp(setup.manualSecret));

  const retryResponse = page.waitForResponse(result => result.url().endsWith('/api/admin/users/role') && result.request().method() === 'POST' && result.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await retryResponse;
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  assert.equal(await page.evaluate(() => window.Atrium.App.modalSubmitInFlight), false, 'trava do submit deve ser liberada');
  assert.deepEqual(pageErrors, [], `sem erros de runtime: ${pageErrors.join(' | ')}`);
  console.log(`ui_reauth_runtime: PASS (dispatch real, retry step-up e adminEditUser role=${editRole} status=${editStatus})`);
} finally {
  await browser?.close();
  await server.stop();
}
