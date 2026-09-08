import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { publicationsInTrackingScope } from '../js/core/publication-scope.js';
import { startUiV2Session, prepareUiV2Page, switchUiV2View } from './ui_v2_helpers.mjs';
const history = [{ id: 'old', publishedAt: '2099-01-01' }, { id: 'pending', publishedAt: '2099-01-02' }, { id: 'unknown' }];
assert.deepEqual(publicationsInTrackingScope(history, '2099-01-02').map(p => p.id), ['pending', 'unknown']);
assert.equal(history.length, 3);
const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(() => {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    window.Atrium.Store.state.intimations = [
      { id: 'tracking-old', title: 'Histórico sintético', text: 'Texto curto.', publishedAt: '2000-01-01', treatmentStatus: 'untreated' },
      { id: 'tracking-new', title: 'Publicação sintética atual', text: 'Texto curto.', publishedAt: today, treatmentStatus: 'untreated' }
    ];
    delete window.Atrium.Store.state.settings.publicationTrackingSince;
    window.Atrium.App.renderAll();
  });
  await switchUiV2View(page, 'inbox');
  await page.locator('#publicationTrackingStart').click();
  await page.waitForFunction(() => document.getElementById('pubMetricUntreated').textContent === '1');
  assert.equal(await page.locator('[data-intimation-id="tracking-old"]').count(), 0);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.Atrium?.Store?.state?.settings?.publicationTrackingSince));
  await switchUiV2View(page, 'inbox');
  assert.equal(await page.locator('#inboxCutoffSelect').inputValue(), 'tracking');
  await page.locator('#inboxCutoffSelect').selectOption('all');
  assert.equal(await page.locator('[data-intimation-id="tracking-old"]').count(), 1);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.intimations.find(p => p.id === 'tracking-old').treatmentStatus), 'untreated');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS persistent tracking start, historical access and unchanged treatment');
} finally { await session.stop(); }
