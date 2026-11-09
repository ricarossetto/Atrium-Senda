import { sourceMethodLabel } from '../../core/source-method-label.js?v=3.0.0';
import { iconSvg } from './icons.js?v=3.0.0';

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
    || sourceId === 'inpi-rpi' || sourceId === 'inpi'
    || /\beproc\b|pjeoffice|certificado|sess[aã]o local|portal judicial|\b(?:webcal|ical|datajud|djen|inpi|rpi)\b|comunica pje/.test(haystack)
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
        const accessibleName = `${routeLabel} ${sourceName}. Status ${status.label}. Método ${sourceMethodLabel(source.method) || 'não informado'}. Última verificação ${lastCheck}.`;
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
              <span>${escapeHtml(sourceMethodLabel(source.method))}</span>
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

/**
 * Painel de falhas de captura DJEN por termo/OAB. Recebe a fila persistida
 * pelo servidor e devolve o HTML das linhas com a ação de retry manual. A
 * mensagem da falha é conteúdo de fonte externa: sempre escapada.
 */
export function renderDjenCaptureErrorsV2Presentation({
  queue = {},
  escapeHtml,
  formatDateTime
} = {}) {
  const terms = Array.isArray(queue.terms) ? queue.terms : [];
  const count = terms.length;
  const lastRunAt = queue.lastRun?.at || queue.updatedAt || null;
  const detail = count
    ? `${count === 1 ? '1 termo monitorado falhou' : `${count} termos monitorados falharam`} na última captura de publicações.${lastRunAt ? ` Última execução: ${formatDateTime(lastRunAt)}.` : ''}`
    : '';
  const rowsHtml = terms.map(term => {
    const identity = [term.registration || '', term.name || ''].map(value => String(value || '').trim()).filter(Boolean).join(' · ')
      || `OAB/${term.oabUf || 'UF'} ${term.oabNumber || '000000'}`;
    const attempts = Math.max(1, Number(term.attempts) || 1);
    const attemptLabel = attempts === 1 ? '1 tentativa' : `${attempts} tentativas`;
    const lastFailed = term.lastFailedAt ? formatDateTime(term.lastFailedAt) : 'horário não informado';
    const accessibleName = `Tentar novamente a captura de ${identity}`;
    return `
      <div class="djen-capture-error-row" data-term-id="${escapeHtml(term.termId)}">
        <div class="djen-capture-error-identity">
          <strong>${escapeHtml(identity)}</strong>
          <small>${escapeHtml(term.message || 'Falha sem detalhe informado pela fonte.')}</small>
        </div>
        <div class="djen-capture-error-meta">
          <span>${escapeHtml(attemptLabel)}</span>
          <span>Última falha: ${escapeHtml(lastFailed)}</span>
        </div>
        <button type="button" class="button ghost djen-capture-error-retry" data-retry-term-id="${escapeHtml(term.termId)}" aria-label="${escapeHtml(accessibleName)}">
          ${iconSvg('sync')}Tentar novamente
        </button>
      </div>`;
  }).join('');
  return Object.freeze({ count, detail, rowsHtml });
}
