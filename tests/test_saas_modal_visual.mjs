import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestServer } from './helpers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = await startTestServer();

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(server.baseUrl);

  // Force show authLoginForm so footer with authTabNewOffice is visible
  await page.evaluate(() => {
    window.KellerAuth.show('authLoginForm');
  });

  await page.waitForSelector('#authTabNewOffice', { state: 'visible' });
  await page.locator('#authTabNewOffice').click();

  await page.waitForSelector('#saasRegisterBackdrop', { state: 'visible' });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(ROOT, 'artifacts', 'saas_modal_light.png') });

  // Switch to dark theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(ROOT, 'artifacts', 'saas_modal_dark.png') });

  await browser.close();
  console.log('✓ Screenshots saved to artifacts/saas_modal_light.png and saas_modal_dark.png');
} finally {
  await server.stop();
}
