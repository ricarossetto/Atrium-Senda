function meaningful(value) {
  if (value === undefined || value === null || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

function updatedAtMs(row) {
  const parsed = Date.parse(row?.updatedAt || row?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeRows(rows) {
  const ordered = [...rows].sort((left, right) => updatedAtMs(left) - updatedAtMs(right));
  const merged = {};
  for (const row of ordered) {
    for (const [field, value] of Object.entries(row || {})) {
      if (meaningful(value) || !(field in merged)) merged[field] = value;
    }
  }
  const sources = rows.map(row => String(row?.source || '')).filter(Boolean);
  if (sources.length) merged.source = sources.reduce((longest, source) => (source.length > longest.length ? source : longest), '');

  if (rows.some(row => row?.scope !== 'private')) {
    const owners = rows.map(row => String(row?.privateOwnerUserId || row?.ownerUserId || '').trim()).filter(Boolean);
    const responsible = new Set((Array.isArray(merged.responsibleUserIds) ? merged.responsibleUserIds : []).map(String));
    owners.forEach(owner => responsible.add(owner));
    merged.scope = 'office';
    delete merged.privateOwnerUserId;
    delete merged.ownerUserId;
    if (responsible.size) merged.responsibleUserIds = [...responsible];
  }
  return merged;
}

/**
 * O acervo não pode ter duas linhas para o mesmo id: a segunda fica invisível para quase
 * todo o sistema, que indexa por id. Funde as repetidas sem perder dado: o valor mais
 * recente vence, campo vazio não apaga campo preenchido e escritório vence privado,
 * com o dono antigo mantido entre os responsáveis.
 */
export function collapseDuplicateProcessRows(processes) {
  if (!Array.isArray(processes)) return processes;
  const groups = new Map();
  for (const row of processes) {
    const id = String(row?.id || '');
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  if (![...groups.values()].some(rows => rows.length > 1)) return processes;

  const emitted = new Set();
  const result = [];
  for (const row of processes) {
    const id = String(row?.id || '');
    if (!id) {
      result.push(row);
      continue;
    }
    if (emitted.has(id)) continue;
    emitted.add(id);
    const rows = groups.get(id);
    result.push(rows.length === 1 ? row : mergeRows(rows));
  }
  return result;
}
