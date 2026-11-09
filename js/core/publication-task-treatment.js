/**
 * ATRIUM — Conclusão de tarefa e tratamento da publicação vinculada (puro, sem DOM).
 *
 * Regra de produto: concluir uma tarefa ligada a uma publicação encerra a triagem
 * daquela publicação. O tratamento aqui é o interno do ATRIUM (`treatmentStatus`),
 * nunca ciência judicial (`specs/publication-treatment.md`).
 *
 * O módulo não decide sozinho: o chamador aplica o plano na mutação serializada do
 * app-state (servidor) ou no estado local antes do flush (cliente). O servidor é a
 * autoridade — o plano derivado no save corrige qualquer cliente que não aplique.
 */

export const TASK_DONE_STATUS = 'concluida';
const OPEN_TREATMENT_STATUSES = new Set(['untreated', 'in_review']);
const TREATMENT_SOURCE = 'task-completion';

function textOrEmpty(value) {
  return String(value ?? '').trim();
}

export function isTaskDone(task) {
  return textOrEmpty(task?.status) === TASK_DONE_STATUS;
}

/** Identificadores de publicação citados pela tarefa (id oficial, externalId ou vínculo). */
export function linkedPublicationIds(task) {
  const ids = [];
  for (const field of ['intimationId', 'sourceIntimationId', 'publicationId']) {
    const value = textOrEmpty(task?.[field]);
    if (value && !ids.includes(value)) ids.push(value);
  }
  return ids;
}

function publicationKeys(intimation) {
  const keys = [];
  for (const field of ['id', 'externalId']) {
    const value = textOrEmpty(intimation?.[field]);
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

export function findLinkedPublication(task, intimations = []) {
  const ids = linkedPublicationIds(task);
  if (!ids.length) return null;
  const list = Array.isArray(intimations) ? intimations : [];
  for (const intimation of list) {
    if (!intimation || intimation.mergedInto) continue;
    const keys = publicationKeys(intimation);
    if (ids.some(id => keys.includes(id))) return intimation;
  }
  return null;
}

/**
 * Tarefas que passaram a concluída entre o estado atual e o novo.
 * Devolve pares `{ task, publication }` para publicações ainda abertas.
 */
export function planTaskCompletionTreatment({ previousTasks = [], nextTasks = [], intimations = [] } = {}) {
  const before = new Map();
  for (const task of Array.isArray(previousTasks) ? previousTasks : []) {
    const id = textOrEmpty(task?.id);
    if (id) before.set(id, task);
  }
  const treatments = [];
  const seen = new Set();
  for (const task of Array.isArray(nextTasks) ? nextTasks : []) {
    const id = textOrEmpty(task?.id);
    if (!id || !isTaskDone(task)) continue;
    const previous = before.get(id);
    if (previous && isTaskDone(previous)) continue;
    if (!previous && textOrEmpty(task?.absorbedInto)) continue;
    const publication = findLinkedPublication(task, intimations);
    if (!publication) continue;
    if (!OPEN_TREATMENT_STATUSES.has(textOrEmpty(publication.treatmentStatus) || 'untreated')) continue;
    const publicationId = textOrEmpty(publication.id) || textOrEmpty(publication.externalId);
    if (seen.has(publicationId)) continue;
    seen.add(publicationId);
    treatments.push({ publicationId, taskId: id, taskTitle: textOrEmpty(task.title).slice(0, 160) });
  }
  return { treatments };
}

/**
 * Aplica o tratamento no estado (servidor ou cliente). Devolve o que mudou e as
 * entradas de auditoria, sem tocar em prazo, ciência ou e-mail.
 */
export function applyTaskCompletionTreatment(state, plan, { actor = 'Sistema', nowIso = new Date().toISOString() } = {}) {
  const treatments = Array.isArray(plan?.treatments) ? plan.treatments : [];
  const auditEntries = [];
  const treated = [];
  if (!treatments.length || !state || typeof state !== 'object') return { changed: false, treated, auditEntries };
  const intimations = Array.isArray(state.intimations) ? state.intimations : [];
  const byKey = new Map();
  for (const intimation of intimations) {
    if (!intimation || intimation.mergedInto) continue;
    for (const key of publicationKeys(intimation)) if (!byKey.has(key)) byKey.set(key, intimation);
  }
  const ator = textOrEmpty(actor).slice(0, 100) || 'Sistema';
  for (const treatment of treatments) {
    const publication = byKey.get(textOrEmpty(treatment.publicationId));
    if (!publication) continue;
    if (!OPEN_TREATMENT_STATUSES.has(textOrEmpty(publication.treatmentStatus) || 'untreated')) continue;
    publication.treatmentStatus = 'treated';
    publication.treatedAt = nowIso;
    publication.treatedBy = ator;
    publication.discardedAt = null;
    publication.discardedBy = null;
    publication.treatmentSource = TREATMENT_SOURCE;
    publication.treatmentTaskId = textOrEmpty(treatment.taskId).slice(0, 160);
    publication.updatedAt = nowIso;
    treated.push(textOrEmpty(publication.id) || textOrEmpty(publication.externalId));
    auditEntries.push({
      id: `aud-tarefa-trata-${Date.now().toString(36)}-${treated.length}`,
      at: nowIso,
      action: 'Publicação tratada ao concluir tarefa',
      detail: `${textOrEmpty(treatment.taskTitle) || treatment.taskId} · ${textOrEmpty(publication.process) || textOrEmpty(publication.id) || treatment.publicationId}`.slice(0, 500),
      actor: ator
    });
  }
  if (!treated.length) return { changed: false, treated, auditEntries: [] };
  if (Array.isArray(state.audit)) state.audit = [...auditEntries, ...state.audit].slice(0, 1000);
  else state.audit = auditEntries;
  return { changed: true, treated, auditEntries };
}

export const TASK_COMPLETION_TREATMENT_SOURCE = TREATMENT_SOURCE;
