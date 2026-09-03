function setText(documentRef, id, value) {
  const element = documentRef?.getElementById?.(id);
  if (element) element.textContent = String(value);
}

function durationLabel(minutes) {
  if (!Number.isFinite(minutes)) return 'Sem base suficiente';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(minutes / 1440).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

function rankedRows(items = [], escapeHtml = value => String(value ?? ''), emptyLabel = 'Sem dados classificados') {
  if (!items.length) return `<p class="dashboard-insight-empty">${escapeHtml(emptyLabel)}</p>`;
  return `<ol class="dashboard-insight-ranking">${items.map(item => `<li><span>${escapeHtml(item.label)}</span><strong>${Number(item.count || 0)}</strong></li>`).join('')}</ol>`;
}

function renderActionableInsights({ documentRef, insights, formatDate, formatCurrency, escapeHtml }) {
  const container = documentRef?.getElementById?.('dashboardActionableInsights');
  if (!container) return;
  const latestCollector = insights.latestCollectorCheck ? formatDate(insights.latestCollectorCheck) : 'Ainda não atualizado';
  const sample = Number(insights.treatmentSampleSize || 0);
  container.innerHTML = `
    <article class="dashboard-insight-card">
      <header><span>Carga de trabalho</span><strong>${insights.tasksByResponsible?.reduce((total, item) => total + Number(item.count || 0), 0) || 0} abertas</strong></header>
      ${rankedRows(insights.tasksByResponsible, escapeHtml, 'Nenhuma tarefa aberta')}
      <small>Distribuição por responsável cadastrado</small>
    </article>
    <article class="dashboard-insight-card">
      <header><span>Fluxo de publicações</span><strong>${Number(insights.pendingPublications || 0)} pendentes</strong></header>
      <dl><div><dt>Tempo médio de tratamento</dt><dd>${escapeHtml(durationLabel(insights.averageTreatmentMinutes))}</dd></div><div><dt>Atividades para revisar</dt><dd>${Number(insights.recentActivityCount || 0)}</dd></div></dl>
      <small>${sample ? `Média baseada em ${sample} tratamento${sample === 1 ? '' : 's'} com início e conclusão registrados` : 'A média aparece quando início e conclusão estiverem registrados'}</small>
    </article>
    <article class="dashboard-insight-card">
      <header><span>Saúde operacional</span><strong>${Number(insights.pendingSyncs || 0)} pendências</strong></header>
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
  formatDate = value => String(value || ''),
  formatCurrency = value => String(value || 0),
  escapeHtml = value => String(value ?? '')
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
  setText(
    documentRef,
    'v2AttentionSummary',
    attentionState === 'clear'
      ? 'Nenhuma pendência crítica identificada nos dados atuais.'
      : 'Revise os itens sinalizados antes de iniciar o restante do expediente.'
  );
  const opening = documentRef?.getElementById?.('v2DashboardOpening');
  if (opening) opening.dataset.attentionState = attentionState;
  renderActionableInsights({ documentRef, insights, formatDate, formatCurrency, escapeHtml });
  return Object.freeze({ late, untreated, deadlines, nextAgendaId: nextAgenda?.id || null, attentionState });
}
