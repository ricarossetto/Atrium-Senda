const PROTECTED_INTIMATION_FIELDS = [
  'status', 'unread', 'treatmentStatus', 'treatmentStartedAt', 'treatmentStartedBy',
  'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy', 'treatmentNote',
  'linkedTaskIds', 'taskId', 'deadline', 'deadlineSource', 'fatalDeadline', 'responsible', 'completedAt'
];

const AUTO_DEADLINE_SOURCES = new Set(['eproc', 'pje']);
const ADDITIVE_INTIMATION_FIELDS = ['client', 'clientName', 'contactId', 'text'];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isAutoDeadlineSource(value) {
  return AUTO_DEADLINE_SOURCES.has(String(value || '').toLowerCase());
}

export function mergeExternalIntimations(left = [], right = []) {
  const result = [];
  const suppressedTail = [];
  const suppressedKeys = new Set();
  const suppressedKeysFor = record => [record?.id, record?.externalId]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  for (const existing of Array.isArray(left) ? left : []) {
    if (existing?.captureSuppressed) {
      const keys = suppressedKeysFor(existing);
      if (keys.length && keys.some(key => suppressedKeys.has(key))) continue;
      for (const key of keys) suppressedKeys.add(key);
      suppressedTail.push(existing);
      continue;
    }
    result.push(existing);
  }
  for (const incoming of Array.isArray(right) ? right : []) {
    if (incoming?.captureSuppressed) {
      const keys = suppressedKeysFor(incoming);
      if (keys.some(key => suppressedKeys.has(key))) continue;
      for (const key of keys) suppressedKeys.add(key);
      suppressedTail.push(incoming);
      continue;
    }
    const identity = incoming?.externalId ?? incoming?.id;
    const index = result.findIndex(item => !item?.captureSuppressed && (item?.externalId ?? item?.id) === identity);
    if (index < 0) {
      result.unshift(incoming);
      continue;
    }
    const current = result[index];
    const merged = { ...current, ...incoming };

    // Só a própria fonte oficial pode alterar o par (data + origem), e apenas quando
    // o valor vigente é idêntico ao último por ela declarado. Sem origem elegível na
    // entrada, a nova data fica só como referência e não vira prazo operativo.
    const sourceUpdatedDeadline = isAutoDeadlineSource(current?.deadlineSource)
      && hasValue(current?.sourceReportedDeadlineAt)
      && current.deadline === current.sourceReportedDeadlineAt
      && hasValue(incoming?.deadline)
      && isAutoDeadlineSource(incoming?.deadlineSource)
      && hasValue(incoming?.sourceReportedDeadlineAt)
      && incoming.sourceReportedDeadlineAt !== current.sourceReportedDeadlineAt;

    for (const field of PROTECTED_INTIMATION_FIELDS) {
      if (field === 'deadline' && sourceUpdatedDeadline) {
        merged.deadline = incoming.deadline;
        continue;
      }
      if (field === 'deadlineSource') {
        if (sourceUpdatedDeadline) {
          merged.deadlineSource = incoming.deadlineSource;
        } else if (Object.prototype.hasOwnProperty.call(current, field)) {
          merged.deadlineSource = current.deadlineSource;
        } else if (hasValue(current?.deadline)) {
          // Prazo legado sem origem declarada: o merge não inventa proveniência.
          delete merged.deadlineSource;
        }
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
    }
    for (const field of ADDITIVE_INTIMATION_FIELDS) {
      if (!hasValue(incoming?.[field]) && hasValue(current?.[field])) merged[field] = current[field];
    }
    result[index] = merged;
  }
  return suppressedTail.length ? [...result, ...suppressedTail] : result;
}
