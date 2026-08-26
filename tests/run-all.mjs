import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checkFiles = [
  'server.mjs',
  'lib/security.mjs',
  'lib/ai-context.mjs',
  'lib/judicial/credential-manager.mjs',
  'lib/judicial/session-manager.mjs',
  'lib/judicial/a1-sandbox.mjs',
  'lib/judicial/totp-sandbox.mjs',
  'lib/judicial/auth-adapters.mjs',
  'lib/judicial/orchestrator.mjs',
  'scripts/import-spreadsheet.mjs',
  'scripts/migrate-judicial-secrets.mjs',
  'js/auth.js',
  'js/portal.js',
  'js/prompts-data.js',
  'js/office-data.js',
  'collector/agent.mjs',
  'collector/adapters/djen.mjs',
  'collector/adapters/datajud.mjs',
  'collector/adapters/pje.mjs',
  'tests/helpers.mjs',
  'tests/security.mjs',
  'tests/importer.mjs',
  'tests/rls.mjs',
  'tests/collector.mjs',
  'tests/features_validation.mjs',
  'tests/open_source_features.mjs',
  'tests/ai-context.mjs',
  'tests/deployment.mjs',
  'tests/system_diagnostic.mjs',
  'tests/judicial_sandbox.mjs',
  'tests/smoke.mjs',
  'lib/state-migrations.mjs',
  'scripts/state-doctor.mjs',
  'tests/state_migrations.mjs'
];

const testSuites = [
  { name: 'Segurança e Criptografia (Auth, TOTP, CSRF, AES-256-GCM)', file: 'tests/security.mjs' },
  { name: 'Importador de Planilhas e Deduplicação (XLSX, PII protegido)', file: 'tests/importer.mjs' },
  { name: 'Políticas Supabase e Row Level Security (RLS AAL2)', file: 'tests/rls.mjs' },
  { name: 'Coletores Judiciais (DJEN, DataJud, PJe sem ciência auto)', file: 'tests/collector.mjs' },
  { name: 'Catálogos ADVBOX/Legal One e regras de negócio', file: 'tests/features_validation.mjs' },
  { name: 'Recursos jurídicos, privacidade e cálculos auxiliares', file: 'tests/open_source_features.mjs' },
  { name: 'Minimização de dados no contexto do assistente de IA', file: 'tests/ai-context.mjs' },
  { name: 'Deployment e Conformidade com Nuvem (Render / Cloud)', file: 'tests/deployment.mjs' },
  { name: 'Diagnóstico do Sistema, Backups Criptografados & Feedback Beta', file: 'tests/system_diagnostic.mjs' },
  { name: 'Arquitetura Judicial, A1 Sandbox (mTLS) & TOTP Sandbox', file: 'tests/judicial_sandbox.mjs' },
  { name: 'Higiene de Estado, Migrações Determinísticas & Recuperação', file: 'tests/state_migrations.mjs' },
  { name: 'Smoke Test E2E Playwright (Fluxo Completo UI / Kanban)', file: 'tests/smoke.mjs' }
];

async function runCommand(args, description) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) resolve(duration);
      else reject(new Error(`${description} falhou com código ${code} (${duration}s)`));
    });
  });
}

console.log('===============================================================');
console.log('  ATRIUM SENDA — SUÍTE DE TESTES E AUDITORIA COMPLETA');
console.log('===============================================================');

let hasFailure = false;

console.log('\n[1/2] Verificando sintaxe de todos os módulos JavaScript...');
for (const file of checkFiles) {
  try {
    await runCommand(['--check', file], `Verificação de ${file}`);
    console.log(`  ✓ ${file}`);
  } catch (error) {
    console.error(`  ✗ ${file}: ${error.message}`);
    hasFailure = true;
  }
}

if (hasFailure) {
  console.error('\nErro na verificação de sintaxe. Execução dos testes interrompida.');
  process.exit(1);
}

console.log('\n[2/2] Executando suítes de testes de conformidade...');
const results = [];

for (const suite of testSuites) {
  console.log(`\n--- Executando: ${suite.name} ---`);
  try {
    const duration = await runCommand([suite.file], suite.name);
    results.push({ name: suite.name, file: suite.file, status: 'APROVADO', duration });
  } catch (error) {
    results.push({ name: suite.name, file: suite.file, status: 'FALHOU', error: error.message });
    hasFailure = true;
  }
}

console.log('\n===============================================================');
console.log('                    RELATÓRIO DE RESULTADOS');
console.log('===============================================================');
for (const res of results) {
  const icon = res.status === 'APROVADO' ? '✓' : '✗';
  console.log(`${icon} [${res.status}] ${res.name} (${res.duration || 'erro'}s)`);
}
console.log('===============================================================');

if (hasFailure) {
  console.error('\nAlgumas suítes de teste falharam.');
  process.exit(1);
} else {
  console.log(`\nTodas as ${testSuites.length} suítes de teste e verificações foram APROVADAS com sucesso!`);
  process.exit(0);
}
