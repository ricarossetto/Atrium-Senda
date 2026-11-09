import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2MonitoringFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-monitoring');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-monitoring.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'workspace' },
  { file: '02-dark-1440x900-monitoring.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'workspace' },
  { file: '03-light-1280x800-mixed-health.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'workspace' },
  { file: '04-dark-1280x800-no-last-check.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'no-check' },
  { file: '05-light-1440x900-primary-term-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'term' },
  { file: '06-dark-1280x800-document-term-drawer.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'document-term' },
  { file: '07-light-1280x800-source-drawer.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'source' },
  { file: '08-dark-1280x800-datajud-drawer.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'datajud' },
  { file: '09-light-390x844-mobile-monitoring.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'workspace' },
  { file: '10-dark-390x844-mobile-monitoring.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'workspace' },
  { file: '11-light-390x844-mobile-sources.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'source-list' },
  { file: '12-dark-390x844-mobile-config-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'source' },
  { file: '13-light-1440x900-djen-capture-errors.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'capture-errors' },
  { file: '14-dark-1280x800-djen-capture-errors.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'capture-errors' },
  { file: '15-light-390x844-djen-capture-errors-mobile.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'capture-errors' },
  { file: '16-light-1024x768-djen-capture-errors-long.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'capture-errors-long' }
];

const CAPTURE_QUEUE = {
  version: 1,
  updatedAt: '2026-09-20T07:00:00.000Z',
  lastRun: { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled', termCount: 4, failedCount: 1 },
  terms: [{
    termId: 'term-falha-a',
    oabUf: 'RS',
    oabNumber: '000123',
    name: 'Advogada Mineral Sintética',
    registration: 'OAB/RS 000123',
    message: 'DJEN limitou requisições (HTTP 429). Tente novamente em instantes.',
    attempts: 2,
    firstFailedAt: '2026-09-19T19:00:00.000Z',
    lastFailedAt: '2026-09-20T07:00:00.000Z'
  }]
};

const CAPTURE_QUEUE_LONG = {
  version: 1,
  updatedAt: '2026-09-20T07:00:00.000Z',
  lastRun: { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled', termCount: 6, failedCount: 3 },
  terms: [
    {
      termId: 'term-falha-longa-a',
      oabUf: 'RS',
      oabNumber: '000123',
      name: 'Advogada Responsável por Contencioso Estratégico de Alta Complexidade Sintética',
      registration: 'OAB/RS 000123',
      message: 'A fonte oficial respondeu com erro intermitente após múltiplas tentativas de paginação; a coleta permanece parcial e será reconsultada integralmente.',
      attempts: 12,
      firstFailedAt: '2026-09-10T07:00:00.000Z',
      lastFailedAt: '2026-09-20T07:00:00.000Z'
    },
    {
      termId: 'term-falha-longa-b',
      oabUf: 'SC',
      oabNumber: '000456',
      name: 'Advogado Teste B',
      registration: 'OAB/SC 000456',
      message: 'coleta parcial',
      attempts: 3,
      firstFailedAt: '2026-09-18T19:00:00.000Z',
      lastFailedAt: '2026-09-19T19:00:00.000Z'
    },
    {
      termId: 'term-falha-longa-c',
      oabUf: 'SP',
      oabNumber: '000789',
      name: 'Advogada Teste C',
      registration: 'OAB/SP 000789',
      message: 'Tempo limite excedido ao consultar a página 3 de 7.',
      attempts: 1,
      firstFailedAt: '2026-09-19T19:00:00.000Z',
      lastFailedAt: '2026-09-19T19:00:00.000Z'
    }
  ]
};

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
const captureQueueFile = path.join(session.server.dataDirectory, 'djen-capture-errors.json');
function seedCaptureErrors(queue) {
  if (!queue) { fs.rmSync(captureQueueFile, { force: true }); return; }
  fs.writeFileSync(captureQueueFile, JSON.stringify(queue, null, 2), 'utf8');
}
try {
  for (const scenario of SCENARIOS) {
    const expectsPanel = scenario.state.startsWith('capture-errors');
    seedCaptureErrors(scenario.state === 'capture-errors' ? CAPTURE_QUEUE : scenario.state === 'capture-errors-long' ? CAPTURE_QUEUE_LONG : null);
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2MonitoringFixture(page);
      if (expectsPanel) {
        await page.locator('#djenCaptureErrorsCard:not([hidden])').waitFor();
        await page.locator('#djenCaptureErrorsCard').scrollIntoViewIfNeeded();
      }

      if (scenario.state === 'no-check') {
        await page.evaluate(() => {
          const { App, Store } = window.Atrium;
          Store.state.sources.forEach(source => { source.lastCheck = null; });
          App.renderMonitoring();
        });
      }
      if (scenario.state === 'term') await page.locator('#primaryTermCard').click();
      if (scenario.state === 'document-term') {
        await page.locator('#newTermButton').click();
        await page.locator('#field-type').selectOption('document');
      }
      if (scenario.state === 'source') await page.locator('[data-source-id="generic-source"]').click();
      if (scenario.state === 'datajud') await page.locator('[data-source-id="datajud-cnj"]').click();
      if (scenario.state === 'source-list') await page.locator('.source-table').scrollIntoViewIfNeeded();
      if (['term', 'document-term', 'source', 'datajud'].includes(scenario.state)) {
        await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-monitoring, #modalBackdrop')]
        .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const sheet = document.querySelector('#modalBackdrop:not(.hidden) .modal');
        const sheetRect = sheet?.getBoundingClientRect();
        const rows = [...document.querySelectorAll('#monitorSourceList .monitor-v2-source-row')];
        const interactive = [...document.querySelectorAll('#view-monitoring button, #view-monitoring [role="button"], #modalBackdrop:not(.hidden) button')]
          .filter(element => element.getClientRects().length);
        return {
          active: document.getElementById('view-monitoring').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          rowOverflow: rows.filter(row => row.scrollWidth - row.clientWidth > 2).length,
          sourceRows: rows.length,
          sheet: sheetRect ? {
            left: sheetRect.left, right: sheetRect.right, top: sheetRect.top, bottom: sheetRect.bottom,
            width: innerWidth, height: innerHeight, overflow: sheet.scrollWidth - sheet.clientWidth
          } : null,
          undersized: innerWidth <= 560 ? interactive.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.getAttribute('aria-label') || element.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.equal(layout.rowOverflow, 0, `${scenario.file}: source row com overflow horizontal.`); assertions++;
      assert.equal(layout.sourceRows, 5); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.sheet) {
        assert.ok(layout.sheet.left >= -2 && layout.sheet.right <= layout.sheet.width + 2, `${scenario.file}: sheet horizontal.`); assertions++;
        assert.ok(layout.sheet.top >= -2 && layout.sheet.bottom <= layout.sheet.height + 2, `${scenario.file}: sheet vertical.`); assertions++;
        assert.ok(layout.sheet.overflow <= 2, `${scenario.file}: sheet com overflow horizontal.`); assertions++;
      }

      const panel = await page.evaluate(() => {
        const card = document.getElementById('djenCaptureErrorsCard');
        if (!card) return null;
        const rows = [...card.querySelectorAll('.djen-capture-error-row')];
        const buttons = [...card.querySelectorAll('button')].filter(button => button.getClientRects().length);
        return {
          hidden: card.hidden,
          rows: rows.length,
          count: document.getElementById('djenCaptureErrorsCount').textContent.trim(),
          detail: document.getElementById('djenCaptureErrorsDetail').textContent.trim(),
          rowOverflow: rows.filter(row => row.scrollWidth - row.clientWidth > 2).length,
          undersized: innerWidth <= 560 ? buttons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });
      assert.equal(panel.hidden, !expectsPanel, `${scenario.file}: visibilidade do painel de falhas de captura.`); assertions++;
      if (expectsPanel) {
        const expectedRows = scenario.state === 'capture-errors-long' ? 3 : 1;
        assert.equal(panel.rows, expectedRows, `${scenario.file}: linhas da fila de falhas.`); assertions++;
        assert.equal(panel.count, String(expectedRows), `${scenario.file}: contador do painel.`); assertions++;
        assert.match(panel.detail, /captura de publicações/); assertions++;
        assert.equal(panel.rowOverflow, 0, `${scenario.file}: linha de falha com overflow horizontal.`); assertions++;
        assert.deepEqual(panel.undersized, [], `${scenario.file}: alvo de toque subdimensionado no painel.`); assertions++;
      }
      if (expectsPanel && scenario.viewport.width >= 1280) {
        await page.locator('#djenCaptureErrorsRetryAll').focus();
        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return { retryId: element?.dataset?.retryTermId || '', outlineStyle: style.outlineStyle };
        });
        assert.equal(focus.retryId, 'term-falha-a', `${scenario.file}: Tab deve alcançar o retry individual.`); assertions++;
        assert.notEqual(focus.outlineStyle, 'none', `${scenario.file}: foco visível no retry individual.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, `Os ${SCENARIOS.length} estados visuais de Monitoring devem produzir hashes distintos.`);
  console.log('======================================================');
  console.log('✓ UI V2 MONITORING VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
