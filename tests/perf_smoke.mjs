import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — SMOKE DE ESTABILIDADE E PERFORMANCE (UI V2)         ');
console.log('===============================================================\n');

const VIEWS = ['dashboard', 'inbox', 'processes', 'kanban', 'agenda', 'contacts', 'financial', 'documents', 'configuration'];
const BUDGET = {
  loadMs: 25_000,
  viewSwitchMs: 4_000,
  domNodes: 40_000,
  duplicates: 0
};

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2PublicationsFixture(page);

  const navigation = await page.evaluate(() => {
    const timing = performance.getEntriesByType('navigation')[0];
    return timing
      ? { domContentLoaded: Math.round(timing.domContentLoadedEventEnd), load: Math.round(timing.loadEventEnd || timing.duration) }
      : { domContentLoaded: 0, load: 0 };
  });
  const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
  console.log(`Carga inicial: DOMContentLoaded ${navigation.domContentLoaded}ms · load ${navigation.load}ms · ${domNodes} nós DOM`);
  assert.ok(navigation.load < BUDGET.loadMs, `Carga inicial acima do orçamento (${navigation.load}ms).`);
  assert.ok(domNodes < BUDGET.domNodes, `DOM acima do orçamento (${domNodes} nós).`);

  const measurements = [];
  for (const view of VIEWS) {
    const startedAt = Date.now();
    await page.evaluate(target => window.Atrium.App.switchView(target), view);
    await page.locator(`#view-${view}.active`).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.view.active')]
      .flatMap(element => element.getAnimations({ subtree: true }))
      .every(animation => animation.playState === 'finished'));
    const duration = Date.now() - startedAt;
    measurements.push({ view, duration });
    assert.ok(duration < BUDGET.viewSwitchMs, `Troca para ${view} acima do orçamento (${duration}ms).`);
  }
  for (const measurement of measurements) console.log(`Troca de view ${measurement.view.padEnd(14)} ${measurement.duration}ms`);

  const integrity = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return {
      duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
      overflow: document.documentElement.scrollWidth - innerWidth,
      activeViews: document.querySelectorAll('.view.active').length
    };
  });
  assert.deepEqual(integrity.duplicates, [], 'IDs duplicados encontrados na árvore ativa.');
  assert.ok(integrity.overflow <= 2, `Overflow global de ${integrity.overflow}px.`);
  assert.equal(integrity.activeViews, 1, 'Somente uma view pode estar ativa por vez.');
  assert.deepEqual(pageErrors, [], 'Erros de página no console.');
  console.log('Integridade: sem IDs duplicados, sem overflow global, uma view ativa, console limpo.');

  console.log('\n>>> SMOKE DE PERFORMANCE: PASS <<<\n');
  await context.close();
} finally {
  await session.stop();
}
