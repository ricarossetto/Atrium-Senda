const SOURCE_STATUS = Object.freeze({
  ok: Object.freeze({ label: 'Ativo', className: 'connected' }),
  attention: Object.freeze({ label: 'Atenção', className: 'warning' }),
  error: Object.freeze({ label: 'Falha', className: 'danger' }),
  planned: Object.freeze({ label: 'Preparado', className: 'planned' }),
  off: Object.freeze({ label: 'Desativado', className: 'muted' })
});

export function renderMonitoringV2Presentation({
  sources = [],
  escapeHtml,
  formatDateTime
} = {}) {
  const sourceHtml = sources.length
    ? sources.map(source => {
        const status = SOURCE_STATUS[source.status] || SOURCE_STATUS.off;
        const lastCheck = source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada';
        const sourceName = source.name || source.short || 'Fonte sem identificação';
        const accessibleName = `Configurar ${sourceName}. Status ${status.label}. Método ${source.method || 'não informado'}. Última verificação ${lastCheck}.`;
        return `
          <div class="monitor-v2-source-row status-${escapeHtml(source.status || 'off')}" data-source-id="${escapeHtml(source.id)}" tabindex="0" role="button" aria-label="${escapeHtml(accessibleName)}">
            <div class="monitor-v2-source-identity">
              <span class="source-mark" aria-hidden="true">${escapeHtml(source.short)}</span>
              <div>
                <strong>${escapeHtml(sourceName)}</strong>
                <small>${escapeHtml(source.detail)}</small>
              </div>
            </div>
            <div class="monitor-v2-source-meta">
              <span class="monitor-v2-meta-label">Método</span>
              <span>${escapeHtml(source.method)}</span>
            </div>
            <div class="monitor-v2-source-meta monitor-v2-last-check">
              <span class="monitor-v2-meta-label">Última verificação</span>
              <span>${escapeHtml(lastCheck)}</span>
            </div>
            <div class="monitor-v2-source-status">
              <span class="status-chip ${status.className}">${status.label}</span>
            </div>
            <span class="monitor-v2-source-route" aria-hidden="true">Configurar <b>→</b></span>
          </div>`;
      }).join('')
    : `
      <div class="monitor-v2-empty" role="status">
        <span aria-hidden="true">◇</span>
        <strong>Nenhuma fonte configurada</strong>
        <p>As fontes jurídicas cadastradas aparecerão aqui com seu estado operacional.</p>
      </div>`;

  return Object.freeze({ sourceHtml });
}
