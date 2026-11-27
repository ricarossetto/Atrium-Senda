/**
 * Situação das fontes de coleta no estado oficial.
 * O registro mais recente vence: a coleta grava pelo servidor, e uma aba aberta há horas
 * não pode devolver uma verificação antiga ao salvar.
 */
/**
 * Fontes que saíram do produto. A consulta ao TJRS por chave foi desativada em
 * 22/11/2026; a entrada antiga não pode voltar pela coleta nem pelo navegador.
 */
export const RETIRED_SOURCE_IDS = Object.freeze(new Set(['tjrs-sidecar-monitor']));

export function withoutRetiredSources(sources) {
  return Array.isArray(sources) ? sources.filter(source => !RETIRED_SOURCE_IDS.has(String(source?.id || ''))) : sources;
}

const checkedAt = source => {
  const parsed = Date.parse(source?.lastCheck || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export function mergeSourceChecks(current, incoming) {
  const merged = Array.isArray(current) ? current.map(source => ({ ...source })) : [];
  let changed = false;
  for (const source of Array.isArray(incoming) ? incoming : []) {
    if (!source?.id) continue;
    const index = merged.findIndex(item => item?.id === source.id);
    if (index < 0) {
      merged.push({ ...source });
      changed = true;
    } else if (checkedAt(source) > checkedAt(merged[index])) {
      merged[index] = { ...merged[index], ...source };
      changed = true;
    }
  }
  const kept = withoutRetiredSources(merged);
  return { sources: kept, changed: changed || kept.length !== merged.length };
}

/** Ao salvar pelo navegador: mantém a lista enviada, mas nunca recua uma verificação. */
export function keepNewestSourceChecks(current, incoming) {
  if (!Array.isArray(incoming)) return incoming;
  if (!Array.isArray(current)) return withoutRetiredSources(incoming);
  return withoutRetiredSources(incoming).map(source => {
    const stored = current.find(item => item?.id === source?.id);
    return stored && checkedAt(stored) > checkedAt(source)
      ? { ...source, status: stored.status, detail: stored.detail, lastCheck: stored.lastCheck }
      : source;
  });
}
