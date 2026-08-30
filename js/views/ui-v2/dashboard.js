function setText(documentRef, id, value) {
  const element = documentRef?.getElementById?.(id);
  if (element) element.textContent = String(value);
}

export function renderDashboardV2Summary({
  documentRef = globalThis.document,
  metrics = {},
  widgets = {},
  formatDate = value => String(value || '')
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
  return Object.freeze({ late, untreated, deadlines, nextAgendaId: nextAgenda?.id || null, attentionState });
}
