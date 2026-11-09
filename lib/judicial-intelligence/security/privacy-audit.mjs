import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { scanSecrets, isScannableFile } from './secret-scanner.mjs';
import { scanLogPii } from './pii-scanner.mjs';
import { scanRetention } from './retention-audit.mjs';
import { scanWorkspaceIsolation, runDynamicIsolationChecks } from './workspace-isolation-audit.mjs';
import { buildReport } from './report.mjs';

export const AUDIT_SCAN_DIRECTORIES = Object.freeze(['lib', 'js', 'collector', 'scripts', 'tests', 'specs', 'functions', 'supabase']);

export const AUDIT_IGNORED_DIRECTORIES = Object.freeze(['node_modules', '.git', 'data', 'dist', 'artifacts', '.factory-reset', 'scratch']);

export function listTrackedFiles({ rootDir }) {
  try {
    const output = execFileSync('git', ['-C', rootDir, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split(/\r?\n/).filter(Boolean);
  } catch {
    return null;
  }
}

export async function walkFiles({ rootDir, maxFiles = 5000 }) {
  const collected = [];
  const rootEntries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of rootEntries) {
    if (entry.isFile()) {
      collected.push(entry.name);
      continue;
    }
    if (!entry.isDirectory() || AUDIT_IGNORED_DIRECTORIES.includes(entry.name)) continue;
    const target = path.join(rootDir, entry.name);
    try {
      const nested = await readdir(target, { recursive: true, withFileTypes: true });
      for (const item of nested) {
        if (!item.isFile()) continue;
        const parent = item.parentPath ?? item.path ?? target;
        collected.push(path.relative(rootDir, path.join(parent, item.name)).replace(/\\/g, '/'));
        if (collected.length >= maxFiles) return collected;
      }
    } catch {
      continue;
    }
  }
  return collected;
}

export async function collectAuditableFiles({ rootDir, files = null, maxFileBytes = 1_500_000 }) {
  let candidates = files;
  if (!candidates) {
    const tracked = listTrackedFiles({ rootDir });
    candidates = tracked && tracked.length > 0 ? tracked : await walkFiles({ rootDir });
  }
  const selected = [];
  for (const file of candidates) {
    if (!isScannableFile(file)) continue;
    if (/(^|[\\/])(node_modules|\.git|dist|artifacts)[\\/]/.test(file)) continue;
    selected.push(file);
  }
  return { files: selected, maxFileBytes };
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter(finding => {
    const key = `${finding.id}|${finding.file}|${finding.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runPrivacyAudit({
  rootDir = process.cwd(),
  files = null,
  includeDynamic = false,
  dynamicRunner = runDynamicIsolationChecks,
  generatedAt = new Date().toISOString()
} = {}) {
  const { files: auditable } = await collectAuditableFiles({ rootDir, files });
  const findings = [];

  for (const relative of auditable) {
    const absolute = path.join(rootDir, relative);
    const content = await readFile(absolute, 'utf8').catch(() => null);
    if (content === null) continue;
    findings.push(...scanSecrets({ file: relative, content }));
    findings.push(...scanLogPii({ file: relative, content }));
  }

  const retention = await scanRetention({ rootDir });
  findings.push(...retention.findings);
  findings.push(...await scanWorkspaceIsolation({ rootDir }));

  let dynamicResults = [];
  if (includeDynamic) {
    dynamicResults = await dynamicRunner({ rootDir });
    for (const result of dynamicResults) {
      if (result.ok) continue;
      findings.push({
        id: 'dynamic-isolation-failure',
        severity: 'HIGH',
        category: 'workspace-isolation',
        file: result.file,
        line: 0,
        description: `Verificação dinâmica falhou: ${result.name}.`,
        evidence: `exit=${result.exitCode}`,
        remediation: 'Corrigir a regressão antes de promover o beta.'
      });
    }
  }

  return buildReport({
    findings: dedupeFindings(findings),
    rootDir,
    filesScanned: auditable.length,
    includeDynamic,
    dynamicResults,
    generatedAt
  });
}
