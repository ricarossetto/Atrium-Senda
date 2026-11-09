/**
 * ATRIUM — projeção de leitura da auditoria oficial.
 *
 * Eventos históricos usam `at`/`actor`/`detail`; contratos mais novos podem usar
 * `timestamp`/`user`/`details`. A trilha administrativa precisa exibir os dois sem
 * inventar campo nem perder o valor original.
 */
export function normalizeAuditEvent(item = {}) {
  return {
    ...item,
    timestamp: item.timestamp || item.at || null,
    user: item.user || item.actor || 'sistema',
    module: item.module || item.source || null,
    details: item.details || item.detail || null,
    result: item.result || 'OK'
  };
}

export function filterAuditEvents(events = [], filters = {}) {
  const user = String(filters.user || '').trim().toLowerCase();
  const action = String(filters.action || '').trim().toLowerCase();
  const module = String(filters.module || '').trim().toLowerCase();
  return events.filter(item => {
    if (user && !String(item.user || '').toLowerCase().includes(user)) return false;
    if (action && !String(item.action || '').toLowerCase().includes(action)) return false;
    if (module && !String(item.module || '').toLowerCase().includes(module)) return false;
    return true;
  });
}
