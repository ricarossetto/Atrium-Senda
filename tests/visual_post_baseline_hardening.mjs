import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareUiV2LeadsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const OUTPUT = process.env.ATRIUM_REVIEW_DIR || path.join(os.tmpdir(), 'atrium-post-baseline-human-review');
fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

async function capture(page, name) {
  const file = path.join(OUTPUT, name);
  await page.screenshot({ path: file, fullPage: false });
  hashes.add(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
}

try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await page.waitForFunction(() => document.getElementById('systemStatusBar')?.classList.contains('is-transient-hidden'));
    assert.equal(await page.locator('#systemStatusBar').getAttribute('class').then(value => value.includes('is-transient-hidden')), true, 'O status positivo deve se recolher após a confirmação.'); assertions++;
    await page.locator('#notificationButton').click();
    await page.locator('#notificationPanel:not(.hidden)').waitFor();
    assert.equal(await page.locator('#notificationButton').getAttribute('aria-expanded'), 'true'); assertions++;
    assert.match(await page.locator('#notificationPanel').textContent(), /Notificações|Tudo acompanhado|publicaç/i); assertions++;
    await capture(page, '18-sidebar-expanded.png');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#notificationButton').getAttribute('aria-expanded'), 'false'); assertions++;

    await page.locator('#sidebarToggleBtn').click();
    await page.locator('#sidebar.collapsed').waitFor();
    const collision = await page.evaluate(() => {
      const brand = document.querySelector('.brand')?.getBoundingClientRect();
      const toggle = document.getElementById('sidebarToggleBtn')?.getBoundingClientRect();
      return brand && toggle ? Math.max(0, Math.min(brand.right, toggle.right) - Math.max(brand.left, toggle.left)) : 0;
    });
    assert.ok(collision < 10, `Logo e controle recolhido não podem se sobrepor materialmente (${collision}px).`); assertions++;
    await capture(page, '19-sidebar-collapsed.png');

    await page.evaluate(() => { window.Atrium.App.openGuidedTour(true); window.Atrium.App.showTourSlide(5); });
    await page.locator('.tour-slide.active[data-slide="5"]').waitFor();
    assert.equal(await page.locator('#tourNextButton').textContent(), 'Começar a usar o Atrium'); assertions++;
    assert.doesNotMatch(await page.locator('#tourNextButton').textContent(), /🚀/); assertions++;
    await capture(page, '02-onboarding-final-screen.png');
    assert.deepEqual(pageErrors, []); assertions++;
  } finally { await context.close(); }

  const crmContext = await session.createContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(crmContext, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2LeadsFixture(page);
    await page.evaluate(() => {
      window.Atrium.Store.state.contacts = [{ id: 'contact-review', name: 'Cliente Sintética Existente', mobile: '(00) 90000-0000', email: 'cliente@example.invalid' }];
    });
    await page.locator('#newLeadButton').click();
    assert.equal(await page.locator('#field-client').getAttribute('role'), 'combobox'); assertions++;
    assert.equal(await page.locator('#field-client-suggestions option').count(), 1); assertions++;
    await capture(page, '16-crm-new-opportunity.png');
    assert.deepEqual(pageErrors, []); assertions++;
  } finally { await crmContext.close(); }

  assert.equal(hashes.size, 4); assertions++;
  console.log(`✓ Pós-baseline visual: 4/4 estados novos, ${hashes.size}/4 hashes, ${assertions}/${assertions} asserções; saída ${OUTPUT}`);
} finally {
  await session.stop();
}
