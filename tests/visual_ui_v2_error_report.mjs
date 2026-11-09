import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-error-report');
const SCENARIOS = [
  { file: '01-light-1440-report.png', theme: 'light', viewport: { width: 1440, height: 900 } },
  { file: '02-dark-1280-report.png', theme: 'dark', viewport: { width: 1280, height: 800 } },
  { file: '03-light-390-report.png', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '04-dark-390-report.png', theme: 'dark', viewport: { width: 390, height: 844 } }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await page.evaluate(() => window.Atrium.App.reportError({
        scope: 'Sincronização eproc · trf4-eproc-2g',
        message: '5 erro(s) durante a coleta eproc. Conclua o login, CAPTCHA ou segundo fator no portal.',
        details: 'Job: sync-1789964340413-1lf2wm\nPortal: trf4-eproc-2g\nEstado: ERROR\nQuando: 2026-09-21T04:37:40.000Z'
      }));
      await page.locator('#errorReportBackdrop:not(.hidden)').waitFor();
      await page.waitForFunction(() => document.activeElement?.id === 'errorReportClose');
      await page.waitForFunction(() => [...document.querySelectorAll('#errorReportBackdrop, #errorReportBackdrop .modal')]
        .flatMap(element => element.getAnimations({ subtree: true }))
        .every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const modal = document.querySelector('#errorReportBackdrop .modal').getBoundingClientRect();
        const footer = document.querySelector('#errorReportBackdrop footer').getBoundingClientRect();
        const code = document.getElementById('errorReportCode');
        const codeRect = code.getBoundingClientRect();
        const send = document.getElementById('errorReportSend').getBoundingClientRect();
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return {
          code: code.textContent,
          codeVisible: codeRect.width > 0 && codeRect.height > 0,
          modalInside: modal.left >= -2 && modal.right <= innerWidth + 2 && modal.top >= -2 && modal.bottom <= innerHeight + 2,
          footerInside: footer.bottom <= innerHeight + 2,
          sendVisible: send.width > 0 && send.height > 0 && send.bottom <= innerHeight + 2,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          appShellInert: document.getElementById('appShell')?.hasAttribute('inert') === true,
          message: document.getElementById('errorReportMessage').textContent,
          details: document.getElementById('errorReportDetails').textContent
        };
      });
      assert.match(layout.code, /^ATR-\d{8}-[0-9A-F]{8}$/); assertions++;
      assert.equal(layout.codeVisible, true); assertions++;
      assert.equal(layout.modalInside, true); assertions++;
      assert.equal(layout.footerInside, true); assertions++;
      assert.equal(layout.sendVisible, true); assertions++;
      assert.ok(layout.overflow <= 2, `overflow global ${layout.overflow}px`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.equal(layout.appShellInert, true, 'Fundo precisa ficar inerte com o relato aberto.'); assertions++;
      assert.match(layout.message, /5 erro\(s\) durante a coleta eproc/); assertions++;
      assert.match(layout.details, /Portal: trf4-eproc-2g/); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Screenshots de temas/viewports diferentes não podem ser idênticos.');
  console.log('======================================================');
  console.log('✓ UI V2 RELATO DE ERRO VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
