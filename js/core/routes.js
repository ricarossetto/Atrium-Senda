export const VIEW_PATHS = Object.freeze({
  dashboard: '/visao-geral',
  processes: '/trabalho/processos',
  inbox: '/trabalho/publicacoes',
  kanban: '/trabalho/tarefas',
  agenda: '/trabalho/agenda',
  contacts: '/relacionamento/contatos',
  leads: '/relacionamento/atendimentos',
  financial: '/gestao/financeiro',
  reports: '/gestao/relatorios',
  calculations: '/calculos',
  documents: '/gestao/documentos',
  assistant: '/inteligencia/assistente',
  prompts: '/inteligencia/prompts',
  monitoring: '/sistema/monitoramento',
  integrations: '/sistema/integracoes',
  configuration: '/sistema/configuracoes',
  importer: '/sistema/importador',
  audit: '/sistema/auditoria',
  links: '/sistema/links'
});

const ROUTE_VIEWS = Object.freeze(Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, pathname]) => [normalizeRoute(pathname), view])
));

export function normalizeRoute(value) {
  return String(value || '')
    .split(/[?#]/)[0]
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase();
}

export function viewFromPathname(pathname) {
  const route = normalizeRoute(pathname);
  return route ? (ROUTE_VIEWS[route] || null) : null;
}

export function pathForView(view) {
  return VIEW_PATHS[view] || null;
}

export function viewFromHash(hash) {
  const candidate = String(hash || '').replace(/^#/, '').trim();
  return VIEW_PATHS[candidate] ? candidate : null;
}

/**
 * Deep link do e-mail: /trabalho/publicacoes?publication=<id> (ou #inbox?publication=<id>).
 * Devolve o identificador bruto; quem consome resolve o registro oficial.
 */
export function publicationIdFromLocation(search = '', hash = '') {
  const fromSearch = new URLSearchParams(String(search || '')).get('publication');
  if (fromSearch && String(fromSearch).trim()) return String(fromSearch).trim();
  const hashText = String(hash || '');
  const queryIndex = hashText.indexOf('?');
  if (queryIndex < 0) return '';
  const fromHash = new URLSearchParams(hashText.slice(queryIndex + 1)).get('publication');
  return fromHash && String(fromHash).trim() ? String(fromHash).trim() : '';
}
