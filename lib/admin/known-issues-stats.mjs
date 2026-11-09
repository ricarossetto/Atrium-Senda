/**
 * ATRIUM — contagem do catálogo de Known Issues para o painel administrativo.
 *
 * A fonte é o próprio KNOWN_ISSUES.md; o painel não pode manter números
 * hardcoded que envelhecem quando um item é corrigido.
 */
export function parseKnownIssuesStats(markdown = '') {
  const stats = { total: 0, open: 0, needsRevalidation: 0, fixed: 0, risk: 0 };
  for (const section of String(markdown).split(/^## /m).slice(1)) {
    const header = section.split('\n', 1)[0] || '';
    if (!/^KI-\d+\b/.test(header)) continue;
    stats.total += 1;
    const status = (section.match(/\*\*Status:\*\*\s*`([^`]+)`/i)?.[1] || '').toUpperCase();
    if (status.includes('OPEN')) stats.open += 1;
    else if (status.includes('NEEDS_REVALIDATION')) stats.needsRevalidation += 1;
    else if (status.includes('FIXED')) stats.fixed += 1;
    else if (status.includes('RISK')) stats.risk += 1;
  }
  return stats;
}
