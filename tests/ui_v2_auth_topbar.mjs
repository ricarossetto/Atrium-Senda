import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';

const before = process.argv.includes('--before');
const output = path.resolve('artifacts/visual-qa/auth-topbar', before ? 'before' : 'after');
fs.mkdirSync(output, { recursive: true });
const server = await startTestServer({ env: { ATRIUM_BETA_MODE: 'true', BETA_DISABLE_AUTOMATIONS: 'true' } });
const browser = await chromium.launch({ headless: true });
const measurements = [];
const states = ['login', 'login-error', 'register-1', 'register-2', 'setup', 'setup-monitoring', 'totp', 'recovery', 'invitation', 'forgot', 'reset'];
try {
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[390, 844], [390, 500], [1280, 800], [1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', locale: 'pt-BR' });
      try {
        await context.addInitScript(value => localStorage.setItem('atrium_theme', value), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/auth/status', route => route.fulfill({ contentType: 'application/json', body: '{"configured":true,"authenticated":false}' }));
        await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
        await page.locator('#authLoginForm.active').waitFor();
        await page.evaluate(() => document.fonts.ready);
        for (const state of before ? ['login'] : states) {
          await page.evaluate(state => {
            const auth = window.AtriumAuth;
            auth.feedback('');
            if (state === 'login' || state === 'login-error') auth.showLogin();
            if (state === 'login-error') auth.feedback('Não foi possível validar estas credenciais sintéticas. Confira os dados e tente novamente.', 'error');
            if (state === 'register-1') auth.showRegister();
            if (state === 'setup') auth.show('authSetupForm');
            if (state === 'totp') {
              auth.show('authTotpSetupForm');
              document.getElementById('authQrCode').src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="210" height="210"%3E%3Crect width="210" height="210" fill="white"/%3E%3Cpath d="M20 20h54v54H20zM136 20h54v54h-54zM20 136h54v54H20z" fill="black"/%3E%3C/svg%3E';
              document.getElementById('authManualSecret').textContent = 'SYNTHETIC';
            }
            if (state === 'recovery') {
              auth.show('authRecoveryStep');
              document.getElementById('authRecoveryCodes').textContent = 'SYNTH-RECOVERY-01\nSYNTH-RECOVERY-02\nSYNTH-RECOVERY-03';
            }
            if (state === 'invitation') {
              auth.show('authInvitationForm');
              document.getElementById('authInvitationWorkspace').textContent = 'Escritório Teste Nome Extenso';
              document.getElementById('authInvitationPerson').textContent = 'Colaboradora Teste — convidada@example.test';
            }
            if (state === 'forgot') auth.show('authForgotForm');
            if (state === 'reset') auth.show('authResetForm');
          }, state);
          if (state === 'register-2') {
            for (const [name, value] of Object.entries({ displayName: 'Advogada Teste Nome Extenso', email: 'teste@example.test', username: 'advogada.teste', password: 'Senha-Sintetica-2026!', confirmPassword: 'Senha-Sintetica-2026!' })) {
              await page.locator(`#authRegisterForm [name="${name}"]`).fill(value);
            }
            await page.locator('#authRegisterNext').click();
            await page.locator('#authRegisterOfficeStep:not([hidden])').waitFor();
          }
          if (state === 'setup-monitoring') {
            for (const [name, value] of Object.entries({ workspaceName: 'Escritório Teste', displayName: 'Advogada Teste', email: 'teste@example.test', username: 'advogada.teste', password: 'Senha-Sintetica-2026!', confirmPassword: 'Senha-Sintetica-2026!' })) {
              await page.locator(`#authSetupForm [name="${name}"]`).fill(value);
            }
            await page.locator('#authSetupNext').click();
            await page.locator('#authMonitoringStep:not([hidden])').waitFor();
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          const evidence = await page.evaluate(() => {
            const panel = document.querySelector('.auth-panel');
            const toolbar = panel.querySelector('.auth-topbar');
            const card = panel.querySelector('.auth-card');
            const box = element => {
              const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
              return { top, bottom, left, right, width, height };
            };
            const controls = [...toolbar.querySelectorAll('a, button')];
            const tabs = panel.querySelector('#authTabs');
            return {
              active: panel.querySelector('.auth-step.active').id,
              toolbar: box(toolbar), card: box(card), tabs: tabs.getClientRects().length ? box(tabs) : null,
              toolbarPosition: getComputedStyle(toolbar).position,
              panelDisplay: getComputedStyle(panel).display, panelPadding: getComputedStyle(panel).padding,
              overflow: document.documentElement.scrollWidth - innerWidth,
              targets: controls.map(element => ({ ...box(element), hit: element.contains(document.elementFromPoint(box(element).left + box(element).width / 2, box(element).top + box(element).height / 2)) })),
              columns: getComputedStyle(document.getElementById('authGate')).gridTemplateColumns.split(' ').length
            };
          });
          measurements.push({ theme, width, height, state, ...evidence });
          if (!before) {
            assert.ok(evidence.toolbar.bottom < evidence.card.top, JSON.stringify(evidence));
            if (evidence.tabs) assert.ok(evidence.toolbar.bottom < evidence.tabs.top, JSON.stringify(evidence));
            assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
            assert.equal(evidence.columns, width > 900 ? 2 : 1);
            for (const target of evidence.targets) {
              assert.ok(target.width >= 44 && target.height >= 44, JSON.stringify(target));
              assert.ok(target.left >= 0 && target.right <= width && target.top >= 0 && target.bottom <= height, JSON.stringify(target));
              assert.equal(target.hit, true);
            }
            for (const selector of ['.auth-back-to-landing', '.auth-theme-toggle']) {
              await page.locator(selector).focus();
              await page.keyboard.press('Tab');
              await page.keyboard.press('Shift+Tab');
              assert.equal(await page.locator(selector).evaluate(element => element === document.activeElement), true);
              assert.notEqual(await page.locator(selector).evaluate(element => getComputedStyle(element).outlineStyle), 'none');
              await page.locator(selector).hover();
              assert.ok(await page.locator(selector).evaluate(element => {
                const rect = element.getBoundingClientRect();
                const card = document.querySelector('.auth-card').getBoundingClientRect();
                return rect.bottom < card.top;
              }));
            }
            await page.locator('.auth-theme-toggle').click();
            assert.equal(await page.evaluate(() => document.documentElement.dataset.theme || 'dark'), theme === 'light' ? 'dark' : 'light');
            await page.locator('.auth-theme-toggle').click();
            assert.equal(await page.evaluate(() => document.documentElement.dataset.theme || 'dark'), theme);
          }
          if (state === 'login' || !before && width === 390 && ['register-1', 'register-2', 'setup', 'totp'].includes(state)) {
            await page.mouse.move(0, 0);
            await page.locator('body').click({ position: { x: 2, y: 2 } });
            await page.screenshot({ path: path.join(output, `${theme}-${width}x${height}-${state}.png`), fullPage: true });
          }
        }
        if (!before) {
          await page.locator('.auth-back-to-landing').click();
          await page.waitForURL('**/discover/');
          await page.locator('#hero-title').waitFor();
          assert.match(await page.locator('#hero-title').textContent(), /Sua rotina jurídica/);
        }
        assert.deepEqual(errors, []);
        console.log(`PASS: ${before ? 'BEFORE' : 'AFTER'} ${theme} ${width}x${height}`);
      } finally { await context.close(); }
    }
  }
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(`Artifacts: ${output}`);
  console.log(JSON.stringify(measurements.filter(item => item.state === 'login').map(({ theme, width, height, toolbar, card, toolbarPosition, panelPadding, targets }) => ({ theme, width, height, gap: card.top - toolbar.bottom, toolbarPosition, panelPadding, targets }))));
} finally {
  await browser.close();
  await server.stop();
}
