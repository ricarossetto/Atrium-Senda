const PROTECTED_INTIMATION_FIELDS = [
  'status', 'unread', 'treatmentStatus', 'treatmentStartedAt', 'treatmentStartedBy',
  'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy', 'treatmentNote',
  'linkedTaskIds', 'taskId', 'deadline', 'fatalDeadline', 'responsible', 'completedAt'
];

const ADDITIVE_INTIMATION_FIELDS = ['client', 'clientName', 'contactId', 'text'];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

export function mergeExternalIntimations(left = [], right = []) {
  const result = [...left];
  for (const incoming of right) {
    const identity = incoming?.externalId ?? incoming?.id;
    const index = result.findIndex(item => (item?.externalId ?? item?.id) === identity);
    if (index < 0) {
      result.unshift(incoming);
      continue;
    }
    const current = result[index];
    const merged = { ...current, ...incoming };
    for (const field of PROTECTED_INTIMATION_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
    }
    for (const field of ADDITIVE_INTIMATION_FIELDS) {
      if (!hasValue(incoming?.[field]) && hasValue(current?.[field])) merged[field] = current[field];
    }
    result[index] = merged;
  }
  return result;
}
