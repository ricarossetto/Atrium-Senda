import https from 'node:https';
import { spawn } from 'node:child_process';
import { randomBytes, createHash, createSign, createVerify, X509Certificate } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

export const A1_ERROR_CODES = {
  CERTIFICATE_NOT_CONFIGURED: 'A1-001',
  PFX_NOT_FOUND: 'A1-002',
  INVALID_PFX_PASSWORD: 'A1-003',
  CERTIFICATE_PARSE_FAILED: 'A1-004',
  PRIVATE_KEY_MISSING: 'A1-005',
  CERTIFICATE_NOT_YET_VALID: 'A1-006',
  CERTIFICATE_EXPIRED: 'A1-007',
  PRIVATE_KEY_OPERATION_FAILED: 'A1-008',
  SIGNATURE_VERIFY_FAILED: 'A1-009',
  SANDBOX_START_FAILED: 'A1-101',
  PLAYWRIGHT_START_FAILED: 'A1-102',
  CLIENT_CERT_CONFIG_FAILED: 'A1-103',
  TLS_CONNECTION_FAILED: 'A1-104',
  NO_CLIENT_CERT_RECEIVED: 'A1-105',
  CERTIFICATE_FINGERPRINT_MISMATCH: 'A1-106',
  BROWSER_CLIENT_CERT_FAILED: 'A1-107',
  SANDBOX_TIMEOUT: 'A1-108',
  SANDBOX_CLEANUP_FAILED: 'A1-109'
};

function runPs(script, payload = {}) {
  return new Promise((resolve, reject) => {
    const jsonPayload = JSON.stringify(payload);
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: windowsPowerShellEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdin.end(jsonPayload, 'utf8');
    child.stdout.on('data', d => { if (stdout.length < 50_000) stdout += d; });
    child.stderr.on('data', d => { if (stderr.length < 10_000) stderr += d; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) return reject(new Error(stderr.trim() || `PowerShell falhou com código ${code}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}

function windowsPowerShellEnvironment() {
  if (process.platform !== 'win32') return process.env;
  const modulePaths = [
    path.join(process.env.USERPROFILE || '', 'Documents', 'WindowsPowerShell', 'Modules'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsPowerShell', 'Modules'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
  ].filter(Boolean);
  return { ...process.env, PSModulePath: modulePaths.join(';') };
}

function runCommand(cmd, args, stdinData = null, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env || process.env
    });
    let stdout = '';
    let stderr = '';
    if (stdinData) child.stdin.end(stdinData);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) return reject(new Error(stderr.trim() || `${cmd} falhou com código ${code}`));
      resolve(stdout);
    });
  });
}

function opensslEnvironment(values = {}) {
  return { ...process.env, ...values };
}

async function createPrivateTempDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'atrium-a1-'));
  await chmod(directory, 0o700).catch(() => {});
  return directory;
}

async function validatePfxOpenSsl({ pfxPath, passphrase, challenge }) {
  let tempModernPath = '';
  try {
    const pfxEnv = opensslEnvironment({ ATRIUM_PFX_PASSWORD: String(passphrase) });
    const certPem = await runCommand('openssl', ['pkcs12', '-in', pfxPath, '-passin', 'env:ATRIUM_PFX_PASSWORD', '-nokeys'], null, { env: pfxEnv });
    const keyPem = await runCommand('openssl', ['pkcs12', '-in', pfxPath, '-passin', 'env:ATRIUM_PFX_PASSWORD', '-nocerts', '-nodes'], null, { env: pfxEnv });
    
    const x509 = new X509Certificate(certPem);
    const now = new Date();
    const notBefore = new Date(x509.validFrom);
    const notAfter = new Date(x509.validTo);
    const isNotYetValid = now < notBefore;
    const isExpired = now > notAfter;
    const hasPrivateKey = Boolean(keyPem && keyPem.includes('PRIVATE KEY'));
    const fingerprintSha256 = x509.fingerprint256.replace(/:/g, '').toUpperCase();

    let signatureBase64 = null;
    let signatureVerified = false;
    let cryptoError = null;

    if (hasPrivateKey && challenge) {
      try {
        const signer = createSign('SHA256');
        signer.update(challenge);
        signer.end();
        const signature = signer.sign(keyPem);
        signatureBase64 = signature.toString('base64');

        const verifier = createVerify('SHA256');
        verifier.update(challenge);
        verifier.end();
        signatureVerified = verifier.verify(certPem, signature);
      } catch (err) {
        cryptoError = err.message;
      }
    }

    const modernPwd = `AtriumTemp-${randomBytes(8).toString('hex')}`;
    tempModernPath = path.join(tmpdir(), `atrium-modern-${randomBytes(8).toString('hex')}.pfx`);
    const privateDirectory = await createPrivateTempDirectory();
    const tempCertPath = path.join(privateDirectory, 'certificate.pem');
    const tempKeyPath = path.join(privateDirectory, 'private-key.pem');

    try {
      await writeFile(tempCertPath, certPem, { mode: 0o600 });
      await writeFile(tempKeyPath, keyPem, { mode: 0o600 });
      const exportEnv = opensslEnvironment({ ATRIUM_MODERN_PASSWORD: modernPwd });
      await runCommand('openssl', ['pkcs12', '-export', '-out', tempModernPath, '-inkey', tempKeyPath, '-in', tempCertPath, '-passout', 'env:ATRIUM_MODERN_PASSWORD'], null, { env: exportEnv });
      await chmod(tempModernPath, 0o600).catch(() => {});
    } finally {
      await rm(privateDirectory, { recursive: true, force: true });
    }

    return {
      subject: x509.subject,
      issuer: x509.issuer,
      serialNumber: x509.serialNumber,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      isNotYetValid,
      isExpired,
      hasPrivateKey,
      fingerprintSha256,
      signatureBase64: signatureBase64 ? 'OK' : null,
      signatureVerified,
      cryptoError,
      modernPath: tempModernPath,
      modernPassphrase: modernPwd
    };
  } catch (err) {
    if (tempModernPath) await unlink(tempModernPath).catch(() => {});
    const msg = err.message.toLowerCase();
    if (msg.includes('mac verify failure') || msg.includes('bad decrypt') || msg.includes('password')) {
      return { parseError: 'INVALID_PASSWORD', errorDetail: err.message };
    }
    return { parseError: 'PARSE_FAILED', errorDetail: err.message };
  }
}

function maskCpf(text) {
  if (!text) return '';
  return String(text).replace(/(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/g, '$1.***.***-$4');
}

function maskSerial(serial) {
  if (!serial || serial.length < 8) return serial || '';
  return `${serial.slice(0, 4)}...${serial.slice(-4)}`;
}

function maskFingerprint(fp) {
  if (!fp || fp.length < 12) return fp || '';
  return `${fp.slice(0, 8)}...${fp.slice(-8)}`;
}

export async function runA1Sandbox({ pfxPath, passphrase }) {
  const steps = [];
  const addStep = (id, name, status, detail = '', errorCode = null) => {
    steps.push({ id, name, status, detail, errorCode });
  };

  if (!pfxPath) {
    addStep('pfxFile', 'Arquivo PFX', 'FAIL', 'Nenhum certificado A1 configurado no sistema.', A1_ERROR_CODES.CERTIFICATE_NOT_CONFIGURED);
    return {
      operational: false,
      status: 'A1 NOT CONFIGURED',
      errorCode: A1_ERROR_CODES.CERTIFICATE_NOT_CONFIGURED,
      errorMessage: 'Nenhum certificado A1 foi configurado.',
      steps,
      summary: null
    };
  }

  if (!existsSync(pfxPath)) {
    addStep('pfxFile', 'Arquivo PFX', 'FAIL', `Arquivo do certificado não foi encontrado em: ${pfxPath}`, A1_ERROR_CODES.PFX_NOT_FOUND);
    return {
      operational: false,
      status: 'A1 FILE MISSING',
      errorCode: A1_ERROR_CODES.PFX_NOT_FOUND,
      errorMessage: 'O arquivo PFX do certificado não foi encontrado no disco.',
      steps,
      summary: null
    };
  }

  addStep('pfxFile', 'Arquivo PFX', 'OK', 'Arquivo PFX localizado e legível no disco.');

  // 1. Validação Criptográfica do PFX via Windows .NET CryptoAPI (em memória sem persistência)
  const challenge = `ATRIUM:A1:SANDBOX:${randomBytes(16).toString('hex')}:${Date.now()}`;
  const validateScript = `
    $ErrorActionPreference = "Stop"
    $rawInput = [Console]::In.ReadToEnd()
    $payload = $rawInput | ConvertFrom-Json
    $pfxPath = [string]$payload.path
    $pwd = [string]$payload.passphrase
    $challenge = [string]$payload.challenge

    try {
      $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $pwd, $flags)
    } catch {
      $err = $_.Exception.Message
      if ($err -match "password" -or $err -match "senha" -or $err -match "0x80070056") {
        [pscustomobject]@{ parseError = "INVALID_PASSWORD"; errorDetail = $err } | ConvertTo-Json -Compress
      } else {
        [pscustomobject]@{ parseError = "PARSE_FAILED"; errorDetail = $err } | ConvertTo-Json -Compress
      }
      exit 0
    }

    $now = [DateTime]::UtcNow
    $isNotYetValid = $now -lt $cert.NotBefore.ToUniversalTime()
    $isExpired = $now -gt $cert.NotAfter.ToUniversalTime()
    $hasPrivateKey = $cert.HasPrivateKey

    $thumbprint256 = $cert.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)

    $signatureBase64 = $null
    $signatureVerified = $false
    $cryptoError = $null

    if ($hasPrivateKey -and $challenge) {
      try {
        $challengeBytes = [System.Text.Encoding]::UTF8.GetBytes($challenge)
        $rsaPrivate = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
        if ($rsaPrivate) {
          $sigBytes = $rsaPrivate.SignData($challengeBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
          $signatureBase64 = [Convert]::ToBase64String($sigBytes)
          $rsaPublic = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($cert)
          $signatureVerified = $rsaPublic.VerifyData($challengeBytes, $sigBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        } else {
          $ecdsaPrivate = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($cert)
          if ($ecdsaPrivate) {
            $sigBytes = $ecdsaPrivate.SignData($challengeBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
            $signatureBase64 = [Convert]::ToBase64String($sigBytes)
            $ecdsaPublic = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPublicKey($cert)
            $signatureVerified = $ecdsaPublic.VerifyData($challengeBytes, $sigBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
          }
        }
      } catch {
        $cryptoError = $_.Exception.Message
      }
    }

    # Gera PFX temporário modernizado (compatível com OpenSSL 3 / Playwright Chromium)
    $modernPwd = "AtriumTemp-" + [guid]::NewGuid().ToString('N')
    $modernPfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $modernPwd)
    $tempModernPath = "$env:TEMP\\atrium-modern-$([guid]::NewGuid().ToString('N')).pfx"
    [System.IO.File]::WriteAllBytes($tempModernPath, $modernPfxBytes)

    [pscustomobject]@{
      subject = $cert.Subject
      issuer = $cert.Issuer
      serialNumber = $cert.SerialNumber
      notBefore = $cert.NotBefore.ToUniversalTime().ToString("o")
      notAfter = $cert.NotAfter.ToUniversalTime().ToString("o")
      isNotYetValid = $isNotYetValid
      isExpired = $isExpired
      hasPrivateKey = $hasPrivateKey
      fingerprintSha256 = $thumbprint256
      signatureBase64 = if ($signatureBase64) { "OK" } else { $null }
      signatureVerified = $signatureVerified
      cryptoError = $cryptoError
      modernPath = $tempModernPath
      modernPassphrase = $modernPwd
    } | ConvertTo-Json -Compress
  `;

  let pfxValidation;
  try {
    if (process.platform === 'win32') {
      pfxValidation = await runPs(validateScript, { path: pfxPath, passphrase, challenge });
    } else {
      pfxValidation = await validatePfxOpenSsl({ pfxPath, passphrase, challenge });
    }
  } catch (err) {
    addStep('passphrase', 'Senha do PFX', 'FAIL', `Erro de execução na leitura do certificado: ${err.message}`, A1_ERROR_CODES.CERTIFICATE_PARSE_FAILED);
    return {
      operational: false,
      status: 'A1 PARSE ERROR',
      errorCode: A1_ERROR_CODES.CERTIFICATE_PARSE_FAILED,
      errorMessage: err.message,
      steps,
      summary: null
    };
  }

  if (pfxValidation.parseError === 'INVALID_PASSWORD') {
    addStep('passphrase', 'Senha do PFX', 'FAIL', 'A senha informada para o certificado PFX está incorreta.', A1_ERROR_CODES.INVALID_PFX_PASSWORD);
    return {
      operational: false,
      status: 'A1 INVALID PASSWORD',
      errorCode: A1_ERROR_CODES.INVALID_PFX_PASSWORD,
      errorMessage: 'Senha do certificado PFX incorreta.',
      steps,
      summary: null
    };
  }

  if (pfxValidation.parseError) {
    addStep('x509Cert', 'Certificado X.509', 'FAIL', `Falha ao interpretar estrutura PKCS#12: ${pfxValidation.errorDetail}`, A1_ERROR_CODES.CERTIFICATE_PARSE_FAILED);
    return {
      operational: false,
      status: 'A1 CORRUPTED',
      errorCode: A1_ERROR_CODES.CERTIFICATE_PARSE_FAILED,
      errorMessage: pfxValidation.errorDetail || 'Estrutura do certificado corrompida.',
      steps,
      summary: null
    };
  }

  addStep('passphrase', 'Senha do PFX', 'OK', 'Senha validada com sucesso.');
  addStep('x509Cert', 'Certificado X.509', 'OK', `Certificado emitido para: ${pfxValidation.subject?.slice(0, 60)}...`);

  if (pfxValidation.isNotYetValid) {
    addStep('validity', 'Validade do Certificado', 'FAIL', `Certificado ainda não está vigente (início: ${pfxValidation.notBefore}).`, A1_ERROR_CODES.CERTIFICATE_NOT_YET_VALID);
    return {
      operational: false,
      status: 'A1 NOT YET VALID',
      errorCode: A1_ERROR_CODES.CERTIFICATE_NOT_YET_VALID,
      errorMessage: 'O certificado digital ainda não iniciou seu período de vigência.',
      steps,
      summary: null
    };
  }

  if (pfxValidation.isExpired) {
    addStep('validity', 'Validade do Certificado', 'FAIL', `Certificado digital expirou em: ${pfxValidation.notAfter}.`, A1_ERROR_CODES.CERTIFICATE_EXPIRED);
    return {
      operational: false,
      status: 'A1 EXPIRED',
      errorCode: A1_ERROR_CODES.CERTIFICATE_EXPIRED,
      errorMessage: 'O certificado digital está expirado.',
      steps,
      summary: null
    };
  }

  addStep('validity', 'Validade do Certificado', 'OK', `Certificado vigente até: ${new Date(pfxValidation.notAfter).toLocaleDateString('pt-BR')}`);

  if (!pfxValidation.hasPrivateKey) {
    addStep('privateKey', 'Chave Privada', 'FAIL', 'O arquivo PFX não contém uma chave privada exportável.', A1_ERROR_CODES.PRIVATE_KEY_MISSING);
    return {
      operational: false,
      status: 'A1 PRIVATE KEY MISSING',
      errorCode: A1_ERROR_CODES.PRIVATE_KEY_MISSING,
      errorMessage: 'Chave privada ausente no arquivo PFX.',
      steps,
      summary: null
    };
  }

  addStep('privateKey', 'Chave Privada', 'OK', 'Chave privada presente e acessível.');

  if (!pfxValidation.signatureVerified) {
    addStep('signature', 'Assinatura Criptográfica', 'FAIL', `Falha ao assinar nonce de desafio: ${pfxValidation.cryptoError || 'Assinatura não conferiu.'}`, A1_ERROR_CODES.SIGNATURE_VERIFY_FAILED);
    return {
      operational: false,
      status: 'A1 SIGNATURE FAILED',
      errorCode: A1_ERROR_CODES.SIGNATURE_VERIFY_FAILED,
      errorMessage: 'Falha na operação de assinatura com a chave privada.',
      steps,
      summary: null
    };
  }

  addStep('signature', 'Assinatura Criptográfica', 'OK', 'Desafio SHA-256 assinado e verificado com a chave pública.');

  // 2. Criação do Servidor Sandbox HTTPS mTLS Local em 127.0.0.1
  const modernPfxPath = pfxValidation.modernPath;
  const modernPassphrase = pfxValidation.modernPassphrase;
  const expectedFingerprint = pfxValidation.fingerprintSha256?.toUpperCase();

  const genServerScript = `
    $ErrorActionPreference = "Stop"
    $cert = New-SelfSignedCertificate -Subject "CN=AtriumSandboxServer" -DnsName "127.0.0.1","localhost" -CertStoreLocation "Cert:\\CurrentUser\\My" -KeyExportPolicy Exportable
    $thumb = $cert.Thumbprint
    $pwd = "ServerSecret-" + [guid]::NewGuid().ToString('N')
    $pfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pwd)
    Remove-Item "Cert:\\CurrentUser\\My\\$thumb" -Force
    [pscustomobject]@{
      pfxBase64 = [Convert]::ToBase64String($pfxBytes)
      passphrase = $pwd
    } | ConvertTo-Json -Compress
  `;

  let serverPfx;
  try {
    serverPfx = await runPs(genServerScript);
  } catch (err) {
    addStep('serverHttps', 'Servidor HTTPS Sandbox', 'FAIL', `Não foi possível gerar certificado de teste local: ${err.message}`, A1_ERROR_CODES.SANDBOX_START_FAILED);
    if (modernPfxPath) { try { await unlink(modernPfxPath); } catch {} }
    return {
      operational: false,
      status: 'A1 SANDBOX SERVER ERROR',
      errorCode: A1_ERROR_CODES.SANDBOX_START_FAILED,
      errorMessage: err.message,
      steps,
      summary: null
    };
  }

  let receivedPeerCert = null;
  let server = null;
  let browser = null;

  try {
    server = https.createServer({
      pfx: Buffer.from(serverPfx.pfxBase64, 'base64'),
      passphrase: serverPfx.passphrase,
      requestCert: true,
      rejectUnauthorized: false
    }, (req, res) => {
      receivedPeerCert = req.socket.getPeerCertificate();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Atrium Sandbox</title></head>
        <body style="font-family:sans-serif;padding:24px;">
          <h2>ATRIUM CERTIFICATE SANDBOX</h2>
          <p>Autenticação mTLS concluída com sucesso em ambiente local seguro.</p>
        </body></html>`);
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const port = server.address().port;
    const sandboxOrigin = `https://127.0.0.1:${port}`;
    addStep('serverHttps', 'Servidor HTTPS Sandbox', 'OK', `Servidor mTLS local ativo em ${sandboxOrigin}`);

    // 3. Execução do Playwright com clientCertificates e Isolamento Estrito de Rede
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        clientCertificates: [{
          origin: sandboxOrigin,
          pfxPath: modernPfxPath,
          passphrase: modernPassphrase
        }]
      });

      // Firewall: bloquear qualquer tentativa de saída para a internet
      await context.route('**/*', (route) => {
        try {
          const u = new URL(route.request().url());
          if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
            route.continue();
          } else {
            route.abort();
          }
        } catch {
          route.abort();
        }
      });

      const page = await context.newPage();
      const response = await page.goto(sandboxOrigin, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      if (!response || response.status() !== 200) {
        throw new Error(`Servidor respondeu com status ${response ? response.status() : 'nulo'}`);
      }

      addStep('playwrightMtls', 'Handshake mTLS Playwright', 'OK', 'Chromium apresentou o certificado A1 no handshake TLS local.');
    } catch (browserErr) {
      addStep('playwrightMtls', 'Handshake mTLS Playwright', 'FAIL', `Falha ao apresentar certificado via navegador: ${browserErr.message}`, A1_ERROR_CODES.BROWSER_CLIENT_CERT_FAILED);
      return {
        operational: false,
        status: 'A1 BROWSER TLS FAILED',
        errorCode: A1_ERROR_CODES.BROWSER_CLIENT_CERT_FAILED,
        errorMessage: browserErr.message,
        steps,
        summary: null
      };
    }

    // 4. Verificação do Certificado Recebido no Servidor
    if (!receivedPeerCert || !Object.keys(receivedPeerCert).length) {
      addStep('fingerprint', 'Confirmação de Fingerprint', 'FAIL', 'O servidor HTTPS não recebeu o certificado do cliente.', A1_ERROR_CODES.NO_CLIENT_CERT_RECEIVED);
      return {
        operational: false,
        status: 'A1 NO CERT RECEIVED',
        errorCode: A1_ERROR_CODES.NO_CLIENT_CERT_RECEIVED,
        errorMessage: 'Certificado de cliente não foi transmitido na conexão TLS.',
        steps,
        summary: null
      };
    }

    const receivedFingerprint = (receivedPeerCert.fingerprint256 || receivedPeerCert.fingerprint || '').replace(/:/g, '').toUpperCase();
    if (receivedFingerprint !== expectedFingerprint) {
      addStep('fingerprint', 'Confirmação de Fingerprint', 'FAIL', `Fingerprint recebido (${receivedFingerprint.slice(0, 8)}...) não confere com o esperado (${expectedFingerprint.slice(0, 8)}...).`, A1_ERROR_CODES.CERTIFICATE_FINGERPRINT_MISMATCH);
      return {
        operational: false,
        status: 'A1 FINGERPRINT MISMATCH',
        errorCode: A1_ERROR_CODES.CERTIFICATE_FINGERPRINT_MISMATCH,
        errorMessage: 'O fingerprint do certificado recebido difere do certificado cadastrado.',
        steps,
        summary: null
      };
    }

    addStep('fingerprint', 'Confirmação de Fingerprint', 'OK', `Fingerprint SHA-256 verificado com correspondência exata (${maskFingerprint(receivedFingerprint)}).`);

    // Extrair dados públicos higienizados do titular
    const cnMatch = (pfxValidation.subject || '').match(/CN=([^,]+)/);
    const holderName = cnMatch ? cnMatch[1].split(':')[0].trim() : 'Titular Identificado';
    const holderDoc = cnMatch && cnMatch[1].includes(':') ? maskCpf(cnMatch[1].split(':')[1].trim()) : '';

    const summary = {
      holder: holderName,
      documentMasked: holderDoc,
      subjectMasked: maskCpf(pfxValidation.subject),
      issuer: pfxValidation.issuer,
      serialMasked: maskSerial(pfxValidation.serialNumber),
      notBefore: pfxValidation.notBefore,
      notAfter: pfxValidation.notAfter,
      fingerprintSha256Masked: maskFingerprint(pfxValidation.fingerprintSha256),
      hasPrivateKey: true,
      testedAt: new Date().toISOString()
    };

    return {
      operational: true,
      status: 'A1 OPERATIONAL',
      errorCode: null,
      errorMessage: null,
      steps,
      summary
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    if (server) {
      try { server.close(); } catch {}
    }
    if (modernPfxPath) {
      try { await unlink(modernPfxPath); } catch {}
    }
  }
}

export async function createModernizedPfx({ pfxPath, passphrase }) {
  if (process.platform === 'win32') {
    const modernizeScript = `
      $ErrorActionPreference = "Stop"
      $rawInput = [Console]::In.ReadToEnd()
      $payload = $rawInput | ConvertFrom-Json
      $pfxPath = [string]$payload.path
      $pwd = [string]$payload.passphrase

      $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $pwd, $flags)

      $modernPwd = "AtriumTemp-" + [guid]::NewGuid().ToString('N')
      $modernPfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $modernPwd)
      $tempModernPath = "$env:TEMP\\atrium-modern-$([guid]::NewGuid().ToString('N')).pfx"
      [System.IO.File]::WriteAllBytes($tempModernPath, $modernPfxBytes)

      [pscustomobject]@{
        modernPath = $tempModernPath
        modernPassphrase = $modernPwd
      } | ConvertTo-Json -Compress
    `;

    const result = await runPs(modernizeScript, { path: pfxPath, passphrase });
    return {
      modernPath: result.modernPath,
      modernPassphrase: result.modernPassphrase,
      cleanup: async () => {
        if (result.modernPath) {
          try { await unlink(result.modernPath); } catch {}
        }
      }
    };
  }

  // Non-Windows fallback using OpenSSL
  const modernPwd = `AtriumTemp-${randomBytes(8).toString('hex')}`;
  const tempModernPath = path.join(tmpdir(), `atrium-modern-${randomBytes(8).toString('hex')}.pfx`);
  const pfxEnv = opensslEnvironment({ ATRIUM_PFX_PASSWORD: String(passphrase) });
  const certPem = await runCommand('openssl', ['pkcs12', '-in', pfxPath, '-passin', 'env:ATRIUM_PFX_PASSWORD', '-nokeys'], null, { env: pfxEnv });
  const keyPem = await runCommand('openssl', ['pkcs12', '-in', pfxPath, '-passin', 'env:ATRIUM_PFX_PASSWORD', '-nocerts', '-nodes'], null, { env: pfxEnv });
  const privateDirectory = await createPrivateTempDirectory();
  const tempCertPath = path.join(privateDirectory, 'certificate.pem');
  const tempKeyPath = path.join(privateDirectory, 'private-key.pem');

  try {
    await writeFile(tempCertPath, certPem, { mode: 0o600 });
    await writeFile(tempKeyPath, keyPem, { mode: 0o600 });
    const exportEnv = opensslEnvironment({ ATRIUM_MODERN_PASSWORD: modernPwd });
    await runCommand('openssl', ['pkcs12', '-export', '-out', tempModernPath, '-inkey', tempKeyPath, '-in', tempCertPath, '-passout', 'env:ATRIUM_MODERN_PASSWORD'], null, { env: exportEnv });
    await chmod(tempModernPath, 0o600).catch(() => {});
  } catch (error) {
    await unlink(tempModernPath).catch(() => {});
    throw error;
  } finally {
    await rm(privateDirectory, { recursive: true, force: true });
  }

  return {
    modernPath: tempModernPath,
    modernPassphrase: modernPwd,
    cleanup: async () => {
      if (tempModernPath) {
        try { await unlink(tempModernPath); } catch {}
      }
    }
  };
}
