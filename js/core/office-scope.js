/**
 * Escopo de leitura do escritório no cliente.
 *
 * O servidor já entrega apenas o acervo que o membro pode ver. Aqui filtramos
 * o que é agregação de escritório (contadores, relatórios, contexto do
 * assistente, exportação): registros `scope: private` e registros suprimidos
 * pela precedência do escritório não entram nessa projeção.
 */

export function isOfficeScopeItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.captureSuppressed) return false;
  return String(item.scope || 'office') !== 'private';
}

export function officeScopeItems(list) {
  return (Array.isArray(list) ? list : []).filter(isOfficeScopeItem);
}

export function officeScopeState(state = {}) {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  for (const name of ['processes', 'tasks', 'intimations', 'communications', 'contacts', 'agenda', 'documents', 'leads', 'customDocs']) {
    if (Array.isArray(next[name])) next[name] = officeScopeItems(next[name]);
  }
  return next;
}
