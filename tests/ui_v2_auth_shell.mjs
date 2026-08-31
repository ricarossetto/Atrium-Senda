import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-auth-shell');
const authSource = fs.readFileSync(path.join(ROOT, 'js', 'auth.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const expectedEndpoints = [
  '/api/auth/status', '/api/auth/setup', '/api/auth/setup/verify', '/api/auth/register',
  '/api/auth/register/verify', '/api/auth/login', '/api/auth/logout'
];
const endpoints = [...new Set(authSource.match(/\/api\/auth\/[a-z/]+/g) || [])].sort();
assert.deepEqual(endpoints, expectedEndpoints.toSorted());
assert.match(indexSource, /css\/views\/ui-v2\/auth\.css/);
assert.doesNotMatch(indexSource, /triagem autônoma/i);

const SCENARIOS = [
  { file: '01-light-1440-loading.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'loading', configured: true },
  { file: '02-light-1440-login.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'login', configured: true },
  { file: '03-dark-1440-login-feedback.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'login-error', configured: true },
  { file: '04-light-1280-register.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'register', configured: true },
  { file: '05-light-1280-first-setup.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'setup', configured: false },
  { file: '06-dark-1280-totp.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'totp', configured: true },
  { file: '07-light-1280-recovery.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'recovery', configured: true },
  { file: '08-light-390-login.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'login', configured: true },
  { file: '09-dark-390-register.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'register', configured: true }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await browser.newContext({ viewport: scenario.viewport, locale: 'pt-BR', deviceScaleFactor: 1 });
    await context.addInitScript(theme => {
      localStorage.setItem('atrium_theme', theme);
      localStorage.setItem('atrium:ui:mode', 'classic');
    }, scenario.theme);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/auth/status', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: scenario.configured, authenticated: false })
    }));
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#authGate:not(.hidden)').waitFor();
    await page.evaluate(({ state, theme }) => {
      document.documentElement.dataset.theme = theme;
      if (state === 'loading') window.KellerAuth.show('authLoading');
      if (state === 'register') document.getElementById('authTabRegister').click();
      if (state === 'login-error') {
        window.KellerAuth.show('authLoginForm');
        window.KellerAuth.feedback('Não foi possível validar estas credenciais sintéticas.', 'error');
      }
      if (state === 'totp') {
        window.KellerAuth.show('authTotpSetupForm');
        document.getElementById('authQrCode').src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="210" height="210"%3E%3Crect width="210" height="210" fill="white"/%3E%3Cpath d="M20 20h54v54H20zM136 20h54v54h-54zM20 136h54v54H20zM96 96h18v18H96zM132 106h38v18h-38zM104 140h18v50h-18zM144 148h46v18h-46z" fill="%23252a2e"/%3E%3C/svg%3E';
        document.getElementById('authManualSecret').textContent = 'SYNTHETIC-MANUAL-TOTP-SECRET';
      }
      if (state === 'recovery') {
        window.KellerAuth.show('authRecoveryStep');
        document.getElementById('authRecoveryCodes').textContent = 'SYNTH-RECOVERY-01\nSYNTH-RECOVERY-02\nSYNTH-RECOVERY-03';
      }
    }, { state: scenario.state, theme: scenario.theme });

    const expectedId = ({ loading: 'authLoading', login: 'authLoginForm', 'login-error': 'authLoginForm', register: 'authRegisterForm', setup: 'authSetupForm', totp: 'authTotpSetupForm', recovery: 'authRecoveryStep' })[scenario.state];
    await page.locator(`#${expectedId}.active`).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('#authGate *')]
      .flatMap(element => element.getAnimations())
      .every(animation => animation.effect?.getTiming().iterations === Infinity
        || animation.playState === 'finished'));

    const evidence = await page.evaluate(state => {
      const gate = document.getElementById('authGate');
      const active = gate.querySelector('.auth-step.active');
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const interactives = [...active.querySelectorAll('button, input, summary')].filter(element => element.getClientRects().length);
      return {
        activeId: active.id,
        overflow: document.documentElement.scrollWidth - innerWidth,
        duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
        undersized: innerWidth <= 520 ? interactives.filter(element => {
          const target = element.matches('input[type="checkbox"], input[type="radio"]')
            ? element.closest('label') || element
            : element;
          const rect = target.getBoundingClientRect();
          return rect.width < 43.5 || rect.height < 43.5;
        }).map(element => element.name || element.id || element.textContent.trim()) : [],
        passwordToggles: gate.querySelectorAll('.password-toggle[aria-label]').length,
        trustBrowser: Boolean(active.querySelector('[name="trustBrowser"]')),
        qrAlt: gate.querySelector('#authQrCode')?.getAttribute('alt'),
        hasFeedbackText: gate.querySelector('#authFeedback')?.textContent.trim().length > 0,
        state
      };
    }, scenario.state);
    assert.equal(evidence.activeId, expectedId); assertions++;
    assert.ok(evidence.overflow <= 2); assertions++;
    assert.deepEqual(evidence.duplicates, []); assertions++;
    assert.deepEqual(evidence.undersized, []); assertions++;
    assert.ok(evidence.passwordToggles >= 4); assertions++;
    if (['login', 'login-error'].includes(scenario.state)) { assert.equal(evidence.trustBrowser, true); assertions++; }
    if (scenario.state === 'totp') { assert.match(evidence.qrAlt, /QR code/i); assertions++; }
    if (scenario.state === 'login-error') { assert.equal(evidence.hasFeedbackText, true); assertions++; }
    assert.deepEqual(pageErrors, []); assertions++;

    if (scenario.state === 'login') {
      const loginForm = page.locator('#authLoginForm');
      await page.evaluate(() => window.KellerAuth.busy(document.getElementById('authLoginForm'), true));
      assert.equal(await loginForm.locator('button[type="submit"]').isDisabled(), true); assertions++;
      await page.evaluate(() => window.KellerAuth.busy(document.getElementById('authLoginForm'), false));
      const toggle = loginForm.locator('.password-toggle');
      assert.equal(await toggle.getAttribute('aria-label'), 'Mostrar conteúdo'); assertions++;
      await toggle.click();
      assert.equal(await loginForm.locator('[name="password"]').getAttribute('type'), 'text'); assertions++;
      assert.equal(await toggle.getAttribute('aria-label'), 'Ocultar conteúdo'); assertions++;
    }
    if (scenario.state === 'register') {
      assert.equal(await page.locator('#authTabRegister').getAttribute('aria-selected'), 'true'); assertions++;
      assert.equal(await page.locator('#authTabLogin').getAttribute('aria-selected'), 'false'); assertions++;
    }

    const output = path.join(OUTPUT, scenario.file);
    await page.screenshot({ path: output, fullPage: false });
    hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    await context.close();
  }

  const fieldNames = await (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/auth/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true,"authenticated":false}' }));
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    const names = await page.locator('#authGate [name]').evaluateAll(elements => [...new Set(elements.map(element => element.name))].sort());
    await context.close();
    return names;
  })();
  assert.deepEqual(fieldNames, ['code', 'confirmPassword', 'displayName', 'email', 'oab', 'password', 'trustBrowser', 'username']);
  assert.equal(hashes.size, SCENARIOS.length);
  console.log('======================================================');
  console.log('✓ UI V2 AUTH SHELL CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await browser.close();
  await server.stop();
}
