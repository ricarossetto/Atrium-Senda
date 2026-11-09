import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const isFull = args.includes('--full');
const modeName = isFull ? 'FULL RELEASE VERIFICATION' : 'FAST INTEGRITY VERIFICATION';

console.log('===============================================================');
console.log(`  ATRIUM VERIFICATION SUITE — ${modeName}`);
console.log('===============================================================\n');

const FAST_SUITE = [
  { name: 'Sintaxe e Integridade Estrutural (JS/MJS)', cmd: process.execPath, args: ['scripts/check-syntax.mjs'] },
  { name: 'Atrium Admin Control Plane Suite', cmd: process.execPath, args: ['tests/admin_control_plane.mjs'] },
  { name: 'Segurança Criptográfica e Derivação de Chaves', cmd: process.execPath, args: ['tests/security.mjs'] },
  { name: 'Row-Level Security & RBAC', cmd: process.execPath, args: ['tests/rls.mjs'] },
  { name: 'Contratos de Especificação e API', cmd: process.execPath, args: ['tests/spec_contracts.mjs'] },
  { name: 'Inteligência Jurídica do Gerador de Minutas', cmd: process.execPath, args: ['tests/legal_intelligence.mjs'] },
  { name: 'Catálogo Derivado de Skills e Vendor', cmd: process.execPath, args: ['tests/skills_catalog_generation.mjs'] },
  { name: 'Artefato Cloud (build:cloud → dist)', cmd: process.execPath, args: ['tests/cloud_frontend_artifact.mjs'] },
  { name: 'Gestão da Chave de IA (Remover/Alterar)', cmd: process.execPath, args: ['tests/ai_key_management.mjs'] },
  { name: 'Provedores de IA (Zen/Go/OpenAI/Anthropic)', cmd: process.execPath, args: ['tests/ai_providers.mjs'] },
  { name: 'Anexos do Assistente (PDF/TXT + OCR)', cmd: process.execPath, args: ['tests/ai_attachments.mjs'] },
  { name: 'Tratamento e Triagem de Publicações', cmd: process.execPath, args: ['tests/publications_treatment.mjs'] },
  { name: 'Isolamento de Workspaces Multi-Tenant', cmd: process.execPath, args: ['tests/multi_workspace.mjs'] },
  { name: 'Isolamento Multi-Tenant, RBAC & Prevenção de IDOR', cmd: process.execPath, args: ['tests/multi_tenant_isolation.mjs'] }
];

const FULL_SUITE = [
  ...FAST_SUITE,
  { name: 'Inteligência Jurídica: Rotas, CSRF e Degradação', cmd: process.execPath, args: ['tests/legal_intelligence_http.mjs'] },
  { name: 'Armazenamento e Metadados Documentais', cmd: process.execPath, args: ['tests/document_storage.mjs'] },
  { name: 'Backup e Restauração Segura de Dados', cmd: process.execPath, args: ['tests/backup_restore.mjs'] },
  { name: 'UI V2 Processos (Playwright Headless)', cmd: process.execPath, args: ['tests/ui_v2_processes.mjs'] }
];

const suite = isFull ? FULL_SUITE : FAST_SUITE;
const results = [];

async function runStep(step, index, total) {
  const label = `[${index + 1}/${total}] ${step.name}`;
  process.stdout.write(`${label} ... `);
  const start = Date.now();

  return new Promise(resolve => {
    const child = spawn(step.cmd, step.args, {
      cwd: ROOT,
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', code => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      const pass = code === 0;
      if (pass) {
        console.log(`PASS (${elapsed}s)`);
      } else {
        console.log(`FAIL (exit ${code}, ${elapsed}s)`);
        if (stderr.trim()) console.error(`    STDERR: ${stderr.trim().slice(0, 300)}`);
        if (stdout.trim()) console.error(`    STDOUT: ${stdout.trim().slice(0, 300)}`);
      }
      resolve({ name: step.name, pass, elapsed, code });
    });

    child.on('error', err => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`ERROR (${elapsed}s)`);
      console.error(`    SPAWN ERROR: ${err.message}`);
      resolve({ name: step.name, pass: false, elapsed, code: 1 });
    });
  });
}

async function run() {
  const startAll = Date.now();
  for (let i = 0; i < suite.length; i++) {
    const res = await runStep(suite[i], i, suite.length);
    results.push(res);
  }

  const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(2);
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log('\n===============================================================');
  console.log(`  RESUMO DA VERIFICAÇÃO (${modeName})`);
  console.log('===============================================================');
  console.log(`  Total de Testes : ${results.length}`);
  console.log(`  Aprovados       : ${passed}`);
  console.log(`  Falhas          : ${failed}`);
  console.log(`  Tempo Total     : ${totalElapsed}s`);
  console.log('---------------------------------------------------------------');

  if (failed > 0) {
    console.error('\n[STATUS: FALHA] Os seguintes testes falharam:');
    results.filter(r => !r.pass).forEach(r => console.error(`  - ${r.name} (exit ${r.code})`));
    console.log('===============================================================\n');
    process.exit(1);
  } else {
    console.log('\n[STATUS: APROVADO] Todos os testes da suíte passaram com sucesso.');
    console.log('===============================================================\n');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
