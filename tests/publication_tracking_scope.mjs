import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { publicationsInRecentScope, recentPublicationCutoff } from '../js/core/publication-scope.js';
import { startUiV2Session, prepareUiV2Page, switchUiV2View } from './ui_v2_helpers.mjs';

const referenceNow = new Date(2099, 0, 3, 14, 0, 0);
const history = [
  { id: 'old', publishedAt: '2099-01-01' },
  { id: 'yesterday', publishedAt: '2099-01-02' },
  { id: 'today', publishedAt: '2099-01-03' },
  { id: 'unknown' }
];
assert.equal(recentPublicationCutoff(referenceNow), '2099-01-02');
assert.deepEqual(publicationsInRecentScope(history, { now: referenceNow }).map(item => item.id), ['yesterday', 'today', 'unknown']);
assert.equal(history.length, 4, 'Aplicar a janela não pode apagar o histórico canônico.');

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(async () => {
    const format = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    window.Atrium.Store.state.intimations = [
      { id: 'recent-old', title: 'Histórico sintético', text: 'Texto curto.', publishedAt: '2000-01-01', treatmentStatus: 'untreated' },
      { id: 'recent-yesterday', title: 'Publicação sintética de ontem', text: 'Texto curto.', publishedAt: format(yesterday), treatmentStatus: 'untreated' },
      { id: 'recent-today', title: 'Publicação sintética atual', text: 'Texto curto.', publishedAt: format(today), treatmentStatus: 'untreated' }
    ];
    delete window.Atrium.Store.state.settings.publicationTrackingSince;
    window.Atrium.App.renderAll();
    window.Atrium.Store.save();
    if (!await window.Atrium.Store.flush()) throw new Error('Fixture de publicações não foi persistida.');
  });
  await switchUiV2View(page, 'inbox');
  assert.equal(await page.locator('#inboxCutoffSelect').inputValue(), '2days');
  assert.equal(await page.locator('#inboxBadge').textContent(), '2');
  assert.equal(await page.locator('[data-intimation-id="recent-old"]').count(), 0);
  await page.reload();
  await switchUiV2View(page, 'inbox');
  assert.equal(await page.locator('#inboxCutoffSelect').inputValue(), '2days', 'Reset ou recarga não pode reabrir todo o histórico.');
  await page.locator('#inboxCutoffSelect').selectOption('all');
  assert.equal(await page.locator('[data-intimation-id="recent-old"]').count(), 1);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.intimations.find(item => item.id === 'recent-old').treatmentStatus), 'untreated');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS rolling two-day publication scope, historical access and unchanged treatment');
} finally { await session.stop(); }
