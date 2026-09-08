import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { startUiV2Session, prepareUiV2Page, switchUiV2View } from './ui_v2_helpers.mjs';
const session = await startUiV2Session();
try {
 const context = await session.createContext();
 const {page, pageErrors} = await prepareUiV2Page(context, session.server.baseUrl);
 await page.evaluate(() => {
  window.Atrium.Store.state.contacts = Array.from({length: 65}, (_,i) => ({id:`scroll-${i}`, name:`Contato Sintético ${String(i).padStart(2,'0')}`, contactRole:'cliente'}));
  window.Atrium.App.renderAll();
 });
 await switchUiV2View(page,'contacts');
 for (const theme of ['light','dark']) {
  await page.evaluate(t => document.documentElement.dataset.theme=t,theme);
  for (const width of [1538,1152,390]) {
   await page.setViewportSize({width,height:900});
   const geometry = await page.locator('.contact-record-list').evaluate(el => ({scroll:el.scrollHeight,client:el.clientHeight,overflow:getComputedStyle(el).overflowY}));
   assert.equal(geometry.overflow,'visible');
   assert.ok(geometry.scroll <= geometry.client + 1);
   const last = page.locator('[data-contact-id="scroll-64"]');
   await last.scrollIntoViewIfNeeded();
   assert.ok(await last.isVisible());
   assert.equal(await page.locator('.contact-record-list').evaluate(el => el.scrollTop),0);
   await last.click();
   await page.locator('#contactInspector.is-open').waitFor();
   await page.locator('[data-contact-inspector-close]').click();
  }
 }
 assert.deepEqual(pageErrors,[]);
 await context.close();
 console.log('PASS contacts page scrolling, 65 rows, themes, desktop/mobile and inspector');
} finally {await session.stop();}
