import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2ProcessesFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-processes');
const CONFIGS = [
  { name: '1440x900', width: 1440, height: 900, inspector: true, form: false },
  { name: '1280x800', width: 1280, height: 800, inspector: false, form: true },
  { name: '1024x768', width: 1024, height: 768, inspector: false, form: false },
  { name: '390x844', width: 390, height: 844, inspector: true, form: true }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let screenshots = 0;
let assertions = 0;

function recordScreenshot(file) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hashes.has(hash), false, `Screenshot duplicado: ${path.basename(file)}.`);
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
        await prepareUiV2ProcessesFixture(page);
        await page.waitForTimeout(120);

        const listLayout = await page.evaluate(expectedMobile => {
          const view = document.getElementById('view-processes');
          const table = document.getElementById('processTable');
          const firstRow = document.querySelector('#processTableBody [data-process-id]');
          const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
          const requiredText = ['5004321-12.2026.8.21.0001', 'Cliente Sintética Processos', 'TJRS', 'Despacho sintético integral', 'Monitorando'];
          return {
            active: view?.classList.contains('active'),
            ui: document.documentElement.dataset.ui,
            theme: document.documentElement.dataset.theme || 'dark',
            overflow: document.documentElement.scrollWidth - innerWidth,
            tableOverflow: table.scrollWidth - table.clientWidth,
            rowDisplay: getComputedStyle(firstRow).display,
            theadPosition: getComputedStyle(table.tHead).position,
            duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
            missingCritical: requiredText.filter(text => !firstRow.textContent.includes(text)),
            expectedMobile
          };
        }, config.width < 1024);
        assert.equal(listLayout.active, true); assertions++;
        assert.equal(listLayout.ui, 'v2'); assertions++;
        assert.equal(listLayout.theme, theme); assertions++;
        assert.ok(listLayout.overflow <= 2, `Overflow global em ${theme} ${config.name}: ${listLayout.overflow}px.`); assertions++;
        assert.ok(listLayout.tableOverflow <= 2, `Overflow da superfície em ${theme} ${config.name}: ${listLayout.tableOverflow}px.`); assertions++;
        assert.deepEqual(listLayout.duplicateIds, []); assertions++;
        assert.deepEqual(listLayout.missingCritical, []); assertions++;
        assert.equal(listLayout.theadPosition === 'absolute', config.width < 1024, `Representação incorreta em ${theme} ${config.name}.`); assertions++;
        assert.deepEqual(pageErrors, [], `Pageerror em ${theme} ${config.name}: ${pageErrors.join(' | ')}`); assertions++;

        const listFile = path.join(OUTPUT, `${theme}-${config.name}-list.png`);
        await page.screenshot({ path: listFile, fullPage: false });
        recordScreenshot(listFile);

        if (config.inspector) {
          await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
          await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
          const drawer = await page.locator('#processInspector').evaluate(element => {
            const rect = element.getBoundingClientRect();
            const content = document.getElementById('processInspectorContent').textContent;
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              overflow: document.documentElement.scrollWidth - innerWidth,
              hasMovement: content.includes('Despacho sintético integral'),
              hasDeadline: content.includes('03/09/2026'),
              hasSecrecy: content.includes('Segredo de justiça')
            };
          });
          assert.ok(drawer.left >= -2 && drawer.right <= drawer.viewportWidth + 2); assertions++;
          assert.ok(drawer.top >= -2 && drawer.bottom <= drawer.viewportHeight + 2); assertions++;
          assert.ok(drawer.overflow <= 2); assertions++;
          assert.equal(drawer.hasMovement, true); assertions++;
          assert.equal(drawer.hasDeadline, true); assertions++;
          assert.equal(drawer.hasSecrecy, true); assertions++;
          const inspectorFile = path.join(OUTPUT, `${theme}-${config.name}-inspector.png`);
          await page.screenshot({ path: inspectorFile, fullPage: false });
          recordScreenshot(inspectorFile);
          await page.locator('#processInspectorClose').click();
        }

        if (config.form) {
          await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
          await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
          await page.locator('#processInspectorEdit').waitFor({ state: 'visible' });
          await page.waitForTimeout(260);
          await page.locator('#processInspectorEdit').click();
          await page.waitForFunction(() => {
            const backdrop = document.querySelector('#modalBackdrop[data-modal-mode="process"]:not(.hidden)');
            const modal = backdrop?.querySelector('.modal');
            const rect = modal?.getBoundingClientRect();
            return Boolean(backdrop && rect && rect.width > 0 && rect.height > 0);
          });
          const form = await page.evaluate(() => {
            const modal = document.querySelector('#modalBackdrop[data-modal-mode="process"] .modal');
            const rect = modal.getBoundingClientRect();
            return {
              visible: rect.width > 0 && rect.height > 0,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              overflow: document.documentElement.scrollWidth - innerWidth,
              sections: document.querySelectorAll('.process-form-section').length,
              hiddenRequired: [...document.querySelectorAll('#modalForm [required]')].filter(element => element.getClientRects().length === 0).length
            };
          });
          assert.equal(form.visible, true); assertions++;
          assert.ok(form.left >= -2 && form.right <= form.viewportWidth + 2); assertions++;
          assert.ok(form.top >= -2 && form.bottom <= form.viewportHeight + 2); assertions++;
          assert.ok(form.overflow <= 2); assertions++;
          assert.equal(form.sections, 8); assertions++;
          assert.equal(form.hiddenRequired, 0); assertions++;
          const formFile = path.join(OUTPUT, `${theme}-${config.name}-form.png`);
          await page.screenshot({ path: formFile, fullPage: false });
          recordScreenshot(formFile);
          await page.locator('#modalCancel').click();
        }
      } finally {
        await context.close();
      }
    }
  }

  const comparisonContext = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(comparisonContext, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2ProcessesFixture(page);
    await page.waitForTimeout(120);

    const v2Heading = await page.locator('.v2-process-heading').boundingBox();
    assert.ok(v2Heading && v2Heading.width > 0, 'A hierarquia V2 de Processos deve estar visível.'); assertions++;

    await page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await page.locator('#view-configuration.active #uiModeControl').waitFor({ state: 'attached' });
    await page.locator('[data-ui-mode="classic"]').evaluate(button => button.click());
    await page.locator('html[data-ui="classic"]').waitFor();
    await page.evaluate(() => window.Atrium.App.switchView('processes'));
    assert.equal(await page.locator('.v2-process-heading').isVisible(), false); assertions++;
    const classicFile = path.join(OUTPUT, 'comparison-classic-light-1440x900-list.png');
    await page.screenshot({ path: classicFile, fullPage: false });
    recordScreenshot(classicFile);

    await page.locator('html').evaluate(element => { element.style.filter = 'grayscale(1)'; });
    const classicGrayFile = path.join(OUTPUT, 'comparison-classic-grayscale-1440x900-list.png');
    await page.screenshot({ path: classicGrayFile, fullPage: false });
    const classicGrayHash = recordScreenshot(classicGrayFile);

    await page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await page.locator('#view-configuration.active #uiModeControl').waitFor({ state: 'attached' });
    await page.locator('[data-ui-mode="v2"]').evaluate(button => button.click());
    await page.locator('html[data-ui="v2"]').waitFor();
    await page.evaluate(() => window.Atrium.App.switchView('processes'));
    assert.equal(await page.locator('.v2-process-heading').isVisible(), true); assertions++;
    const v2GrayFile = path.join(OUTPUT, 'comparison-v2-grayscale-1440x900-list.png');
    await page.screenshot({ path: v2GrayFile, fullPage: false });
    const v2GrayHash = recordScreenshot(v2GrayFile);
    assert.notEqual(classicGrayHash, v2GrayHash, 'Classic e V2 Processos devem permanecer distintos sem cor.'); assertions++;
    assert.deepEqual(pageErrors, [], `Comparativo Processos gerou pageerror: ${pageErrors.join(' | ')}`); assertions++;
  } finally {
    await comparisonContext.close();
  }

  console.log('======================================================');
  console.log('✓ UI V2 PROCESSOS VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Screenshots V2: ${screenshots}`);
  console.log(`- Hashes V2 únicos: ${hashes.size}`);
  console.log(`- Asserções V2: ${assertions}/${assertions}`);
  console.log(`- Artefatos V2: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
