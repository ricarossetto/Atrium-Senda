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
  '/api/auth/status', '/api/auth/setup', '/api/auth/setup/verify', '/api/auth/workspaces/register',
  '/api/auth/workspaces/register/verify', '/api/auth/invitations/accept', '/api/auth/register/verify',
  '/api/auth/login', '/api/auth/logout', '/api/auth/profile'
];
const endpoints = [...new Set(authSource.match(/\/api\/auth\/[a-z/]+/g) || [])].sort();
assert.deepEqual(endpoints, expectedEndpoints.toSorted());
assert.match(indexSource, /css\/views\/ui-v2\/auth\.css/);
assert.doesNotMatch(indexSource, /triagem autônoma/i);
assert.match(indexSource, /class="theme-toggle-btn auth-theme-toggle" data-theme-toggle/);
assert.match(indexSource, /Dados protegidos no seu computador/);
assert.match(indexSource, /Consulta judicial somente para leitura/);
assert.match(indexSource, /Você confirma tarefas e prazos/);
assert.match(indexSource, /Crie seu acesso mestre/);
assert.match(indexSource, /Ativar monitoramento automático/);
assert.match(indexSource, /inicia a primeira busca nas fontes disponíveis/);
assert.doesNotMatch(indexSource, /Criptografia AES-256-GCM|Segundo Fator TOTP \(RFC 6238\)|Sessão HttpOnly &amp; Zero Trust/);

const SCENARIOS = [
  { file: '01-light-1440-loading.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'loading', configured: true },
  { file: '02-light-1440-login.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'login', configured: true },
  { file: '03-dark-1440-login-feedback.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'login-error', configured: true },
  { file: '04-light-1280-register.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'register', configured: true },
  { file: '05-light-1280-first-setup.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'setup', configured: false },
  { file: '06-dark-1280-totp.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'totp', configured: true },
  { file: '07-light-1280-recovery.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'recovery', configured: true },
  { file: '08-light-390-login.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'login', configured: true },
  { file: '09-dark-390-register.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'register', configured: true },
  { file: '10-light-1920x1080-first-setup.png', theme: 'light', viewport: { width: 1920, height: 1080 }, state: 'setup', configured: false },
  { file: '11-dark-1920x1200-first-setup.png', theme: 'dark', viewport: { width: 1920, height: 1200 }, state: 'setup', configured: false },
  { file: '12-light-2560x1080-first-setup.png', theme: 'light', viewport: { width: 2560, height: 1080 }, state: 'setup', configured: false },
  { file: '13-light-1920x1080-monitoring-setup.png', theme: 'light', viewport: { width: 1920, height: 1080 }, state: 'setup-monitoring', configured: false },
  { file: '14-light-1440-team-invitation.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'invitation', configured: true }
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
    await page.route('**/api/auth/invitations/accept?*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, invitation: { displayName: 'Colaboradora Teste', email: 'convidada@example.test', workspace: { id: 'ws-synthetic', name: 'Escritório Teste' } } })
    }));
    await page.goto(`${server.baseUrl}${scenario.state === 'invitation' ? '#invite=synthetic-invitation-token' : ''}`, { waitUntil: 'networkidle' });
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
      if (state === 'setup-monitoring') {
        const form = document.getElementById('authSetupForm');
        window.KellerAuth.show('authSetupForm');
        form.elements.workspaceName.value = 'Escritório Teste';
        form.elements.displayName.value = 'Advogada Teste';
        form.elements.email.value = 'advogada@example.test';
        form.elements.username.value = 'advogada.teste';
        form.elements.password.value = 'Senha-Sintetica-2026!';
        form.elements.confirmPassword.value = 'Senha-Sintetica-2026!';
        document.getElementById('authSetupNext').click();
        form.elements.oab.value = '000000';
        form.elements.oab.dispatchEvent(new Event('input', { bubbles: true }));
        form.elements.oabUf.value = 'RS';
        form.elements.oabUf.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { state: scenario.state, theme: scenario.theme });

    const expectedId = ({ loading: 'authLoading', login: 'authLoginForm', 'login-error': 'authLoginForm', register: 'authRegisterForm', setup: 'authSetupForm', 'setup-monitoring': 'authSetupForm', invitation: 'authInvitationForm', totp: 'authTotpSetupForm', recovery: 'authRecoveryStep' })[scenario.state];
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
    if (scenario.state === 'invitation') {
      assert.equal(await page.locator('#authInvitationWorkspace').textContent(), 'Escritório Teste'); assertions++;
      assert.match(await page.locator('#authInvitationPerson').textContent(), /Colaboradora Teste.*convidada@example\.test/); assertions++;
      assert.equal(await page.locator('#authTabs').isVisible(), false); assertions++;
    }
    if (scenario.state === 'setup') {
      const setupLayout = await page.evaluate(() => {
        const rect = name => {
          const element = document.querySelector(`#authSetupForm [name="${name}"]`);
          const box = element.getBoundingClientRect();
          return { top: box.top, left: box.left, right: box.right, width: box.width, height: box.height };
        };
        const card = document.querySelector('.auth-card');
        const brandTitle = document.querySelector('.auth-visual-copy h1');
        const brandSubtitle = brandTitle.querySelector('em');
        const securityItems = [...document.querySelectorAll('.auth-security-list > span')];
        const cardBox = card.getBoundingClientRect();
        return {
          displayName: rect('displayName'), email: rect('email'), username: rect('username'),
          password: rect('password'), confirmPassword: rect('confirmPassword'),
          cardOverflow: card.scrollHeight - card.clientHeight,
          themeControlInsideCard: Boolean(document.querySelector('.auth-theme-toggle')?.closest('.auth-panel')),
          brandTitleSize: Number.parseFloat(getComputedStyle(brandTitle).fontSize),
          brandSubtitleSize: Number.parseFloat(getComputedStyle(brandSubtitle).fontSize),
          brandSubtitleStyle: getComputedStyle(brandSubtitle).fontStyle,
          cardCenterOffset: Math.abs(cardBox.top + cardBox.height / 2 - innerHeight / 2),
          securityItemsUseHangingIndent: securityItems.every(item => {
            const text = item.querySelector(':scope > span');
            return getComputedStyle(item).display === 'grid'
              && getComputedStyle(item).gridTemplateColumns.split(' ').length === 2
              && Boolean(text);
          }),
          oabRequired: document.querySelector('#authSetupForm [name="oab"]')?.required,
          oabUfRequired: document.querySelector('#authSetupForm [name="oabUf"]')?.required
        };
      });
      const fullWidth = ['displayName', 'email', 'username', 'password', 'confirmPassword'].map(name => setupLayout[name]);
      assert.ok(fullWidth.every(box => Math.abs(box.left - fullWidth[0].left) <= 1 && Math.abs(box.width - fullWidth[0].width) <= 1)); assertions++;
      assert.ok(setupLayout.displayName.top < setupLayout.email.top && setupLayout.email.top < setupLayout.username.top); assertions++;
      assert.ok(setupLayout.username.top < setupLayout.password.top && setupLayout.password.top < setupLayout.confirmPassword.top); assertions++;
      assert.ok(setupLayout.cardOverflow <= 2, `O primeiro acesso não deve exigir rolagem interna: ${setupLayout.cardOverflow}px.`); assertions++;
      assert.equal(setupLayout.themeControlInsideCard, true); assertions++;
      assert.equal(setupLayout.brandSubtitleStyle, 'normal'); assertions++;
      assert.ok(setupLayout.brandSubtitleSize < setupLayout.brandTitleSize * .8); assertions++;
      assert.ok(setupLayout.cardCenterOffset <= 2, `O cartão deve ficar centralizado verticalmente: desvio de ${setupLayout.cardCenterOffset}px.`); assertions++;
      assert.equal(setupLayout.securityItemsUseHangingIndent, true); assertions++;
      assert.equal(setupLayout.oabRequired, false); assertions++;
      assert.equal(setupLayout.oabUfRequired, false); assertions++;
      assert.equal(await page.locator('#authIdentityStep').isVisible(), true); assertions++;
      assert.equal(await page.locator('#authMonitoringStep').isVisible(), false); assertions++;
    }
    if (scenario.state === 'setup-monitoring') {
      const setupLayout = await page.evaluate(() => {
        const rect = name => {
          const box = document.querySelector(`#authSetupForm [name="${name}"]`).getBoundingClientRect();
          return { top: box.top, left: box.left, right: box.right, width: box.width, height: box.height };
        };
        const card = document.querySelector('.auth-card').getBoundingClientRect();
        return {
          oab: rect('oab'),
          oabUf: rect('oabUf'),
          monitoringVisible: Boolean(document.getElementById('authMonitoringChoice').getClientRects().length),
          continueLabel: document.getElementById('authMonitoringContinue').textContent.trim(),
          cardCenterOffset: Math.abs(card.top + card.height / 2 - innerHeight / 2),
          cardOverflow: document.querySelector('.auth-card').scrollHeight - document.querySelector('.auth-card').clientHeight,
          ufLabelAlignment: getComputedStyle(document.querySelector('.auth-uf-label')).textAlign,
          ufLabelPadding: Number.parseFloat(getComputedStyle(document.querySelector('.auth-uf-label')).paddingLeft)
        };
      });
      assert.ok(Math.abs(setupLayout.oab.top - setupLayout.oabUf.top) <= 1 && Math.abs(setupLayout.oab.height - setupLayout.oabUf.height) <= 1); assertions++;
      assert.ok(
        setupLayout.oab.right < setupLayout.oabUf.left && setupLayout.oabUf.width >= 120,
        `Campos OAB/UF desalinhados: ${JSON.stringify(setupLayout)}`
      ); assertions++;
      assert.equal(setupLayout.monitoringVisible, true); assertions++;
      assert.equal(setupLayout.continueLabel, 'Continuar sem monitoramento'); assertions++;
      assert.equal(setupLayout.ufLabelAlignment, 'left'); assertions++;
      assert.equal(setupLayout.ufLabelPadding, 8); assertions++;
      assert.ok(setupLayout.cardOverflow <= 2, `A etapa profissional não deve exigir rolagem interna: ${setupLayout.cardOverflow}px.`); assertions++;
      assert.ok(setupLayout.cardCenterOffset <= 2, `O cartão profissional deve ficar centralizado: desvio de ${setupLayout.cardCenterOffset}px.`); assertions++;
      await page.locator('#authMonitoringChoice input').check();
      assert.equal(await page.locator('#authMonitoringContinue').textContent(), 'Ativar monitoramento e continuar'); assertions++;
      assert.match(await page.locator('#authMonitoringDecisionHint').textContent(), /primeira busca começa automaticamente/i); assertions++;
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
  assert.deepEqual(fieldNames, ['bootstrapToken', 'code', 'confirmPassword', 'displayName', 'email', 'enableMonitoring', 'oab', 'oabUf', 'password', 'trustBrowser', 'username', 'workspaceName']);

  const publicThemeControl = await (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/auth/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false,"authenticated":false}' }));
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    const button = page.locator('.auth-theme-toggle');
    const initial = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, saved: localStorage.getItem('atrium_theme') }));
    await button.click();
    const dark = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme || 'dark', saved: localStorage.getItem('atrium_theme'), toasts: document.querySelectorAll('#toastRegion .toast').length }));
    await button.click();
    const light = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, saved: localStorage.getItem('atrium_theme') }));
    const result = { initial, dark, light, visible: await button.isVisible(), label: await button.getAttribute('aria-label') };
    await context.close();
    return result;
  })();
  assert.deepEqual(publicThemeControl.initial, { theme: 'light', saved: 'light' });
  assert.deepEqual(publicThemeControl.dark, { theme: 'dark', saved: 'dark', toasts: 0 });
  assert.deepEqual(publicThemeControl.light, { theme: 'light', saved: 'light' });
  assert.equal(publicThemeControl.visible, true);
  assert.equal(publicThemeControl.label, 'Tema claro ativo. Alternar para tema escuro');

  const avatarVisibility = await (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/auth/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true,"authenticated":false}' }));
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    const visibility = await page.evaluate(() => {
      const image = document.getElementById('profileAvatarImage');
      const initials = document.querySelector('.profile-initials');
      const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      window.KellerAuth.renderProfileAvatar(photo, image, initials);
      const withPhoto = {
        imageHidden: image.hidden,
        initialsHidden: initials.hidden,
        imageDisplay: getComputedStyle(image).display,
        initialsDisplay: getComputedStyle(initials).display
      };
      window.KellerAuth.renderProfileAvatar('', image, initials);
      const withoutPhoto = {
        imageHidden: image.hidden,
        initialsHidden: initials.hidden,
        imageDisplay: getComputedStyle(image).display,
        initialsDisplay: getComputedStyle(initials).display
      };
      return { withPhoto, withoutPhoto };
    });
    await context.close();
    return visibility;
  })();
  assert.deepEqual(avatarVisibility.withPhoto, {
    imageHidden: false,
    initialsHidden: true,
    imageDisplay: 'block',
    initialsDisplay: 'none'
  });
  assert.deepEqual(avatarVisibility.withoutPhoto, {
    imageHidden: true,
    initialsHidden: false,
    imageDisplay: 'none',
    initialsDisplay: 'grid'
  });
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
