import { chromium } from 'playwright';
import { startTestServer } from '../tests/helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(server.baseUrl);
await page.evaluate(() => {
  window.Atrium.App.openGuidedTour(true);
});
await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();

const outputDir = path.resolve('artifacts/visual-qa/onboarding-check');
fs.mkdirSync(outputDir, { recursive: true });

const modal = page.locator('.guided-tour-modal');

// Dark theme
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
});
for (let i = 0; i < 6; i++) {
  await page.evaluate((slide) => {
    window.Atrium.App.showTourSlide(slide);
  }, i);
  await page.waitForTimeout(450);
  await modal.screenshot({ path: path.join(outputDir, `slide-${i}-dark.png`) });
}

// Light theme
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
});
for (let i = 0; i < 6; i++) {
  await page.evaluate((slide) => {
    window.Atrium.App.showTourSlide(slide);
  }, i);
  await page.waitForTimeout(450);
  await modal.screenshot({ path: path.join(outputDir, `slide-${i}-light.png`) });
}

console.log('ALL 12 SCREENSHOTS CAPTURED SUCCESSFULLY in ' + outputDir);
await browser.close();
await server.stop();
