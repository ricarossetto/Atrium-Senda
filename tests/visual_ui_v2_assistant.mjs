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
  { file: '12-dark-390x844-mobile-key-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'key' },
  { file: '13-light-1440x900-citations.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'citations' },
  { file: '14-dark-1280x800-citations.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'citations' },
  { file: '15-light-390x844-mobile-citations.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'citations' },
  { file: '16-light-1440x900-plan.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'plan' },
  { file: '17-dark-1280x800-plan.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'plan' },
  { file: '18-light-390x844-mobile-plan.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'plan' }
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

      if (['rich', 'markdown', 'error', 'citations'].includes(scenario.state)) {
        await page.evaluate(async state => {
          const app = window.portalApp;
          app.aiConfigured = true;
          const citationIntelligence = {
            active: true,
            modules: [{ id: 'legal-draft-br' }],
            research: { status: 'unavailable' },
            gates: { status: 'FAIL' },
            citations: {
              entries: [
                { id: 'C1', kind: 'sumula', raw: 'Súmula 331 do TST', status: 'verified', policy: 'required', groundedIn: [{ type: 'documento', ref: 'D1' }], note: 'Referência confirmada nas fontes fornecidas.' },
                { id: 'C2', kind: 'tema', raw: 'Tema 1234 do STJ', status: 'pending', policy: 'required', groundedIn: [], note: 'Referência marcada para conferência em fonte oficial.' },
                { id: 'C3', kind: 'precedente-superior', raw: 'REsp 1.234.567/RS', status: 'unverified', policy: 'required', groundedIn: [], note: 'Sem confirmação nas fontes fornecidas; conferir em fonte oficial antes de exportar.' }
              ],
              review: {
                status: 'FAIL',
                ready: false,
                counts: { total: 3, verified: 1, conflict: 0, pending: 1, unverified: 1 },
                blockers: [{ id: 'C3', raw: 'REsp 1.234.567/RS', status: 'unverified', message: 'Referência específica sem verificação nem marcador de conferência: REsp 1.234.567/RS.' }],
                warnings: [],
                overrideApplied: false,
                override: null
              }
            }
          };
          window.KellerAuth.secureFetch = async () => state === 'error'
            ? ({ ok: false, async json() { return { message: '<script>erro sintético</script>' }; } })
            : ({ ok: true, async json() { return {
              model: 'Gemini sintético',
              reply: state === 'markdown'
                ? '# Análise supervisionada\n\n> Conteúdo sintético para revisão profissional.\n\n- Primeiro ponto\n- Segundo ponto\n\n```js\nconst revisao = true;\n```'
                : state === 'citations'
                  ? '## Minuta sintética\n\nA Súmula 331 do TST orienta o caso, o Tema 1234 do STJ está marcado para conferência e o REsp 1.234.567/RS aguarda validação em fonte oficial.'
                  : '## Síntese da publicação\n\nA leitura é **assistencial** e exige revisão profissional.\n\n1. Conferir a fonte oficial\n2. Validar os fatos\n3. Revisar a minuta',
              ...(state === 'citations' ? { intelligence: citationIntelligence } : {})
            }; } });
          await app.sendAiMessage(state === 'error' ? 'Produzir falha sintética' : 'Analise este conteúdo sintético sob supervisão.');
        }, scenario.state);
        if (scenario.state === 'citations') {
          await page.locator('[data-citation-review-id]').click();
          await page.locator('.citation-review-panel').waitFor();
          await page.locator('.citation-review-panel').scrollIntoViewIfNeeded();
        }
      }

      if (scenario.state === 'plan') {
        await page.evaluate(() => {
          const plan = {
            id: 'plan-visual-0001',
            status: 'awaiting-approval',
            pieceType: 'apelacao',
            steps: [
              { id: 'analise', label: 'Triagem da solicitação', status: 'done', summary: 'apelacao · civel' },
              { id: 'pesquisa', label: 'Pesquisa externa (discovery)', status: 'pending-approval', requiresApproval: true },
              { id: 'redacao', label: 'Redação supervisionada', status: 'blocked' },
              { id: 'revisao-citacoes', label: 'Revisão de citações', status: 'blocked' },
              { id: 'conferencia-humana', label: 'Conferência humana final', status: 'blocked' }
            ]
          };
          const baseFetch = window.KellerAuth.secureFetch;
          window.KellerAuth.secureFetch = async (url, options = {}) => {
            const target = String(url);
            if (target.includes('/plans') && target.includes('/events')) {
              return { ok: true, body: { getReader: () => ({ read: async () => ({ value: undefined, done: true }) }) } };
            }
            if (target === '/api/legal-intelligence/plans') {
              return { ok: true, async json() { return { ok: true, plan, analysis: { active: true, pieceType: 'apelacao' } }; } };
            }
            return baseFetch(url, options);
          };
        });
        await page.locator('#aiChatInput').fill('Elabore a apelação com jurisprudência do STJ.');
        await page.locator('#btnAiPlan').click();
        await page.locator('.agentic-plan-panel').waitFor();
        await page.locator('.agentic-plan-panel').scrollIntoViewIfNeeded();
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

      if (scenario.state === 'citations') {
        assert.equal(await page.locator('.citation-review-item').count(), 3, `${scenario.file}: três citações no painel.`); assertions++;
        assert.equal(await page.locator('.citation-review-blockers').count(), 1, `${scenario.file}: bloqueio visível.`); assertions++;
        assert.equal(await page.locator('[data-citation-justification]').count(), 1, `${scenario.file}: justificativa disponível.`); assertions++;
        assert.match(await page.locator('.ai-citation-summary').textContent(), /3 citação\(ões\): 1 verificada\(s\) · 1 pendente\(s\) · 1 não verificada\(s\)/); assertions++;
      }

      if (scenario.state === 'plan') {
        assert.equal(await page.locator('.agentic-plan-step').count(), 5, `${scenario.file}: cinco etapas no plano.`); assertions++;
        assert.equal(await page.locator('[data-plan-action="approve"]').count(), 1, `${scenario.file}: aprovação da pesquisa disponível.`); assertions++;
        assert.equal(await page.locator('[data-plan-action="run"]').count(), 0, `${scenario.file}: sem etapa executável antes da aprovação.`); assertions++;
        assert.match(await page.locator('.agentic-plan-header .status-chip').textContent(), /Aguarda aprovação/); assertions++;
        assert.equal(await page.locator('.agentic-plan-message .message-avatar').count(), 1); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));

      // Regressão (depois do screenshot, para não alterar a cena): o atalho "Abrir Biblioteca
      // de Prompts" é um `.quick-prompt-btn` sem `data-prompt`; clicar nele não pode chamar
      // `sendMessage(undefined)` e derrubar a view.
      const atalhoSemPrompt = await page.evaluate(() => {
        const botao = [...document.querySelectorAll('.quick-prompt-btn')].find(item => !String(item.dataset.prompt || '').trim());
        if (!botao) return false;
        botao.click();
        return true;
      });
      assert.equal(atalhoSemPrompt, true, `${scenario.file}: esperava um atalho rápido sem data-prompt.`); assertions++;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      const vistaAposClique = await page.evaluate(() => Array.from(document.querySelectorAll('.view.active')).map(view => view.id).join(','));
      assert.match(vistaAposClique, /view-prompts|view-assistant/, `${scenario.file}: atalho sem prompt deve navegar ou manter a view viva, veio "${vistaAposClique}".`); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
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
