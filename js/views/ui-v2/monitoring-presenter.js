import { iconSvg } from './icons.js';

const SOURCE_STATUS = Object.freeze({
  ok: Object.freeze({ label: 'Ativo', className: 'connected' }),
  attention: Object.freeze({ label: 'Atenção', className: 'warning' }),
  error: Object.freeze({ label: 'Falha', className: 'danger' }),
  planned: Object.freeze({ label: 'Preparado', className: 'planned' }),
  off: Object.freeze({ label: 'Desativado', className: 'muted' })
});

function sourceRouteLabel(source = {}) {
  const sourceId = String(source.id || '').toLowerCase();
  const haystack = [source.id, source.name, source.short, source.method, source.detail]
    .map(value => String(value || '').toLowerCase()).join(' ');
  return sourceId === 'a1' || sourceId === 'pje' || sourceId === 'external-calendar'
    || sourceId === 'djen-cnj' || sourceId === 'djen' || sourceId === 'datajud-cnj' || sourceId === 'datajud'
    || /\beproc\b|pjeoffice|certificado|sess[aã]o local|portal judicial|\b(?:webcal|ical|datajud|djen)\b|comunica pje/.test(haystack)
    ? 'Configurar'
    : 'Ver detalhes';
}

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
        const routeLabel = sourceRouteLabel(source);
        const accessibleName = `${routeLabel} ${sourceName}. Status ${status.label}. Método ${source.method || 'não informado'}. Última verificação ${lastCheck}.`;
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
            <span class="monitor-v2-source-route" aria-hidden="true">${routeLabel} ${iconSvg('chevron-right')}</span>
          </div>`;
      }).join('')
    : `
      <div class="monitor-v2-empty" role="status">
        <span aria-hidden="true">${iconSvg('monitoring')}</span>
        <strong>Nenhuma fonte configurada</strong>
        <p>As fontes jurídicas cadastradas aparecerão aqui com seu estado operacional.</p>
      </div>`;

  return Object.freeze({ sourceHtml });
}
