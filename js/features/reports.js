import { Store } from '../core/store.js?v=3.0.1';
import { computeProductivityReport, buildProductivityCsv } from '../core/task-performance.js?v=3.0.1';
import { renderReportsWorkspace } from '../views/ui-v2/reports-presenter.js?v=3.0.1';
import { officeScopeItems } from '../core/office-scope.js?v=3.0.1';

/**
 * ATRIUM — Feature de Relatórios (produtividade de tarefas)
 *
 * Projeção derivada de `Store.state.tasks` com filtros de período, responsável
 * e tipo de atividade, ordenação da tabela-resumo e exportação CSV. Sem Store
 * paralelo, sem mutação de dados e sem inferência de prazo jurídico.
 */
export function createReportsFeature({
  store = Store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  escapeHtml,
  formatDate,
  formatMinutes,
  showToast,
  computeReport = computeProductivityReport,
  renderWorkspace = renderReportsWorkspace
} = {}) {
  let initialized = false;
  let filters = { period: 'current-month', responsible: 'all', taskType: 'all', dateFrom: '', dateTo: '' };
  let sort = { key: 'points', dir: 'desc' };
  let currentReport = null;
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },
    get filters() { return filters; },
    get sort() { return sort; },
    get report() { return currentReport; },

    init() {
      if (initialized) return false;
      const container = byId('reportsWorkspace');
      if (!container) return false;
      initialized = true;
      container.addEventListener('click', event => {
        const sortTarget = event.target.closest('[data-report-sort]');
        if (sortTarget) {
          const key = sortTarget.dataset.reportSort;
          sort = sort.key === key
            ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'responsible' ? 'asc' : 'desc' };
          this.render();
          return;
        }
        if (event.target.closest('[data-report-export]')) this.exportCsv();
      });
      container.addEventListener('change', event => {
        const control = event.target.closest('[data-report-filter]');
        if (!control) return;
        filters = { ...filters, [control.dataset.reportFilter]: control.value };
        this.render();
      });
      return true;
    },

    compute() {
      currentReport = computeReport(officeScopeItems(store.state.tasks), {
        configuration: store.state.configuration || {},
        now: new Date(),
        ...filters
      });
      return currentReport;
    },

    render() {
      const container = byId('reportsWorkspace');
      if (!container) return null;
      const report = this.compute();
      container.innerHTML = renderWorkspace({ report, sort, escapeHtml, formatDate, formatMinutes });
      return report;
    },

    exportCsv() {
      const report = currentReport || this.compute();
      try {
        const blob = new (globalThis.Blob || windowRef.Blob)([buildProductivityCsv(report)], { type: 'text/csv;charset=utf-8' });
        const url = globalThis.URL.createObjectURL(blob);
        const anchor = documentRef.createElement('a');
        anchor.href = url;
        anchor.download = `atrium-produtividade-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        globalThis.URL.revokeObjectURL(url);
        showToast?.('Relatório exportado em CSV.', 'success');
      } catch {
        showToast?.('Não foi possível exportar o relatório. Tente novamente.', 'error');
      }
    }
  };

  return feature;
}
