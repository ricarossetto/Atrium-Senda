import { renderPerformanceChart } from './performance-chart.js?v=3.0.2';

function setText(documentRef, id, value) {
  const element = documentRef?.getElementById?.(id);
  if (element) element.textContent = String(value);
}

const MONTH_LABELS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function monthLabel(series) {
  return series ? `${MONTH_LABELS[series.month] || ''} de ${series.year}` : '';
}

function monthSlug(series) {
  const label = String(MONTH_LABELS[series?.month] || '').slice(0, 3).toLowerCase();
  return series && label ? `${label}/${series.year}` : '';
}

function deltaLabel(variation) {
  if (!Number.isFinite(variation)) return 'sem base anterior';
  const sign = variation > 0 ? '+' : '';
  return `${sign}${Math.round(variation)}%`;
}

function variationSmall(current, variation, previousText, emptyLabel) {
  if (current <= 0) return emptyLabel;
  if (!Number.isFinite(variation)) return 'sem base anterior';
  return `${deltaLabel(variation)} vs ${previousText}`;
}

function renderPerformancePanel({ documentRef, performance, escapeHtml }) {
  const container = documentRef?.getElementById?.('v2PerformancePanel');
  if (!container || !performance) return;

  const hasActivity = performance.current.completed + performance.previous.completed > 0;
  const previousSlug = monthSlug(performance.previous);
  const goalValue = performance.goal ? `${performance.goal.toLocaleString('pt-BR')} pts` : '';
  const reach = Number.isFinite(performance.goalRatio) ? `${Math.round(performance.goalRatio * 100)}%` : '—';

  container.innerHTML = `
    <div class="v2-performance-head">
      <div><p class="v2-kicker">Desempenho</p><strong>${escapeHtml(monthLabel(performance.current))}</strong></div>
      <div class="v2-performance-legend" aria-hidden="true">
        <span><i class="v2-perf-swatch is-current"></i>Mês atual</span>
        <span><i class="v2-perf-swatch is-previous"></i>Mês anterior</span>
        ${performance.goal ? '<span><i class="v2-perf-swatch is-goal"></i>Meta</span>' : ''}
      </div>
    </div>
    <div class="v2-performance-kpis">
      <div><span>Concluídas</span><strong>${performance.current.completed}</strong><small>${escapeHtml(variationSmall(performance.current.completed, performance.variation.completed, `${previousSlug} · ${performance.previous.completed}`, 'sem conclusões no mês'))}</small></div>
      <div><span>Pontos</span><strong>${performance.current.points.toLocaleString('pt-BR')}</strong><small>${escapeHtml(variationSmall(performance.current.points, performance.variation.points, `${previousSlug} · ${performance.previous.points.toLocaleString('pt-BR')}`, 'sem pontos no mês'))}</small></div>
      <div><span>Pendentes</span><strong>${performance.pending}</strong><small>${performance.late} em atraso</small></div>
      <div><span>Alcance da meta</span><strong>${escapeHtml(reach)}</strong><small>${goalValue ? `Meta: ${escapeHtml(goalValue)}` : 'Sem meta configurada'}</small></div>
    </div>
    ${hasActivity
      ? renderPerformanceChart({ performance, escapeHtml })
      : '<p class="v2-performance-empty">Nenhuma tarefa concluída neste mês. As comparações aparecem conforme a equipe conclui tarefas.</p>'}`;
}

function durationLabel(minutes) {
  if (!Number.isFinite(minutes)) return 'Sem base suficiente';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(minutes / 1440).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function rankedRows(items = [], escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])), emptyLabel = 'Sem dados classificados') {
  if (!items.length) return `<p class="dashboard-insight-empty">${escapeHtml(emptyLabel)}</p>`;
  return `<ol class="dashboard-insight-ranking">${items.map(item => `<li><span>${escapeHtml(item.label)}</span><strong>${Number(item.count || 0)}</strong></li>`).join('')}</ol>`;
}

function shortDate(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || ''));
  return match ? `${match[3]}/${match[2]}` : '';
}

function renderWeeklyFunnel(weeks = [], escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))) {
  const list = (Array.isArray(weeks) ? weeks : []).filter(entry => entry && typeof entry === 'object');
  if (!list.length) return '';
  const hasActivity = list.some(entry =>
    Number(entry.received || 0) + Number(entry.treated || 0) + Number(entry.discarded || 0) + Number(entry.pending || 0) > 0);
  if (!hasActivity) return '';
  const visible = list.slice(-4);
  const weekHeads = visible.map(entry => {
    const start = shortDate(entry.weekStart);
    const end = shortDate(entry.weekEnd);
    const label = start || String(entry.week || '—');
    const full = start && end ? `Semana de ${start} a ${end}` : label;
    return `<th scope="col" title="${escapeHtml(full)}">${escapeHtml(label)}</th>`;
  }).join('');
  const metricRows = [
    ['Recebidas', 'received'],
    ['Tratadas', 'treated'],
    ['Descartadas', 'discarded'],
    ['Pendentes', 'pending']
  ].map(([label, key]) =>
    `<tr><th scope="row">${label}</th>${visible.map(entry => `<td>${Number(entry[key] || 0)}</td>`).join('')}</tr>`
  ).join('');
  return `
      <div class="dashboard-funnel-weekly">
        <table>
          <caption>Funil semanal · ${visible.length === 1 ? 'semana atual' : `últimas ${visible.length} semanas`}</caption>
          <thead><tr><th scope="col">Métrica</th>${weekHeads}</tr></thead>
          <tbody>${metricRows}</tbody>
        </table>
      </div>`;
}

function renderActionableInsights({ documentRef, insights, formatDate, formatCurrency, escapeHtml }) {
  const container = documentRef?.getElementById?.('dashboardActionableInsights');
  if (!container) return;
  const latestCollector = insights.latestCollectorCheck ? formatDate(insights.latestCollectorCheck) : 'Ainda não atualizado';
  const sample = Number(insights.treatmentSampleSize || 0);
  const pendingPublications = Number(insights.pendingPublications || 0);
  const pendingSyncs = Number(insights.pendingSyncs || 0);
  container.innerHTML = `
    <article class="dashboard-insight-card">
      <header><span>Carga de trabalho</span><strong>${insights.tasksByResponsible?.reduce((total, item) => total + Number(item.count || 0), 0) || 0} abertas</strong></header>
      ${rankedRows(insights.tasksByResponsible, escapeHtml, 'Nenhuma tarefa aberta')}
      <small>Distribuição por responsável cadastrado</small>
    </article>
    <article class="dashboard-insight-card">
      <header><span>Fluxo de publicações</span><strong>${pendingPublications} ${pendingPublications === 1 ? 'pendente' : 'pendentes'}</strong></header>
      <dl><div><dt>Tempo médio de tratamento</dt><dd>${escapeHtml(durationLabel(insights.averageTreatmentMinutes))}</dd></div><div><dt>Atividades para revisar</dt><dd>${Number(insights.recentActivityCount || 0)}</dd></div></dl>
      ${renderWeeklyFunnel(insights.weeklyFunnel, escapeHtml)}
      <small>${sample ? `Média baseada em ${sample} tratamento${sample === 1 ? '' : 's'} com início e conclusão registrados` : 'A média aparece quando início e conclusão estiverem registrados'}</small>
    </article>
    <article class="dashboard-insight-card">
      <header><span>Situação do sistema</span><strong>${pendingSyncs} ${pendingSyncs === 1 ? 'pendência' : 'pendências'}</strong></header>
      <dl><div><dt>Última atualização registrada</dt><dd>${escapeHtml(latestCollector)}</dd></div><div><dt>Documentos sem classificação</dt><dd>${Number(insights.unclassifiedDocuments || 0)}</dd></div></dl>
      <small>Fontes e documentos que exigem conferência humana</small>
    </article>
    <article class="dashboard-insight-card">
      <header><span>Carteira e recebimentos</span><strong>${escapeHtml(formatCurrency(insights.receiptsTotal || 0))}</strong></header>
      ${rankedRows(insights.processesByStatus, escapeHtml, 'Nenhum processo ativo')}
      <small>${Number(insights.receiptsCount || 0)} recebimento${Number(insights.receiptsCount || 0) === 1 ? '' : 's'} registrado${Number(insights.receiptsCount || 0) === 1 ? '' : 's'} · sem contabilidade fiscal</small>
    </article>`;
}


export function renderDashboardV2Summary({
  documentRef = globalThis.document,
  metrics = {},
  widgets = {},
  insights = {},
  performance = null,
  formatDate = value => String(value || ''),
  formatCurrency = value => String(value || 0),
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
} = {}) {
  const late = Number(widgets.late || 0);
  const untreated = Number(metrics.untreatedIntimations || 0);
  const deadlines = Number(metrics.deadlines || 0);
  const nextAgenda = widgets.reminders?.[0] || null;
  const attentionState = late > 0 || untreated > 0 || deadlines > 0 ? 'attention' : 'clear';

  setText(documentRef, 'v2AttentionLate', late);
  setText(documentRef, 'v2AttentionPublications', untreated);
  setText(documentRef, 'v2AttentionDeadlines', deadlines);
  setText(documentRef, 'v2AttentionAgenda', nextAgenda ? formatDate(nextAgenda.date) : 'Livre');
  setText(documentRef, 'v2AttentionAgendaDetail', nextAgenda?.title || 'Nenhum compromisso imediato.');
  const opening = documentRef?.getElementById?.('v2DashboardOpening');
  if (opening) opening.dataset.attentionState = attentionState;
  renderPerformancePanel({ documentRef, performance, escapeHtml });
  renderActionableInsights({ documentRef, insights, formatDate, formatCurrency, escapeHtml });
  return Object.freeze({ late, untreated, deadlines, nextAgendaId: nextAgenda?.id || null, attentionState });
}
