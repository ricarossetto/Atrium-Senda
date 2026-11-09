/**
 * ATRIUM — Propagação do prazo declarado pela fonte oficial para tarefas ligadas.
 *
 * Contrato (specs/human-deadline-policy.md):
 * - Em `settings.deadlineMode === 'auto'`, o prazo informado pela fonte oficial
 *   (eproc/PJe) acompanha a publicação: quando a fonte altera a data
 *   (suspensão, recesso, retificação), a tarefa cujo prazo veio da fonte é atualizada.
 * - Prazo de origem humana nunca é sobrescrito: a divergência vira aviso
 *   (`deadlineConflict`) para conferência, e o valor editado permanece.
 * - Nenhuma data é calculada: o módulo só transporta o valor declarado pela fonte.
 *
 * Módulo puro: não faz I/O e não decide sozinho — o chamador aplica o plano no
 * estado oficial dentro da mutação serializada.
 */

const TASK_REFERENCE_FIELDS = ['intimationId', 'sourceIntimationId', 'publicationId'];
const MAX_AUDIT_ENTRIES = 50;
const AUTO_APPLIED_DEADLINE_SOURCES = new Set(['eproc', 'pje']);

function isAutoAppliedSource(source) {
  const normalized = String(source || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return AUTO_APPLIED_DEADLINE_SOURCES.has(normalized);
}

function textOrEmpty(value) {
  return String(value ?? '').trim();
}

function taskReferenceKeys(task) {
  const keys = [];
  for (const field of TASK_REFERENCE_FIELDS) {
    const value = textOrEmpty(task?.[field]);
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

function intimationReferenceKeys(intimation) {
  const keys = [];
  for (const value of [intimation?.id, intimation?.externalId]) {
    const text = textOrEmpty(value);
    if (text && !keys.includes(text)) keys.push(text);
  }
  return keys;
}

/**
 * Quem é o dono do prazo atual da tarefa:
 * - `empty`: sem prazo — a fonte pode preencher em modo `auto`;
 * - `source`: o valor vigente confere com o que a fonte declarou por último;
 * - `human`: qualquer outro valor (edição humana explícita ou dado legado divergente).
 *
 * A regra é deliberadamente estrita: só o valor idêntico ao declarado pela fonte é
 * tratado como "da fonte". Um `deadlineSource` antigo nunca autoriza sobrescrever uma
 * data que já divergiu (prazo manual prevalece — specs/human-deadline-policy.md).
 */
export function taskDeadlineOwnership(task) {
  const deadline = textOrEmpty(task?.deadline);
  if (!deadline) return 'empty';
  const sourceReported = textOrEmpty(task?.sourceReportedDeadlineAt);
  return sourceReported && sourceReported === deadline ? 'source' : 'human';
}

export function resolveSourceDeadlineValue(intimation) {
  return textOrEmpty(intimation?.sourceReportedDeadlineAt);
}

export function sourceDeadlineLabel(intimation) {
  return textOrEmpty(intimation?.sourceReportedDeadlineSource)
    || textOrEmpty(intimation?.source)
    || 'fonte oficial';
}

/**
 * Plano de sincronização. Compara o valor declarado pela fonte com o último valor
 * que a tarefa registrou da fonte (`sourceReportedDeadlineAt`) — o que torna a
 * operação idempotente: aplicar duas vezes o mesmo plano não muda nada.
 */
export function planSourceDeadlineSync({ tasks = [], intimations = [], deadlineMode = 'auto' } = {}) {
  const updates = [];
  const conflicts = [];
  const converged = [];
  const cursorSyncs = [];
  const auto = textOrEmpty(deadlineMode || 'auto') !== 'manual';
  if (!Array.isArray(tasks) || tasks.length === 0) return { updates, conflicts, converged, cursorSyncs, auto };

  const intimationByKey = new Map();
  for (const intimation of Array.isArray(intimations) ? intimations : []) {
    if (!intimation || typeof intimation !== 'object' || intimation.mergedInto) continue;
    for (const key of intimationReferenceKeys(intimation)) {
      if (!intimationByKey.has(key)) intimationByKey.set(key, intimation);
    }
  }
  if (intimationByKey.size === 0) return { updates, conflicts, converged, cursorSyncs, auto };

  for (const task of tasks) {
    if (!task || typeof task !== 'object' || !task.id) continue;
    let intimation = null;
    for (const key of taskReferenceKeys(task)) {
      const candidate = intimationByKey.get(key);
      if (candidate) { intimation = candidate; break; }
    }
    if (!intimation) continue;

    const sourceValue = resolveSourceDeadlineValue(intimation);
    const source = sourceDeadlineLabel(intimation);
    // Tarefa concluída é decisão humana encerrada: a fonte não reabre nem reescreve
    // o prazo por automação. Um novo ato/republicação gera tarefa própria.
    if (/^conclu/i.test(textOrEmpty(task.status)) || task.completedAt) {
      converged.push({ taskId: String(task.id), reason: 'tarefa-concluida', clearConflict: false });
      continue;
    }
    // Domicílio e fontes sem contrato de prazo entram apenas como referência;
    // nunca viram deadline operacional por automação (AGENTS §16).
    if (!isAutoAppliedSource(source)) continue;
    const lastSourceValue = textOrEmpty(task.sourceReportedDeadlineAt);
    const current = textOrEmpty(task.deadline);
    const ownership = taskDeadlineOwnership(task);
    const previousSourceValue = textOrEmpty(intimation.sourceReportedDeadlinePrevious) || lastSourceValue;
    const at = textOrEmpty(intimation.sourceDeadlineChangedAt) || null;

    if (!sourceValue) {
      // Fonte parou de declarar prazo (item saiu do painel/retificado sem data):
      // nada é apagado — o prazo existente permanece humano até decisão explícita.
      if (task.deadlineConflict && task.deadlineConflict.sourceValue !== '') {
        converged.push({ taskId: String(task.id), reason: 'sem-prazo-na-fonte', clearConflict: true });
      }
      continue;
    }

    if (ownership === 'human' && current !== sourceValue) {
      conflicts.push({
        taskId: String(task.id),
        intimationId: textOrEmpty(intimation.id || intimation.externalId) || null,
        source,
        sourceValue,
        humanValue: current,
        previousSourceValue,
        at,
        manual: !auto,
        mode: auto ? 'auto' : 'manual'
      });
      continue;
    }

    if (!auto) {
      if (current !== sourceValue) {
        conflicts.push({
          taskId: String(task.id),
          intimationId: textOrEmpty(intimation.id || intimation.externalId) || null,
          source,
          sourceValue,
          humanValue: current,
          previousSourceValue,
          at,
          manual: true,
          mode: 'manual'
        });
      }
      continue;
    }

    if (sourceValue === lastSourceValue && ownership !== 'empty') {
      // Já convergente com a fonte: sincroniza o cursor e limpa aviso obsoleto.
      if (task.deadlineConflict || lastSourceValue !== current) {
        converged.push({ taskId: String(task.id), reason: 'ja-sincronizado', clearConflict: true, source, sourceValue, at });
      }
      continue;
    }

    if (current === sourceValue) {
      // O valor vigente já confere com o que a fonte declara (a pessoa alinhou o prazo):
      // nada é reescrito — só o cursor da fonte avança e o aviso, se havia, desaparece.
      cursorSyncs.push({ taskId: String(task.id), source, sourceValue, at });
      continue;
    }

    updates.push({
      taskId: String(task.id),
      intimationId: textOrEmpty(intimation.id || intimation.externalId) || null,
      source,
      sourceValue,
      previousValue: current,
      previousSourceValue,
      at
    });
  }

  return { updates, conflicts, converged, cursorSyncs, auto };
}

function buildAuditEntry({ at, action, detail, actor }, index = 0) {
  const suffix = `${Date.now().toString(36)}${index}${Math.random().toString(36).slice(2, 6)}`;
  return {
    id: `aud-prazo-${suffix}`,
    at,
    action,
    detail: String(detail || '').slice(0, 500),
    actor: String(actor || 'Sincronização').slice(0, 100)
  };
}

/**
 * Aplica o plano no estado oficial (muta `state.tasks` e devolve o audit).
 * Nunca remove nem cria tarefa; só atualiza o prazo de origem `source`.
 */
export function applySourceDeadlineSync(state, plan, { actor = 'Sincronização', nowIso = new Date().toISOString() } = {}) {
  const updates = Array.isArray(plan?.updates) ? plan.updates : [];
  const conflicts = Array.isArray(plan?.conflicts) ? plan.conflicts : [];
  const converged = Array.isArray(plan?.converged) ? plan.converged : [];
  const cursorSyncs = Array.isArray(plan?.cursorSyncs) ? plan.cursorSyncs : [];
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const byId = new Map(tasks.filter(task => task && task.id).map(task => [String(task.id), task]));
  const auditEntries = [];
  let tasksChanged = false;

  for (const update of updates) {
    const task = byId.get(update.taskId);
    if (!task) continue;
    const from = textOrEmpty(task.deadline);
    if (from === update.sourceValue && textOrEmpty(task.sourceReportedDeadlineAt) === update.sourceValue) continue;
    task.deadline = update.sourceValue;
    task.deadlineSource = update.source || task.deadlineSource || null;
    task.sourceReportedDeadlineAt = update.sourceValue;
    task.sourceDeadlineSyncAt = nowIso;
    if (task.deadlineConflict) delete task.deadlineConflict;
    task.updatedAt = nowIso;
    const history = Array.isArray(task.history) ? task.history : [];
    task.history = [...history, {
      at: nowIso,
      action: `Prazo atualizado pela fonte (${from || 'sem prazo'} → ${update.sourceValue})`,
      actor
    }].slice(-200);
    tasksChanged = true;
    if (auditEntries.length < MAX_AUDIT_ENTRIES) {
      auditEntries.push(buildAuditEntry({
        at: nowIso,
        action: 'Prazo atualizado pela fonte oficial',
        detail: `${textOrEmpty(task.title) || update.taskId} · ${textOrEmpty(task.process) || 'sem processo'} · ${from || 'sem prazo'} → ${update.sourceValue} (${update.source})`,
        actor
      }, auditEntries.length));
    }
  }

  for (const conflict of conflicts) {
    const task = byId.get(conflict.taskId);
    if (!task) continue;
    const nextConflict = {
      source: conflict.source,
      sourceValue: conflict.sourceValue,
      humanValue: conflict.humanValue,
      previousSourceValue: conflict.previousSourceValue || '',
      at: conflict.at || nowIso,
      mode: conflict.mode
    };
    const current = task.deadlineConflict;
    const same = current
      && textOrEmpty(current.sourceValue) === nextConflict.sourceValue
      && textOrEmpty(current.humanValue) === nextConflict.humanValue
      && textOrEmpty(current.mode) === textOrEmpty(nextConflict.mode);
    if (same) continue;
    task.deadlineConflict = nextConflict;
    task.updatedAt = nowIso;
    tasksChanged = true;
    if (!current && auditEntries.length < MAX_AUDIT_ENTRIES) {
      auditEntries.push(buildAuditEntry({
        at: nowIso,
        action: 'Divergência de prazo com a fonte oficial',
        detail: `${textOrEmpty(task.title) || conflict.taskId} · prazo atual ${conflict.humanValue} · fonte ${conflict.source} informa ${conflict.sourceValue}`,
        actor
      }, auditEntries.length));
    }
  }

  for (const entry of converged) {
    const task = byId.get(entry.taskId);
    if (!task) continue;
    if (entry.clearConflict && task.deadlineConflict) {
      delete task.deadlineConflict;
      task.updatedAt = nowIso;
      tasksChanged = true;
    }
    if (entry.at && textOrEmpty(task.sourceDeadlineSyncAt) !== textOrEmpty(entry.at)) {
      task.sourceDeadlineSyncAt = entry.at;
      tasksChanged = true;
    }
  }

  for (const entry of cursorSyncs) {
    const task = byId.get(entry.taskId);
    if (!task) continue;
    const cursorChanged = textOrEmpty(task.sourceReportedDeadlineAt) !== textOrEmpty(entry.sourceValue)
      || (entry.at && textOrEmpty(task.sourceDeadlineSyncAt) !== textOrEmpty(entry.at));
    const hadConflict = Boolean(task.deadlineConflict);
    if (cursorChanged) {
      task.sourceReportedDeadlineAt = entry.sourceValue;
      if (entry.at) task.sourceDeadlineSyncAt = entry.at;
    }
    if (hadConflict) delete task.deadlineConflict;
    if (cursorChanged || hadConflict) {
      task.updatedAt = nowIso;
      tasksChanged = true;
    }
  }

  return { changed: tasksChanged, auditEntries, updated: updates.length, conflicts: conflicts.length };
}
