const TREATMENT_FIELDS = [
  'treatmentStatus',
  'treatedAt',
  'treatedBy',
  'discardedAt',
  'discardedBy',
  'treatmentNote',
  'treatmentSource',
  'treatmentTaskId',
  'treatmentStartedAt',
  'treatmentStartedBy',
  'treatmentAudit'
];

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || (value && typeof value === 'object')) return structuredClone(value);
  return value;
}

/**
 * O tratamento de publicação é autoridade do servidor: só a rota oficial de
 * tratamento (e a derivação de conclusão de tarefa) pode mudar os campos.
 * O flush do cliente não pode forjar quem tratou, quando, nem a auditoria.
 */
export function preserveCanonicalTreatment(currentState, nextState) {
  if (!nextState || typeof nextState !== 'object') return nextState;
  const currentById = new Map(
    (Array.isArray(currentState?.intimations) ? currentState.intimations : [])
      .filter(record => record && record.id)
      .map(record => [String(record.id), record])
  );
  const intimations = Array.isArray(nextState.intimations) ? nextState.intimations : [];
  for (const record of intimations) {
    if (!record || typeof record !== 'object') continue;
    const previous = currentById.get(String(record.id || ''));
    if (!previous) continue;
    for (const field of TREATMENT_FIELDS) {
      if (Object.hasOwn(previous, field)) record[field] = cloneValue(previous[field]);
      else delete record[field];
    }
    if (!record.treatmentStatus) record.treatmentStatus = 'untreated';
  }
  return nextState;
}
