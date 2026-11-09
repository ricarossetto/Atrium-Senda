import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPrivacyAudit } from '../lib/judicial-intelligence/security/privacy-audit.mjs';
import { scanSecrets, isScannableFile, isPrivateKeyFile } from '../lib/judicial-intelligence/security/secret-scanner.mjs';
import { scanLogPii, identifierLooksSensitive } from '../lib/judicial-intelligence/security/pii-scanner.mjs';
import { scanSensitiveRoutes } from '../lib/judicial-intelligence/security/workspace-isolation-audit.mjs';
import { buildReport, renderMarkdown, exitCodeFor, summarizeFindings, SEVERITIES } from '../lib/judicial-intelligence/security/report.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PRIVACY/SECURITY LINTER (BETA)');
console.log('===============================================================\n');

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-ji-privacy-'));

try {
  console.log('[P1] Scanner de segredos: literais, fallback e arquivo de chave...');
  {
    const fakePassword = ['senha', "= '", 'Sup3r', 'Secreta', "'"].join('');
    const fakeKey = ['api', "_key = '", 'ABCDEFGHIJKLMNOP', "123456'"].join('');
    const fallbackLine = ['const key = process.env.API_KEY || ', "'chave-embutida-123456';"].join('');
    const findings = scanSecrets({
      file: 'src/config.mjs',
      lines: [
        `export const config = { ${fakePassword} };`,
        fallbackLine,
        `const token = '${['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0ZSJ9', 'assinatura'].join('.')}';`,
        `const safe = process.env.SENHA;`
      ]
    });
    const ids = findings.map(finding => finding.id).sort();
    assert.deepEqual(ids, ['fallback-credential', 'jwt-literal', 'literal-password']);
    assert.equal(findings.every(finding => finding.severity === 'CRITICAL' || finding.severity === 'HIGH'), true);
    assert.equal(findings.every(finding => !finding.evidence.includes('Sup3r')), true, 'Evidência nunca ecoa o segredo.');
    assert.equal(isScannableFile('lib/security.mjs'), true);
    assert.equal(isScannableFile('data/state.json'), false);
    assert.equal(isPrivateKeyFile('secrets/a1.pfx'), true);
    const keyFinding = scanSecrets({ file: 'secrets/a1.pfx', lines: [] });
    assert.equal(keyFinding[0].id, 'tracked-private-key-file');
    assert.equal(keyFinding[0].severity, 'MEDIUM');
    const fixtureKey = scanSecrets({ file: 'tests/fixtures/synthetic.key', lines: [] });
    assert.equal(fixtureKey[0].severity, 'LOW', 'Chave sintética em teste tem severidade reduzida.');
    const fixtureSecretLine = ['const password = ', "'senha-de-teste-123';"].join('');
    const fixtureSecret = scanSecrets({ file: 'tests/example.mjs', lines: [fixtureSecretLine] });
    assert.equal(fixtureSecret[0].severity, 'LOW');
  }

  console.log('[P2] Scanner de PII em logs: mascaramento, fixtures e precisão...');
  {
    const cpf = ['987', '.654', '.321', '-00'].join('');
    const findings = scanLogPii({
      file: 'lib/servico.mjs',
      lines: [`console.log('Cliente ${'${cliente.nome}'} CPF ' + '${cpf}');`]
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, 'log-cpf');
    assert.equal(findings[0].severity, 'HIGH');
    assert.equal(findings[0].evidence.includes(cpf), false, 'PII nunca é ecoada em claro.');
    assert.equal(scanLogPii({ file: 'lib/x.mjs', lines: [`console.log('CPF 000.000.000-00')`] }).length, 0, 'Valor sintético não gera achado.');
    assert.equal(scanLogPii({ file: 'tests/x.mjs', lines: [`console.log('obs')`] }).length, 0);
    assert.equal(identifierLooksSensitive('removedTotpCount'), false);
    assert.equal(identifierLooksSensitive('pfxPath'), false);
    assert.equal(identifierLooksSensitive('PASSWORD_RESET_DAILY_LIMIT'), false);
    assert.equal(identifierLooksSensitive('sessionCookie'), true);
    assert.equal(identifierLooksSensitive('portalCredentials.totpSecret'), true);
    const consoleCall = ['console', '.', 'log'].join('');
    const sensitiveRef = ['session', 'Cookie'].join('');
    const interpolatedLine = [`${consoleCall}(\`Sessao: \${${sensitiveRef}}\`);`].join('');
    const interpolated = scanLogPii({ file: 'scripts/demo.mjs', lines: [interpolatedLine] });
    assert.equal(interpolated.length, 1);
    assert.equal(interpolated[0].id, 'log-sensitive-field');
    // Áreas antes isentas pelo próprio scanner agora são cobertas: um segredo
    // plantado no diretório da camada de segurança precisa ser detectado.
    const exclusionProbe = scanSecrets({
      file: 'lib/judicial-intelligence/security/example-config.mjs',
      lines: [['const ', ['api', '_key'].join(''), " = '", 'A'.repeat(24), "';"].join('')]
    });
    assert.ok(exclusionProbe.length >= 1, 'Área antes isenta deve ser coberta pelo scanner.');
    const piiProbeLine = [`${consoleCall}(\`Sessao: \${${sensitiveRef}}\`);`].join('');
    const piiExclusionProbe = scanLogPii({
      file: 'lib/judicial-intelligence/security/example-log.mjs',
      lines: [piiProbeLine]
    });
    assert.ok(piiExclusionProbe.length >= 1, 'Scanner de PII também cobre a área antes isenta.');
  }

  console.log('[P3] RBAC: rota sensível sem guarda e prefixo protegido...');
  {
    const unguarded = scanSensitiveRoutes({
      file: 'server.mjs',
      content: [
        "if (req.method === 'GET' && url.pathname === '/api/relatorios/export') {",
        '  const data = await load();',
        '}',
        "if (url.pathname.startsWith('/api/admin/')) {",
        '  assertAdmin(req, true);',
        "  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {",
        '    return json({ ok: true });',
        '  }',
        '}',
        "if (req.method === 'POST' && url.pathname === '/api/estado/salvar') {",
        '  assertAuthenticated(req, true);',
        '  return json({ ok: true });',
        '}'
      ].join('\n')
    });
    assert.equal(unguarded.length, 1);
    assert.equal(unguarded[0].id, 'unguarded-route');
    assert.equal(unguarded[0].severity, 'HIGH');
    assert.equal(unguarded[0].line, 1);
    const guarded = scanSensitiveRoutes({
      file: 'server.mjs',
      content: "if (url.pathname.startsWith('/api/admin/')) {\n  assertAdmin(req, true);\n  if (url.pathname === '/api/admin/overview') { return json({}); }\n}"
    });
    assert.equal(guarded.length, 0);
  }

  console.log('[P4] Relatório, severidades e códigos de saída...');
  {
    const findings = [
      { id: 'a', severity: 'MEDIUM', category: 'secret', file: 'a.mjs', line: 2, description: 'x', evidence: 'y', remediation: 'z' },
      { id: 'b', severity: 'CRITICAL', category: 'secret', file: 'b.mjs', line: 1, description: 'x', evidence: 'y', remediation: 'z' }
    ];
    const report = buildReport({ findings, rootDir: 'C:/projeto', filesScanned: 10, generatedAt: '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(report.summary.bySeverity, { CRITICAL: 1, HIGH: 0, MEDIUM: 1, LOW: 0, INFO: 0 });
    assert.equal(report.findings[0].severity, 'CRITICAL', 'Relatório ordena por severidade.');
    const summary = summarizeFindings(findings);
    assert.equal(summary.byCategory.secret, 2);
    assert.deepEqual(SEVERITIES, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
    assert.equal(exitCodeFor(report, { failOn: 'never' }), 0);
    assert.equal(exitCodeFor(report, { failOn: 'critical' }), 1);
    assert.equal(exitCodeFor(report, { failOn: 'high' }), 1);
    const clean = buildReport({ findings: [{ ...findings[0], id: 'c' }] });
    assert.equal(exitCodeFor(clean, { failOn: 'high' }), 0);
    assert.equal(exitCodeFor(clean, { failOn: 'medium' }), 1);
    const markdown = renderMarkdown(report);
    assert.match(markdown, /Relatório de Privacidade/);
    assert.match(markdown, /CRITICAL/);
    assert.match(markdown, /b\.mjs:1/);
  }

  console.log('[P5] Auditoria completa em projeto sintético com problemas plantados...');
  {
    const project = path.join(tempRoot, 'projeto-sintetico');
    await mkdir(path.join(project, 'src'), { recursive: true });
    await mkdir(path.join(project, 'secrets'), { recursive: true });
    await writeFile(path.join(project, '.gitignore'), 'node_modules/\n', 'utf8');
    await writeFile(path.join(project, 'src', 'servico.mjs'), [
      `const password = 'credencial-embutida-999';`,
      "console.log('CPF ' + '${cpf}');"
    ].join('\n'), 'utf8');
    await writeFile(path.join(project, 'secrets', 'a1.pfx'), 'binario-sintetico', 'utf8');
    await writeFile(path.join(project, 'server.mjs'), "if (url.pathname === '/api/relatorios') {\n  return json({});\n}\n", 'utf8');
    await writeFile(path.join(project, 'lixo.tmp-1234'), 'x', 'utf8');

    const report = await runPrivacyAudit({ rootDir: project, generatedAt: '2026-01-01T00:00:00.000Z' });
    const ids = new Set(report.findings.map(finding => finding.id));
    assert.equal(ids.has('literal-password'), true);
    assert.equal(ids.has('tracked-private-key-file'), true);
    assert.equal(ids.has('unguarded-route'), true);
    assert.equal(ids.has('tmp-suffixed'), true);
    assert.equal(ids.has('gitignore-missing-env'), true);
    assert.equal(ids.has('gitignore-missing-data'), true);
    assert.equal(report.filesScanned > 0, true);
    assert.equal(exitCodeFor(report, { failOn: 'critical' }), 1);
    assert.equal(JSON.stringify(report).includes('credencial-embutida-999'), false, 'Relatório nunca ecoa o segredo.');
  }

  console.log('[P6] Auditoria real do repositório beta: sem CRITICAL e estrutura íntegra...');
  {
    const report = await runPrivacyAudit({ rootDir: path.resolve('.') });
    assert.equal(report.filesScanned >= 300, true, 'Auditoria deve varrer o repositório real.');
    assert.equal(report.summary.bySeverity.CRITICAL, 0, 'Nenhum segredo crítico no repositório beta.');
    assert.equal(report.summary.bySeverity.HIGH, 0, 'Nenhuma rota sensível sem guarda detectada.');
    for (const severity of SEVERITIES) {
      assert.equal(Number.isInteger(report.summary.bySeverity[severity]), true);
    }
    assert.equal(Array.isArray(report.findings), true);
    assert.equal(report.findings.every(finding => finding.id && finding.severity && finding.category), true);
  }

  console.log('✓ Privacy linter: segredos, PII, RBAC, retenção, relatórios e projeto sintético aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-ji-privacy-')) {
    throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
