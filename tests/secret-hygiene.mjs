import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM — HIGIENE DE SEGREDOS (FAIL-CLOSED, SEM CREDENCIAL)   ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = spawnSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' }).stdout
  .split(/\r?\n/).filter(Boolean);

console.log('[S1] Nenhum fallback/credencial literal em scripts, lib, collector e server...');
const violations = [];
for (const file of tracked) {
  if (!/^(scripts|collector|lib)\//.test(file) && file !== 'server.mjs') continue;
  let content; try { content = readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
  if (/A1_PFX_PASSPHRASE\s*\|\|\s*'[^']+'/.test(content)) violations.push(file + ': fallback literal de passphrase A1');
  if (/\bpassword\s*:\s*'[^']+'/i.test(content)) violations.push(file + ': senha literal');
  if (/\bpassphrase\s*[:=]\s*'[^']+'/i.test(content)) violations.push(file + ': passphrase literal');
  if (/\bsecret\s*[:=]\s*'[^']{8,}'/i.test(content)) violations.push(file + ': secret literal');
}
assert.deepEqual(violations, [], 'Credenciais literais não podem existir no código:\n' + violations.join('\n'));
console.log('  ✓ Nenhuma credencial literal encontrada.');

console.log('[S2] .env.example não contém valores de segredo...');
const envExample = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
for (const line of envExample.split(/\r?\n/)) {
  const match = line.match(/^(A1_PFX_PATH|A1_PFX_PASSPHRASE|PJE_TOTP_SECRET|RESEND_API_KEY|RESEND_WEBHOOK_SECRET|AUTH_SESSION_SECRET|AUTH_ENCRYPTION_KEY|COLLECTOR_INGEST_TOKEN|SETUP_BOOTSTRAP_TOKEN)=(.*)$/);
  if (!match) continue;
  const value = match[2].trim();
  assert.ok(value === '' || /^(?:troque|gerad|exemplo|change|replace|sua|seu|coloque)/i.test(value),
    `.env.example:${match[1]} não pode conter valor real de segredo.`);
}
console.log('  ✓ .env.example apenas com placeholders vazios.');

console.log('[S3] Scripts CLI falham fechado sem credencial explícita...');
const runFailClosed = (script, env) => spawnSync(process.execPath, [script], {
  cwd: ROOT,
  env: { ...process.env, ...env },
  encoding: 'utf8',
  timeout: 20_000
});

const downloadRun = runFailClosed('scripts/download-and-ingest-a1.mjs', { A1_PFX_PASSPHRASE: '' });
assert.notEqual(downloadRun.status, 0, 'download-and-ingest-a1.mjs deve falhar sem passphrase.');
assert.match(String(downloadRun.stderr) + String(downloadRun.stdout), /passphrase/i, 'Falha deve orientar o uso da passphrase.');
// Nota: o auxílio de operador scripts/validate-server-state.mjs (com dados
// pessoais do ambiente de desenvolvimento) fica fora da edição aberta por
// desenho; este S3 cobre os scripts publicados na edição.

console.log('  ✓ download-and-ingest-a1 falha fechado sem credencial.');

console.log('\n>>> SECRET HYGIENE: PASS <<<\n');
