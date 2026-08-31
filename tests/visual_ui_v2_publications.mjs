import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-publications');
const CONFIGS = [
  { name: '1440x900', width: 1440, height: 900, treatment: true, email: false },
  { name: '1280x800', width: 1280, height: 800, treatment: false, email: true },
  { name: '1024x768', width: 1024, height: 768, treatment: false, email: false },
  { name: '390x844', width: 390, height: 844, treatment: true, email: true }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let screenshots = 0;
let assertions = 0;

function recordScreenshot(file) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  hashes.add(hash);
  screenshots++;
}

try {
  for (const theme of ['light', 'dark']) {
    for (const config of CONFIGS) {
      const context = await session.createContext({ viewport: { width: config.width, height: config.height } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await prepareUiV2PublicationsFixture(page);
        await page.waitForTimeout(120);

        const listLayout = await page.evaluate(() => {
          const view = document.getElementById('view-inbox');
          const records = [...document.querySelectorAll('#inboxList [data-intimation-id]')];
          const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
          const required = ['Intimação sintética', '5004321-12.2026.8.21.0001', 'Não tratada', 'Em análise'];
          return {
            active: view.classList.contains('active'),
            ui: document.documentElement.dataset.ui,
            overflow: document.documentElement.scrollWidth - innerWidth,
            duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
            missing: required.filter(text => !view.textContent.includes(text)),
            recordCount: records.length
          };
        });
        assert.equal(listLayout.active, true); assertions++;
        assert.equal(listLayout.ui, 'v2'); assertions++;
        assert.ok(listLayout.overflow <= 2, `Overflow em ${theme} ${config.name}: ${listLayout.overflow}px.`); assertions++;
        assert.deepEqual(listLayout.duplicateIds, []); assertions++;
        assert.deepEqual(listLayout.missing, []); assertions++;
        assert.equal(listLayout.recordCount, 4); assertions++;
        assert.deepEqual(pageErrors, []); assertions++;

        const listFile = path.join(OUTPUT, `${theme}-${config.name}-list.png`);
        await page.screenshot({ path: listFile, fullPage: false });
        recordScreenshot(listFile);

        await page.locator('[data-intimation-id="ui-v2-publication-review"]').click();
        await page.locator('#intimationDetail .detail-header').waitFor();
        await page.waitForTimeout(260);
        const detailLayout = await page.evaluate(() => {
          const detail = document.getElementById('intimationDetail');
          const rect = detail.getBoundingClientRect();
          const text = detail.textContent;
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            overflow: document.documentElement.scrollWidth - innerWidth,
            hasOriginal: text.includes('Conteúdo sintético integral da decisão em análise.'),
            hasReading: text.includes('Lida'),
            showsTreatment: text.includes('Em análise'),
            hasActor: text.includes('Advogada Revisora Sintética')
          };
        });
        assert.ok(detailLayout.left >= -2 && detailLayout.right <= detailLayout.viewportWidth + 2); assertions++;
        assert.ok(
          detailLayout.top >= -2 && detailLayout.bottom <= detailLayout.viewportHeight + 2,
          `Detalhe fora do viewport em ${theme} ${config.name}: ${JSON.stringify(detailLayout)}.`
        ); assertions++;
        assert.ok(detailLayout.overflow <= 2); assertions++;
        assert.equal(detailLayout.hasOriginal, true); assertions++;
        assert.equal(detailLayout.hasReading, true); assertions++;
        assert.equal(detailLayout.showsTreatment, true); assertions++;
        assert.equal(detailLayout.hasActor, true); assertions++;
        const detailFile = path.join(OUTPUT, `${theme}-${config.name}-detail.png`);
        await page.screenshot({ path: detailFile, fullPage: false });
        recordScreenshot(detailFile);

        if (config.treatment) {
          await page.locator('#btnMarkTreated').click();
          await page.locator('#treatPublicationBackdrop:not(.hidden)').waitFor();
          await page.waitForTimeout(260);
          const treatment = await page.locator('#treatPublicationBackdrop .modal').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
          });
          assert.ok(treatment.left >= -2 && treatment.right <= treatment.viewportWidth + 2); assertions++;
          assert.ok(treatment.top >= -2 && treatment.bottom <= treatment.viewportHeight + 2); assertions++;
          const treatmentFile = path.join(OUTPUT, `${theme}-${config.name}-treatment.png`);
          await page.screenshot({ path: treatmentFile, fullPage: false });
          recordScreenshot(treatmentFile);
          await page.locator('#treatPublicationCancel').click();
        }

        if (config.email) {
          if (config.width < 768) {
            await page.locator('#publicationDetailClose').click();
            await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();
          }
          await page.locator('#btnEmailPublications').click();
          await page.locator('#publicationsEmailModalBackdrop:not(.hidden)').waitFor();
          await page.waitForTimeout(260);
          const emailFile = path.join(OUTPUT, `${theme}-${config.name}-email.png`);
          await page.screenshot({ path: emailFile, fullPage: false });
          recordScreenshot(emailFile);
          await page.locator('#publicationsEmailClose').click();
        }
      } finally {
        await context.close();
      }
    }
  }

  const comparison = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(comparison, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2PublicationsFixture(page);
    const v2File = path.join(OUTPUT, 'comparison-v2-light-1440x900.png');
    await page.screenshot({ path: v2File, fullPage: false });
    recordScreenshot(v2File);
    await page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await page.locator('#view-configuration.active #uiModeControl').waitFor();
    await page.locator('[data-ui-mode="classic"]').click();
    await page.locator('html[data-ui="classic"]').waitFor();
    await page.evaluate(() => window.Atrium.App.switchView('inbox'));
    assert.equal(await page.locator('.v2-publications-heading').isVisible(), false); assertions++;
    assert.ok(await page.locator('#inboxList .inbox-primary').count() > 0); assertions++;
    const classicFile = path.join(OUTPUT, 'comparison-classic-light-1440x900.png');
    await page.screenshot({ path: classicFile, fullPage: false });
    recordScreenshot(classicFile);
    assert.deepEqual(pageErrors, []); assertions++;
  } finally {
    await comparison.close();
  }

  assert.equal(hashes.size, screenshots, 'Cada estado visual selecionado deve produzir evidência distinta.');
  console.log('======================================================');
  console.log('✓ UI V2 PUBLICAÇÕES VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Screenshots V2: ${screenshots}`);
  console.log(`- Hashes V2 únicos: ${hashes.size}`);
  console.log(`- Asserções V2: ${assertions}/${assertions}`);
  console.log(`- Artefatos V2: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
