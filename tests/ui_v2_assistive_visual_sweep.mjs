import assert from 'node:assert/strict';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  prepareUiV2ProcessesFixture,
  prepareUiV2PublicationsFixture,
  prepareUiV2TasksFixture,
  startUiV2Session
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — VARREDURA VISUAL DOS SELOS ASSISTIVOS (MOBILE + LARGO)');
console.log('===============================================================\n');

const VIEWPORTS = [
  { width: 390, height: 844, label: 'celular 390x844' },
  { width: 860, height: 900, label: 'limite 860x900' },
  { width: 1920, height: 1080, label: 'desktop 1920x1080' },
  { width: 2560, height: 1440, label: 'widescreen 2560x1440' }
];

const CLASSIFIER_RESPONSES = {
  '/api/ai-classifier/status': { ok: true, enabled: true, available: true, reason: 'operacional' },
  '/api/ai-classifier/suggestions': {
    ok: true,
    enabled: true,
    generatedAt: '2026-09-29T00:00:00.000Z',
    suggestions: {
      'ui-v2-publication-process': { area: 'trabalhista', areaConfidence: 0.84, priority: 'normal', deadlineSignal: 'sim', deadlineDays: 'd15', action: 'suggest', reason: '' }
    }
  },
  '/api/ai-classifier/task-suggestions': {
    ok: true,
    enabled: true,
    generatedAt: '2026-09-29T00:00:00.000Z',
    suggestions: {
      'ui-v2-task-overdue': { category: 'prazo', categoryConfidence: 0.82, urgency: 'alta', urgencyConfidence: 0.9, action: 'suggest', reason: '' }
    }
  },
  '/api/ai-classifier/process-suggestions': {
    ok: true,
    enabled: true,
    generatedAt: '2026-09-29T00:00:00.000Z',
    suggestions: {
      'ui-v2-process-tjrs': { movementType: 'decisao', movementConfidence: 0.83, needsAttention: 'sim', missingFields: ['comarca', 'classe'], action: 'suggest', reason: '' }
    }
  },
  '/api/ai-classifier/duplicate-candidates': {
    ok: true,
    enabled: true,
    generatedAt: '2026-09-29T00:00:00.000Z',
    pairs: [{
      key: 'djen:ui-v2-dup-a|djen:ui-v2-dup-b',
      aId: 'djen:ui-v2-dup-a',
      bId: 'djen:ui-v2-dup-b',
      aSource: 'djen',
      bSource: 'djen',
      pairType: 'djen×djen',
      exact: true,
      autoSafe: true,
      verdict: 'mesma',
      confidence: 0.88,
      action: 'suggest',
      reason: '',
      at: '2026-09-29T00:00:00.000Z'
    }]
  }
};

async function stubClassifier(context) {
  await context.addInitScript(payloads => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      for (const [needle, payload] of payloads) {
        if (url.includes(needle)) {
          return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }
      return original(input, init);
    };
  }, Object.entries(CLASSIFIER_RESPONSES));
}

async function chipGeometry(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    const container = element.closest('article, tr, .inbox-list-card') || element.parentElement;
    const containerRect = container.getBoundingClientRect();
    return {
      text: String(element.textContent || '').trim(),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      insideContainer: rect.left >= containerRect.left - 1 && rect.right <= containerRect.right + 1,
      withinViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1,
      visible: rect.width > 0 && rect.height > 0
    };
  });
}

const session = await startUiV2Session();
const report = [];
try {
  for (const viewport of VIEWPORTS) {
    const context = await session.createContext({ viewport });
    try {
      await stubClassifier(context);
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark', probe: true });

      // 1. Tarefas: selos de categoria/urgência + aviso de prazo da fonte.
      await prepareUiV2TasksFixture(page);
      const taskChip = await chipGeometry(page, '#kanbanBoard [data-task-id="ui-v2-task-overdue"] .task-triage-chip');
      assert.ok(taskChip.visible, `[${viewport.label}] selo de tarefa precisa estar visível`);
      assert.ok(taskChip.insideContainer, `[${viewport.label}] selo de tarefa não pode vazar do cartão`);
      assert.ok(taskChip.withinViewport, `[${viewport.label}] selo de tarefa não pode sair da tela`);
      const conflictChip = await chipGeometry(page, '#kanbanBoard [data-task-id="ui-v2-task-overdue"] .task-triage-chip');
      assert.equal(conflictChip.visible, true);
      await page.evaluate(() => {
        const { Store, App } = window.Atrium;
        const task = Store.state.tasks.find(item => item.id === 'ui-v2-task-overdue');
        task.deadlineConflict = { source: 'eproc', sourceValue: '2026-10-05', humanValue: task.deadline, mode: 'auto' };
        App.renderAll();
      });
      const deadlineNotice = await chipGeometry(page, '#kanbanBoard [data-task-id="ui-v2-task-overdue"] .task-date-source-conflict');
      assert.ok(deadlineNotice.visible, `[${viewport.label}] aviso de prazo da fonte precisa estar visível`);
      assert.ok(deadlineNotice.insideContainer && deadlineNotice.withinViewport, `[${viewport.label}] aviso de prazo não pode vazar`);
      const tasksLayout = await collectUiV2LayoutEvidence(page);

      // 2. Processos: selo de andamento e de cadastro incompleto.
      await prepareUiV2ProcessesFixture(page);
      const movementChip = await chipGeometry(page, '#processTableBody .process-triage-chip.is-movement');
      assert.ok(movementChip.visible, `[${viewport.label}] selo de andamento precisa estar visível`);
      assert.ok(movementChip.insideContainer && movementChip.withinViewport, `[${viewport.label}] selo de andamento não pode vazar`);
      const missingChip = await chipGeometry(page, '#processTableBody .process-triage-chip.is-missing');
      assert.ok(missingChip.visible, `[${viewport.label}] selo de cadastro incompleto precisa estar visível`);
      assert.ok(missingChip.insideContainer && missingChip.withinViewport, `[${viewport.label}] selo de cadastro não pode vazar`);
      const processesLayout = await collectUiV2LayoutEvidence(page);

      // 3. Publicações: painel de duplicatas prováveis com veredito.
      await prepareUiV2PublicationsFixture(page);
      await page.evaluate(() => {
        const { Store, App } = window.Atrium;
        const base = {
          source: 'djen',
          event: 'Intimação · Decisão',
          sourceReportedAt: '2026-09-10',
          text: 'Texto integral sintético idêntico para a revisão de duplicidade.',
          treatmentStatus: 'untreated',
          process: '5007777-77.2026.8.21.0001'
        };
        Store.state.intimations.push({ ...base, id: 'djen:ui-v2-dup-a', externalId: 'djen:ui-v2-dup-a' });
        Store.state.intimations.push({ ...base, id: 'djen:ui-v2-dup-b', externalId: 'djen:ui-v2-dup-b' });
        App.renderAll();
      });
      const panelVisible = await page.locator('#duplicateReviewPanel:not(.hidden)').count();
      assert.equal(panelVisible, 1, `[${viewport.label}] painel de duplicatas precisa estar visível`);
      const verdictChip = await chipGeometry(page, '#duplicateReviewPanel .duplicate-verdict');
      assert.ok(verdictChip.visible, `[${viewport.label}] veredito de duplicata precisa estar visível`);
      assert.ok(verdictChip.insideContainer && verdictChip.withinViewport, `[${viewport.label}] veredito não pode vazar`);
      const pairRow = await chipGeometry(page, '#duplicateReviewPanel .duplicate-pair');
      assert.ok(pairRow.insideContainer && pairRow.withinViewport, `[${viewport.label}] par de duplicatas não pode vazar`);
      const publicationsLayout = await collectUiV2LayoutEvidence(page);

      // 4. Sem erro de página e sem estouro horizontal global nas três telas.
      for (const [view, layout] of [['tarefas', tasksLayout], ['processos', processesLayout], ['publicações', publicationsLayout]]) {
        assert.ok(layout.globalOverflow <= 1, `[${viewport.label}] ${view}: estouro horizontal de ${layout.globalOverflow}px`);
        assert.deepEqual(layout.duplicateIds, [], `[${viewport.label}] ${view}: ids duplicados no DOM`);
      }
      const errors = (pageErrors || []).map(error => String(error?.message || error));
      assert.deepEqual(errors, [], `[${viewport.label}] erros de página: ${errors.join(' | ')}`);

      report.push(`${viewport.label}: tarefas=${taskChip.width}x${taskChip.height}px, andamento=${movementChip.width}px, cadastro=${missingChip.width}px, duplicata=${verdictChip.width}px, overflow=0`);
      console.log(`✓ ${viewport.label} — selos visíveis, dentro do contêiner, sem estouro e sem erro de página.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

console.log('\nResumo da varredura:');
for (const line of report) console.log(`  · ${line}`);
console.log('\n[PASS] Varredura visual assistiva concluída (celular, limite, desktop e widescreen).\n');
