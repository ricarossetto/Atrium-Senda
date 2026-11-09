import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

// Anti-replay por passo monotonico: cada login precisa consumir um passo TOTP
// estritamente maior que o ultimo consumido, respeitando a janela ±1 do servidor.
let lastUsedStep = 0;
const currentStep = () => Math.floor(Date.now() / 30000);
async function loginTotp(secret) {
  const step = Math.max(currentStep(), lastUsedStep + 1);
  while (currentStep() < step - 1) await new Promise(resolve => setTimeout(resolve, 500));
  lastUsedStep = step;
  return generateTotp(secret, step);
}

try {
  const password = 'Synthetic-Reset-Ui-2026!';
  const setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'master.ui', displayName: 'Master UI Teste', email: 'master-ui@example.test', workspaceName: 'Workspace UI', password
  });
  const setup = await setupResponse.json();
  const setupStep = currentStep();
  await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret, setupStep) });
  lastUsedStep = Math.max(lastUsedStep, setupStep);

  for (const theme of ['light', 'dark']) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(server.baseUrl);
      await page.locator('#authLoginForm.active').waitFor({ state: 'visible' });
      await page.locator('#authLoginForm [name="username"]').fill('master.ui');
      await page.locator('#authLoginForm [name="password"]').fill(password);
      await page.locator('#authLoginForm [name="code"]').fill(await loginTotp(setup.manualSecret));
      await page.locator('#authLoginForm button[type="submit"]').click();
      await page.locator('#appShell').waitFor({ state: 'visible' });
      await page.evaluate(selected => document.documentElement.setAttribute('data-theme', selected), theme);
      await page.evaluate(() => window.KellerAuth.openProfile());
      const trigger = page.locator('#btnWorkspaceFactoryReset');
      await trigger.waitFor({ state: 'visible' });
      await trigger.click();
      await page.locator('#workspaceFactoryResetBackdrop').waitFor({ state: 'visible' });
      const submit = page.locator('#workspaceFactoryResetSubmit');
      assert.equal(await submit.isDisabled(), true);
      await page.locator('#workspaceFactoryResetPassword').fill(password);
      await page.locator('#workspaceFactoryResetToken').fill('ZERAR_ESCRITORI');
      assert.equal(await submit.isDisabled(), true);
      await page.locator('#workspaceFactoryResetToken').fill('ZERAR_ESCRITORIO');
      assert.equal(await submit.isEnabled(), true);
      const box = await page.locator('#workspaceFactoryResetBackdrop section').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1, 'modal não pode causar overflow horizontal');
      await context.close();
    }
  }
  console.log('FACTORY RESET UI: danger modal, master visibility, typed confirmation, light/dark and desktop/mobile passed');
} finally {
  await browser.close();
  await server.stop();
}
