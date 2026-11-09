/**
 * Quando o servidor recusa um salvamento porque o estado mudou (por exemplo, a varredura de
 * um tribunal gravou enquanto a tela estava aberta), a alteração local não pode ser perdida:
 * reaplica sobre o estado novo só o que mudou desde a última versão que este navegador leu.
 * Alterações em campos diferentes convivem. Se os dois lados mudaram o mesmo campo para
 * valores diferentes, há conflito real: nada é trocado, porque nenhum dos dois pode ser
 * descartado em silêncio.
 */
const SERVER_OWNED_FIELDS = new Set(['revision', 'updatedAt', 'appVersion', 'schemaVersion', 'dataVersion']);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasIdentity = list => Array.isArray(list)
  && list.every(item => isPlainObject(item) && item.id !== undefined && item.id !== null && item.id !== '');

function rebaseCollection(base, mine, theirs, conflicts, path) {
  const key = item => String(item.id);
  const baseById = new Map(base.map(item => [key(item), item]));
  const mineById = new Map(mine.map(item => [key(item), item]));
  const theirIds = new Set(theirs.map(key));
  const result = [];
  for (const row of theirs) {
    const id = key(row);
    const original = baseById.get(id);
    if (mineById.has(id)) {
      result.push(rebaseValue(original ?? {}, mineById.get(id), row, conflicts, `${path}/${id}`));
    } else if (!original || !same(original, row)) {
      // Removido aqui, mas novo ou alterado no servidor: a alteração mais recente fica.
      result.push(row);
    }
  }
  const added = mine.filter(item => !baseById.has(key(item)) && !theirIds.has(key(item)));
  return [...added, ...result];
}

function rebaseValue(base, mine, theirs, conflicts, path) {
  if (same(base, mine)) return theirs;
  if (same(mine, theirs) || same(base, theirs)) {
    if (!hasIdentity(mine) && !isPlainObject(mine)) return mine;
  }
  if (hasIdentity(base ?? []) && hasIdentity(mine) && hasIdentity(theirs ?? [])) {
    return rebaseCollection(base ?? [], mine, theirs ?? [], conflicts, path);
  }
  if (isPlainObject(mine) && isPlainObject(theirs)) {
    const safeBase = isPlainObject(base) ? base : {};
    const result = { ...theirs };
    for (const field of new Set([...Object.keys(safeBase), ...Object.keys(mine)])) {
      if (path === '' && SERVER_OWNED_FIELDS.has(field)) continue;
      if (field in mine) result[field] = rebaseValue(safeBase[field], mine[field], theirs[field], conflicts, `${path}/${field}`);
      else if (same(safeBase[field], theirs[field])) delete result[field];
    }
    return result;
  }
  if (same(base, theirs)) return mine;
  conflicts.push(path);
  return theirs;
}

export function rebaseClientState({ base, mine, theirs }) {
  const conflicts = [];
  const state = rebaseValue(base, mine, theirs, conflicts, '');
  return { state, conflicts };
}
