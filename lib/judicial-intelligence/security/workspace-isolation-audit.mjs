import { execFile } from 'node:child_process';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';

export const WORKSPACE_INVARIANTS = Object.freeze([
  {
    id: 'workspace-data-directory',
    file: 'server.mjs',
    pattern: /function workspaceDataDirectory\(/,
    severity: 'HIGH',
    description: 'Resolução de diretório de dados por workspace presente.'
  },
  {
    id: 'workspace-request-context',
    file: 'server.mjs',
    pattern: /workspaceRequestContext\s*=\s*new AsyncLocalStorage/,
    severity: 'HIGH',
    description: 'Contexto de workspace por requisição (AsyncLocalStorage) presente.'
  },
  {
    id: 'collector-workspace-guard',
    file: 'server.mjs',
    pattern: /collectorWorkspace\(req\)/,
    severity: 'HIGH',
    description: 'Ingest do coletor resolve workspace por token/pairing.'
  },
  {
    id: 'static-private-prefixes',
    file: 'server.mjs',
    pattern: /privateStaticPrefixes\s*=\s*\[[^\]]*'data\/'[^\]]*'lib\/'/s,
    severity: 'HIGH',
    description: 'Diretórios sensíveis (data/, lib/) bloqueados no serving estático.'
  },
  {
    id: 'session-cookie-isolation',
    file: 'lib/security.mjs',
    pattern: /keller_session=[^;]*; HttpOnly; SameSite=Strict/,
    severity: 'HIGH',
    description: 'Sessão do escritório usa cookie HttpOnly com SameSite=Strict (sem cruzamento entre sites).'
  },
  {
    id: 'collector-fail-closed',
    file: 'lib/collectors/collector-context.mjs',
    pattern: /resolveAgentWorkspace/,
    severity: 'HIGH',
    description: 'Agente coletor falha fechado sem workspace explícito.'
  },
  {
    id: 'workspace-test-coverage',
    file: 'tests/multi_workspace.mjs',
    pattern: /cross-workspace|cross.workspace|401|403/,
    severity: 'MEDIUM',
    description: 'Cobertura de isolamento entre workspaces presente.'
  }
]);

export const DYNAMIC_ISOLATION_CHECKS = Object.freeze([
  { name: 'Isolamento de Workspaces Multi-Tenant', file: 'tests/multi_workspace.mjs' },
  { name: 'Isolamento Multi-Workspace dos Collectors (H3)', file: 'tests/h3_collector_isolation.mjs' }
]);

export const SENSITIVE_ROUTE_SKIP_PREFIXES = Object.freeze([
  '/api/health',
  '/api/version',
  '/api/status',
  '/api/auth/',
  '/api/platform/',
  '/api/tenant/',
  '/api/system/api-metadata'
]);

export const GUARD_TOKENS = Object.freeze([
  'assertAuthenticated',
  'assertAdmin',
  'collectorWorkspace',
  'createPlatformHttpHandler',
  'platformHttpHandler',
  'handleOmniRequest',
  'handleRegistryRequest',
  'handleInpiRequest',
  'handleTjrsSidecarRequest',
  'resolveCollectorSpawnToken',
  'authenticateCollector'
]);

const ROUTE_PATTERN = /url\.pathname\s*(?:===\s*'([^']+)'|\.startsWith\('([^']+)'\))/g;

function collectGuardedPrefixes(lines) {
  const guarded = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/url\.pathname\.startsWith\('([^']+)'\)/);
    if (!match) continue;
    const window = lines.slice(index, index + 8).join('\n');
    if (GUARD_TOKENS.some(token => window.includes(token))) {
      guarded.push({ prefix: match[1], line: index + 1 });
    }
  }
  return guarded;
}

function blockWindow(lines, startIndex, maxLookahead) {
  const collected = [];
  let depth = 0;
  let started = false;
  const limit = Math.min(lines.length, startIndex + maxLookahead);
  for (let index = startIndex; index < limit; index += 1) {
    const line = lines[index];
    collected.push(line);
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    depth += opens - closes;
    if (opens > 0) started = true;
    if (started && depth <= 0) break;
    if (!started && collected.length >= 3) break;
  }
  return collected.join('\n');
}

export function scanSensitiveRoutes({ file, content, lookahead = 70, lookbehind = 15 }) {
  const findings = [];
  if (!/server\.mjs$/.test(file) && !/http-routes\.mjs$/.test(file)) return findings;
  const source = String(content ?? '');
  const lines = source.split(/\r?\n/);
  const guardedPrefixes = collectGuardedPrefixes(lines);
  for (const match of source.matchAll(ROUTE_PATTERN)) {
    const route = match[1] ?? match[2];
    if (!route.startsWith('/api/')) continue;
    if (SENSITIVE_ROUTE_SKIP_PREFIXES.some(prefix => route.startsWith(prefix))) continue;
    const lineIndex = source.slice(0, match.index).split(/\r?\n/).length - 1;
    const lineNumber = lineIndex + 1;
    const window = blockWindow(lines, lineIndex, lookahead);
    if (GUARD_TOKENS.some(token => window.includes(token))) continue;
    const backward = lines.slice(Math.max(0, lineIndex - lookbehind), lineIndex).join('\n');
    if (GUARD_TOKENS.some(token => backward.includes(token))) continue;
    if (guardedPrefixes.some(entry => route.startsWith(entry.prefix) && entry.line <= lineNumber)) continue;
    findings.push({
      id: 'unguarded-route',
      severity: 'HIGH',
      category: 'rbac',
      file,
      line: lineNumber,
      description: `Rota ${route} sem guarda de autenticação/RBAC detectada na janela analisada.`,
      evidence: route,
      remediation: 'Aplicar assertAuthenticated/assertAdmin (ou handler dedicado) antes do efeito, com CSRF quando mutável.'
    });
  }
  return findings;
}

export async function scanWorkspaceIsolation({ rootDir, maxFileBytes = 2_000_000 }) {
  const findings = [];
  for (const invariant of WORKSPACE_INVARIANTS) {
    const target = path.join(rootDir, invariant.file);
    try {
      await access(target);
    } catch {
      findings.push({
        id: `missing-${invariant.id}`,
        severity: invariant.severity,
        category: 'workspace-isolation',
        file: invariant.file,
        line: 0,
        description: `Invariante ausente: ${invariant.description}`,
        evidence: '[arquivo ausente]',
        remediation: 'Restaurar a proteção ou atualizar o invariante com justificativa revisada.'
      });
      continue;
    }
    const content = await readFile(target, 'utf8').catch(() => '');
    if (content.length > maxFileBytes) continue;
    if (!invariant.pattern.test(content)) {
      findings.push({
        id: `broken-${invariant.id}`,
        severity: invariant.severity,
        category: 'workspace-isolation',
        file: invariant.file,
        line: 0,
        description: `Invariante não encontrado: ${invariant.description}`,
        evidence: '[padrão ausente]',
        remediation: 'Investigar regressão de isolamento; não prosseguir sem restabelecer a proteção.'
      });
    }
    findings.push(...scanSensitiveRoutes({ file: invariant.file, content }));
  }

  const serverPath = path.join(rootDir, 'server.mjs');
  const serverContent = await readFile(serverPath, 'utf8').catch(() => '');
  if (serverContent) findings.push(...scanSensitiveRoutes({ file: 'server.mjs', content: serverContent }));
  return findings;
}

export function runDynamicIsolationChecks({ rootDir, checks = DYNAMIC_ISOLATION_CHECKS, timeoutMs = 300_000, execFileFn = execFile } = {}) {
  return Promise.all(checks.map(check => new Promise(resolve => {
    const startedAt = Date.now();
    execFileFn(process.execPath, [check.file], { cwd: rootDir, timeout: timeoutMs }, error => {
      resolve({
        name: check.name,
        file: check.file,
        ok: !error,
        exitCode: error?.code ?? 0,
        durationMs: Date.now() - startedAt
      });
    });
  })));
}
