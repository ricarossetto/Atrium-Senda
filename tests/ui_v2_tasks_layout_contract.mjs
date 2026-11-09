import assert from 'node:assert/strict';
import { TASK_COLUMNS } from '../js/features/tasks.js';
import { renderTaskListRow } from '../js/views/ui-v2/tasks-presenter.js';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CONTRATO ESTRUTURAL E LAYOUT DA LISTA DE TAREFAS');
console.log('===============================================================\n');

// 1. Unit Contract Check: renderTaskListRow outputs correct container, content, metadata, actions
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const sampleHtml = renderTaskListRow({
  task: {
    id: 'task-contract-1',
    title: 'Minuta de Agravo de Instrumento',
    description: 'Elaborar peça recursal com pedido de efeito suspensivo.',
    process: '5001234-56.2026.8.21.0001',
    client: 'Empresa Teste SA',
    status: 'andamento',
    priority: 'urgente',
    points: 25,
    responsible: 'Dr. Roberto Silveira',
    deadline: '2026-09-25',
    fatalDeadline: '2026-09-30',
    timeLogs: [{ minutes: 45 }]
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: () => 'DJEN',
  escapeHtml,
  formatDate: d => d,
  formatMinutes: m => `${m}m`,
  totalTimeMinutes: logs => logs.reduce((acc, l) => acc + (Number(l.minutes) || 0), 0),
  daysUntil: () => 5,
  processes: [{ id: 'p1', number: '5001234-56.2026.8.21.0001', client: 'Empresa Teste SA' }],
  contacts: []
});

assert.ok(sampleHtml.includes('task-list-row'), 'Row container required');
assert.ok(sampleHtml.includes('task-list-check-col'), 'Checkbox column required');
assert.ok(sampleHtml.includes('task-list-main'), 'Main content block required');
assert.ok(sampleHtml.includes('task-list-meta-col'), 'Metadata & actions column required');
assert.ok(sampleHtml.includes('task-list-title-line'), 'Title line required');
assert.ok(sampleHtml.includes('task-list-context-line'), 'Context line required');
assert.ok(sampleHtml.includes('task-list-tags-line'), 'Tags line required');
assert.ok(sampleHtml.includes('task-list-deadline-box'), 'Deadline box required');
assert.ok(sampleHtml.includes('task-list-controls-group'), 'Controls group required');
assert.ok(sampleHtml.includes('Prazo fatal'), 'Prazo fatal kicker required');
assert.ok(sampleHtml.includes('25 pts'), 'Effort points required');
assert.ok(sampleHtml.includes('Dr. Roberto Silveira'), 'Responsible owner required');
assert.ok(sampleHtml.includes('data-task-list-timesheet-start'), 'Timer start action required');
assert.ok(sampleHtml.includes('data-task-list-move'), 'Stage selector required');

console.log('✓ Contrato unitário do renderer: 100% dos blocos e metadados presentes.');

// 1b. Divergência de prazo com a fonte oficial: informa sem alterar o prazo vigente
const conflictHtml = renderTaskListRow({
  task: {
    id: 'task-contract-2',
    title: 'Prazo eproc — Manifestação',
    status: 'triagem',
    priority: 'importante',
    deadline: '2026-10-02',
    sourceReportedDeadlineAt: '2026-09-20',
    deadlineConflict: { source: 'eproc', sourceValue: '2026-09-20', humanValue: '2026-10-02', mode: 'auto' }
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: () => 'eproc',
  escapeHtml,
  formatDate: d => d,
  formatMinutes: m => `${m}m`,
  totalTimeMinutes: () => 0,
  daysUntil: () => 5,
  processes: [],
  contacts: []
});
assert.ok(conflictHtml.includes('task-deadline-conflict'), 'Aviso de divergência com a fonte é obrigatório');
assert.ok(conflictHtml.includes('eproc declarou 2026-09-20'), 'Aviso deve declarar a data informada pela fonte');
assert.ok(conflictHtml.includes('2026-10-02'), 'Prazo vigente (edição humana) deve permanecer exibido');
assert.ok(conflictHtml.includes('data digitada por pessoa, não alterada'), 'O aviso explica em linguagem que a data da tarefa prevalece e não foi alterada');
assert.ok(conflictHtml.includes('e esta tarefa está com 2026-10-02'), 'A explicação completa (title) traz as duas datas');
assert.ok(conflictHtml.includes('nada foi sobrescrito'), 'A explicação afirma que nada foi sobrescrito');
assert.ok(!/informa .{0,20}conferir/.test(conflictHtml), 'O texto antigo, que só mostrava a data da fonte, não pode voltar');

const convergedHtml = renderTaskListRow({
  task: {
    id: 'task-contract-3',
    title: 'Prazo eproc — Manifestação',
    status: 'triagem',
    priority: 'importante',
    deadline: '2026-09-20',
    sourceReportedDeadlineAt: '2026-09-20',
    deadlineConflict: { source: 'eproc', sourceValue: '2026-09-20', humanValue: '2026-09-20', mode: 'auto' }
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: () => 'eproc',
  escapeHtml,
  formatDate: d => d,
  formatMinutes: m => `${m}m`,
  totalTimeMinutes: () => 0,
  daysUntil: () => 5,
  processes: [],
  contacts: []
});
assert.ok(!convergedHtml.includes('task-deadline-conflict'), 'Sem divergência real o aviso não pode aparecer');
console.log('✓ Contrato unitário do aviso de divergência de prazo com a fonte oficial.');

// 1c. Selos da triagem assistiva: sempre sugestão, nunca dado da tarefa
const triageRowHtml = renderTaskListRow({
  task: {
    id: 'task-contract-4',
    title: 'Elaborar manifestação',
    status: 'triagem',
    priority: 'normal',
    deadline: '',
    timeLogs: []
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: () => 'SISTEMA JURÍDICO',
  escapeHtml,
  formatDate: d => d,
  formatMinutes: m => `${m}m`,
  totalTimeMinutes: () => 0,
  daysUntil: () => 5,
  processes: [],
  contacts: [],
  triage: { category: 'prazo', urgency: 'alta', confidence: 0.82, action: 'suggest' }
});
assert.ok(triageRowHtml.includes('task-triage-chip'), 'Selos da triagem assistiva são obrigatórios');
assert.ok(triageRowHtml.includes('>Prazo<'), 'Categoria sugerida deve aparecer');
assert.ok(triageRowHtml.includes('urgency-alta'), 'Urgência sugerida deve aparecer');
assert.ok(triageRowHtml.includes('Nada foi alterado'), 'Tooltip deve declarar que nada foi alterado');
assert.ok(triageRowHtml.includes('confiança 82%'), 'Confiança deve ser informada como sugestão');

const noTriageHtml = renderTaskListRow({
  task: { id: 'task-contract-5', title: 'Tarefa sem sugestão', status: 'triagem', priority: 'normal', deadline: '', timeLogs: [] },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: () => 'SISTEMA JURÍDICO',
  escapeHtml,
  formatDate: d => d,
  formatMinutes: m => `${m}m`,
  totalTimeMinutes: () => 0,
  daysUntil: () => 5,
  processes: [],
  contacts: []
});
assert.ok(!noTriageHtml.includes('task-triage-chip'), 'Sem sugestão vigente não há selo');
console.log('✓ Contrato unitário dos selos de triagem assistiva da tarefa.');

// 2. Playwright Computed Layout Validation (Desktop & Mobile)
const session = await startUiV2Session();
try {
  // Desktop validation (1440x900)
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    await prepareUiV2TasksFixture(page);

    // Switch to list view
    await page.locator('#taskListViewButton').click();
    await page.waitForTimeout(300);

    const rows = page.locator('#taskList .task-list-row');
    const rowCount = await rows.count();
    assert.ok(rowCount >= 4, `Esperado pelo menos 4 tarefas, encontrado ${rowCount}`);

    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      const rowMetrics = await rows.nth(i).evaluate(el => {
        const rect = el.getBoundingClientRect();
        const main = el.querySelector('.task-list-main')?.getBoundingClientRect();
        const meta = el.querySelector('.task-list-meta-col')?.getBoundingClientRect();
        const check = el.querySelector('.task-list-check-col')?.getBoundingClientRect();

        return {
          rowWidth: rect.width,
          mainWidth: main?.width || 0,
          metaWidth: meta?.width || 0,
          checkWidth: check?.width || 0,
          mainRight: main?.right || 0,
          metaLeft: meta?.left || 0
        };
      });

      assert.ok(rowMetrics.rowWidth > 800, `Card deve usar a largura disponível: ${rowMetrics.rowWidth}px`);
      assert.ok(rowMetrics.mainWidth > 400, `Conteúdo principal não pode ficar espremido: ${rowMetrics.mainWidth}px`);
      assert.ok(rowMetrics.metaWidth > 250, `Bloco de ações/prazos deve ter espaço adequado: ${rowMetrics.metaWidth}px`);
      assert.ok(rowMetrics.metaLeft >= rowMetrics.mainRight - 2, 'Main e Meta não podem se sobrepor horizontalmente');
    }

    assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);
    console.log(`✓ Layout Desktop validado em ${rowCount} linhas: zero sobreposição, largura total utilizada (> 1100px).`);

  } finally {
    await context.close();
  }

  // Mobile validation (390x844)
  const mobileContext = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobileContext, session.server.baseUrl, { theme: 'light', probe: true });
    await prepareUiV2TasksFixture(page);
    await page.locator('#taskListViewButton').click();
    await page.waitForTimeout(300);

    const firstRowMetrics = await page.locator('#taskList .task-list-row').first().evaluate(el => {
      const rect = el.getBoundingClientRect();
      const main = el.querySelector('.task-list-main')?.getBoundingClientRect();
      const meta = el.querySelector('.task-list-meta-col')?.getBoundingClientRect();

      return {
        rowWidth: rect.width,
        mainWidth: main?.width || 0,
        metaWidth: meta?.width || 0,
        mainBottom: main?.bottom || 0,
        metaTop: meta?.top || 0
      };
    });

    assert.ok(firstRowMetrics.rowWidth > 300, `Mobile deve usar largura do viewport: ${firstRowMetrics.rowWidth}px`);
    assert.ok(firstRowMetrics.mainWidth > 200, `Conteúdo principal mobile adequado: ${firstRowMetrics.mainWidth}px`);
    assert.ok(firstRowMetrics.metaTop >= firstRowMetrics.mainBottom - 4, 'No mobile o bloco meta deve empilhar abaixo do main sem colidir');

    assert.deepEqual(pageErrors, [], `Erros de página mobile: ${pageErrors.join(' | ')}`);
    console.log('✓ Layout Mobile validado: empilhamento vertical correto, zero sobreposição.');

  } finally {
    await mobileContext.close();
  }

  console.log('[Barra] Contagem agrupada com Lista/Kanban e alinhada aos botões...');
  const alignmentContext = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page } = await prepareUiV2Page(alignmentContext, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2TasksFixture(page);
    const metrics = await page.evaluate(() => {
      const rect = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom), centerY: Math.round((box.top + box.bottom) / 2) };
      };
      return {
        chip: rect('#taskResultCount'),
        viewSwitch: rect('#taskViewSwitch'),
        cluster: rect('.task-view-cluster'),
        buttons: [...document.querySelectorAll('#view-kanban .toolbar-actions .button')].map(button => Math.round(button.getBoundingClientRect().bottom)),
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    assert.ok(metrics.chip && metrics.viewSwitch, 'contagem e seletor de visualização existem');
    assert.ok(Math.abs(metrics.chip.centerY - metrics.viewSwitch.centerY) <= 2, `contagem centrada com o seletor (${metrics.chip.centerY} vs ${metrics.viewSwitch.centerY})`);
    assert.ok(metrics.buttons.length >= 3 && metrics.buttons.every(bottom => Math.abs(bottom - metrics.viewSwitch.bottom) <= 2), 'seletor e botões compartilham a linha de base');
    assert.ok(metrics.chip.right <= metrics.viewSwitch.left + 1, 'contagem fica imediatamente à esquerda do seletor');
    assert.ok(metrics.overflow <= 2, `sem overflow global (${metrics.overflow}px)`);
    console.log('✓ Barra de tarefas: contagem agrupada e alinhada com os controles.');
  } finally {
    await alignmentContext.close();
  }

} finally {
  await session.stop();
}

console.log('\n===============================================================');
console.log('  CONTRATO DE LAYOUT DA LISTA DE TAREFAS: APROVADO');
console.log('===============================================================\n');
