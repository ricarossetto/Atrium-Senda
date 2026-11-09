import { applyTaskCompletionTreatment, planTaskCompletionTreatment } from '../core/publication-task-treatment.js?v=3.0.0';

const SNAPSHOT_FIELDS = [
  'treatmentStatus', 'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy',
  'treatmentSource', 'treatmentTaskId', 'updatedAt'
];

/**
 * Concluir a tarefa encerra a triagem da publicação vinculada (mesma regra do servidor).
 * Aplicado pelo orquestrador — a feature de tarefas não conhece o estado de tratamento.
 * Devolve a função de desfazer para o caso de o flush falhar.
 */
export function treatPublicationForCompletedTask(store, task, previousStatus, actor = 'Advogado(a)') {
  if (!store?.state || !task) return null;
  const plan = planTaskCompletionTreatment({
    previousTasks: [{ id: task.id, status: previousStatus }],
    nextTasks: [task],
    intimations: store.state.intimations || []
  });
  if (!plan.treatments.length) return null;
  const snapshots = [];
  for (const treatment of plan.treatments) {
    const publication = (store.state.intimations || []).find(item => item
      && (String(item.id) === treatment.publicationId || String(item.externalId) === treatment.publicationId));
    if (!publication) continue;
    const snapshot = {};
    for (const field of SNAPSHOT_FIELDS) snapshot[field] = publication[field];
    snapshots.push({ publication, snapshot });
  }
  const result = applyTaskCompletionTreatment(store.state, plan, { actor });
  if (!result.changed) return null;
  const auditIds = new Set((result.auditEntries || []).map(entry => entry.id));
  return () => {
    for (const { publication, snapshot } of snapshots) {
      for (const [field, value] of Object.entries(snapshot)) {
        if (value === undefined) delete publication[field];
        else publication[field] = value;
      }
    }
    store.state.audit = (store.state.audit || []).filter(entry => !auditIds.has(entry.id));
  };
}
