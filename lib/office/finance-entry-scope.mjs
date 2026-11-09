import { buildProcessIndex, canAccessFinancialEntry, processForRecord } from './access-control.mjs';

/**
 * Campos aditivos e opcionais do lançamento financeiro:
 * - `processId`: vínculo opcional a processo (`null` = sem vínculo);
 * - `createdByUserId`: autor carimbado pelo servidor a partir do ator autenticado.
 *
 * A visibilidade não usa campo de dono paralelo: deriva do processo vinculado por
 * `canAccessFinancialEntry`. Por isso o corpo do cliente nunca define `createdByUserId`
 * nem um vínculo que não resolva em processo do estado oficial.
 */

function normalizeProcessId(entry, processIndex) {
  const raw = typeof entry?.processId === 'string' ? entry.processId.trim() : '';
  if (!raw) return null;
  // Vínculo órfão viraria acesso a processo inexistente: normaliza para sem vínculo.
  return processForRecord({ processId: raw }, processIndex) ? raw : null;
}

export const FINANCE_COLLECTIONS = Object.freeze(['officeExpenses', 'financialEntries']);

// Serialização estável: ordem de chaves do objeto não é conteúdo financeiro.
function canonicalFinanceValue(value) {
  if (Array.isArray(value)) return value.map(canonicalFinanceValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = canonicalFinanceValue(value[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

function keyedEntries(list) {
  const byId = new Map();
  let unkeyed = 0;
  for (const entry of Array.isArray(list) ? list : []) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (!id) { unkeyed += 1; continue; }
    if (!byId.has(id)) byId.set(id, entry);
  }
  return { byId, unkeyed };
}

/**
 * Coleções financeiras que o flush tentou alterar e que o servidor devolveu à versão
 * oficial. Só é chamado para quem não tem `finance.write`/`office.manage` — é o mesmo
 * critério que decide a reversão em `saveClientAppState`.
 *
 * Recebe o corpo **antes** da fusão de acesso, porque a fusão já restaura as coleções e
 * esconderia a tentativa de escrita. A comparação é por `id`, com os dois lados
 * normalizados do mesmo jeito, para que reenviar a lista sem mudança (inclusive na ordem
 * que o leitor enxerga no modo `enforced`) não vire divergência.
 */
export function discardedFinanceCollections({ submitted, official, user = null, teams = [], visibleOnly = false } = {}) {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return [];
  const actorUserId = String(user?.id || user?.userId || user?.username || '');
  const processIndex = buildProcessIndex(official?.processes);
  const discarded = [];
  for (const name of FINANCE_COLLECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(submitted, name)) continue;
    if (!Array.isArray(submitted[name])) { discarded.push(name); continue; }
    const officialNormalized = normalizeFinanceEntries({
      entries: structuredClone(Array.isArray(official?.[name]) ? official[name] : []),
      // Sem ator: o lado oficial preserva o autor real de cada lançamento. Carimbar o
      // ator aqui faria todo lançamento oficial parecer do próprio leitor.
      previousEntries: official?.[name] ?? [],
      actorUserId: '',
      processIndex
    });
    const submittedNormalized = normalizeFinanceEntries({
      entries: structuredClone(submitted[name]),
      previousEntries: official?.[name] ?? [],
      actorUserId,
      processIndex
    });
    const officialEntries = keyedEntries(officialNormalized);
    const submittedEntries = keyedEntries(submittedNormalized);
    // Lançamento sem identificador não pode ser casado: só a contagem diz se houve criação.
    let diverged = submittedEntries.unkeyed > officialEntries.unkeyed;
    for (const [id, entry] of submittedEntries.byId) {
      const officialEntry = officialEntries.byId.get(id);
      // Identificador desconhecido é lançamento novo — sempre tentativa de escrita.
      if (!officialEntry) { diverged = true; break; }
      if (JSON.stringify(canonicalFinanceValue(entry)) !== JSON.stringify(canonicalFinanceValue(officialEntry))) {
        diverged = true;
        break;
      }
    }
    // Lançamento que o leitor enxergava e sumiu do corpo também é alteração; o que ele
    // nem enxerga (projeção de acesso) não aparece no corpo dele por definição.
    if (!diverged) {
      const submittedIds = new Set(submittedEntries.byId.keys());
      for (const [id, entry] of officialEntries.byId) {
        if (submittedIds.has(id)) continue;
        if (visibleOnly && !canAccessFinancialEntry(user, entry, processIndex, teams)) continue;
        diverged = true;
        break;
      }
    }
    if (diverged) discarded.push(name);
  }
  return discarded;
}

export function normalizeFinanceEntries({ entries, previousEntries = [], actorUserId = '', processIndex }) {
  if (!Array.isArray(entries)) return entries;
  const index = processIndex instanceof Map ? processIndex : new Map();
  const previousById = new Map(
    (Array.isArray(previousEntries) ? previousEntries : []).map(entry => [String(entry?.id || ''), entry])
  );
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const previousAuthor = String(previousById.get(String(entry.id || ''))?.createdByUserId || '');
    entry.createdByUserId = previousAuthor || String(actorUserId || '') || null;
    entry.processId = normalizeProcessId(entry, index);
    return entry;
  });
}
