export const SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const SEVERITY_WEIGHT = Object.freeze({
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1
});

export function sortFindings(findings = []) {
  return [...findings].sort((left, right) => {
    const weight = (SEVERITY_WEIGHT[right.severity] ?? 0) - (SEVERITY_WEIGHT[left.severity] ?? 0);
    if (weight !== 0) return weight;
    return `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`);
  });
}

export function summarizeFindings(findings = []) {
  const bySeverity = Object.fromEntries(SEVERITIES.map(severity => [severity, 0]));
  const byCategory = {};
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byCategory };
}

export function buildReport({ findings = [], rootDir = null, filesScanned = 0, includeDynamic = false, dynamicResults = [], generatedAt = new Date().toISOString() } = {}) {
  const sorted = sortFindings(findings);
  return {
    version: 1,
    generatedAt,
    rootDir,
    filesScanned,
    includeDynamic,
    dynamicResults,
    findings: sorted,
    summary: summarizeFindings(sorted)
  };
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# ATRIUM — Relatório de Privacidade/Segurança (beta)');
  lines.push('');
  lines.push(`Gerado em ${report.generatedAt}. Arquivos avaliados: ${report.filesScanned}. Auditoria técnica, não parecer jurídico.`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push('| Severidade | Total |');
  lines.push('|---|---|');
  for (const severity of SEVERITIES) {
    lines.push(`| ${severity} | ${report.summary.bySeverity[severity] ?? 0} |`);
  }
  lines.push('');
  if ((report.dynamicResults ?? []).length > 0) {
    lines.push('## Verificações dinâmicas');
    lines.push('');
    lines.push('| Verificação | Estado | Duração |');
    lines.push('|---|---|---|');
    for (const result of report.dynamicResults) {
      lines.push(`| ${result.name} | ${result.ok ? 'OK' : 'FALHOU'} | ${result.durationMs} ms |`);
    }
    lines.push('');
  }
  lines.push('## Achados');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('Nenhum achado.');
  } else {
    lines.push('| id | Severidade | Categoria | Local | Descrição | Remediação |');
    lines.push('|---|---|---|---|---|---|');
    for (const finding of report.findings) {
      const location = finding.file ? `\`${finding.file}${finding.line ? `:${finding.line}` : ''}\`` : '—';
      lines.push(`| ${finding.id} | ${finding.severity} | ${finding.category} | ${location} | ${escapeCell(finding.description)} | ${escapeCell(finding.remediation)} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function exitCodeFor(report, { failOn = 'never' } = {}) {
  if (!failOn || failOn === 'never' || failOn === 'none') return 0;
  const threshold = SEVERITY_WEIGHT[String(failOn).toUpperCase()];
  if (!threshold) return 0;
  for (const finding of report.findings) {
    if ((SEVERITY_WEIGHT[finding.severity] ?? 0) >= threshold && finding.category !== 'informational') return 1;
  }
  return 0;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
