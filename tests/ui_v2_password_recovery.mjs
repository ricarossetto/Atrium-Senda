import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'password-recovery');
const PUBLIC_MESSAGE = 'Se este identificador estiver vinculado a uma conta ATRIUM, enviaremos um link de redefinição válido por 30 minutos. Verifique também a caixa de spam.';
const PASSWORD = 'Senha-UI-Recuperacao-2026!';
const NEW_PASSWORD = 'Senha-UI-Redefinida-2026!';
const RESET_PASSWORD = 'Senha-UI-Link-Real-2026!';

// O anti-replay de TOTP consome cada passo de 30s uma única vez por usuário.
// Logins sucessivos do mesmo usuário avançam o contador e aguardam a janela ±1.
const consumedTotpSteps = new Map();
async function freshTotp(secret) {
  const counter = () => Math.floor(Date.now() / 30_000);
  let target = consumedTotpSteps.has(secret) ? consumedTotpSteps.get(secret) + 1 : counter();
  while (target > counter() + 1) await new Promise(resolve => setTimeout(resolve, 1_000));
  target = Math.max(target, counter());
  consumedTotpSteps.set(secret, target);
  return generateTotp(secret, target);
}

function decryptEnvelope(value, encryptionKey) {
  const raw = String(value ?? '');
  if (!raw.startsWith('enc:v1:')) return raw;
  const [iv, tag, ciphertext] = raw.slice(7).split(':');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

async function waitForEmailedResetToken(dbFile, encryptionKey, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(dbFile)) {
      const db = new DatabaseSync(dbFile);
      try {
        const row = db.prepare("SELECT payload, status FROM notification_outbox WHERE event_type='PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1").get();
        if (row) {
          const payload = JSON.parse(decryptEnvelope(row.payload, encryptionKey));
          const match = String(payload.text || '').match(/#reset=([A-Za-z0-9_-]+)/);
          if (match) return match[1];
        }
      } finally {
        db.close();
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Token de redefinição não apareceu no outbox a tempo.');
}

fs.mkdirSync(OUTPUT, { recursive: true });
const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };

async function mockGateApi(page, { resetResponse } = {}) {
  await page.route('**/api/auth/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ configured: true, authenticated: false, workspaceRegistrationEnabled: false })
  }));
  await page.route('**/api/auth/password/forgot', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, message: PUBLIC_MESSAGE })
  }));
  await page.route('**/api/auth/password/reset', route => route.fulfill(resetResponse || {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, message: 'Senha redefinida com sucesso. Entre com a nova senha.' })
  }));
}

try {
  // --- 1. Tela de solicitação ("Esqueceu sua senha?") ---
  const gateContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', deviceScaleFactor: 1 });
  const gatePage = await gateContext.newPage();
  const gateErrors = [];
  gatePage.on('pageerror', error => gateErrors.push(error.message));
  await mockGateApi(gatePage);
  const forgotRequests = [];
  gatePage.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/auth/password/forgot')) forgotRequests.push(JSON.parse(request.postData() || '{}'));
  });

  await gatePage.goto(`${server.baseUrl}?auth=login`, { waitUntil: 'networkidle' });
  await gatePage.locator('#authLoginForm.active').waitFor();
  await gatePage.locator('#authForgotPassLink').click();
  await gatePage.locator('#authForgotForm.active').waitFor();
  check(await gatePage.locator('#authTabs').isHidden(), 'abas de acesso devem ficar ocultas no fluxo de recuperação');
  check(await gatePage.locator('#authForgotForm [name="identifier"]').isVisible(), 'campo de identificação deve estar visível');
  await gatePage.waitForFunction(() => document.activeElement?.name === 'identifier');
  check(true, 'foco deve ir para o identificador');
  await gatePage.screenshot({ path: path.join(OUTPUT, '01-light-1440-forgot.png') });

  await gatePage.locator('#authForgotForm [name="identifier"]').fill('titular@example.test');
  await gatePage.locator('#authForgotForm button[type="submit"]').click();
  await gatePage.waitForFunction(message => document.getElementById('authFeedback')?.textContent.trim() === message, PUBLIC_MESSAGE);
  check(forgotRequests.length === 1 && forgotRequests[0].identifier === 'titular@example.test', 'solicitação deve enviar apenas o identificador informado');
  check(Object.keys(forgotRequests[0]).length === 1, 'solicitação não deve enviar campos além do identificador');
  check(await gatePage.locator('#authFeedback.success').isVisible(), 'confirmação pública deve ser exibida como sucesso');
  await gatePage.screenshot({ path: path.join(OUTPUT, '02-light-1440-forgot-sent.png') });

  await gatePage.locator('#authForgotBackBtn').click();
  await gatePage.locator('#authLoginForm.active').waitFor();
  check(await gatePage.locator('#authTabs').isVisible(), 'abas devem voltar ao retornar para o login');
  await gateContext.close();

  // --- 2. Link de redefinição (deep link + estados) ---
  const resetContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', deviceScaleFactor: 1 });
  const resetPage = await resetContext.newPage();
  const resetErrors = [];
  resetPage.on('pageerror', error => resetErrors.push(error.message));
  await mockGateApi(resetPage);
  const resetRequests = [];
  resetPage.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/auth/password/reset')) resetRequests.push(JSON.parse(request.postData() || '{}'));
  });

  await resetPage.goto(`${server.baseUrl}/#reset=synthetic-reset-token`, { waitUntil: 'networkidle' });
  await resetPage.locator('#authResetForm.active').waitFor();
  check(await resetPage.locator('#authTabs').isHidden(), 'abas devem ficar ocultas na tela de nova senha');
  check(!resetPage.url().includes('synthetic-reset-token'), 'token deve ser removido da barra de endereços');
  const touchTargets = await resetPage.evaluate(() => [...document.querySelectorAll('#authResetForm button, #authResetForm input')]
    .filter(element => element.getClientRects().length)
    .map(element => ({ id: element.name || element.id, height: element.getBoundingClientRect().height })));
  check(touchTargets.length >= 4, `tela de nova senha deve expor campos e ações: ${JSON.stringify(touchTargets)}`);
  check(touchTargets.every(target => target.height >= 43.5), `alvos de toque móveis devem ter ao menos 44px: ${JSON.stringify(touchTargets)}`);
  await resetPage.screenshot({ path: path.join(OUTPUT, '03-light-390-reset.png') });

  await resetPage.locator('#authResetForm [name="password"]').fill(NEW_PASSWORD);
  await resetPage.locator('#authResetForm [name="confirmPassword"]').fill(`${NEW_PASSWORD}-diferente`);
  await resetPage.locator('#authResetForm button[type="submit"]').click();
  await resetPage.waitForFunction(() => /não coincidem/i.test(document.getElementById('authFeedback')?.textContent || ''));
  check(resetRequests.length === 0, 'senhas divergentes não podem chamar o servidor');

  await resetPage.locator('#authResetForm [name="password"]').fill(NEW_PASSWORD);
  await resetPage.locator('#authResetForm [name="confirmPassword"]').fill(NEW_PASSWORD);
  await resetPage.locator('#authResetForm button[type="submit"]').click();
  await resetPage.locator('#authLoginForm.active').waitFor();
  check(resetRequests.length === 1 && resetRequests[0].token === 'synthetic-reset-token' && resetRequests[0].password === NEW_PASSWORD, 'redefinição deve enviar token e nova senha');
  check(await resetPage.locator('#authFeedback.success').isVisible(), 'sucesso da redefinição deve ser informado');
  await resetPage.screenshot({ path: path.join(OUTPUT, '04-light-390-reset-success.png') });
  await resetContext.close();

  // --- 3. Token inválido/expirado ---
  const invalidContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', deviceScaleFactor: 1, colorScheme: 'dark' });
  await invalidContext.addInitScript(() => localStorage.setItem('atrium_theme', 'dark'));
  const invalidPage = await invalidContext.newPage();
  const invalidErrors = [];
  invalidPage.on('pageerror', error => invalidErrors.push(error.message));
  await mockGateApi(invalidPage, {
    resetResponse: {
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Este link de redefinição de senha não é mais válido: ele já foi utilizado, expirou ou foi substituído por uma solicitação mais recente. Solicite um novo link.' })
    }
  });
  await invalidPage.goto(`${server.baseUrl}/#reset=token-expirado-sintetico`, { waitUntil: 'networkidle' });
  await invalidPage.locator('#authResetForm.active').waitFor();
  await invalidPage.locator('#authResetForm [name="password"]').fill(NEW_PASSWORD);
  await invalidPage.locator('#authResetForm [name="confirmPassword"]').fill(NEW_PASSWORD);
  await invalidPage.locator('#authResetForm button[type="submit"]').click();
  await invalidPage.waitForFunction(() => /não é mais válido/i.test(document.getElementById('authFeedback')?.textContent || ''));
  check(await invalidPage.locator('#authResetForm.active').isVisible(), 'estado inválido deve manter o formulário ativo');
  check(await invalidPage.locator('#authFeedback.error').isVisible(), 'token inválido deve ser exibido como erro');
  await invalidPage.screenshot({ path: path.join(OUTPUT, '05-dark-1440-reset-invalid.png') });
  await invalidPage.locator('#authResetBackBtn').click();
  await invalidPage.locator('#authForgotForm.active').waitFor();
  await invalidContext.close();

  // --- 4. Alteração de senha autenticada (backend real) ---
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular.ui.teste',
    displayName: 'Titular UI Teste',
    email: 'titular.ui@example.test',
    password: PASSWORD,
    workspaceName: 'Escritorio UI Teste'
  });
  const setup = await response.json();
  const manualSecret = setup.manualSecret;
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(manualSecret) });
  check(response.status === 200, 'sessão sintética da UI deve ser criada');

  const appContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', deviceScaleFactor: 1 });
  await appContext.addInitScript(() => {
    localStorage.setItem('atrium:ui:mode', 'classic');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
  });
  const appPage = await appContext.newPage();
  const appErrors = [];
  appPage.on('pageerror', error => appErrors.push(error.message));
  await appPage.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await appPage.locator('#authLoginForm.active').waitFor();
  await appPage.locator('#authLoginForm [name="username"]').fill('titular.ui.teste');
  await appPage.locator('#authLoginForm [name="password"]').fill(PASSWORD);
  await appPage.locator('#authLoginForm [name="code"]').fill(await freshTotp(manualSecret));
  await appPage.locator('#authLoginForm button[type="submit"]').click();
  await appPage.locator('#appShell:not(.hidden)').waitFor();

  await appPage.locator('#profileButton').click();
  await appPage.locator('#profileSettingsBackdrop:not(.hidden)').waitFor();
  check(await appPage.locator('#profileCurrentPassword').isVisible(), 'bloco de alteração de senha deve existir no perfil');
  check(await appPage.locator('#btnProfilePasswordChange').isVisible(), 'ação de atualizar senha deve estar visível');
  await appPage.screenshot({ path: path.join(OUTPUT, '06-light-1440-profile-password.png') });

  const csrfBefore = await appPage.evaluate(() => window.KellerAuth.csrfToken);
  await appPage.locator('#profileCurrentPassword').fill('Senha-Errada-2026!');
  await appPage.locator('#profileNewPassword').fill(NEW_PASSWORD);
  await appPage.locator('#profileNewPasswordConfirm').fill(NEW_PASSWORD);
  await appPage.locator('#profilePasswordCode').fill(generateTotp(manualSecret));
  await appPage.locator('#btnProfilePasswordChange').click();
  await appPage.waitForFunction(() => /incorreta/i.test(document.getElementById('profilePasswordFeedback')?.textContent || ''));
  check((await appPage.evaluate(() => window.KellerAuth.csrfToken)) === csrfBefore, 'falha não deve rotacionar o CSRF');
  check((await postJson(`${server.baseUrl}/api/auth/login`, { username: 'titular.ui.teste', password: PASSWORD, code: await freshTotp(manualSecret) })).status === 200, 'senha original deve continuar válida após falha');

  await appPage.locator('#profileCurrentPassword').fill(PASSWORD);
  await appPage.locator('#profileNewPassword').fill(NEW_PASSWORD);
  await appPage.locator('#profileNewPasswordConfirm').fill(NEW_PASSWORD);
  await appPage.locator('#profilePasswordCode').fill(generateTotp(manualSecret));
  await appPage.locator('#btnProfilePasswordChange').click();
  await appPage.waitForFunction(() => /Senha alterada/i.test(document.getElementById('profilePasswordFeedback')?.textContent || ''));
  check((await appPage.evaluate(() => window.KellerAuth.csrfToken)) !== csrfBefore, 'alteração de senha deve rotacionar o CSRF da sessão');
  check((await appPage.evaluate(() => document.getElementById('profileNewPassword').value)) === '', 'campos de senha devem ser limpos após o sucesso');
  check((await postJson(`${server.baseUrl}/api/auth/login`, { username: 'titular.ui.teste', password: PASSWORD, code: generateTotp(manualSecret) })).status === 401, 'senha anterior deve parar de autenticar');
  check((await postJson(`${server.baseUrl}/api/auth/login`, { username: 'titular.ui.teste', password: NEW_PASSWORD, code: await freshTotp(manualSecret) })).status === 200, 'senha nova deve autenticar no fluxo real');
  await appPage.screenshot({ path: path.join(OUTPUT, '07-light-1440-profile-password-changed.png') });
  await appContext.close();

  // --- 5. Fluxo real ponta a ponta: e-mail → link → nova senha → login ---
  const emailed = await postJson(`${server.baseUrl}/api/auth/password/forgot`, { identifier: 'titular.ui@example.test' });
  check(emailed.status === 200, 'solicitação real de redefinição deve responder 200');
  const realToken = await waitForEmailedResetToken(path.join(server.dataDirectory, 'notifications.sqlite'), server.encryptionKey);
  check(realToken.length >= 40, 'token entregue por e-mail deve ter entropia real');
  const tokenHashInState = JSON.parse(fs.readFileSync(path.join(server.dataDirectory, 'security.json'), 'utf8')).passwordResetTokens.at(-1)?.tokenHash;
  check(tokenHashInState !== realToken, 'estado persistido não pode conter o token em texto puro');

  const e2eContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', deviceScaleFactor: 1 });
  const e2ePage = await e2eContext.newPage();
  const e2eErrors = [];
  e2ePage.on('pageerror', error => e2eErrors.push(error.message));
  await e2ePage.goto(`${server.baseUrl}/#reset=${realToken}`, { waitUntil: 'networkidle' });
  await e2ePage.locator('#authResetForm.active').waitFor();
  check(!e2ePage.url().includes(realToken), 'token real deve ser removido da barra de endereços');
  await e2ePage.locator('#authResetForm [name="password"]').fill(RESET_PASSWORD);
  await e2ePage.locator('#authResetForm [name="confirmPassword"]').fill(RESET_PASSWORD);
  await e2ePage.locator('#authResetForm button[type="submit"]').click();
  await e2ePage.locator('#authLoginForm.active').waitFor();
  check(await e2ePage.locator('#authFeedback.success').isVisible(), 'redefinição pelo link real deve concluir com sucesso');
  await e2ePage.screenshot({ path: path.join(OUTPUT, '08-light-1440-reset-real-success.png') });
  check((await postJson(`${server.baseUrl}/api/auth/password/reset`, { token: realToken, password: RESET_PASSWORD })).status === 401, 'token real deve ser de uso único');
  check((await postJson(`${server.baseUrl}/api/auth/login`, { username: 'titular.ui.teste', password: RESET_PASSWORD, code: await freshTotp(manualSecret) })).status === 200, 'senha definida pelo link real deve autenticar');
  check((await postJson(`${server.baseUrl}/api/auth/login`, { username: 'titular.ui.teste', password: NEW_PASSWORD, code: generateTotp(manualSecret) })).status === 401, 'senha anterior deve parar de autenticar após o link real');
  check(e2eErrors.length === 0, `fluxo real não deve gerar erros: ${e2eErrors.join(' | ')}`);
  await e2eContext.close();

  check(gateErrors.length === 0, `tela de recuperação não deve gerar erros: ${gateErrors.join(' | ')}`);
  check(resetErrors.length === 0, `tela de nova senha não deve gerar erros: ${resetErrors.join(' | ')}`);
  check(invalidErrors.length === 0, `estado inválido não deve gerar erros: ${invalidErrors.join(' | ')}`);
  check(appErrors.length === 0, `perfil autenticado não deve gerar erros: ${appErrors.join(' | ')}`);

  console.log('======================================================');
  console.log('UI V2 PASSWORD RECOVERY OK');
  console.log(`Asserções: ${assertions}/${assertions}`);
  console.log(`Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await browser.close();
  await server.stop();
}
