import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'configuration-experimental');
fs.mkdirSync(OUTPUT, { recursive: true });

console.log('\n===============================================================');
console.log('  ATRIUM — VISUAL QA: SECAO EXPERIMENTAL (WIDGETS DO PAINEL)    ');
console.log('===============================================================\n');

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
function record(file) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hashes.has(hash), false, `Screenshot duplicado: ${path.basename(file)}`);
  hashes.add(hash);
}
try {
  for (const scenario of [
    { file: '01-light-1440-experimental-off.png', theme: 'light', viewport: { width: 1440, height: 900 }, enable: false },
    { file: '02-dark-1280-experimental-on.png', theme: 'dark', viewport: { width: 1280, height: 800 }, enable: true },
    { file: '03-light-390-experimental-on.png', theme: 'light', viewport: { width: 390, height: 844 }, enable: true }
  ]) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await switchUiV2View(page, 'configuration');
      await page.locator('[data-config-section="experimental"]').click();
      await page.locator('#configurationList .configuration-experimental').waitFor();

      if (scenario.enable) {
        await page.locator('[data-experimental-toggle]').check();
        await page.locator('[data-experimental-widget="inbox"]').uncheck();
      }

      const state = await page.evaluate(() => {
        const panel = document.querySelector('#configurationList .configuration-experimental');
        const toggles = [...panel.querySelectorAll('[data-experimental-widget]')];
        return {
          heading: document.getElementById('configurationHeading')?.textContent,
          count: document.getElementById('configurationCount')?.textContent,
          widgets: toggles.length,
          checked: toggles.filter(input => input.checked).length,
          disabled: toggles.filter(input => input.disabled).length,
          masterChecked: panel.querySelector('[data-experimental-toggle]')?.checked,
          resetDisabled: panel.querySelector('[data-experimental-reset]')?.disabled,
          stored: window.localStorage.getItem('atrium_dashboard_widgets'),
          overflow: document.documentElement.scrollWidth - innerWidth,
          clipped: [...panel.querySelectorAll('*')].filter(element => element.scrollWidth > element.clientWidth + 2).length
        };
      });
      assert.equal(state.heading, 'Experimental'); assertions++;
      assert.equal(state.count, 'Preferência local'); assertions++;
      assert.equal(state.widgets, 6); assertions++;
      assert.ok(state.overflow <= 2, `${scenario.file}: overflow global ${state.overflow}px.`); assertions++;
      assert.equal(state.clipped, 0, `${scenario.file}: conteúdo cortado.`); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (scenario.enable) {
        assert.equal(state.masterChecked, true); assertions++;
        assert.equal(state.checked, 5, 'Caixa de atividades desligada pelo usuário.'); assertions++;
        assert.equal(state.disabled, 0, 'Com a personalização ativa, os blocos ficam habilitados.'); assertions++;
        assert.equal(state.resetDisabled, false); assertions++;
        assert.match(state.stored, /"enabled":true/); assertions++;
        assert.match(state.stored, /"inbox"/); assertions++;
      } else {
        assert.equal(state.masterChecked, false, 'Desligado por padrão.'); assertions++;
        assert.equal(state.checked, 6, 'Layout atual: todos os blocos marcados.'); assertions++;
        assert.equal(state.disabled, 6, 'Blocos desabilitados enquanto a personalização está desligada.'); assertions++;
        assert.equal(state.resetDisabled, true); assertions++;
        assert.equal(state.stored, null, 'Nada é persistido antes de ativar.'); assertions++;
      }

      const file = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: file, fullPage: false });
      record(file);

      if (scenario.enable) {
        await switchUiV2View(page, 'dashboard');
        await page.locator('#view-dashboard.active').waitFor();
        const dashboard = await page.evaluate(() => ({
          inboxHidden: document.querySelector('#view-dashboard .activity-inbox')?.hidden,
          attentionHidden: document.querySelector('#view-dashboard #v2DashboardOpening')?.hidden,
          overflow: document.documentElement.scrollWidth - innerWidth
        }));
        assert.equal(dashboard.inboxHidden, true, 'Bloco desligado não aparece no painel.'); assertions++;
        assert.equal(dashboard.attentionHidden, false); assertions++;
        assert.ok(dashboard.overflow <= 2); assertions++;
        const dashFile = path.join(OUTPUT, '04-light-390-dashboard-sem-caixa.png');
        await page.screenshot({ path: dashFile, fullPage: false });
        record(dashFile);
      }
    } finally {
      await context.close();
    }
  }
  console.log(`✓ Seção Experimental aprovada visualmente: ${hashes.size} screenshots únicos, ${assertions} asserções.`);
  console.log(`  Artefatos: ${OUTPUT}`);
  console.log('\n>>> VISUAL QA EXPERIMENTAL: PASS <<<\n');
} finally {
  await session.stop();
}
