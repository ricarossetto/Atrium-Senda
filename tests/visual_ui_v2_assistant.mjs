import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2AssistantFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-assistant');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-configured.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'configured' },
  { file: '02-dark-1440x900-configured.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'configured' },
  { file: '03-light-1440x900-onboarding.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'unconfigured' },
  { file: '04-dark-1440x900-rich-chat.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'rich' },
  { file: '05-light-1280x800-markdown.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'markdown' },
  { file: '06-dark-1280x800-error.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'error' },
  { file: '07-light-1280x800-context.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'context' },
  { file: '08-dark-1024x768-skill.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'skill' },
  { file: '09-light-1024x768-key-drawer.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'key' },
  { file: '10-light-390x844-mobile-chat.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'configured' },
  { file: '11-dark-390x844-mobile-chat.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'rich' },
  { file: '12-dark-390x844-mobile-key-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'key' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2AssistantFixture(page, {
        configured: scenario.state !== 'unconfigured',
        withContext: scenario.state === 'context'
      });

      if (['rich', 'markdown', 'error'].includes(scenario.state)) {
        await page.evaluate(async state => {
          const app = window.portalApp;
          app.aiConfigured = true;
          window.KellerAuth.secureFetch = async () => state === 'error'
            ? ({ ok: false, async json() { return { message: '<script>erro sintético</script>' }; } })
            : ({ ok: true, async json() { return { model: 'Gemini sintético', reply: state === 'markdown'
              ? '# Análise supervisionada\n\n> Conteúdo sintético para revisão profissional.\n\n- Primeiro ponto\n- Segundo ponto\n\n```js\nconst revisao = true;\n```'
              : '## Síntese da publicação\n\nA leitura é **assistencial** e exige revisão profissional.\n\n1. Conferir a fonte oficial\n2. Validar os fatos\n3. Revisar a minuta' }; } });
          await app.sendAiMessage(state === 'error' ? 'Produzir falha sintética' : 'Analise este conteúdo sintético sob supervisão.');
        }, scenario.state);
      }

      if (scenario.state === 'skill') {
        await page.evaluate(() => {
          window.CODEX_LEGAL_SKILLS = [{ id: 'visual-skill', title: 'Auditoria adversarial', name: 'Auditoria', description: 'Revisão crítica supervisionada.', instructions: 'Instrução sintética.' }];
          const select = document.getElementById('codexSkillSelect');
          select.innerHTML = '<option value="visual-skill">Auditoria adversarial</option>';
          select.value = 'visual-skill';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      if (scenario.state === 'key') {
        await page.locator('#btnOpenGeminiKeyModal').click();
        await page.waitForFunction(() => document.querySelector('#geminiKeyBackdrop .gemini-key-modal')?.contains(document.activeElement));
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-assistant, #geminiKeyBackdrop')]
        .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const sheet = document.querySelector('#geminiKeyBackdrop:not(.hidden) .gemini-key-modal');
        const sheetRect = sheet?.getBoundingClientRect();
        const visibleButtons = [...document.querySelectorAll('#view-assistant button, #geminiKeyBackdrop:not(.hidden) button')].filter(button => button.getClientRects().length);
        return {
          active: document.getElementById('view-assistant').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          chatOverflow: document.querySelector('#view-assistant .ai-chat-card').scrollWidth - document.querySelector('#view-assistant .ai-chat-card').clientWidth,
          sheet: sheetRect ? { left: sheetRect.left, right: sheetRect.right, top: sheetRect.top, bottom: sheetRect.bottom, width: innerWidth, height: innerHeight, overflow: sheet.scrollWidth - sheet.clientWidth } : null,
          undersized: innerWidth <= 560 ? visibleButtons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.ok(layout.chatOverflow <= 2, `${scenario.file}: chat com overflow horizontal.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.sheet) {
        assert.ok(layout.sheet.left >= -2 && layout.sheet.right <= layout.sheet.width + 2, `${scenario.file}: sheet horizontal.`); assertions++;
        assert.ok(layout.sheet.top >= -2 && layout.sheet.bottom <= layout.sheet.height + 2, `${scenario.file}: sheet vertical.`); assertions++;
        assert.ok(layout.sheet.overflow <= 2, `${scenario.file}: sheet com overflow horizontal.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os doze estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 ASSISTANT VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
