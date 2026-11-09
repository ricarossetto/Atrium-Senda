/**
 * Situação das fontes de coleta no estado oficial.
 * O registro mais recente vence: a coleta grava pelo servidor, e uma aba aberta há horas
 * não pode devolver uma verificação antiga ao salvar.
 */
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
  return { sources: merged, changed };
}

/** Ao salvar pelo navegador: mantém a lista enviada, mas nunca recua uma verificação. */
export function keepNewestSourceChecks(current, incoming) {
  if (!Array.isArray(incoming) || !Array.isArray(current)) return incoming;
  return incoming.map(source => {
    const stored = current.find(item => item?.id === source?.id);
    return stored && checkedAt(stored) > checkedAt(source)
      ? { ...source, status: stored.status, detail: stored.detail, lastCheck: stored.lastCheck }
      : source;
  });
}
