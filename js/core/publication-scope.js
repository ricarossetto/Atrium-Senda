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
