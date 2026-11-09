import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

console.log('\n===============================================================');
console.log('  ATRIUM — JI HEALTH ESTRITO: DECLARADO VS PROBADO (BETA)      ');
console.log('===============================================================\n');

function runCli(args, env) {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/judicial-intelligence.mjs', ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8'
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

const BETA_FLAGS_ON = {
  BETA_PRIVACY_AUDIT: 'true',
  BETA_DOCUMENT_ACQUISITION: 'true',
  BETA_PROCESS_INTELLIGENCE: 'true',
  BETA_PDPJ_PROVIDER: 'false',
  BETA_DUE_DILIGENCE: 'false',
  BETA_LEGAL_RAG: 'false',
  BETA_DISABLE_AUTOMATIONS: 'true'
};

// 1. Modo declarado: nada é afirmado como verificado.
{
  const result = runCli(['health'], BETA_FLAGS_ON);
  assert.equal(result.code, 0, `health declarado deve sair 0 (${result.stderr ?? ''})`);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.probeMode, 'declared');
  assert.equal(snapshot.verification.process_intelligence, 'UNVERIFIED');
  assert.equal(snapshot.verification.datajud, 'UNVERIFIED');
  assert.equal(snapshot.verificationEvidence.process_intelligence, 'declared');
  assert.equal(snapshot.automation.automationsDisabled, true);
}

// 2. Modo estrito: probes locais reais, estado testado por módulo.
{
  const result = runCli(['health', '--strict'], BETA_FLAGS_ON);
  assert.equal(result.code, 0, `health --strict deve sair 0 com probes locais verdes (${result.stderr ?? ''})`);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.probeMode, 'strict');
  assert.equal(snapshot.modules.process_intelligence, 'ok');
  assert.equal(snapshot.modules.documents, 'ok');
  assert.equal(snapshot.modules.privacy_audit, 'ok');
  assert.equal(snapshot.verification.process_intelligence, 'FIXTURE_VALIDATED');
  assert.equal(snapshot.verification.documents, 'FIXTURE_VALIDATED');
  assert.equal(snapshot.verification.privacy_audit, 'FIXTURE_VALIDATED');
  assert.equal(snapshot.verificationEvidence.process_intelligence, 'probed');
  assert.equal(snapshot.verificationEvidence.documents, 'probed');
  // Fonte externa nunca é promovida pelo health local.
  assert.equal(snapshot.verification.datajud, 'UNVERIFIED');
  assert.equal(snapshot.verificationEvidence.datajud, 'probed');
  assert.equal(snapshot.automation.automationsDisabled, true);
  // TPU permanece provisório no relatório quando aparece.
  assert.equal(typeof snapshot.flags.find(flag => flag.id === 'BETA_PROCESS_INTELLIGENCE'), 'object');
}

// 3. Módulo desligado não é inventariado nem afirmado.
{
  const result = runCli(['health', '--strict'], {
    ...BETA_FLAGS_ON,
    BETA_PROCESS_INTELLIGENCE: 'false',
    BETA_DOCUMENT_ACQUISITION: 'false'
  });
  assert.equal(result.code, 0);
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.modules.process_intelligence, undefined);
  assert.equal(snapshot.modules.datajud, undefined);
  assert.equal(snapshot.modules.privacy_audit, 'ok');
  assert.equal(snapshot.verification.privacy_audit, 'FIXTURE_VALIDATED');
}

// 4. PDPJ habilitado sem JWT humano: HUMAN_REQUIRED honesto, sem falha de gate.
{
  const result = runCli(['health', '--strict'], { ...BETA_FLAGS_ON, BETA_PDPJ_PROVIDER: 'true' });
  assert.equal(result.code, 0, 'HUMAN_REQUIRED não é degraded/unavailable');
  const snapshot = JSON.parse(result.stdout);
  assert.equal(snapshot.verification.pdpj, 'HUMAN_REQUIRED');
  assert.equal(snapshot.modules.mni !== undefined, true);
  assert.equal(snapshot.verification.mni, 'HUMAN_REQUIRED');
  assert.match(String(snapshot.verificationNotes.pdpj ?? ''), /JWT humano|token/i);
}

// 5. Kill-switch bloqueia operação mesmo com flags ligadas (comportamento).
{
  const result = runCli(['datajud-check', '--cnj', '0000000-00.2026.8.21.0000'], BETA_FLAGS_ON);
  assert.equal(result.code, 1, 'kill-switch deve bloquear datajud-check');
  assert.match(String(`${result.stderr}${result.stdout}`), /bloqueada/);
}

console.log('PASS health estrito: declarado vs probado, kill-switch e módulos desligados honestos.');
