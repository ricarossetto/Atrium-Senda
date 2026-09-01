import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { SecurityManager } from '../lib/security.mjs';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';
import { JudicialSessionManager, SESSION_STATUS } from '../lib/judicial/session-manager.mjs';
import { runA1Sandbox, A1_ERROR_CODES } from '../lib/judicial/a1-sandbox.mjs';
import { runTotpSandbox, parseTotpUri, parseGoogleAuthMigration, TOTP_ERROR_CODES } from '../lib/judicial/totp-sandbox.mjs';

import { randomBytes, X509Certificate } from 'node:crypto';

function windowsPowerShellEnvironment() {
  if (process.platform !== 'win32') return process.env;
  return {
    ...process.env,
    PSModulePath: [
      path.join(process.env.USERPROFILE || '', 'Documents', 'WindowsPowerShell', 'Modules'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsPowerShell', 'Modules'),
      path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
    ].join(';')
  };
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) return reject(new Error(stderr || `${cmd} exited with code ${code}`));
      resolve(stdout.trim());
    });
  });
}

async function generateSyntheticCertCrossPlatform() {
  if (process.platform === 'win32') {
    const genSyntheticScript = `
      $ErrorActionPreference = "Stop"
      $cert = New-SelfSignedCertificate -Subject "CN=Atrium Teste Unitario:00011122233" -CertStoreLocation "Cert:\\CurrentUser\\My" -KeyExportPolicy Exportable -KeySpec Signature
      $thumb = $cert.Thumbprint
      $pwd = "UnitSecret123!"
      $pfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pwd)
      Remove-Item "Cert:\\CurrentUser\\My\\$thumb" -Force
      $filePath = "$env:TEMP\\atrium-unit-synthetic-$([guid]::NewGuid().ToString('N')).pfx"
      [System.IO.File]::WriteAllBytes($filePath, $pfxBytes)
      [pscustomobject]@{
        filePath = $filePath
        passphrase = $pwd
        thumbprint = $thumb
        thumbprintSha256 = $cert.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
      } | ConvertTo-Json -Compress
    `;

    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', genSyntheticScript], {
        windowsHide: true,
        env: windowsPowerShellEnvironment(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      child.on('exit', code => {
        if (code !== 0) return reject(new Error(stderr || `PS exited with code ${code}`));
        try { resolve(JSON.parse(stdout.trim())); } catch { resolve(stdout.trim()); }
      });
    });
  }

  // Non-Windows (Linux / macOS) OpenSSL generation
  const pwd = 'UnitSecret123!';
  const id = randomBytes(8).toString('hex');
  const tempKeyPath = path.join(tmpdir(), `atrium-synth-key-${id}.pem`);
  const tempCertPath = path.join(tmpdir(), `atrium-synth-cert-${id}.pem`);
  const tempPfxPath = path.join(tmpdir(), `atrium-unit-synthetic-${id}.pfx`);

  await runCommand('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', tempKeyPath, '-out', tempCertPath, '-days', '365', '-nodes', '-subj', '/CN=Atrium Teste Unitario:00011122233']);
  await runCommand('openssl', ['pkcs12', '-export', '-out', tempPfxPath, '-inkey', tempKeyPath, '-in', tempCertPath, '-passout', `pass:${pwd}`]);
  
  const fs = await import('node:fs/promises');
  const certRaw = await fs.readFile(tempCertPath, 'utf8');
  const x509 = new X509Certificate(certRaw);
  const thumbprintSha256 = x509.fingerprint256.replace(/:/g, '').toUpperCase();

  try { await unlink(tempKeyPath); } catch {}
  try { await unlink(tempCertPath); } catch {}

  return {
    filePath: tempPfxPath,
    passphrase: pwd,
    thumbprint: thumbprintSha256.slice(0, 40),
    thumbprintSha256
  };
}

console.log('--- SUITE: JUDICIAL INTEGRATION & SANDBOX ARCHITECTURE ---');

const tempDir = await mkdtemp(path.join(tmpdir(), 'atrium-judicial-test-'));
const security = new SecurityManager({
  dataDirectory: tempDir,
  sessionSecret: Buffer.alloc(32, 1).toString('base64'),
  encryptionKey: Buffer.alloc(32, 2).toString('base64')
});
await security.init();

try {
  // ==========================================
  // TEST 1: TOTP Sandbox & QR Migration
  // ==========================================
  console.log('\n[1/4] Testando TOTP Sandbox e Parsers RFC 6238...');

  // 1.1 Base32 e Teste de Segredo
  const sampleSecret = 'JBSWY3DPEHPK3PXP';
  const totpRes = runTotpSandbox({ secret: sampleSecret });
  assert.equal(totpRes.operational, true, 'TOTP Sandbox deve validar segredo Base32');
  assert.equal(totpRes.status, 'SEGUNDO FATOR OPERACIONAL');
  assert.equal(totpRes.summary.digits, 6);
  assert.equal(totpRes.steps.length, 4);
  assert.equal(totpRes.steps.every(s => s.status === 'OK'), true);

  // 1.2 Segredo Inválido
  const invalidTotp = runTotpSandbox({ secret: 'INVALID_SECRET_!@#' });
  assert.equal(invalidTotp.operational, false);
  assert.equal(invalidTotp.errorCode, TOTP_ERROR_CODES.INVALID_BASE32_SECRET);

  // 1.3 URI otpauth standard
  const otpUri = 'otpauth://totp/TRF4:advogado%40oab.org.br?secret=JBSWY3DPEHPK3PXP&issuer=TRF4';
  const parsedUri = parseTotpUri(otpUri);
  assert.equal(parsedUri.type, 'single');
  assert.equal(parsedUri.account.secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(parsedUri.account.issuer, 'TRF4');

  // 1.4 Google Authenticator Migration Protobuf
  const migrationUri = 'otpauth-migration://offline?data=CjcKEkpCU1dZM0RQRUhQSzNQWFASE2Fkdm9nYWRvQHRyZjQub3JnLmJyGgRUUkY0IAEoATACEAEYASAA';
  const parsedMig = parseTotpUri(migrationUri);
  assert.equal(parsedMig.type, 'migration');
  assert.ok(parsedMig.accounts.length >= 1);
  console.log('✓ TOTP Sandbox, RFC 6238, Clock check e Protobuf Migration 100% aprovados.');

  // ==========================================
  // TEST 2: Judicial Session Manager
  // ==========================================
  console.log('\n[2/4] Testando Judicial Session Manager & Isolated Profiles...');
  const sessionManager = new JudicialSessionManager({ dataDirectory: tempDir });
  await sessionManager.init();

  const userId = 'adv-ricardo';
  const portalId = 'eproc-trf4';

  const profileDir = sessionManager.getProfileDir(userId, portalId);
  assert.ok(profileDir.includes('adv-ricardo'), 'Caminho do perfil deve isolar por usuário');
  assert.ok(profileDir.includes('eproc-trf4'), 'Caminho do perfil deve isolar por portal');

  // Locks de Concorrência
  const release = await sessionManager.acquireLock(userId, portalId);
  assert.equal(sessionManager.isLocked(userId, portalId), true);
  await assert.rejects(
    async () => await sessionManager.acquireLock(userId, portalId),
    /já está em uso/,
    'Deve bloquear concorrência no mesmo profile'
  );
  release();
  assert.equal(sessionManager.isLocked(userId, portalId), false);

  // Lifecycle de Sessão
  await sessionManager.updateSessionStatus(userId, portalId, SESSION_STATUS.CONNECTED);
  let status = await sessionManager.getSessionStatus(userId, portalId);
  assert.equal(status.status, SESSION_STATUS.CONNECTED);
  assert.ok(status.lastConnectedAt);

  await sessionManager.clearSession(userId, portalId);
  status = await sessionManager.getSessionStatus(userId, portalId);
  assert.equal(status.status, SESSION_STATUS.NOT_CONFIGURED);
  console.log('✓ Judicial Session Manager, Isolation e Concurrency Locks 100% aprovados.');

  // ==========================================
  // TEST 3: Judicial Credential Manager (Zero Trust)
  // ==========================================
  console.log('\n[3/4] Testando Judicial Credential Manager e Visão Higienizada...');
  const credManager = new JudicialCredentialManager({ dataDirectory: tempDir, securityManager: security });
  await credManager.init();

  await credManager.savePortalTotp('eproc-trf4', { secret: 'JBSWY3DPEHPK3PXP', label: 'TRF4 eproc' });
  await credManager.savePortalCredentials('eproc-trf4', { username: '04276712050', password: 'SecretPassword123' });

  const publicView = await credManager.getPublicStatus();
  assert.equal(publicView.automatedTotpEnabled, true);
  assert.equal(publicView.totpCount, 1);
  assert.equal(publicView.credentialsCount, 1);
  assert.equal(publicView.password, undefined, 'Senhas nunca devem estar no publicView');
  assert.equal(publicView.secret, undefined, 'Segredos nunca devem estar no publicView');
  console.log('✓ Judicial Credential Manager e Zero Trust Sanitization 100% aprovados.');

  // ==========================================
  // TEST 4: A1 Certificate Sandbox (mTLS + Playwright + Nonce Signing)
  // ==========================================
  console.log('\n[4/4] Testando A1 Sandbox...');

  // 4.1 Teste cross-platform com arquivo inexistente
  const missingRes = await runA1Sandbox({ pfxPath: path.join(tempDir, 'non-existent.pfx'), passphrase: '123' });
  assert.equal(missingRes.operational, false);
  assert.equal(missingRes.errorCode, A1_ERROR_CODES.PFX_NOT_FOUND);

  if (process.platform !== 'win32') {
    console.log('ℹ️  SKIPPED — Windows verification runs in dedicated CI job (Judicial A1 Windows Verification)');
  } else {
    // 4.2 Gerar PFX sintético com par de chaves RSA
    let syntheticCert = null;
    try {
      syntheticCert = await generateSyntheticCertCrossPlatform();
      console.log('Certificado sintético gerado com SHA-256:', syntheticCert.thumbprintSha256);

      // 4.3 Teste com senha errada
      const wrongPwdRes = await runA1Sandbox({ pfxPath: syntheticCert.filePath, passphrase: 'WRONG_PASSWORD' });
      if (wrongPwdRes.operational !== false) {
        console.error('\n--- DIAGNÓSTICO: Senha errada retornou operacional: true inesperadamente ---');
        console.error('Status:', wrongPwdRes.status);
        console.error('ErrorCode:', wrongPwdRes.errorCode);
        console.error('ErrorMessage:', wrongPwdRes.errorMessage);
        console.error('Steps:', JSON.stringify(wrongPwdRes.steps, null, 2));
      }
      assert.equal(wrongPwdRes.operational, false, 'PFX com senha incorreta deve retornar operational: false');
      assert.equal(wrongPwdRes.errorCode, A1_ERROR_CODES.INVALID_PFX_PASSWORD);

      // 4.4 Teste Sandbox Completo (Assinatura + HTTPS Efêmero + Playwright mTLS + Fingerprint Match)
      const sandboxRes = await runA1Sandbox({ pfxPath: syntheticCert.filePath, passphrase: syntheticCert.passphrase });
      if (!sandboxRes.operational) {
        console.error('\n======================================================');
        console.error('  DIAGNÓSTICO DE FALHA NO A1 SANDBOX (WINDOWS RUNNER)');
        console.error('======================================================');
        console.error('Status:', sandboxRes.status);
        console.error('ErrorCode:', sandboxRes.errorCode);
        console.error('ErrorMessage:', sandboxRes.errorMessage);
        console.error('Steps executados:');
        for (const step of (sandboxRes.steps || [])) {
          console.error(`  [${step.status}] ${step.name} (${step.id}): ${step.detail || 'Sem detalhe'} ${step.errorCode ? `[${step.errorCode}]` : ''}`);
        }
        console.error('======================================================\n');
      }

      assert.equal(sandboxRes.operational, true, `Sandbox deve retornar operacional. Erro: ${sandboxRes.errorMessage || sandboxRes.errorCode}`);
      assert.equal(sandboxRes.status, 'A1 OPERATIONAL');
      assert.equal(sandboxRes.errorCode, null);
      assert.equal(sandboxRes.steps.length, 9);
      assert.equal(sandboxRes.steps.every(s => s.status === 'OK'), true);
      assert.ok(sandboxRes.summary.holder.includes('Atrium Teste Unitario'));
      assert.ok(sandboxRes.summary.documentMasked.includes('***'));

      console.log('✓ A1 Sandbox (mTLS + Playwright + Nonce Signature + Fingerprint Verification) 100% aprovado.');
    } finally {
      if (syntheticCert?.filePath) {
        try { await unlink(syntheticCert.filePath); } catch {}
      }
    }
  }

  console.log('\n======================================================');
  console.log('✓ TODAS AS VALIDAÇÕES DA INTEGRAÇÃO JUDICIAL PASSARAM COM SUCESSO!');
  console.log('======================================================\n');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
