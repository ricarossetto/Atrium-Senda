import assert from 'node:assert/strict';
import { computeProductivityReport, buildProductivityCsv } from '../js/core/task-performance.js';
import { createReportsFeature } from '../js/features/reports.js';

console.log('\n=== RELATÓRIOS DE PRODUTIVIDADE ===\n');

const now = new Date('2026-09-18T15:00:00.000Z');
const tasks = [
  { id: 'done-a', title: 'Agravo de Instrumento', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste',
    taskDefinition: 'Agravo de Instrumento', points: 25, createdAt: '2026-09-01T12:00:00.000Z', completedAt: '2026-09-05T12:00:00.000Z',
    deadline: '2026-09-04', client: 'Cliente Alfa', process: '5001111-61.2026.8.21.0001', timeLogs: [{ minutes: 120 }] },
  { id: 'done-b', title: 'Recurso Especial', status: 'concluida', responsible: 'Equipe B', completedBy: 'Advogado Colaborador',
    taskDefinition: 'Recurso Especial', points: 10, createdAt: '2026-09-10T12:00:00.000Z', completedAt: '2026-09-12T12:00:00.000Z',
    deadline: '2026-09-20', client: 'Cliente Beta', process: '5002222-06.2026.5.04.0001', timeLogs: [] },
  { id: 'done-a-2', title: 'Agravo de Instrumento', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste',
    taskDefinition: 'Agravo de Instrumento', points: 25, createdAt: '2026-08-01T12:00:00.000Z', completedAt: '2026-08-03T12:00:00.000Z' },
  { id: 'open-1', title: 'Prazo aberto', status: 'andamento', responsible: 'Equipe A', points: 5, deadline: '2026-09-01' },
  { id: 'legacy-done', title: 'Concluída legada', status: 'concluida', responsible: 'Equipe A', points: 7 }
];

const configuration = {
  users: [
    { name: 'Equipe A', pointsGoal: 100 },
    { name: 'Equipe B', pointsGoal: 0 }
  ]
};

const report = computeProductivityReport(tasks, { configuration, now, period: 'current-month' });
assert.equal(report.range.label, 'Mês atual');
assert.equal(report.totals.completed, 2, 'Somente conclusões do mês atual.');
assert.equal(report.totals.points, 35);
assert.equal(report.totals.timeLoggedMinutes, 120);
assert.equal(report.totals.avgDurationMinutes, Math.round(((5760 + 2880) / 2)), 'Duração = conclusão - criação.');
assert.equal(report.totals.avgDelayDays, -3, 'Atraso = conclusão - prazo informado (1,5 d e -7,5 d).');
assert.equal(report.totals.pending, 1, 'Concluída legada sem data não conta como pendente.');
assert.equal(report.totals.late, 1, 'Prazo 2026-09-01 é atrasado em 18/09.');

const rowA = report.rows.find(row => row.responsible === 'Equipe A');
assert.equal(rowA.completed, 1);
assert.equal(rowA.points, 25);
assert.equal(rowA.goal, 100, 'Meta individual vem de configuration.users.');
assert.equal(rowA.reach, 0.25);
const rowB = report.rows.find(row => row.responsible === 'Equipe B');
assert.equal(rowB.goal, null, 'Meta zerada não gera alcance.');
assert.equal(rowB.reach, null);

assert.equal(report.completions[0].id, 'done-b', 'Conclusões ordenadas por data decrescente.');
assert.equal(report.completions[0].completedBy, 'Advogado Colaborador', 'Quem concluiu entra no detalhe.');
assert.deepEqual(report.byType, [
  { type: 'Agravo de Instrumento', count: 1 },
  { type: 'Recurso Especial', count: 1 }
].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, 'pt-BR')));
assert.equal(report.filterOptions.responsibles.includes('Equipe A'), true);
console.log('✓ Mês atual: totais, metas por usuário, duração, atraso e quem concluiu.');

const previous = computeProductivityReport(tasks, { configuration, now, period: 'previous-month' });
assert.equal(previous.range.label, 'Mês anterior');
assert.equal(previous.totals.completed, 1);
assert.equal(previous.completions[0].id, 'done-a-2');
const last30 = computeProductivityReport(tasks, { configuration, now, period: '30d' });
assert.equal(last30.totals.completed, 2);
const custom = computeProductivityReport(tasks, { configuration, now, period: 'custom', dateFrom: '2026-08-01', dateTo: '2026-09-30' });
assert.equal(custom.totals.completed, 3, 'Período personalizado cobre a janela inteira.');
console.log('✓ Períodos mês anterior, 30 dias e personalizado aplicam a janela correta.');

const filtered = computeProductivityReport(tasks, { configuration, now, period: 'current-month', responsible: 'Equipe B', taskType: 'Agravo de Instrumento' });
assert.equal(filtered.totals.completed, 0, 'Filtros combinados (responsável + tipo) excluem fora do recorte.');
assert.equal(filtered.totals.pending, 0);
const byTypeOnly = computeProductivityReport(tasks, { configuration, now, period: 'current-month', taskType: 'Agravo de Instrumento' });
assert.equal(byTypeOnly.totals.completed, 1);
assert.equal(byTypeOnly.rows.every(row => row.responsible === 'Equipe A'), true);
console.log('✓ Filtros de responsável e tipo de atividade funcionam combinados.');

const csv = buildProductivityCsv(report);
assert.match(csv, /Produtividade por respons/);
assert.match(csv, /Conclusões do período/);
assert.match(csv, /Advogado Colaborador/);
assert.match(csv, /Equipe A,1,25,100,25%/);
assert.match(csv, /Cliente Alfa/);
assert.ok(csv.includes('"Título, com vírgula"') === false, 'Sem vírgula não cita célula.');
const tricky = computeProductivityReport([{ id: 'x', title: 'Título, "aspas"', status: 'concluida', responsible: 'Á', completedBy: 'B', points: 1, completedAt: '2026-09-05T12:00:00.000Z', createdAt: '2026-09-05T12:00:00.000Z' }], { configuration: {}, now });
const trickyCsv = buildProductivityCsv(tricky);
assert.match(trickyCsv, /"Título, ""aspas"""/, 'CSV cita células com vírgula/aspas.');
console.log('✓ CSV tem dois blocos e citação correta de células perigosas.');

// Feature: init, render, filtros, ordenação e exportação.
const listeners = new Map();
const elements = {
  reportsWorkspace: {
    innerHTML: '',
    addEventListener(type, handler) {
      const key = `reportsWorkspace:${type}`;
      listeners.set(key, [...(listeners.get(key) || []), handler]);
    }
  }
};
const downloads = [];
const createdAnchors = [];
const toasts = [];
const previousCreateObjectURL = globalThis.URL.createObjectURL;
const previousRevokeObjectURL = globalThis.URL.revokeObjectURL;
globalThis.URL.createObjectURL = () => 'blob:relatorio-sintetico';
globalThis.URL.revokeObjectURL = () => {};
try {
  const store = {
    state: {
      tasks,
      configuration
    }
  };
  const feature = createReportsFeature({
    store,
    documentRef: {
      getElementById: id => elements[id] || null,
      createElement: tag => {
        const anchor = { tag, download: '', href: '', click() { downloads.push(this.download); } };
        createdAnchors.push(anchor);
        return anchor;
      }
    },
    windowRef: {},
    computeReport: (source, options) => computeProductivityReport(source, { ...options, now }),
    escapeHtml: value => String(value ?? ''),
    formatDate: value => String(value || ''),
    formatMinutes: value => (value ? `${value}m` : ''),
    showToast: (message, type) => toasts.push({ message, type })
  });

  assert.equal(feature.init(), true);
  assert.equal(feature.init(), false, 'Init é idempotente.');
  const report = feature.render();
  assert.equal(report.totals.completed, 2);
  assert.match(elements.reportsWorkspace.innerHTML, /Produtividade por responsável/);
  assert.match(elements.reportsWorkspace.innerHTML, /Quem fez o que/);
  assert.match(elements.reportsWorkspace.innerHTML, /Advogado Colaborador/);
  assert.match(elements.reportsWorkspace.innerHTML, /Atividades concluídas por tipo/);

  const changeHandlers = listeners.get('reportsWorkspace:change');
  assert.equal(changeHandlers.length, 1);
  changeHandlers[0]({ target: { closest: selector => selector === '[data-report-filter]' ? { dataset: { reportFilter: 'period' }, value: 'previous-month' } : null } });
  assert.equal(feature.filters.period, 'previous-month');
  assert.equal(feature.report.totals.completed, 1, 'Troca de período re-renderiza com a janela nova.');

  const clickHandlers = listeners.get('reportsWorkspace:click');
  assert.equal(clickHandlers.length, 1);
  clickHandlers[0]({ target: { closest: selector => selector === '[data-report-sort]' ? { dataset: { reportSort: 'responsible' } } : null } });
  assert.deepEqual(feature.sort, { key: 'responsible', dir: 'asc' }, 'Primeiro clique em coluna nova ordena ascendente.');
  clickHandlers[0]({ target: { closest: selector => selector === '[data-report-sort]' ? { dataset: { reportSort: 'responsible' } } : null } });
  assert.deepEqual(feature.sort, { key: 'responsible', dir: 'desc' }, 'Segundo clique inverte a direção.');

  clickHandlers[0]({ target: { closest: selector => selector === '[data-report-export]' ? {} : null } });
  assert.equal(downloads.length, 1, 'Exportação gera um download.');
  assert.match(downloads[0], /^atrium-produtividade-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.deepEqual(toasts.at(-1), { message: 'Relatório exportado em CSV.', type: 'success' });
  assert.equal(createdAnchors[0].tag, 'a');
  console.log('✓ Feature: init idempotente, filtros, ordenação e export CSV.');
} finally {
  if (previousCreateObjectURL) globalThis.URL.createObjectURL = previousCreateObjectURL;
  if (previousRevokeObjectURL) globalThis.URL.revokeObjectURL = previousRevokeObjectURL;
}

console.log('\n>>> REPORTS FEATURE: PASS <<<\n');
