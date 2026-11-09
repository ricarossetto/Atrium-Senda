import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeProductivityReport } from '../js/core/task-performance.js';
import { renderReportsWorkspace } from '../js/views/ui-v2/reports-presenter.js';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const formatDate = value => `DATA:${value}`;
const formatMinutes = value => (value ? `${value}m` : '');

console.log('\n=== UI V2 — RELATÓRIOS DE PRODUTIVIDADE ===\n');

const now = new Date('2026-09-18T15:00:00.000Z');
const unitTasks = [
  { id: 'rel-a', title: 'Agravo de Instrumento sintético', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste',
    taskDefinition: 'Agravo de Instrumento', points: 25, createdAt: '2026-09-08T12:00:00.000Z', completedAt: '2026-09-10T12:00:00.000Z',
    deadline: '2026-09-09', client: 'Cliente Relatório A', process: '5001111-61.2026.8.21.0001', timeLogs: [{ minutes: 60 }] },
  { id: 'rel-b', title: 'Recurso Especial sintético', status: 'concluida', responsible: 'Equipe B', completedBy: 'Advogado Colaborador',
    taskDefinition: 'Recurso Especial', points: 10, createdAt: '2026-09-12T12:00:00.000Z', completedAt: '2026-09-13T12:00:00.000Z',
    client: 'Cliente Relatório B', timeLogs: [] },
  { id: 'rel-open', title: 'Prazo aberto sintético', status: 'andamento', responsible: 'Equipe A', points: 5, deadline: '2026-09-01', timeLogs: [] }
];
const unitReport = computeProductivityReport(unitTasks, {
  configuration: { users: [{ name: 'Equipe A', pointsGoal: 100 }, { name: 'Equipe B', pointsGoal: 50 }] },
  now,
  period: 'current-month'
});

const html = renderReportsWorkspace({ report: unitReport, sort: { key: 'points', dir: 'desc' }, escapeHtml, formatDate, formatMinutes });
for (const expected of ['Produtividade por responsável', 'Quem fez o que', 'Atividades concluídas por tipo', 'Exportar CSV', 'Alcance', 'Agravo de Instrumento sintético', 'Advogado Colaborador', 'Cliente Relatório A']) {
  assert.ok(html.includes(expected), `Presenter deve preservar: ${expected}`);
}
assert.ok(html.includes('aria-pressed="true"'), 'Coluna ativa precisa indicar ordenação.');
assert.match(html, /Duração: da criação à conclusão/, 'Rodapé deve declarar a regra de cálculo.');
assert.match(html, /prazo informado/);
assert.equal((html.match(/data-report-sort=/g) || []).length, 3, 'Três colunas ordenáveis (responsável, concluídas, pontos).');
assert.equal((html.match(/data-report-filter=/g) || []).length, 3, 'Fora do modo custom: período, responsável e tipo.');
assert.match(html, /<th scope="col">/);

const emptyHtml = renderReportsWorkspace({
  report: computeProductivityReport([], { configuration: {}, now }),
  sort: { key: 'points', dir: 'desc' },
  escapeHtml,
  formatDate,
  formatMinutes
});
assert.match(emptyHtml, /Nenhuma tarefa concluída neste período/, 'Estado vazio honesto para conclusões.');
assert.match(emptyHtml, /Sem movimentação de tarefas neste filtro/, 'Estado vazio honesto para a tabela-resumo.');

const presenterSource = readFileSync(new URL('../js/views/ui-v2/reports-presenter.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /fetch\(|secureFetch|Store\.|save\(|flush\(/, 'Presenter não pode acessar rede ou Store.');
console.log('✓ Presenter: tabelas, estados vazios, ordenação, rodapé e pureza.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
    await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      window.__reportDownloads = [];
      window.URL.createObjectURL = () => 'blob:relatorio-sintetico';
      window.URL.revokeObjectURL = () => {};
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) { window.__reportDownloads.push(this.download); return; }
        return originalClick.call(this);
      };
      Store.state.tasks = [
        { id: 'rel-a', title: 'Agravo de Instrumento sintético', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste', taskDefinition: 'Agravo de Instrumento', points: 25, createdAt: '2026-02-08T12:00:00.000Z', completedAt: '2026-02-10T12:00:00.000Z', deadline: '2026-02-09', client: 'Cliente Relatório A', process: '5001111-61.2026.8.21.0001', timeLogs: [{ minutes: 60 }] },
        { id: 'rel-a-2', title: 'Minuta sintética', status: 'concluida', responsible: 'Equipe A', completedBy: 'Advogada Teste', taskDefinition: 'Minuta', points: 5, createdAt: '2026-03-07T12:00:00.000Z', completedAt: '2026-03-08T12:00:00.000Z', timeLogs: [] },
        { id: 'rel-b', title: 'Recurso Especial sintético', status: 'concluida', responsible: 'Equipe B', completedBy: 'Advogado Colaborador', taskDefinition: 'Recurso Especial', points: 10, createdAt: '2026-03-05T12:00:00.000Z', completedAt: '2026-03-06T12:00:00.000Z', client: 'Cliente Relatório B', timeLogs: [] },
        { id: 'rel-open', title: 'Prazo aberto sintético', status: 'andamento', responsible: 'Equipe A', points: 5, deadline: '2026-04-01', timeLogs: [] }
      ];
      Store.state.configuration.users = [{ name: 'Equipe A', pointsGoal: 100 }, { name: 'Equipe B', pointsGoal: 50 }];
      App.switchView('reports');
    });
    await page.locator('#view-reports.active').waitFor();
    await page.locator('#reportsWorkspace .reports-kpis').waitFor();

    assert.equal(await page.locator('#view-reports').getAttribute('data-title'), 'Relatórios');
    assert.equal(await page.locator('[data-report-filter="period"]').count(), 1);
    assert.equal(await page.locator('[data-report-filter="responsible"]').count(), 1);
    assert.equal(await page.locator('[data-report-filter="taskType"]').count(), 1);
    assert.equal(await page.locator('[data-report-filter="dateFrom"]').count(), 0, 'Datas só aparecem no período personalizado.');

    await page.selectOption('[data-report-filter="period"]', 'custom');
    await page.locator('[data-report-filter="dateFrom"]').waitFor();
    await page.fill('[data-report-filter="dateFrom"]', '2026-01-01');
    await page.fill('[data-report-filter="dateTo"]', '2026-12-31');

    const completionsText = await page.locator('#reportsCompletionsHeading').locator('xpath=../..').textContent();
    for (const expected of ['Advogada Teste', 'Advogado Colaborador', 'Cliente Relatório A', 'Equipe B']) {
      assert.ok(completionsText.includes(expected), `Quem fez o que deve incluir ${expected}.`);
    }
    assert.match(await page.locator('#reportsWorkspace .reports-kpis').textContent(), /Concluídas/, 'KPIs do período devem renderizar.');

    const firstRowResponsible = () => page.locator('#reportsWorkspace .reports-table tbody tr').first().locator('td').first().textContent();
    assert.equal(await firstRowResponsible(), 'Equipe A', 'Ordenação padrão por pontos: Equipe A (30) primeiro.');
    await page.locator('[data-report-sort="responsible"]').click();
    assert.equal(await page.locator('[data-report-sort="responsible"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await firstRowResponsible(), 'Equipe A', 'Nome ascendente mantém Equipe A primeiro.');
    await page.locator('[data-report-sort="responsible"]').click();
    assert.equal(await firstRowResponsible(), 'Equipe B', 'Nome descendente inverte a ordem das linhas.');

    await page.selectOption('[data-report-filter="responsible"]', 'Equipe B');
    assert.match(await page.locator('#reportsWorkspace .reports-kpis').textContent(), /Concluídas[\s\S]*?1/, 'Filtro por responsável re-renderiza os KPIs.');
    await page.selectOption('[data-report-filter="responsible"]', 'all');

    await page.locator('[data-report-export]').click();
    const downloads = await page.evaluate(() => window.__reportDownloads);
    assert.equal(downloads.length, 1, 'Exportar CSV deve disparar um download.');
    assert.match(downloads[0], /^atrium-produtividade-\d{4}-\d{2}-\d{2}\.csv$/);

    const geometry = await page.evaluate(() => {
      const wrap = document.querySelector('#reportsWorkspace .reports-table-wrap');
      const toolbar = document.querySelector('#reportsWorkspace .reports-toolbar');
      return {
        pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        tableOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : -1,
        toolbarVisible: Boolean(toolbar && toolbar.getBoundingClientRect().height > 0)
      };
    });
    assert.ok(geometry.pageOverflow <= 1, 'Relatórios não podem criar rolagem horizontal no documento.');
    assert.equal(geometry.toolbarVisible, true);
    assert.deepEqual(pageErrors, [], `Pageerror: ${pageErrors.join(' | ')}`);
    console.log('✓ Playwright: visão, filtros, período personalizado, ordenação, export CSV e geometria.');
  } finally {
    await context.close();
  }

  const mobileContext = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobileContext, session.server.baseUrl);
    await page.evaluate(() => {
      const { App } = window.Atrium;
      App.switchView('reports');
    });
    await page.locator('#view-reports.active').waitFor();
    const mobile = await page.evaluate(() => {
      const button = document.querySelector('[data-report-export]');
      return {
        pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        buttonHeight: button ? button.getBoundingClientRect().height : 0
      };
    });
    assert.ok(mobile.pageOverflow <= 1, 'Mobile não pode criar rolagem horizontal no documento.');
    assert.ok(mobile.buttonHeight >= 44, 'Ação principal precisa de alvo tátil de 44px no mobile.');
    assert.deepEqual(pageErrors, []);
    console.log('✓ Mobile: sem overflow e alvo tátil do export.');
  } finally {
    await mobileContext.close();
  }
} finally {
  await session.stop();
}

console.log('\n>>> UI V2 REPORTS: PASS <<<\n');
