import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-dashboard');
const CONFIGS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let screenshots = 0;
let assertions = 0;

function answersInside(inner, outer) {
  return inner.x >= outer.x - 2 && inner.y >= outer.y - 2
    && inner.x + inner.width <= outer.x + outer.width + 2
    && inner.y + inner.height <= outer.y + outer.height + 2;
}

function recordScreenshot(file) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hashes.has(hash), false, `Screenshot V2 duplicado: ${path.basename(file)}.`);
  hashes.add(hash);
  screenshots++;
  return hash;
}

try {
  for (const theme of ['light', 'dark']) {
    for (const config of CONFIGS) {
      const context = await session.createContext({ viewport: { width: config.width, height: config.height } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await page.waitForTimeout(180);
        const layout = await page.evaluate(() => {
          const opening = document.getElementById('v2DashboardOpening')?.getBoundingClientRect();
          const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
          const search = document.querySelector('.global-search')?.getBoundingClientRect();
          const status = document.getElementById('systemStatusBar')?.getBoundingClientRect();
          const cards = [...document.querySelectorAll('#view-dashboard :is(.v2-attention-item, .metric-card, .dashboard-insight-card, .dashboard-widget)')];
          return {
            ui: document.documentElement.dataset.ui,
            theme: document.documentElement.getAttribute('data-theme') || 'dark',
            activeDashboard: document.getElementById('view-dashboard')?.classList.contains('active'),
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            opening: opening && { left: opening.left, right: opening.right, top: opening.top, width: opening.width },
            topbarHeight: topbar?.height || 0,
            searchVisible: Boolean(search && search.width > 0 && search.height >= 40),
            statusVisible: Boolean(status && status.width > 0 && status.height > 0),
            clippedCards: cards.filter(card => card.scrollWidth > card.clientWidth + 2).length,
            insightCards: document.querySelectorAll('#dashboardActionableInsights .dashboard-insight-card').length,
            duplicateIds: (() => {
              const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
              return ids.filter((id, index) => ids.indexOf(id) !== index);
            })(),
            unexpectedOverlay: [...document.querySelectorAll('.modal-backdrop:not(.hidden), #guidedTourBackdrop:not(.hidden)')].length
          };
        });

        assert.equal(layout.ui, 'v2'); assertions++;
        assert.equal(layout.theme, theme); assertions++;
        assert.equal(layout.activeDashboard, true); assertions++;
        assert.ok(layout.pageOverflow <= 2, `Overflow global em ${theme} ${config.name}: ${layout.pageOverflow}px.`); assertions++;
        assert.ok(layout.opening && layout.opening.left >= -2 && layout.opening.right <= config.width + 2, `Hero fora do viewport em ${theme} ${config.name}.`); assertions++;
        assert.ok(layout.topbarHeight <= (config.width <= 390 ? 175 : 92), `Topbar excessiva em ${theme} ${config.name}: ${layout.topbarHeight}px.`); assertions++;
        assert.equal(layout.searchVisible, true, `Busca deve permanecer visível em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.statusVisible, true, `Status persistente deve estar visível em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.clippedCards, 0, `Cards com conteúdo cortado em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.insightCards, 4, `Indicadores do escritório incompleto em ${theme} ${config.name}.`); assertions++;
        assert.deepEqual(layout.duplicateIds, []); assertions++;
        assert.equal(layout.unexpectedOverlay, 0); assertions++;
        assert.deepEqual(pageErrors, [], `Pageerror em ${theme} ${config.name}: ${pageErrors.join(' | ')}`); assertions++;

        const file = path.join(OUTPUT, `${theme}-${config.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        recordScreenshot(file);
      } finally {
        await context.close();
      }
    }
  }

  const comparisonContext = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(comparisonContext, session.server.baseUrl, { theme: 'light' });
    await page.waitForTimeout(180);
    const v2Opening = await page.locator('#v2DashboardOpening').boundingBox();
    assert.ok(v2Opening && v2Opening.width > 700, 'A composição V2 deve possuir uma zona editorial dominante.'); assertions++;

    const performanceBox = await page.locator('#v2PerformancePanel').boundingBox();
    assert.ok(performanceBox && performanceBox.width > 200, 'Painel de performance deve abrir a faixa do hero.'); assertions++;
    assert.ok(performanceBox.x - v2Opening.x < 48, 'O painel de performance deve abrir a coluna esquerda da abertura.'); assertions++;
    const attentionBox = await page.locator('.v2-attention-grid').boundingBox();
    assert.ok(attentionBox && performanceBox.x + performanceBox.width <= attentionBox.x + 2, 'Painel de performance não pode sobrepor os cartões de atenção.'); assertions++;
    const hearingsBox = await page.locator('#dashboardHearingsPanel').boundingBox();
    assert.ok(hearingsBox && answersInside(hearingsBox, v2Opening), 'A pauta de audiências deve permanecer dentro da abertura.'); assertions++;
    assert.ok(attentionBox.x + attentionBox.width <= hearingsBox.x + 2, 'A pauta de audiências deve ficar à direita dos cartões.'); assertions++;
    assert.equal(await page.locator('.v2-dashboard-opening-copy, #v2AttentionSummary').count(), 0, 'A abertura não pode voltar a exibir texto de resumo.'); assertions++;

    assert.equal(await page.locator('#uiModeControl, [data-ui-mode]').count(), 0); assertions++;
    await page.locator('html').evaluate(element => { element.style.filter = 'grayscale(1)'; });
    assert.equal(await page.locator('#v2DashboardOpening').isVisible(), true); assertions++;
    const v2GrayFile = path.join(OUTPUT, 'comparison-v2-grayscale-1440x900.png');
    await page.screenshot({ path: v2GrayFile, fullPage: false });
    recordScreenshot(v2GrayFile);
    assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2'); assertions++;
    assert.deepEqual(pageErrors, [], `Comparativo Dashboard gerou pageerror: ${pageErrors.join(' | ')}`); assertions++;
  } finally {
    await comparisonContext.close();
  }

  const funnelFile = path.join(session.server.dataDirectory, 'publication-funnel-weekly.json');
  const funnelWeekStarts = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'];
  // O endpoint upserta a semana corrente na leitura; a expectativa deve derivar
  // da janela mesclada (fixture + semana atual) para não depender do calendário.
  const brtToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [todayYear, todayMonth, todayDay] = brtToday.split('-').map(Number);
  const todayUtc = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay));
  const currentMonday = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay - ((todayUtc.getUTCDay() + 6) % 7)));
  const mergedWeekStarts = [...new Set([...funnelWeekStarts, currentMonday.toISOString().slice(0, 10)])].sort();
  const expectedFunnelHeaders = ['Métrica', ...mergedWeekStarts.slice(-4).map(date => `${date.slice(8, 10)}/${date.slice(5, 7)}`)];
  fs.writeFileSync(funnelFile, JSON.stringify({
    version: 1,
    updatedAt: '2026-09-20T07:00:00.000Z',
    weeks: [
      { week: '2026-W35', weekStart: '2026-08-24', weekEnd: '2026-08-30', received: 18, treated: 15, discarded: 3, pending: 6, at: '2026-08-30T19:00:00.000Z' },
      { week: '2026-W36', weekStart: '2026-08-31', weekEnd: '2026-09-06', received: 22, treated: 19, discarded: 2, pending: 7, at: '2026-09-06T19:00:00.000Z' },
      { week: '2026-W37', weekStart: '2026-09-07', weekEnd: '2026-09-13', received: 14, treated: 12, discarded: 1, pending: 8, at: '2026-09-13T19:00:00.000Z' },
      { week: '2026-W38', weekStart: '2026-09-14', weekEnd: '2026-09-20', received: 9, treated: 6, discarded: 1, pending: 8, at: '2026-09-20T19:00:00.000Z' }
    ]
  }, null, 2), 'utf8');

  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await page.locator('#dashboardActionableInsights .dashboard-funnel-weekly').waitFor();
      await page.locator('#dashboardActionableInsights .dashboard-funnel-weekly').scrollIntoViewIfNeeded();
      const funnel = await page.evaluate(() => {
        const table = document.querySelector('#dashboardActionableInsights .dashboard-funnel-weekly table');
        const card = table?.closest('.dashboard-insight-card');
        return {
          rows: table?.querySelectorAll('tbody tr').length || 0,
          caption: table?.querySelector('caption')?.textContent.trim() || '',
          headers: [...(table?.querySelectorAll('thead th') || [])].map(cell => cell.textContent.trim()),
          cardClipped: card ? card.scrollWidth > card.clientWidth + 2 : true,
          tableOverflow: table ? table.scrollWidth - table.clientWidth : 0,
          pageOverflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      assert.equal(funnel.rows, 4, `Funil semanal deve listar 4 métricas em ${theme}.`); assertions++;
      assert.equal(funnel.caption, 'Funil semanal · últimas 4 semanas'); assertions++;
      assert.deepEqual(funnel.headers, expectedFunnelHeaders); assertions++;
      assert.equal(funnel.cardClipped, false, `Card do funil cortado em ${theme}.`); assertions++;
      assert.ok(funnel.tableOverflow <= 2, `Tabela do funil com overflow em ${theme}.`); assertions++;
      assert.ok(funnel.pageOverflow <= 2, `Overflow global com funil em ${theme}.`); assertions++;
      assert.deepEqual(pageErrors, [], `Pageerror no funil (${theme}): ${pageErrors.join(' | ')}`); assertions++;
      const funnelScreenshot = path.join(OUTPUT, `${theme}-1440x900-funnel.png`);
      await page.screenshot({ path: funnelScreenshot, fullPage: false });
      recordScreenshot(funnelScreenshot);
    } finally {
      await context.close();
    }
  }

  console.log('======================================================');
  console.log('✓ UI V2 DASHBOARD VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Screenshots V2: ${screenshots}`);
  console.log(`- Hashes V2 únicos: ${hashes.size}`);
  console.log(`- Asserções V2: ${assertions}/${assertions}`);
  console.log(`- Artefatos V2: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
