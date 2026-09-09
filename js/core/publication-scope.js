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
