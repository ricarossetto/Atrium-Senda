/**
 * ATRIUM — Estado oficial de intimações: fusão, aliases e gate de custo.
 *
 * Extraído de `server.mjs` para ser o único fluxo de escrita de intimações
 * compartilhado pelo flush do cliente, pela persistência de coleções externas e
 * pelos saves do sweep eproc/PJe — e testável comportamentalmente sem subir o
 * servidor (o listener HTTP é iniciado no import de `server.mjs`).
 *
 * Contrato: nunca remove registros fisicamente; o perdedor vira alias reversível
 * (`mergedInto`) e as tarefas apontam para o keeper.
 */
import { randomBytes } from 'node:crypto';
import { groupDuplicateCandidates, createIntimationIdentityResolver } from './intimation-identity.mjs';
import { chooseKeeper, computeMergePlan } from './intimation-merge-engine.mjs';
import { sanitizeRecord, sanitizeArray } from '../state-sanitize.mjs';

const INTIMATION_TASK_REFERENCE_FIELDS = ['intimationId', 'sourceIntimationId', 'publicationId'];
// Campos que definem strong/fullTextKey/dataISO. Alteração do payload nesses campos exige
// reavaliar a fusão; o texto integral fica de fora para manter o flush barato (nenhum
// fluxo legítimo do cliente reescreve o teor de uma intimação).
const INTIMATION_IDENTITY_FIELDS = [
  'externalId', 'process', 'processNumber', 'disponibilizadoEm', 'publishedAt', 'sourceReportedAt',
  'sourceCollectedAt', 'createdAt', 'firstSeenAt', 'event', 'title'
];

export function intimationReferenceKeys(record) {
  const keys = [];
  for (const value of [record?.id, record?.externalId]) {
    const text = String(value || '').trim();
    if (text && !keys.includes(text)) keys.push(text);
  }
  return keys;
}

/**
 * Indício barato de que o flush pode conter duplicata ainda não oficial: existe
 * intimação elegível (djen/eproc) cujo id/externalId não está representado no estado
 * atual. Duplicatas em um payload sempre introduzem ao menos um registro novo; o estado
 * oficial é mantido sem duplicatas vivas pelo backfill v10→v11 e pelas escritas.
 */
export function intimationsMayNeedCanonicalMerge(incomingList, currentList) {
  const incoming = Array.isArray(incomingList) ? incomingList : [];
  if (incoming.length < 2) return false;
  const currentByKey = new Map();
  for (const item of Array.isArray(currentList) ? currentList : []) {
    for (const key of intimationReferenceKeys(item)) if (!currentByKey.has(key)) currentByKey.set(key, item);
  }
  for (const item of incoming) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const externalId = String(item.externalId || item.id || '');
    if (!/^(?:djen:|eproc:|intimation:djen:|intimation:eproc:)/.test(externalId)) continue;
    const keys = intimationReferenceKeys(item);
    if (keys.length === 0) continue;
    const currentItem = keys.map(key => currentByKey.get(key)).find(candidate => candidate !== undefined);
    if (!currentItem) return true;
    // Registro já conhecido pode ter campos de identidade alterados no payload; nesse caso
    // também vale reavaliar (par novo por mutação de data/evento/texto).
    for (const field of INTIMATION_IDENTITY_FIELDS) {
      if (String(currentItem[field] ?? '') !== String(item[field] ?? '')) return true;
    }
  }
  return false;
}

/**
 * Reaplica aliases oficiais no estado enviado pelo cliente e garante que o keeper
 * referenciado exista no payload. Sem isso, um flush que omite o keeper deixaria o alias
 * órfão e o registro sumiria do envelope público (que filtra `mergedInto`).
 */
export function reapplyCanonicalIntimationAliases(value, currentIntimations) {
  const canonical = Array.isArray(currentIntimations) ? currentIntimations : [];
  const canonicalAliases = canonical.filter(item => item && typeof item === 'object' && !Array.isArray(item) && item.mergedInto);
  if (canonicalAliases.length === 0) return;
  value.intimations = sanitizeArray(value.intimations, 100_000);
  const indexByKey = new Map();
  value.intimations.forEach((item, index) => {
    for (const key of intimationReferenceKeys(item)) if (!indexByKey.has(key)) indexByKey.set(key, index);
  });
  for (const alias of canonicalAliases) {
    const aliasKeys = intimationReferenceKeys(alias);
    const index = aliasKeys.map(key => indexByKey.get(key)).find(candidate => candidate !== undefined);
    if (index === undefined) {
      value.intimations.push(sanitizeRecord(alias));
      for (const key of aliasKeys) if (!indexByKey.has(key)) indexByKey.set(key, value.intimations.length - 1);
    } else {
      value.intimations[index] = {
        ...value.intimations[index],
        mergedInto: alias.mergedInto,
        mergedAt: alias.mergedAt,
        mergeReason: alias.mergeReason,
        sourceAliases: alias.sourceAliases
      };
    }
  }
  const restoredKeepers = new Set();
  for (const alias of canonicalAliases) {
    const keeper = resolveIntimationAlias(canonical, alias.id);
    if (!keeper || keeper.mergedInto) continue;
    const keeperKeys = intimationReferenceKeys(keeper);
    if (keeperKeys.length === 0 || keeperKeys.some(key => indexByKey.has(key))) continue;
    if (restoredKeepers.has(keeperKeys[0])) continue;
    restoredKeepers.add(keeperKeys[0]);
    value.intimations.push(sanitizeRecord(keeper));
    for (const key of keeperKeys) if (!indexByKey.has(key)) indexByKey.set(key, value.intimations.length - 1);
  }
}

function intimationSourceLabel(record) {
  const externalId = String(record?.externalId || record?.id || '');
  if (externalId.startsWith('djen:') || externalId.startsWith('intimation:djen:')) return 'djen';
  if (externalId.startsWith('eproc:') || externalId.startsWith('intimation:eproc:')) return 'eproc';
  return String(record?.source || 'desconhecida').slice(0, 40);
}

export function resolveIntimationAlias(intimations, identifier) {
  const list = Array.isArray(intimations) ? intimations : [];
  const target = String(identifier || '').trim();
  if (!target) return null;
  let record = list.find(item => item && intimationReferenceKeys(item).includes(target)) || null;
  const visited = new Set();
  while (record && record.mergedInto) {
    const keeperId = String(record.mergedInto).trim();
    if (!keeperId || visited.has(keeperId)) return null;
    visited.add(keeperId);
    const keeper = list.find(item => item && intimationReferenceKeys(item).includes(keeperId)) || null;
    if (!keeper) return null;
    record = keeper;
  }
  return record || null;
}

/**
 * Funde em memória os pares já agrupados por identidade oficial. O keeper absorve o
 * perdedor (alias reversível via `mergedInto`), tarefas do perdedor são reapontadas e o
 * audit recebe entrada sem PII (ids/fontes/motivo). Nunca remove registros fisicamente.
 */
export function mergeDuplicateIntimationsIntoState(state, { actor = 'Sistema', nowIso = new Date().toISOString() } = {}) {
  const empty = { changed: false, merges: [], auditEntries: [] };
  if (!state || typeof state !== 'object' || Array.isArray(state)) return empty;
  const intimations = sanitizeArray(state.intimations, 100_000);
  if (intimations.length < 2) return empty;
  const groups = groupDuplicateCandidates(intimations).groups;
  if (!groups.length) return empty;

  const identityOf = createIntimationIdentityResolver(intimations);
  const tasks = sanitizeArray(state.tasks, 100_000);
  const replacements = new Map();
  const merges = [];
  let tasksChanged = false;

  for (const group of groups) {
    let keeper = null;
    for (const member of group.members) {
      const record = intimations[member.index];
      if (!record || record.mergedInto) continue;
      const nextKeeper = keeper ? chooseKeeper(keeper, record, identityOf) : record;
      if (nextKeeper) keeper = nextKeeper;
    }
    if (!keeper) continue;
    const keeperOrigin = keeper;

    for (const member of group.members) {
      const loser = intimations[member.index];
      if (!loser || loser === keeperOrigin || loser.mergedInto) continue;
      const plan = computeMergePlan(keeper, loser, { identityOf });
      if (!plan.mergeable) continue;
      const keeperChanged = JSON.stringify(plan.merged) !== JSON.stringify(keeper);
      const aliasRecord = {
        ...loser,
        mergedInto: plan.alias.mergedInto,
        mergedAt: plan.alias.mergedAt,
        mergeReason: plan.alias.reason,
        sourceAliases: plan.alias.sourceAliases
      };
      const aliasChanged = JSON.stringify(aliasRecord) !== JSON.stringify(loser);
      keeper = plan.merged;
      replacements.set(loser, aliasRecord);

      const loserKeys = intimationReferenceKeys(loser);
      const keeperKey = String(keeper.id || keeper.externalId || plan.alias.mergedInto);
      const rewrittenTaskIds = [];
      for (const task of tasks) {
        if (!task) continue;
        let matched = false;
        for (const field of INTIMATION_TASK_REFERENCE_FIELDS) {
          const reference = String(task[field] || '').trim();
          if (!reference || !loserKeys.includes(reference)) continue;
          task[field] = keeperKey;
          matched = true;
        }
        if (matched && task.id) rewrittenTaskIds.push(String(task.id));
      }
      if (rewrittenTaskIds.length > 0) {
        tasksChanged = true;
        const linked = new Set(Array.isArray(keeper.linkedTaskIds) ? keeper.linkedTaskIds.map(String) : []);
        for (const taskId of rewrittenTaskIds) linked.add(taskId);
        keeper.linkedTaskIds = [...linked];
        if (!keeper.taskId) keeper.taskId = rewrittenTaskIds[0];
      }
      if (keeperChanged || aliasChanged) {
        merges.push({
          keeperId: keeperKey,
          loserId: String(plan.alias.id),
          reason: plan.alias.reason,
          sources: [intimationSourceLabel(keeperOrigin), intimationSourceLabel(loser)]
        });
      }
    }
    replacements.set(keeperOrigin, keeper);
  }

  // Reescrita de tarefa também conta como mudança: mesmo que os pares não alterem o JSON
  // das intimações, o reapontamento de referências precisa ser persistido.
  const changed = tasksChanged
    || [...replacements.entries()].some(([before, after]) => JSON.stringify(before) !== JSON.stringify(after));
  if (!changed) return { changed: false, merges: [], auditEntries: [] };

  state.intimations = intimations.map(record => replacements.get(record) || record);
  state.tasks = tasks;
  const auditEntries = [];
  if (merges.length > 0) {
    const baseAudit = Array.isArray(state.audit) ? state.audit : [];
    for (const [index, merge] of merges.entries()) {
      auditEntries.push({
        id: `aud-merge-${Date.now()}-${index}-${randomBytes(4).toString('hex')}`,
        at: nowIso,
        action: 'Publicações duplicadas fundidas',
        detail: `Oficial ${merge.keeperId} absorveu ${merge.loserId} (fontes ${merge.sources.join('+')}; motivo ${merge.reason})`.slice(0, 500),
        actor: String(actor || 'Sistema').slice(0, 100)
      });
    }
    state.audit = [...auditEntries, ...baseAudit].slice(0, 1000);
  }
  return { changed: true, merges, auditEntries };
}

/**
 * Fusão oficial de **um par específico** de publicações, confirmada por pessoa no painel
 * de duplicatas prováveis. Reaproveita o mesmo motor (`chooseKeeper` + `computeMergePlan`),
 * nunca remove registro (o perdedor vira alias reversível com `mergedInto`), reaponta as
 * tarefas do perdedor para o keeper, registra auditoria sem PII e é idempotente.
 *
 * Recusas explícitas (nunca "funde pela metade"): registro ausente, mesmo registro, par já
 * fundido e conflito de tratamento (treated × discarded) — este último é decisão humana.
 */
export function mergeIntimationPairIntoState(state, idA, idB, { actor = 'Sistema', nowIso = new Date().toISOString() } = {}) {
  const empty = { merged: false, reason: '', keeperId: '', loserId: '', auditEntry: null };
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ...empty, reason: 'estado-ausente' };
  const intimations = sanitizeArray(state.intimations, 100_000);
  const find = identifier => intimations.find(item => item && intimationReferenceKeys(item).includes(String(identifier))) || null;
  const first = find(idA);
  const second = find(idB);
  if (!first || !second) return { ...empty, reason: 'registro-ausente' };
  if (first === second) return { ...empty, reason: 'mesmo-registro' };
  if (first.mergedInto || second.mergedInto) return { ...empty, reason: 'ja-fundido' };

  const identityOf = createIntimationIdentityResolver(intimations);
  const keeper = chooseKeeper(first, second, identityOf);
  if (!keeper) return { ...empty, reason: 'keeper-indisponivel' };
  const loser = keeper === first ? second : first;
  const plan = computeMergePlan(keeper, loser, { identityOf });
  if (!plan.mergeable) {
    return { ...empty, reason: String(plan.conflict?.reason || 'nao-funde') };
  }

  const aliasRecord = {
    ...loser,
    mergedInto: plan.alias.mergedInto,
    mergedAt: plan.alias.mergedAt,
    mergeReason: plan.alias.reason,
    sourceAliases: plan.alias.sourceAliases,
    mergeReviewedBy: String(actor || 'Sistema').slice(0, 100)
  };
  const keeperKey = String(keeper.id || keeper.externalId || plan.alias.mergedInto);
  const loserKeys = new Set(intimationReferenceKeys(loser).map(String));
  const tasks = sanitizeArray(state.tasks, 100_000);
  const TASK_REFERENCE_FIELDS = ['intimationId', 'sourceIntimationId', 'publicationId', 'intimationKey'];
  const rewrittenTaskIds = new Set();
  for (const task of tasks) {
    if (!task) continue;
    for (const field of TASK_REFERENCE_FIELDS) {
      const current = String(task[field] || '').trim();
      if (current && loserKeys.has(current)) {
        task[field] = keeperKey;
        rewrittenTaskIds.add(String(task.id));
      }
    }
  }
  for (const rewrite of plan.taskLinkRewrites || []) {
    const task = tasks.find(candidate => candidate && String(candidate.id) === String(rewrite.taskId));
    if (!task) continue;
    task[rewrite.field] = keeperKey;
    rewrittenTaskIds.add(String(task.id));
  }
  if (rewrittenTaskIds.size > 0) {
    const linked = new Set(Array.isArray(plan.merged.linkedTaskIds) ? plan.merged.linkedTaskIds.map(String) : []);
    for (const taskId of rewrittenTaskIds) linked.add(taskId);
    plan.merged.linkedTaskIds = [...linked];
  }

  state.intimations = intimations.map(record => {
    if (record === loser) return aliasRecord;
    if (record === keeper) return plan.merged;
    return record;
  });
  state.tasks = tasks;
  const auditEntry = {
    id: `aud-merge-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    at: nowIso,
    action: 'Publicações duplicadas fundidas (confirmação humana)',
    detail: `Oficial ${keeperKey} absorveu ${String(plan.alias.id)} (motivo ${plan.alias.reason}; fusão reversível)`.slice(0, 500),
    actor: String(actor || 'Sistema').slice(0, 100)
  };
  state.audit = [auditEntry, ...sanitizeArray(state.audit, 1_000)].slice(0, 1000);
  return {
    merged: true,
    reason: plan.alias.reason,
    keeperId: keeperKey,
    loserId: String(plan.alias.id),
    auditEntry
  };
}

/**
 * Fluxo oficial único de escrita: reaplica aliases já persistidos, avalia o gate de
 * custo e funde duplicatas quando o payload introduz id elegível novo. Devolve o
 * `mergeOutcome` para o digest usar `absorbedIntimationKeys(mergeOutcome.merges)`.
 */
export function applyCanonicalIntimationMerge(value, currentIntimations, { actor = 'Sistema', nowIso = new Date().toISOString() } = {}) {
  const empty = { changed: false, merges: [], auditEntries: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  reapplyCanonicalIntimationAliases(value, currentIntimations);
  if (!intimationsMayNeedCanonicalMerge(value.intimations, currentIntimations)) return empty;
  return mergeDuplicateIntimationsIntoState(value, { actor, nowIso });
}

/**
 * Chaves absorvidas previstas para um lote que ainda não passou pelo estado oficial
 * (a ingestão do coletor grava apenas `runtime.json`). Espelha a escolha de keeper do
 * fluxo oficial sobre `[...estado atual, ...lote recebido]` para o digest anunciar
 * somente keepers, sem persistir nada aqui. Registros já aliases não votam e ids
 * repetidos entre atual e lote contam uma única vez.
 */
export function planAbsorbedIntimationKeys(currentIntimations = [], incomingIntimations = []) {
  const currentList = sanitizeArray(currentIntimations, 100_000);
  const incomingList = sanitizeArray(incomingIntimations, 100_000);
  const seenKeys = new Set();
  const combined = [];
  for (const record of [...currentList, ...incomingList]) {
    const key = String(record.id || record.externalId || '');
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    combined.push(record);
  }
  if (combined.length < 2) return new Set();
  const groups = groupDuplicateCandidates(combined).groups;
  if (!groups.length) return new Set();

  const identityOf = createIntimationIdentityResolver(combined);
  const absorbed = new Set();
  for (const group of groups) {
    let keeper = null;
    for (const member of group.members) {
      const record = combined[member.index];
      if (!record || record.mergedInto) continue;
      keeper = keeper ? chooseKeeper(keeper, record, identityOf) : record;
    }
    if (!keeper) continue;
    const keeperOrigin = keeper;
    const keeperKey = String(keeper.id || keeper.externalId || '');
    for (const member of group.members) {
      const loser = combined[member.index];
      if (!loser || loser === keeperOrigin || loser.mergedInto) continue;
      const plan = computeMergePlan(keeper, loser, { identityOf });
      if (!plan.mergeable) continue;
      const loserKey = String(plan.alias.id || '');
      if (loserKey && loserKey !== keeperKey) absorbed.add(loserKey);
      keeper = plan.merged;
    }
  }
  return absorbed;
}
