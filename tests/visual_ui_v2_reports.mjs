import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-reports');
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
        await page.evaluate(() => {
          const { App, Store } = window.Atrium;
          Store.state.tasks = [
            { id: 'rel-a', title: 'Agravo de Instrumento sintético', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste', taskDefinition: 'Agravo de Instrumento', points: 25, createdAt: '2026-02-08T12:00:00.000Z', completedAt: '2026-02-10T12:00:00.000Z', deadline: '2026-02-09', client: 'Cliente Relatório A', process: '5001111-61.2026.8.21.0001', timeLogs: [{ minutes: 60 }] },
            { id: 'rel-a-2', title: 'Minuta sintética', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste', taskDefinition: 'Minuta', points: 5, createdAt: '2026-03-07T12:00:00.000Z', completedAt: '2026-03-08T12:00:00.000Z', timeLogs: [] },
            { id: 'rel-b', title: 'Recurso Especial sintético', status: 'concluida', responsible: 'Equipe B', completedBy: 'Advogado Colaborador', taskDefinition: 'Recurso Especial', points: 10, createdAt: '2026-03-05T12:00:00.000Z', completedAt: '2026-03-06T12:00:00.000Z', client: 'Cliente Relatório B', timeLogs: [] },
            { id: 'rel-open', title: 'Prazo aberto sintético', status: 'andamento', responsible: 'Equipe A', points: 5, deadline: '2026-04-01', timeLogs: [] }
          ];
          Store.state.configuration.users = [{ name: 'Equipe A', pointsGoal: 100 }, { name: 'Equipe B', pointsGoal: 50 }];
          App.switchView('reports');
        });
        await page.locator('#view-reports.active').waitFor();
        await page.locator('#reportsWorkspace .reports-kpis').waitFor();
        await page.selectOption('[data-report-filter="period"]', 'custom');
        await page.fill('[data-report-filter="dateFrom"]', '2026-01-01');
        await page.fill('[data-report-filter="dateTo"]', '2026-12-31');
        await page.locator('#reportsCompletionsHeading').waitFor();

        const layout = await page.evaluate(() => {
          const workspace = document.getElementById('reportsWorkspace')?.getBoundingClientRect();
          const toolbar = document.querySelector('.reports-toolbar')?.getBoundingClientRect();
          const kpis = [...document.querySelectorAll('.reports-kpi')];
          return {
            ui: document.documentElement.dataset.ui,
            theme: document.documentElement.getAttribute('data-theme') || 'dark',
            activeReports: document.getElementById('view-reports')?.classList.contains('active'),
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            workspace: workspace && { left: workspace.left, right: workspace.right },
            toolbarHeight: toolbar?.height || 0,
            kpiCount: kpis.length,
            clippedKpis: kpis.filter(card => card.scrollWidth > card.clientWidth + 2).length,
            sortButtons: document.querySelectorAll('[data-report-sort]').length,
            labelsWrapped: [...document.querySelectorAll('.reports-filter')].every(label => label.querySelector('select, input')),
            duplicateIds: (() => {
              const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
              return ids.filter((id, index) => ids.indexOf(id) !== index);
            })(),
            unexpectedOverlay: [...document.querySelectorAll('.modal-backdrop:not(.hidden), #guidedTourBackdrop:not(.hidden)')].length
          };
        });

        assert.equal(layout.ui, 'v2'); assertions++;
        assert.equal(layout.theme, theme); assertions++;
        assert.equal(layout.activeReports, true); assertions++;
        assert.ok(layout.pageOverflow <= 2, `Overflow global em ${theme} ${config.name}: ${layout.pageOverflow}px.`); assertions++;
        assert.ok(layout.workspace && layout.workspace.left >= -2 && layout.workspace.right <= config.width + 2, `Workspace fora do viewport em ${theme} ${config.name}.`); assertions++;
        assert.ok(layout.toolbarHeight > 0, `Toolbar invisível em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.kpiCount, 6, `KPIs incompletos em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.clippedKpis, 0, `KPIs cortados em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.sortButtons, 3, `Colunas ordenáveis ausentes em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.labelsWrapped, true, `Filtros sem label em ${theme} ${config.name}.`); assertions++;
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

  console.log(`- Hashes V2 únicos: ${hashes.size}`);
  console.log(`- Asserções V2: ${assertions}/${assertions}`);
  console.log(`- Artefatos V2: ${OUTPUT}`);
  assert.equal(screenshots, 8, 'Deve haver exatamente 8 capturas (light/dark × 4 viewports).');
  console.log('\n>>> VISUAL UI V2 REPORTS: PASS <<<\n');
} finally {
  await session.stop();
}
