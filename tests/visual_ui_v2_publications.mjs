import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-publications');
const SCENARIOS = [
  { file: '01-light-1440-list.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '02-dark-1440-list.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '03-light-1440-inspector.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'inspector' },
  { file: '04-dark-1440-inspector.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'inspector' },
  { file: '05-light-1280-untreated.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'untreated' },
  { file: '06-dark-1280-treated.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'treated' },
  { file: '07-light-390-list.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'list' },
  { file: '08-dark-390-inspector.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'inspector' }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2PublicationsFixture(page);

      if (scenario.state === 'untreated' || scenario.state === 'treated') {
        await page.locator(`#inboxFilters [data-filter="${scenario.state}"]`).click();
        await page.waitForFunction(filter => document.querySelector(`#inboxFilters [data-filter="${filter}"]`)?.getAttribute('aria-pressed') === 'true', scenario.state);
      } else if (scenario.state === 'inspector') {
        await page.locator('[data-intimation-id="ui-v2-publication-review"] .publication-record-open').click();
        await page.locator('#view-inbox.publication-detail-open').waitFor();
        await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
        if (scenario.viewport.width === 390) {
          await page.evaluate(() => {
            const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-review');
            item.treatmentStartedBy = 'Advogada Revisora Sintética com nome extenso para conferência de geometria do banner';
            item.treatmentNote = 'Nota sintética com conteúdo extenso para validar a quebra sem recortar a data nem o nome da pessoa.';
            window.Atrium.App.renderIntimationDetail();
          });
        }
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-inbox, #intimationDetail')]
        .flatMap(element => element.getAnimations({ subtree: true }))
        .every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(state => {
        const view = document.getElementById('view-inbox');
        const queue = document.querySelector('.inbox-list-card').getBoundingClientRect();
        const workspace = document.querySelector('.inbox-layout').getBoundingClientRect();
        const detail = document.getElementById('intimationDetail');
        const rect = detail.getBoundingClientRect();
        const detailStyle = getComputedStyle(detail);
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return {
          active: view.classList.contains('active'),
          filter: [...document.querySelectorAll('#inboxFilters [data-filter]')].find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter,
          recordCount: document.querySelectorAll('#inboxList [data-intimation-id]').length,
          queueRatio: queue.width / workspace.width,
          open: view.classList.contains('publication-detail-open'),
          detailVisible: detailStyle.visibility !== 'hidden'
            && detailStyle.display !== 'none'
            && Number(detailStyle.opacity) > 0,
          detailBounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight },
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          hasCanonicalDetail: detail.textContent.includes('Conteúdo sintético integral da decisão em análise.') && detail.textContent.includes('Advogada Revisora Sintética'),
          state
        };
      }, scenario.state);
      assert.equal(layout.active, true); assertions++;
      assert.ok(layout.queueRatio >= .98); assertions++;
      assert.ok(layout.overflow <= 2); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      if (scenario.state === 'list') {
        assert.equal(layout.filter, 'all'); assertions++;
        assert.equal(layout.recordCount, 4); assertions++;
        assert.equal(layout.open, false); assertions++;
        assert.equal(layout.detailVisible, false); assertions++;
      } else if (scenario.state === 'inspector') {
        assert.equal(layout.open, true); assertions++;
        assert.equal(layout.detailVisible, true); assertions++;
        assert.equal(layout.hasCanonicalDetail, true); assertions++;
        assert.ok(layout.detailBounds.left >= -2 && layout.detailBounds.right <= layout.detailBounds.width + 2); assertions++;
        assert.ok(layout.detailBounds.top >= -2 && layout.detailBounds.bottom <= layout.detailBounds.height + 2); assertions++;
      } else {
        assert.equal(layout.filter, scenario.state); assertions++;
        assert.ok(layout.recordCount >= 1); assertions++;
        assert.equal(layout.open, false); assertions++;
      }
      if (scenario.state === 'inspector' && scenario.viewport.width === 390) {
        const banner = await page.locator('#intimationDetail .treatment-info-banner > div').evaluate(element => {
          const parent = element.getBoundingClientRect();
          const children = [...element.children].map(child => {
            const box = child.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, text: child.textContent };
          });
          return { left: parent.left, right: parent.right, children };
        });
        assert.match(banner.children[0].text, /Advogada Revisora Sintética com nome extenso/); assertions++;
        assert.ok(banner.children.every(box => box.left >= banner.left - 1 && box.right <= banner.right + 1)); assertions++;
        for (let index = 1; index < banner.children.length; index++) {
          assert.ok(banner.children[index].top >= banner.children[index - 1].bottom - 1, 'Ator, data e nota não podem colidir no banner mobile'); assertions++;
        }
      }
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length);
  let matrixShots = 0;
  for (const density of ['basic', 'pro']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 1280, 1024, 390]) {
        const context = await session.createContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        try {
          await context.addInitScript(value => localStorage.setItem('atrium_ui_density', value), density);
          await context.route('**/api/ai-classifier/status', route => route.fulfill({ json: { enabled: true, available: true } }));
          await context.route('**/api/ai-classifier/suggestions', route => route.fulfill({ json: { enabled: true, suggestions: {} } }));
          let suggestionRoute;
          let playbookRoute;
          let correctionRoute;
          let suggestionRequests = 0;
          let playbookRequests = 0;
          await context.route('**/api/ai-classifier/suggest', route => { suggestionRequests++; suggestionRoute = route; });
          await context.route('**/api/ai-classifier/publication-playbook?*', route => { playbookRequests++; playbookRoute = route; });
          await context.route('**/api/ai-classifier/correct', route => { correctionRoute = route; });
          const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
          await prepareUiV2PublicationsFixture(page);
          await page.evaluate(() => {
            const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-review');
            item.text = 'Conteúdo oficial sintético com uma palavra longa: ' + 'DocumentoSintetico'.repeat(20) + '\n' + 'Parágrafo oficial preservado para leitura antes das providências.\n'.repeat(12);
          });
          await page.locator('[data-intimation-id="ui-v2-publication-review"] .publication-record-open').click();
          await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
          // Área e prioridade e contagem começam recolhidas; abrem pelo resumo.
          assert.equal(await page.locator('[data-fold="classifier"]').evaluate(fold => fold.open), false); assertions++;
          assert.equal(await page.locator('[data-fold="conference"]').evaluate(fold => fold.open), false); assertions++;
          assert.match(await page.locator('[data-fold="classifier"] > summary').innerText(), /Gerando sugestão/); assertions++;
          await page.locator('[data-fold="classifier"] > summary').click();
          await page.locator('[data-fold="conference"] > summary').click();
          await page.locator('#intimationDetail .ai-classifier-panel').filter({ hasText: 'Gerando sugestão' }).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.dataset.uiDensity), density); assertions++;
          await page.locator('[data-conference-days]').fill('23');
          assert.ok(playbookRoute && suggestionRoute); assertions++;
          const playbookRendered = page.waitForFunction(() => document.querySelector('[data-playbook-block]')?.textContent.includes('Modelo sintético'));
          await playbookRoute.fulfill({ json: { intimationId: 'ui-v2-publication-review', act: 'Ato sintético', items: [{ label: 'Modelo sintético', definition: { name: 'Modelo sintético', area: 'Cível', points: 1 } }] } });
          await playbookRendered;
          assert.equal(await page.locator('[data-conference-days]').inputValue(), '23'); assertions++;
          assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-conference-days')), true); assertions++;
          await page.locator('#intimationDetail .ai-classifier-panel').evaluate(element => element.scrollIntoView({ block: 'center' }));
          const prefix = `matrix-${density}-${theme}-${width}`;
          await page.screenshot({ path: path.join(OUTPUT, `${prefix}-loading.png`) }); matrixShots++;
          await suggestionRoute.fulfill({ json: { suggestion: { action: 'suggest', confidence: .9, suggestion: { area: { label: 'civil', confidence: .9 }, priority: { label: 'alta', confidence: .9 } } } } });
          await page.locator('.ai-classifier-actions [data-ai-classifier-action="correct"]').first().waitFor();
          assert.equal(await page.locator('[data-fold="conference"]').evaluate(fold => fold.open), true, 'a seção aberta sobrevive ao rerender'); assertions++;
          assert.equal(await page.locator('[data-conference-days]').inputValue(), '23'); assertions++;
          assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-conference-days')), true); assertions++;
          const geometry = await page.evaluate(() => {
            const original = document.querySelector('.publication-original');
            const tasks = document.querySelector('#intimationDetail .linked-tasks-card');
            const meta = document.querySelector('.publication-detail-meta');
            const group = document.querySelector('.ai-classifier-actions');
            return {
              // Texto oficial vem primeiro desde a 6.63.1: quem abre a publicação lê o ato antes dos metadados.
              order: Boolean(original.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(original.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING),
              overflow: document.documentElement.scrollWidth - innerWidth,
              wrap: getComputedStyle(group).flexWrap,
              actions: [...group.querySelectorAll('button')].map(button => {
                const box = button.getBoundingClientRect();
                const label = button.querySelector('span').getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height, labelLeft: label.left, labelRight: label.right };
              })
            };
          });
          assert.equal(geometry.order, true); assertions++;
          assert.equal(geometry.wrap, 'wrap'); assertions++;
          assert.ok(geometry.overflow <= 2); assertions++;
          assert.equal(geometry.actions.length, 3); assertions++;
          for (const action of geometry.actions) {
            assert.ok(action.left >= -1 && action.right <= width + 1 && action.labelLeft >= action.left && action.labelRight <= action.right + 1); assertions++;
            if (width === 390) { assert.ok(action.height >= 44); assertions++; }
          }
          for (let index = 1; index < geometry.actions.length; index++) {
            const previous = geometry.actions[index - 1];
            const current = geometry.actions[index];
            assert.ok(current.top >= previous.bottom - 1 || current.left >= previous.right - 1 && Math.abs(current.top - previous.top) <= 1 && Math.abs(current.height - previous.height) <= 1, JSON.stringify({ density, theme, width, previous, current })); assertions++;
          }
          await page.locator('#intimationDetail .ai-classifier-panel').evaluate(element => element.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: path.join(OUTPUT, `${prefix}-ready.png`) }); matrixShots++;
          await page.locator('[data-ai-classifier-action="correct"][data-ai-classifier-question="area"]').click();
          await page.locator('[data-ai-classifier-question="area"][data-ai-classifier-label="civil"]').focus();
          await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
          assert.equal(await page.evaluate(() => document.activeElement?.dataset.aiClassifierLabel), 'civil'); assertions++;
          assert.equal(await page.evaluate(() => document.activeElement?.dataset.aiClassifierQuestion), 'area'); assertions++;
          await page.locator('[data-ai-classifier-label="outro"]').click();
          await page.locator('#aiClassifierCustomAreaInput').fill('Área sintética em edição');
          await page.locator('#aiClassifierCustomAreaInput').evaluate(element => element.setSelectionRange(5, 14));
          const scrollBefore = await page.locator('#intimationDetail').evaluate(element => element.scrollTop);
          await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
          assert.equal(await page.locator('#intimationDetail').evaluate(element => element.scrollTop), scrollBefore); assertions++;
          assert.equal(await page.locator('#aiClassifierCustomAreaInput').inputValue(), 'Área sintética em edição'); assertions++;
          assert.equal(await page.evaluate(() => document.activeElement?.id), 'aiClassifierCustomAreaInput'); assertions++;
          assert.deepEqual(await page.locator('#aiClassifierCustomAreaInput').evaluate(element => [element.selectionStart, element.selectionEnd]), [5, 14]); assertions++;
          const pendingCorrection = page.waitForRequest('**/api/ai-classifier/correct');
          await page.locator('[data-ai-classifier-action="custom-save"]').click();
          await pendingCorrection;
          await page.locator('#aiClassifierCustomAreaInput').focus();
          await page.evaluate(() => window.Atrium.App.renderIntimationDetail());
          assert.equal(await page.locator('#aiClassifierCustomAreaInput').inputValue(), 'Área sintética em edição'); assertions++;
          assert.equal(await page.evaluate(() => document.activeElement?.id), 'aiClassifierCustomAreaInput'); assertions++;
          await correctionRoute.fulfill({ status: 422, json: { message: 'Falha sintética de correção' } });
          await page.locator('.toast').filter({ hasText: 'Falha sintética de correção' }).waitFor();
          await page.locator('#intimationDetail .ai-classifier-panel').evaluate(element => element.scrollIntoView({ block: 'center' }));
          await page.screenshot({ path: path.join(OUTPUT, `${prefix}-correction.png`) }); matrixShots++;
          await page.evaluate(() => {
            const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-review');
            item.text = ''; item.sourceText = ''; item.description = '';
            window.Atrium.App.renderIntimationDetail();
          });
          assert.equal(await page.locator('.original-text').textContent(), 'Sem texto original.'); assertions++;
          await page.locator('.publication-original').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(OUTPUT, `${prefix}-empty.png`) }); matrixShots++;
          assert.equal(suggestionRequests, 1); assertions++;
          assert.equal(playbookRequests, 1); assertions++;
          assert.deepEqual(pageErrors, []); assertions++;
        } finally { await context.close(); }
      }
    }
  }
  console.log(`Matriz Basic/PRO × light/dark × 1440/1280/1024/390: ${matrixShots} screenshots, loading/ready/correction/empty; foco e formulário preservados.`);
  console.log('======================================================');
  console.log('✓ UI V2 PUBLICAÇÕES VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
