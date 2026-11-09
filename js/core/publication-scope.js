// Scope of internal triage only. Never changes treatment or official notice.
export function publicationsInTrackingScope(items, since) {
  const records = Array.isArray(items) ? items : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since || ''))) return records;
  return records.filter(item => {
    const published = String(item.publishedAt || '').slice(0, 10);
    // Unknown dates remain visible for human review.
    return !/^\d{4}-\d{2}-\d{2}$/.test(published) || published >= since;
  });
}

export function recentPublicationCutoff(now = new Date(), days = 2) {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - Math.max(0, Number(days || 1) - 1));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Rolling triage window. Unknown dates remain visible so records are not hidden
// before a person can verify their publication date.
export function publicationsInRecentScope(items, { now = new Date(), days = 2 } = {}) {
  const records = Array.isArray(items) ? items : [];
  const cutoff = recentPublicationCutoff(now, days);
  return records.filter(item => {
    const published = String(item?.publishedAt || '').slice(0, 10);
    return !/^\d{4}-\d{2}-\d{2}$/.test(published) || published >= cutoff;
  });
}

// Merge aliases are compatibility shims for stale clients: the keeper record is
// the active publication and the alias must never render, count or link.
function mergedIntimationTarget(item) {
  const target = item?.mergedInto;
  if (target === undefined || target === null) return '';
  if (typeof target === 'object') return String(target.id ?? target.targetId ?? '').trim();
  return String(target).trim();
}

export function isMergedIntimation(item) {
  return mergedIntimationTarget(item) !== '';
}

export function isActiveIntimation(item) {
  return !isMergedIntimation(item);
}

export function activeIntimations(items) {
  return (Array.isArray(items) ? items : []).filter(isActiveIntimation);
}

export function resolveIntimationId(items, id) {
  const records = Array.isArray(items) ? items : [];
  let current = id;
  const visited = new Set();
  while (current !== undefined && current !== null && String(current).trim() !== '') {
    const key = String(current).trim();
    if (visited.has(key)) return '';
    visited.add(key);
    const record = records.find(item => String(item?.id) === key);
    if (!record || !isMergedIntimation(record)) return key;
    current = mergedIntimationTarget(record);
  }
  return '';
}

export function findIntimationRecord(items, id) {
  const records = Array.isArray(items) ? items : [];
  const resolved = resolveIntimationId(records, id);
  if (!resolved) return null;
  return records.find(item => String(item?.id) === resolved) || null;
}
