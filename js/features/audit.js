import { Store, isoDate } from '../core/store.js';

export function createAuditFeature({
  store = Store,
  documentRef = globalThis.document,
  escapeHtml,
  formatDateTime,
  exportJson,
  getIsoDate = isoDate,
  showToast,
  presentation
} = {}) {
  let initialized = false;
  let auditFilter = 'all';
  let auditQuery = '';
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },
    get filter() { return auditFilter; },
    set filter(value) { auditFilter = value || 'all'; },
    get query() { return auditQuery; },
    set query(value) { auditQuery = value || ''; },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('auditFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-audit-filter]');
        if (!button) return;
        auditFilter = button.dataset.auditFilter;
        byId('auditFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.render(auditFilter, byId('auditSearch')?.value);
      });
      byId('auditSearch')?.addEventListener('input', () => this.render(auditFilter, byId('auditSearch').value));
      byId('btnExportAuditLog')?.addEventListener('click', () => this.export());
      byId('btnClearAuditLog')?.addEventListener('click', () => this.resetFilters());
      byId('exportAuditButton')?.addEventListener('click', () => this.export());
      return true;
    },

    filteredEvents(filter = auditFilter, query = auditQuery) {
      let events = store.state.audit || [];
      const normalizedQuery = String(query || '').toLowerCase().trim();
      if (normalizedQuery) {
        events = events.filter(event => String(event.action || '').toLowerCase().includes(normalizedQuery)
          || String(event.detail || '').toLowerCase().includes(normalizedQuery)
          || String(event.actor || '').toLowerCase().includes(normalizedQuery));
      }
      if (filter && filter !== 'all') {
        events = events.filter(event => {
          const action = String(event.action || '').toLowerCase();
          if (filter === 'security') return action.includes('auth') || action.includes('login') || action.includes('senha') || action.includes('2fa') || action.includes('totp') || action.includes('chave') || action.includes('sessão');
          if (filter === 'sync') return action.includes('sincroniz') || action.includes('colet') || action.includes('djen') || action.includes('datajud') || action.includes('import');
          if (filter === 'task') return action.includes('tarefa') || action.includes('prazo') || action.includes('kanban');
          if (filter === 'process') return action.includes('processo') || action.includes('caso') || action.includes('cliente');
          return true;
        });
      }
      return events;
    },

    render(filter = 'all', query = '') {
      const list = byId('auditList');
      const badge = byId('auditCountBadge');
      if (!list) return;
      auditFilter = filter || auditFilter || 'all';
      auditQuery = query !== undefined ? query : (auditQuery || '');
      const events = this.filteredEvents(auditFilter, auditQuery);
      if (badge) badge.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;
      if (presentation?.render?.({ events, filter: auditFilter, query: auditQuery, formatDateTime })) return events;
      if (!events.length) {
        list.innerHTML = '<div class="empty-detail" style="padding:32px 16px;text-align:center;"><span>✦</span><h3>Nenhum evento registrado</h3><p>Não há eventos de auditoria para os filtros selecionados.</p></div>';
        return events;
      }
      list.innerHTML = `
        <div class="responsive-table">
          <table class="sortable-table">
            <thead><tr><th style="width:170px;">Data e Hora</th><th style="width:140px;">Usuário / Agente</th><th>Ação Executada</th><th>Detalhes do Evento</th><th style="width:100px;">Status</th></tr></thead>
            <tbody>${events.map(item => `
              <tr>
                <td><time style="font-size:12px;color:var(--muted);">${formatDateTime(item.at)}</time></td>
                <td><strong style="font-size:12.5px;">${escapeHtml(item.actor || 'Sistema')}</strong></td>
                <td><span class="gold-pill" style="font-size:11px;">${escapeHtml(item.action)}</span></td>
                <td><span style="font-size:12.5px;color:var(--text);">${escapeHtml(item.detail || '')}</span></td>
                <td><span class="status-chip connected" style="font-size:10.5px;">Registrado</span></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
      return events;
    },

    resetFilters() {
      auditFilter = 'all';
      auditQuery = '';
      if (byId('auditSearch')) byId('auditSearch').value = '';
      byId('auditFilters')?.querySelectorAll('button').forEach((item, index) => item.classList.toggle('active', index === 0));
      this.render('all', '');
      showToast?.('Filtros de auditoria redefinidos.', 'info');
    },

    export() {
      exportJson?.(store.state.audit, `atrium-auditoria-${getIsoDate()}.json`);
    }
  };

  return feature;
}
