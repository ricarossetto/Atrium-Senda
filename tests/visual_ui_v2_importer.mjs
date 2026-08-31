import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ImporterFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_IMPORTER_FIXTURE
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-importer');
fs.mkdirSync(OUTPUT, { recursive: true });

const widePreview = {
  ...structuredClone(UI_V2_IMPORTER_FIXTURE),
  filename: 'relatorio-eproc-sintetico.xls',
  totalRows: 8,
  preview: Array.from({ length: 5 }, (_, index) => ({
    'Número do processo': `5000000-0${index}.2026.8.21.0001`,
    Classe: 'Procedimento jurídico sintético',
    'Autores / Clientes': `Cliente Sintético ${index + 1}`,
    Réus: 'Parte adversa exclusivamente sintética',
    Localidade: 'Comarca Sintética / Vara de Teste',
    Assunto: 'Matéria jurídica sintética para validação de contenção',
    'Último andamento': 'Movimentação longa e sintética preservada apenas para validar scroll tabular confinado.',
    Valor: `R$ ${index}.000,00`
  }))
};

const longPreview = {
  ...structuredClone(UI_V2_IMPORTER_FIXTURE),
  filename: 'cabecalhos-e-valores-muito-longos-sinteticos.csv',
  totalRows: 2,
  preview: [{
    'Cabeçalho sintético propositalmente longo para validar contenção acessível': 'Valor sintético muito longo '.repeat(10),
    'Outro cabeçalho controlado': 'Observação externa <script>não executar</script>'
  }]
};

const neutralPreview = {
  filename: 'estrutura-nao-classificada-sintetica.csv',
  totalRows: 2,
  preview: [{ Coluna: 'Dado sintético', Revisão: 'Classificação pendente' }],
  processes: [], contacts: [], tasks: []
};

const SCENARIOS = [
  { file: '01-light-1440x900-initial.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'initial' },
  { file: '02-dark-1440x900-initial.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'initial' },
  { file: '03-light-1440x900-drag-over.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'drag' },
  { file: '04-light-1440x900-mixed-preview.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'preview' },
  { file: '05-dark-1440x900-mixed-preview.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'preview' },
  { file: '06-light-1280x800-wide-eproc.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'preview', data: widePreview },
  { file: '07-dark-1280x800-long-content.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'preview', data: longPreview },
  { file: '08-light-1440x900-neutral-counts.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'preview', data: neutralPreview },
  { file: '09-light-390x844-initial.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'initial' },
  { file: '10-dark-390x844-preview.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'preview' },
  { file: '11-light-1440x900-integration-hub.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'integration' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2ImporterFixture(page, { preview: scenario.state === 'preview', data: scenario.data || UI_V2_IMPORTER_FIXTURE });
      let rootSelector = '#view-importer';
      if (scenario.state === 'drag') await page.locator('#importerDropzone').evaluate(element => element.classList.add('drag-over'));
      if (scenario.state === 'integration') {
        await page.evaluate(() => window.Atrium.App.switchView('integrations'));
        await page.locator('#view-integrations.active').waitFor();
        rootSelector = '#view-integrations';
      }
      await page.waitForFunction(selector => {
        const root = document.querySelector(selector);
        return root && root.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
      }, rootSelector);
      if (scenario.state === 'preview') {
        await page.locator('#importerPreviewCard').waitFor({ state: 'visible' });
        await page.locator('#importerPreviewCard').evaluate(element => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
        await page.evaluate(() => new Promise(resolve => {
          let previousX = scrollX;
          let previousY = scrollY;
          let stableFrames = 0;
          const observe = () => {
            const preview = document.getElementById('importerPreviewCard');
            const rect = preview?.getBoundingClientRect();
            const intersectsViewport = Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
            const scrollStable = Math.abs(scrollX - previousX) < .5 && Math.abs(scrollY - previousY) < .5;
            const animationsFinished = preview?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
            stableFrames = intersectsViewport && scrollStable && animationsFinished ? stableFrames + 1 : 0;
            previousX = scrollX;
            previousY = scrollY;
            if (stableFrames >= 4) resolve(true);
            else requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        }));
      }

      const layout = await page.evaluate(({ selector, mobile, expectPreview }) => {
        const root = document.querySelector(selector);
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const tableRegion = document.querySelector('.importer-preview-scroll');
        const critical = [...root.querySelectorAll('button, a[href]')].filter(element => element.getClientRects().length);
        return {
          active: root.classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          theme: document.documentElement.dataset.theme || 'dark',
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          rootOverflow: root.scrollWidth - root.clientWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          previewVisible: !document.getElementById('importerPreviewCard').classList.contains('hidden'),
          tableContained: !tableRegion || tableRegion.getBoundingClientRect().right <= innerWidth + 2,
          undersized: mobile ? critical.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.id || element.textContent.trim()) : [],
          expectPreview
        };
      }, { selector: rootSelector, mobile: scenario.viewport.width <= 560, expectPreview: scenario.state === 'preview' });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.equal(layout.theme, scenario.theme); assertions++;
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.ok(layout.rootOverflow <= 2, `${scenario.file}: overflow da view ${layout.rootOverflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.equal(layout.tableContained, true); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      if (scenario.state !== 'integration') {
        assert.equal(layout.previewVisible, layout.expectPreview); assertions++;
      }
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Todos os estados visuais do Importador devem ser distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 IMPORTER VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
