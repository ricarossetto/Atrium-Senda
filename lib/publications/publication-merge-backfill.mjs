/**
 * ATRIUM — Backfill idempotente de publicações duplicadas pré-existentes.
 *
 * Aplica o motor puro (`intimation-identity.mjs` + `intimation-merge-engine.mjs`) sobre o
 * estado oficial de UM workspace (cada workspace possui seu próprio app-state.json). É o
 * passo funcional da migração v10→v11, executado no boot com backup `pre-migration-*`.
 *
 * Contrato:
 * - Nada é removido fisicamente: o perdedor vira alias reversível (`mergedInto`).
 * - Tarefas do perdedor são reapontadas para o keeper (`intimationId`/`sourceIntimationId`/
 *   `publicationId`) e unidas em `linkedTaskIds`; nenhuma tarefa é apagada.
 * - Conflito `treated` × `discarded` não funde e registra pendência no audit com id
 *   determinístico (replay não duplica) contendo apenas ids, fontes e motivo.
 * - `state.audit` recebe 1 entrada por fusão; reexecutar sobre estado já processado é no-op
 *   e preserva `mergedAt`.
 * - O estado só é mutado quando há mudança real ou pendência nova.
 */
import { createHash, randomBytes } from 'node:crypto';
import { groupDuplicateCandidates, createIntimationIdentityResolver } from './intimation-identity.mjs';
import { chooseKeeper, computeMergePlan } from './intimation-merge-engine.mjs';

export const MERGE_ACTION = 'Publicações duplicadas fundidas';
export const CONFLICT_ACTION = 'Publicações duplicadas com conflito de tratamento';

const TASK_REFERENCE_FIELDS = ['intimationId', 'sourceIntimationId', 'publicationId'];

export function backfillDuplicateIntimations(state, { actor = 'Sistema', nowIso = new Date().toISOString() } = {}) {
  const result = { changed: false, merges: [], conflicts: [], rewrittenTaskIds: [] };
  if (!isRecord(state)) return result;
  const intimations = Array.isArray(state.intimations) ? state.intimations : [];
  if (intimations.length < 2) return result;
  const groups = groupDuplicateCandidates(intimations).groups;
  if (groups.length === 0) return result;

  const identityOf = createIntimationIdentityResolver(intimations);
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const replacements = new Map();
  const merges = [];
  const conflicts = [];
  const rewrittenTaskIds = new Set();

  for (const group of groups) {
    let keeper = null;
    for (const member of group.members) {
      const record = intimations[member.index];
      if (!isRecord(record) || record.mergedInto) continue;
      const nextKeeper = keeper ? chooseKeeper(keeper, record, identityOf) : record;
      if (nextKeeper) keeper = nextKeeper;
    }
    if (!keeper) continue;
    const keeperOrigin = keeper;

    for (const member of group.members) {
      const loser = intimations[member.index];
      if (!isRecord(loser) || loser === keeperOrigin || loser.mergedInto) continue;
      const plan = computeMergePlan(keeper, loser, { identityOf });
      if (!plan.mergeable) {
        if (plan.conflict) {
          conflicts.push({
            keeperId: recordKey(keeper),
            loserId: recordKey(loser),
            reason: plan.conflict.reason,
            sources: [sourceLabel(keeper), sourceLabel(loser)]
          });
        }
        continue;
      }

      const aliasRecord = {
        ...loser,
        mergedInto: plan.alias.mergedInto,
        mergedAt: plan.alias.mergedAt,
        mergeReason: plan.alias.reason,
        sourceAliases: plan.alias.sourceAliases
      };
      keeper = plan.merged;
      replacements.set(loser, aliasRecord);

      const loserKeys = referenceKeys(loser);
      const keeperKey = recordKey(keeper) || String(plan.alias.mergedInto || '');
      const rewritten = [];
      for (const task of tasks) {
        if (!isRecord(task)) continue;
        let matched = false;
        for (const field of TASK_REFERENCE_FIELDS) {
          const reference = String(task[field] || '').trim();
          if (!reference || !loserKeys.includes(reference)) continue;
          task[field] = keeperKey;
          matched = true;
        }
        if (matched && task.id) rewritten.push(String(task.id));
      }
      if (rewritten.length > 0) {
        const linked = new Set(Array.isArray(keeper.linkedTaskIds) ? keeper.linkedTaskIds.map(String) : []);
        for (const taskId of rewritten) linked.add(taskId);
        keeper.linkedTaskIds = [...linked];
        if (!keeper.taskId) keeper.taskId = rewritten[0];
      }

      merges.push({
        keeperId: keeperKey,
        loserId: String(plan.alias.id),
        reason: plan.alias.reason,
        sources: [sourceLabel(keeperOrigin), sourceLabel(loser)],
        rewrittenTaskIds: rewritten
      });
      for (const taskId of rewritten) rewrittenTaskIds.add(taskId);
    }
    replacements.set(keeperOrigin, keeper);
  }

  const changed = merges.length > 0;
  const audit = Array.isArray(state.audit) ? state.audit : [];
  const knownAuditIds = new Set(audit.map(entry => entry?.id).filter(Boolean));
  const pendingAudit = [];
  for (const [index, merge] of merges.entries()) {
    pendingAudit.push(mergeAuditEntry(merge, actor, nowIso, index));
  }
  for (const conflict of conflicts) {
    const entry = conflictAuditEntry(conflict, actor, nowIso);
    if (knownAuditIds.has(entry.id)) continue;
    knownAuditIds.add(entry.id);
    pendingAudit.push(entry);
  }

  if (!changed && pendingAudit.length === 0) return { ...result, conflicts };

  if (changed) {
    state.intimations = intimations.map(record => replacements.get(record) || record);
    state.tasks = tasks;
  }
  if (pendingAudit.length > 0) {
    state.audit = [...pendingAudit, ...audit].slice(0, 1000);
  }

  return {
    changed: changed || pendingAudit.length > 0,
    merges,
    conflicts,
    rewrittenTaskIds: [...rewrittenTaskIds]
  };
}

function mergeAuditEntry(merge, actor, nowIso, index) {
  return {
    id: `aud-merge-${Date.now()}-${index}-${randomBytes(4).toString('hex')}`,
    at: nowIso,
    action: MERGE_ACTION,
    detail: `Oficial ${merge.keeperId} absorveu ${merge.loserId} (fontes ${merge.sources.join('+')}; motivo ${merge.reason})`.slice(0, 500),
    actor: String(actor || 'Sistema').slice(0, 100)
  };
}

function conflictAuditEntry(conflict, actor, nowIso) {
  return {
    id: `aud-merge-conflict-${pairHash(conflict.keeperId, conflict.loserId)}`,
    at: nowIso,
    action: CONFLICT_ACTION,
    detail: `Revisão manual necessária: ${conflict.keeperId} × ${conflict.loserId} (fontes ${conflict.sources.join('+')}; motivo ${conflict.reason})`.slice(0, 500),
    actor: String(actor || 'Sistema').slice(0, 100)
  };
}

function pairHash(keeperId, loserId) {
  return createHash('sha256').update(`${keeperId}|${loserId}`, 'utf8').digest('hex').slice(0, 24);
}

function referenceKeys(record) {
  const keys = [];
  for (const value of [record?.id, record?.externalId]) {
    const text = String(value || '').trim();
    if (text && !keys.includes(text)) keys.push(text);
  }
  return keys;
}

function sourceLabel(record) {
  const externalId = String(record?.externalId || record?.id || '');
  if (externalId.startsWith('djen:') || externalId.startsWith('intimation:djen:')) return 'djen';
  if (externalId.startsWith('eproc:') || externalId.startsWith('intimation:eproc:')) return 'eproc';
  return String(record?.source || 'desconhecida').slice(0, 40);
}

function recordKey(record) {
  return String(record?.id || record?.externalId || '');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
