import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CLASSIFICADOR IA: TRIAGEM VISÍVEL NA LISTA (BROWSER)');
console.log('===============================================================\n');

const SUGGESTIONS = {
  'ui-v2-publication-urgent': { area: 'trabalhista', areaConfidence: 0.91, priority: 'alta', priorityConfidence: 0.82, deadlineSignal: 'sim', deadlineDays: 'd15', action: 'suggest', reason: 'SUGGEST_ONLY', at: '2026-09-01T10:00:00.000Z' },
  'ui-v2-publication-review': { area: 'fazenda', areaConfidence: 0.62, priority: 'normal', priorityConfidence: 0.7, action: 'review', reason: 'LOW_CONFIDENCE_REVIEW', at: '2026-09-01T10:00:00.000Z' },
  'ui-v2-publication-treated': { area: '<script>alert(1)</script>', areaConfidence: 0.7, priority: 'zzz', priorityConfidence: 0.4, action: 'suggest', reason: 'SUGGEST_ONLY', at: '2026-09-01T10:00:00.000Z' }
};

async function installClassifierStubs(page) {
  await page.evaluate(suggestions => {
    window.__uiV2ClassifierRequests = [];
    const originalFetch = window.fetch.bind(window);
    const originalSecureFetch = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    const response = (payload, ok = true, status = 200) => ({ ok, status, async json() { return structuredClone(payload); } });
    const route = (url, method) => {
      if (url === '/api/ai-classifier/status') return response({ ok: true, enabled: true, available: true, reason: 'operacional' });
      if (url === '/api/ai-classifier/settings') {
        window.__uiV2ClassifierRequests.push({ url, method });
        return response({ ok: true, enabled: true, revision: 'rev-browser' });
      }
      if (url === '/api/ai-classifier/suggestions') {
        window.__uiV2ClassifierRequests.push({ url, method });
        return response({ ok: true, enabled: true, generatedAt: '2026-09-01T10:00:00.000Z', suggestions });
      }
      if (url === '/api/ai-classifier/triage-backlog') {
        window.__uiV2ClassifierRequests.push({ url, method });
        return response({ ok: true, classified: 2, failed: 0, pending: 0, results: [] });
      }
      return null;
    };
    window.fetch = async (input, options = {}) => {
      const url = String(input?.url || input);
      const handled = route(url, String(options.method || 'GET').toUpperCase());
      return handled || originalFetch(input, options);
    };
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      const handled = route(String(url), String(options.method || 'GET').toUpperCase());
      return handled || originalSecureFetch(url, options);
    };
  }, SUGGESTIONS);
}

async function runScenario(session, theme) {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
  await prepareUiV2PublicationsFixture(page);
  await installClassifierStubs(page);

  await page.locator('#aiClassifierToggle').click();
  await page.waitForFunction(() => document.querySelectorAll('#inboxList .publication-ai-chip').length >= 2);

  const chips = await page.evaluate(() => [...document.querySelectorAll('#inboxList .publication-ai-chip')].map(chip => {
    const style = getComputedStyle(chip);
    const rect = chip.getBoundingClientRect();
    return {
      text: chip.textContent.trim(),
      firm: chip.classList.contains('is-firm'),
      soft: chip.classList.contains('is-soft'),
      title: chip.getAttribute('title') || '',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      color: style.color,
      background: style.backgroundColor
    };
  }));
  assert.ok(chips.length >= 2, 'a lista deve mostrar o chip derivado sem clique por publicação');
  const firm = chips.find(chip => chip.firm);
  assert.ok(firm, 'sugestão firme tem variante própria');
  assert.match(firm.text, /Trabalhista · Alta/, 'chip firme mostra área e prioridade');
  assert.match(firm.title, /Atrium IA · Confiança 0,91 · sugestão para conferência/);
  const soft = chips.find(chip => chip.soft);
  assert.ok(soft, 'revisão tem variante discreta');
  assert.match(soft.text, /Fazenda pública/, 'rótulo novo da taxonomia aparece traduzido');
  assert.ok(chips.every(chip => chip.width <= 220 && chip.height <= 24), 'chip compacto, sem barra esticada');
  assert.ok(chips.every(chip => chip.color !== chip.background), 'chip legível no tema atual');

  const hostile = await page.evaluate(() => document.querySelector('#inboxList [data-intimation-id="ui-v2-publication-treated"] .publication-ai-chip')?.textContent || '');
  assert.match(hostile, /<script>alert\(1\)<\/script>/, 'rótulo hostil aparece como texto, nunca executa');
  const scripted = await page.evaluate(() => document.querySelectorAll('#inboxList script').length);
  assert.equal(scripted, 0, 'nenhum script injetado pelo rótulo');

  await page.locator('#aiClassifierBacklogButton').click();
  await page.waitForFunction(() => window.__uiV2ClassifierRequests.some(request => request.url === '/api/ai-classifier/triage-backlog'));
  const backlogState = await page.evaluate(() => ({
    requests: window.__uiV2ClassifierRequests.filter(request => request.url === '/api/ai-classifier/triage-backlog'),
    status: document.getElementById('aiClassifierBacklogStatus')?.textContent || '',
    known: Boolean(document.getElementById('aiClassifierBacklogButton'))
  }));
  assert.equal(backlogState.requests.length, 1, 'o lote roda uma vez por clique');
  assert.match(backlogState.status, /sugestões de área e prioridade para revisar/, 'o status diz o que há para revisar');
  assert.ok(backlogState.known, 'o botão do lote existe no shell');

  const actions = await page.evaluate(() => {
    const container = document.querySelector('.publication-primary-actions');
    const floor = container.getBoundingClientRect();
    const rect = id => document.getElementById(id).getBoundingClientRect();
    const visibleButtons = [...container.querySelectorAll('.button')].filter(button => button.getClientRects().length);
    const statusChip = document.getElementById('aiClassifierBacklogStatus');
    const statusBox = statusChip && statusChip.getClientRects().length ? statusChip.getBoundingClientRect() : null;
    return {
      inViewport: rect('newIntimationButton').right <= innerWidth + 1 && rect('btnEmailPublications').right <= innerWidth + 1,
      insideContainer: rect('newIntimationButton').right <= floor.right + 1,
      rows: new Set(visibleButtons.map(button => { const box = button.getBoundingClientRect(); return Math.round((box.top + box.bottom) / 2 / 8); })).size,
      rowDetail: visibleButtons.map(button => (button.id || '') + ':' + Math.round(button.getBoundingClientRect().top) + ':' + Math.round(button.getBoundingClientRect().height)).join(' '),
      buttons: visibleButtons.length,
      statusCenterY: statusBox ? Math.round((statusBox.top + statusBox.bottom) / 2) : null,
      buttonCenterY: Math.round(rect('aiClassifierToggle').top + rect('aiClassifierToggle').height / 2)
    };
  });
  assert.ok(actions.inViewport, 'ações primárias permanecem dentro do viewport com a triagem ligada');
  assert.ok(actions.insideContainer, 'ações não escapam do contêiner da toolbar');
  assert.ok(actions.buttons >= 3, 'barra mantém as ações do domínio visíveis');
  assert.equal(actions.rows, 1, `as ações ficam em uma linha, sem botão sobrando sozinho: ${actions.rowDetail}`);
  assert.ok(actions.statusCenterY !== null, 'o status da triagem está visível após o lote');
  assert.ok(Math.abs(actions.statusCenterY - actions.buttonCenterY) <= 2, `status centralizado na linha (${actions.statusCenterY} vs ${actions.buttonCenterY})`);

  const deadlineChip = await page.evaluate(() => {
    const chip = document.querySelector('#inboxList [data-intimation-id="ui-v2-publication-urgent"] .publication-ai-deadline');
    return chip ? { text: chip.textContent.trim(), title: chip.getAttribute('title') || '' } : null;
  });
  assert.ok(deadlineChip, 'sinal de prazo aparece na linha');
  assert.match(deadlineChip.text, /Possível prazo · 15 dias/);
  assert.match(deadlineChip.title, /nada é gravado automaticamente/);

  await page.locator('#inboxList [data-intimation-id="ui-v2-publication-urgent"] .publication-record-open').click();
  await page.locator('#intimationDetail .publication-deadline-conference').waitFor();
  const conference = await page.evaluate(() => ({
    days: document.querySelector('#intimationDetail [data-conference-days]')?.value || '',
    signal: Boolean(document.querySelector('#intimationDetail [data-conference-signal="sim"]')),
    hint: document.querySelector('#intimationDetail .publication-deadline-conference-hint')?.textContent || ''
  }));
  assert.equal(conference.days, '15', 'contagem abre com os dias sinalizados');
  assert.ok(conference.signal, 'aviso de sinal visível na conferência');
  assert.match(conference.hint, /nada é gravado/);

  const layout = await page.evaluate(() => ({
    rows: document.querySelectorAll('#inboxList [data-intimation-id]').length,
    overflow: document.documentElement.scrollWidth - innerWidth,
    chipInRow: Boolean(document.querySelector('#inboxList [data-intimation-id] .publication-ai-chip')),
    viewActive: document.querySelector('#view-inbox.active') !== null
  }));
  assert.equal(layout.rows, 4, 'todas as publicações do recorte continuam visíveis');
  assert.ok(layout.overflow <= 2, `sem overflow global (${layout.overflow}px)`);
  assert.ok(layout.chipInRow, 'chip vive dentro da linha, não em camada solta');
  assert.ok(layout.viewActive, 'a view de publicações permanece ativa');
  assert.deepEqual(pageErrors, [], `sem erros de página: ${pageErrors.join(' | ')}`);

  await context.close();
  return chips;
}

const session = await startUiV2Session();
try {
  const light = await runScenario(session, 'light');
  const dark = await runScenario(session, 'dark');
  assert.ok(light.length >= 2 && dark.length >= 2, 'os dois temas renderizam a triagem');
  console.log(`chips light=${light.length} dark=${dark.length}`);
} finally {
  await session.stop();
}
process.exit(0);
