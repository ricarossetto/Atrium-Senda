import http from 'node:http';
import { appendFile, readFile, writeFile, mkdir, stat, unlink, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager, verifyTotp } from './lib/security.mjs';
import { collectDjen } from './collector/adapters/djen.mjs';
import ExcelJS from 'exceljs';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(ROOT, '.env');
const COLLECTOR_ENV_FILE = path.join(ROOT, '.env.collector');
await loadEnv(ENV_FILE);
await ensureLocalSecrets(ENV_FILE);
if (String(process.env.KELLER_SKIP_COLLECTOR_ENV).toLowerCase() !== 'true') await loadEnv(COLLECTOR_ENV_FILE);

const DATA_DIR = path.resolve(process.env.JURISFLOW_DATA_DIR || process.env.KELLER_DATA_DIR || path.join(ROOT, 'data'));
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'judicial-integrations.json');
const DEFAULT_PORTALS_FILE = existsSync(path.join(ROOT, 'collector', 'portals.json')) ? path.join(ROOT, 'collector', 'portals.json') : path.join(ROOT, 'collector', 'portals.example.json');
const PORTALS_FILE = path.resolve(process.env.JURISFLOW_PORTALS_FILE || process.env.KELLER_PORTALS_FILE || DEFAULT_PORTALS_FILE);
const COLLECTOR_AGENT_FILE = path.join(ROOT, 'collector', 'agent.mjs');
const CLOUD_MODE = String(process.env.JURISFLOW_CLOUD_MODE || process.env.KELLER_CLOUD_MODE || '').toLowerCase();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const PROCESS_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
const security = new SecurityManager({
  dataDirectory: DATA_DIR,
  sessionSecret: process.env.AUTH_SESSION_SECRET,
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
  secureCookies: String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
});
await security.init();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.ttf': 'font/ttf'
};
const publicFiles = new Set(['index.html', 'css/portal.css', 'js/jsqr.js', 'js/auth.js', 'js/portal.js', 'js/prompts-data.js', 'js/office-data.js']);
const publicDirectories = ['assets/images/', 'assets/fonts/', 'assets/team/', 'assets/icons/'];
const emptyRuntime = () => ({ events: [], tasks: [], intimations: [], processes: [], sources: [], updatedAt: null });
let interactiveCollector = null;

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  for (const [key, value] of Object.entries(parsed)) if (!(key in process.env)) process.env[key] = value;
}

async function ensureLocalSecrets(file) {
  const generated = [];
  const specs = [
    ['AUTH_SESSION_SECRET', () => randomBytes(48).toString('base64url')],
    ['AUTH_ENCRYPTION_KEY', () => randomBytes(32).toString('base64')],
    ['COLLECTOR_INGEST_TOKEN', () => randomBytes(32).toString('base64url')]
  ];
  for (const [key, create] of specs) {
    const current = process.env[key];
    if (!current || /troque|gerad|exemplo/i.test(current)) {
      const value = create(); process.env[key] = value; generated.push(`${key}=${value}`);
    }
  }
  if (!generated.length) return;
  const preamble = existsSync(file) ? '\n' : '# Segredos locais gerados automaticamente. Nunca envie este arquivo ao GitHub.\n';
  await appendFile(file, `${preamble}${generated.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function readRuntime() {
  try {
    const stored = JSON.parse(await readFile(RUNTIME_FILE, 'utf8'));
    if (stored?.encrypted) return { ...emptyRuntime(), ...JSON.parse(security.decrypt(stored.encrypted)) };
    const legacy = { ...emptyRuntime(), ...stored };
    await saveRuntime(legacy);
    return legacy;
  } catch { return emptyRuntime(); }
}
async function saveRuntime(payload) {
  await mkdir(DATA_DIR, { recursive: true });
  const envelope = {
    version: 1,
    algorithm: 'aes-256-gcm',
    updatedAt: payload?.updatedAt || new Date().toISOString(),
    encrypted: security.encrypt(JSON.stringify({ ...emptyRuntime(), ...payload }))
  };
  await writeFile(RUNTIME_FILE, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
}
async function readAppStateEnvelope() {
  try {
    const envelope = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
    return { state: JSON.parse(security.decrypt(envelope.encrypted)), revision: envelope.revision || envelope.updatedAt || null };
  } catch (error) {
    if (existsSync(APP_STATE_FILE)) throw new Error('O estado criptografado não pôde ser aberto.', { cause: error });
    return { state: null, revision: null };
  }
}
async function readAppState() { return (await readAppStateEnvelope()).state; }
async function saveAppState(value, expectedRevision = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Estado da aplicação inválido.'), { statusCode: 400 });
  if (value.contacts === undefined) value.contacts = [];
  if (value.customPrompts === undefined) value.customPrompts = [];
  if (value.customLinks === undefined) value.customLinks = [];
  for (const key of ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts', 'customPrompts', 'customLinks']) {
    if (!Array.isArray(value[key])) value[key] = [];
    if (value[key].length > 10_000) throw Object.assign(new Error(`Coleção inválida: ${key}.`), { statusCode: 400 });
  }
  const current = await readAppStateEnvelope();
  if (current.revision && expectedRevision !== current.revision) {
    throw Object.assign(new Error('Os dados foram atualizados em outra aba ou pelo importador. Recarregue a Central antes de salvar.'), { statusCode: 409 });
  }
  await mkdir(DATA_DIR, { recursive: true });
  const envelope = { version: 1, algorithm: 'aes-256-gcm', revision: randomBytes(18).toString('base64url'), encrypted: security.encrypt(JSON.stringify(value)), updatedAt: new Date().toISOString() };
  await writeFile(APP_STATE_FILE, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
  return { updatedAt: envelope.updatedAt, revision: envelope.revision };
}

async function readJudicialSecrets() {
  try {
    const envelope = JSON.parse(await readFile(INTEGRATIONS_FILE, 'utf8'));
    return JSON.parse(security.decrypt(envelope.encrypted));
  } catch (error) {
    if (existsSync(INTEGRATIONS_FILE)) throw new Error('A configuração judicial criptografada não pôde ser aberta.', { cause: error });
    return {
      certificate: process.env.A1_PFX_PATH && process.env.A1_PFX_PASSPHRASE ? {
        path: process.env.A1_PFX_PATH,
        passphrase: process.env.A1_PFX_PASSPHRASE,
        fileName: path.basename(process.env.A1_PFX_PATH),
        source: 'collector-env'
      } : null,
      totpSecrets: {},
      allowAutomatedTotp: false
    };
  }
}

async function saveJudicialSecrets(value) {
  await mkdir(DATA_DIR, { recursive: true });
  const envelope = {
    version: 1,
    algorithm: 'aes-256-gcm',
    encrypted: security.encrypt(JSON.stringify(value)),
    updatedAt: new Date().toISOString()
  };
  await writeFile(INTEGRATIONS_FILE, JSON.stringify(envelope, null, 2), { encoding: 'utf8', mode: 0o600 });
}

async function readPortalConfiguration() {
  const config = JSON.parse(await readFile(PORTALS_FILE, 'utf8'));
  if (!Array.isArray(config.portals)) throw new Error('A lista local de portais é inválida.');
  return config;
}

function publicCertificatePortals(config, secrets) {
  return config.portals.filter(portal => portal.usesCertificate).map(portal => ({
    id: portal.id,
    name: portal.name,
    short: portal.short || portal.name.slice(0, 3).toUpperCase(),
    enabled: Boolean(portal.enabled),
    certificateMode: portal.certificateMode || 'windows-store',
    group: portal.group || 'Outros tribunais',
    system: portal.system || portal.strategy || 'Portal judicial',
    automationLevel: portal.automationLevel || 'supported',
    manualFirstLogin: Boolean(portal.manualFirstLogin),
    notice: portal.notice || '',
    supportsTotp: Boolean(portal.supportsTotp !== false),
    totpConfigured: Boolean(secrets.totpSecrets?.[portal.id]?.secret),
    firstLoginRequired: portal.strategy === 'pje' && !portal.enabled
  }));
}

async function judicialIntegrationStatus() {
  const [secrets, config] = await Promise.all([readJudicialSecrets(), readPortalConfiguration()]);
  const certificatePath = secrets.certificate?.path;
  let certificate = {
    configured: Boolean(certificatePath),
    fileName: certificatePath ? path.basename(secrets.certificate.fileName || certificatePath) : '',
    accessible: Boolean(certificatePath && existsSync(certificatePath)),
    valid: false,
    expiresAt: null,
    source: secrets.certificate?.source || ''
  };
  if (certificate.accessible && secrets.certificate?.passphrase) {
    try { certificate = { ...certificate, ...(await validatePfxWithWindows(certificatePath, secrets.certificate.passphrase)) }; }
    catch { certificate.valid = false; }
  }
  return {
    certificate,
    pjeOffice: await pjeOfficeStatus(),
    automatedTotpEnabled: Boolean(secrets.allowAutomatedTotp),
    portals: publicCertificatePortals(config, secrets),
    interactiveCollectorRunning: Boolean(interactiveCollector && interactiveCollector.exitCode === null)
  };
}

function validatePfxWithWindows(file, passphrase) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json',
    '$secure = ConvertTo-SecureString ([string]$payload.passphrase) -AsPlainText -Force',
    '$bundle = Get-PfxData -FilePath ([string]$payload.path) -Password $secure',
    '$cert = @($bundle.EndEntityCertificates)[0]',
    '[pscustomobject]@{ valid = $true; certificateCount = @($bundle.EndEntityCertificates).Count; expiresAt = if ($cert) { $cert.NotAfter.ToUniversalTime().ToString("o") } else { $null } } | ConvertTo-Json -Compress'
  ].join('; ');
  return new Promise((resolve, reject) => {
    const windowsPowerShellModules = [
      path.join(process.env.USERPROFILE || '', 'Documents', 'WindowsPowerShell', 'Modules'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsPowerShell', 'Modules'),
      path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
    ].join(';');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: { ...process.env, PSModulePath: windowsPowerShellModules },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = ''; let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('A validação do certificado excedeu o tempo limite.')); }, 15_000);
    child.stdout.on('data', chunk => { if (stdout.length < 20_000) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < 2_000) stderr += chunk; });
    child.on('error', error => finish(error));
    child.on('exit', code => {
      if (code !== 0) return finish(new Error('O Windows recusou o certificado ou a senha informada.'));
      try { finish(null, JSON.parse(stdout.trim())); }
      catch { finish(new Error('O Windows não retornou uma validação reconhecível.')); }
    });
    child.stdin.end(JSON.stringify({ path: file, passphrase }));
  });
}

async function pjeOfficeStatus() {
  try {
    const response = await fetch('http://127.0.0.1:8800/pjeOffice/', { signal: AbortSignal.timeout(2_500) });
    return { available: response.ok, detail: response.ok ? 'PJeOffice Pro disponível neste computador' : `PJeOffice respondeu HTTP ${response.status}` };
  } catch { return { available: false, detail: 'PJeOffice Pro não está respondendo' }; }
}

function decodeProtobufVarint(buffer, offset) {
  let res = 0;
  let shift = 0;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    res |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: res, offset };
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function parseGoogleAuthMigration(dataBase64) {
  const cleanBase64 = decodeURIComponent(dataBase64).replace(/^otpauth-migration:\/\/offline\?data=/i, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  let offset = 0;
  const accounts = [];

  while (offset < buffer.length) {
    const key = decodeProtobufVarint(buffer, offset);
    offset = key.offset;
    const fieldNumber = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType === 2) {
      const len = decodeProtobufVarint(buffer, offset);
      offset = len.offset;
      const end = offset + len.value;
      const subBuffer = buffer.subarray(offset, end);
      offset = end;

      if (fieldNumber === 1) {
        let subOffset = 0;
        let secret = '';
        let name = '';
        let issuer = '';
        while (subOffset < subBuffer.length) {
          const subKey = decodeProtobufVarint(subBuffer, subOffset);
          subOffset = subKey.offset;
          const subField = subKey.value >> 3;
          const subWire = subKey.value & 0x07;

          if (subWire === 2) {
            const subLen = decodeProtobufVarint(subBuffer, subOffset);
            subOffset = subLen.offset;
            const subData = subBuffer.subarray(subOffset, subOffset + subLen.value);
            subOffset += subLen.value;
            if (subField === 1) secret = base32Encode(subData);
            else if (subField === 2) name = subData.toString('utf8');
            else if (subField === 3) issuer = subData.toString('utf8');
          } else if (subWire === 0) {
            const val = decodeProtobufVarint(subBuffer, subOffset);
            subOffset = val.offset;
          }
        }
        if (secret) accounts.push({ secret, name, issuer });
      }
    } else if (wireType === 0) {
      const val = decodeProtobufVarint(buffer, offset);
      offset = val.offset;
    }
  }
  return accounts;
}

function extractTotpSecret(value) {
  const raw = String(value || '').trim();
  if (/^otpauth-migration:/i.test(raw)) {
    const accounts = parseGoogleAuthMigration(raw);
    if (!accounts.length || !accounts[0].secret) throw Object.assign(new Error('Não foi possível extrair a chave TOTP do QR do Authenticator.'), { statusCode: 400 });
    return accounts[0].secret.toUpperCase().replace(/[\s=-]/g, '');
  }
  let secret = raw;
  if (/^otpauth:/i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { throw Object.assign(new Error('O QR de 2FA não contém um endereço TOTP válido.'), { statusCode: 400 }); }
    if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') throw Object.assign(new Error('Somente QR Codes TOTP de ativação são aceitos.'), { statusCode: 400 });
    secret = url.searchParams.get('secret') || '';
  }
  secret = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) throw Object.assign(new Error('O segredo TOTP não é válido. Gere um QR novo no portal ou informe a chave manual em base32.'), { statusCode: 400 });
  return secret;
}

async function saveUploadedCertificate(body) {
  if (CLOUD_MODE) throw Object.assign(new Error('O certificado A1 só pode ser configurado no agente local protegido.'), { statusCode: 503 });
  const fileName = path.basename(String(body.fileName || 'certificado.pfx'));
  if (!/\.(pfx|p12)$/i.test(fileName)) throw Object.assign(new Error('Selecione um certificado .pfx ou .p12.'), { statusCode: 400 });
  const encoded = String(body.pfxBase64 || '').replace(/^data:[^,]+,/, '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) throw Object.assign(new Error('O conteúdo do certificado é inválido.'), { statusCode: 400 });
  const binary = Buffer.from(encoded, 'base64');
  if (binary.length < 100 || binary.length > 5_000_000) throw Object.assign(new Error('O certificado deve ter entre 100 bytes e 5 MB.'), { statusCode: 400 });
  const passphrase = String(body.passphrase || '');
  if (!passphrase || passphrase.length > 256) throw Object.assign(new Error('Informe a senha atual do certificado.'), { statusCode: 400 });
  const secretDirectory = path.join(DATA_DIR, 'secrets');
  await mkdir(secretDirectory, { recursive: true });
  const destination = path.join(secretDirectory, `a1-${Date.now()}-${randomBytes(6).toString('hex')}.pfx`);
  await writeFile(destination, binary, { mode: 0o600 });
  let validation;
  try { validation = await validatePfxWithWindows(destination, passphrase); }
  catch (error) { await unlink(destination).catch(() => {}); throw Object.assign(error, { statusCode: 400 }); }
  const secrets = await readJudicialSecrets();
  secrets.certificate = { path: destination, passphrase, fileName, source: 'encrypted-store', configuredAt: new Date().toISOString() };
  await saveJudicialSecrets(secrets);
  return { ...validation, fileName };
}

async function updatePortalCoverage(enabledIds) {
  const enabled = new Set(Array.isArray(enabledIds) ? enabledIds.map(String) : []);
  const config = await readPortalConfiguration();
  const certificateIds = new Set(config.portals.filter(portal => portal.usesCertificate).map(portal => portal.id));
  for (const portal of config.portals) if (certificateIds.has(portal.id)) portal.enabled = enabled.has(portal.id);
  const temporary = `${PORTALS_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, PORTALS_FILE);
  return { enabled: [...enabled].filter(id => certificateIds.has(id)) };
}

async function resetJudicialConnections() {
  if (CLOUD_MODE) throw Object.assign(new Error('As sessões judiciais só podem ser zeradas no agente local protegido.'), { statusCode: 503 });
  if (interactiveCollector && interactiveCollector.exitCode === null) {
    throw Object.assign(new Error('Encerre a primeira conexão em andamento antes de zerar os acessos.'), { statusCode: 409 });
  }
  const secrets = await readJudicialSecrets();
  const certificatePreserved = Boolean(secrets.certificate?.path && secrets.certificate?.passphrase);
  secrets.totpSecrets = {};
  secrets.allowAutomatedTotp = false;
  secrets.connectionsResetAt = new Date().toISOString();
  await saveJudicialSecrets(secrets);
  await updatePortalCoverage([]);

  process.env.ALLOW_AUTOMATED_PORTAL_TOTP = 'false';
  delete process.env.PJE_TOTP_SECRET;
  if (existsSync(COLLECTOR_ENV_FILE)) {
    const source = await readFile(COLLECTOR_ENV_FILE, 'utf8');
    const sanitized = source.split(/\r?\n/)
      .filter(line => !/^(?:PJE_TOTP_SECRET|ALLOW_AUTOMATED_PORTAL_TOTP)=/.test(line))
      .filter((line, index, values) => line || index < values.length - 1);
    sanitized.push('ALLOW_AUTOMATED_PORTAL_TOTP=false');
    await writeFile(COLLECTOR_ENV_FILE, `${sanitized.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  const collectorDirectory = path.resolve(ROOT, 'collector');
  const profileDirectory = path.resolve(collectorDirectory, '.profile');
  if (path.dirname(profileDirectory) !== collectorDirectory || path.basename(profileDirectory) !== '.profile') {
    throw new Error('O diretório de sessão judicial não passou na validação de segurança.');
  }
  await rm(profileDirectory, { recursive: true, force: true });
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  return { certificatePreserved, totpRemoved: true, sessionsRemoved: true, enabled: [] };
}

async function startInteractiveCollector(portalIds) {
  if (CLOUD_MODE) throw Object.assign(new Error('A primeira conexão com tribunais deve ser iniciada no agente local com PJeOffice.'), { statusCode: 503 });
  if (interactiveCollector && interactiveCollector.exitCode === null) throw Object.assign(new Error('Já existe uma primeira conexão em andamento.'), { statusCode: 409 });
  const config = await readPortalConfiguration();
  const allowed = new Set(config.portals.filter(portal => portal.usesCertificate).map(portal => portal.id));
  const selected = [...new Set((Array.isArray(portalIds) ? portalIds : []).map(String))].filter(id => allowed.has(id));
  if (!selected.length) throw Object.assign(new Error('Selecione ao menos um portal para a primeira conexão.'), { statusCode: 400 });
  const centralUrl = `http://${HOST}:${PORT}`;
  interactiveCollector = spawn(process.execPath, [COLLECTOR_AGENT_FILE], {
    cwd: ROOT,
    env: {
      ...process.env,
      CENTRAL_URL: centralUrl,
      COLLECTOR_HEADLESS: 'false',
      COLLECTOR_INTERACTIVE: 'true',
      LOGIN_WAIT_SECONDS: '240',
      COLLECTOR_PORTAL_IDS: selected.join(',')
    },
    windowsHide: false,
    stdio: 'pipe'
  });
  interactiveCollector.stdout?.on('data', chunk => { console.log('[Coletor]:', chunk.toString().trim()); });
  interactiveCollector.stderr?.on('data', chunk => { console.error('[Coletor Erro]:', chunk.toString().trim()); });
  interactiveCollector.once('exit', () => { interactiveCollector = null; });
  interactiveCollector.once('error', (err) => { console.error('[Coletor Falha]:', err); interactiveCollector = null; });
  return { started: true, portalCount: selected.length };
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}
function json(res, status, payload, headers = {}) {
  applySecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', ...headers });
  res.end(JSON.stringify(payload));
}
async function readJson(req, limit = 1_000_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Carga maior que o limite permitido.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function unfoldIcs(source) { return source.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
function unescapeIcs(value = '') { return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim(); }
function parseIcsDate(raw = '') {
  const value = raw.trim();
  if (/^\d{8}$/.test(value)) return { date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, time: '' };
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  return match ? { date: `${match[1]}-${match[2]}-${match[3]}`, time: `${match[4]}:${match[5]}` } : { date: '', time: '' };
}
function parseCalendar(source) {
  const records = []; let current = null;
  for (const line of unfoldIcs(source)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) records.push(current); current = null; continue; }
    if (!current) continue;
    const separator = line.indexOf(':'); if (separator < 0) continue;
    current[line.slice(0, separator).split(';')[0].toUpperCase()] = unescapeIcs(line.slice(separator + 1));
  }
  return records;
}
function calendarPayload(records) {
  const now = new Date().toISOString();
  const events = records.map((record, index) => {
    const start = parseIcsDate(record.DTSTART); const summary = record.SUMMARY || 'Compromisso ADVBOX'; const description = record.DESCRIPTION || '';
    const process = `${summary} ${description}`.match(PROCESS_RE)?.[0] || '';
    const externalId = `advbox-calendar:${record.UID || `${start.date}:${summary}:${index}`}`;
    return { id: externalId, externalId, title: summary, date: start.date, time: start.time, source: 'Agenda ADVBOX', client: record.LOCATION || '', process, description, importedAt: now };
  }).filter(event => event.date);
  const tasks = events.map(event => ({ id: `task:${event.externalId}`, externalId: `task:${event.externalId}`, title: event.title, description: event.description || 'Importado automaticamente da agenda ADVBOX.', status: 'triagem', source: 'Agenda ADVBOX', client: event.client, process: event.process, deadline: event.date, priority: 'normal', responsible: 'Ricardo', createdAt: event.importedAt }));
  return { events, tasks };
}

function excelSerialToIsoDate(serial) {
  if (typeof serial === 'number' && serial > 10000 && serial < 100000) {
    const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof serial === 'string') {
    const m = serial.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (serial.match(/^\d{4}-\d{2}-\d{2}/)) return serial.slice(0, 10);
  }
  return '';
}

function findHeaderRow(matrix) {
  const known = ['número processo', 'numero processo', 'processo', 'classe', 'autores principais', 'autor', 'réu', 'reu', 'localidade judicial', 'assunto', 'último evento', 'ultimo evento', 'data/hora', 'data de distribuição', 'valor da causa', 'cliente', 'documento', 'cpf', 'cnpj', 'telefone', 'celular', 'email', 'tarefa', 'compromisso', 'etapa', 'fase', 'tribunal', 'comarca'];
  let bestRow = 0;
  let maxMatches = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const rowLower = row.map(c => String(c || '').toLowerCase().trim());
    if (rowLower[0] && rowLower[0].startsWith('relatório')) continue;
    const matches = rowLower.filter(cell => known.some(k => cell === k || (cell.length > 3 && k.includes(cell)) || (k.length > 3 && cell.includes(k)))).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestRow = i;
    }
  }
  return bestRow;
}

async function parseUploadedSpreadsheet({ filename = '', base64 = '', content = '' }) {
  let matrix = [];
  if (base64) {
    const buffer = Buffer.from(base64, 'base64');
    try {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('A planilha está vazia.');
      const sheet = wb.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    } catch (err) {
      throw new Error(`Não foi possível processar a planilha: ${err.message}`);
    }
  } else if (content) {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) throw new Error('Arquivo de texto vazio.');
    const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    matrix = lines.map(line => line.split(delimiter).map(p => p.replace(/^["']|["']$/g, '').trim()));
  } else {
    throw new Error('Nenhum dado de planilha enviado.');
  }

  if (!matrix.length) throw new Error('A planilha não contém dados legíveis.');

  const headerRowIndex = findHeaderRow(matrix);
  const rawHeaders = (matrix[headerRowIndex] || []).map(c => String(c || '').trim());
  const headers = rawHeaders.map((h, i) => h || `Coluna_${i + 1}`);

  const rows = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const rowArray = matrix[r];
    if (!rowArray || !rowArray.some(c => c !== null && c !== undefined && String(c).trim() !== '')) continue;
    const rowObj = {};
    headers.forEach((h, idx) => { rowObj[h] = rowArray[idx] ?? ''; });
    rows.push(rowObj);
  }

  const contacts = [];
  const processes = [];
  const tasks = [];

  for (const row of rows) {
    const rowKeys = Object.keys(row);
    const getVal = (...keys) => {
      for (const k of keys) {
        const foundKey = rowKeys.find(rk => {
          const cleanRk = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanRk === cleanK || (cleanK.length > 4 && cleanRk.includes(cleanK));
        });
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
          return row[foundKey];
        }
      }
      return '';
    };

    const rawProc = String(getVal('numeroprocesso', 'processo', 'cnj', 'numero', 'protocolo') || '').trim();
    const procNumberMatch = rawProc.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    const procNumber = procNumberMatch ? procNumberMatch[0] : rawProc.replace(/\s*\([^)]+\)/, '').trim();
    const unitCode = rawProc.match(/\(([^)]+)\)/)?.[1] || '';

    const author = String(getVal('autoresprincipais', 'autor', 'cliente', 'nome', 'nomedocliente', 'contato') || '').trim();
    const defendant = String(getVal('reus', 'reu', 'reupassivo', 'reclamada') || '').trim();
    const locality = String(getVal('localidadejudicial', 'comarca', 'tribunal', 'orgao', 'vara', 'cidade') || '').trim();
    const classe = String(getVal('classe', 'classejudicial', 'acao', 'tipodeacao') || '').trim();
    const subject = String(getVal('assunto', 'materia') || '').trim();
    const lastEvent = String(getVal('ultimoevento', 'ultimoandamento', 'andamento', 'fase', 'etapa') || '').trim();
    const lastEventDate = excelSerialToIsoDate(getVal('datahora', 'dataultimoevento', 'dataandamento') || '');
    const distribDate = excelSerialToIsoDate(getVal('datadistribuicaodoprocesso', 'datadistribuicao', 'datadecadastro', 'cadastro') || '');
    const causeValRaw = getVal('valordacausa', 'valor', 'honorariosvalor');
    const causeValue = typeof causeValRaw === 'number' ? causeValRaw : Number(String(causeValRaw).replace(/[^\d.,]/g, '').replace(',', '.')) || '';
    const doc = String(getVal('cpfcnpj', 'cpf', 'cnpj', 'documento') || '').trim();
    const mobile = String(getVal('celular', 'telefone', 'whatsapp', 'fone') || '').trim();
    const email = String(getVal('email', 'correioeletronico') || '').trim();
    const feeType = String(getVal('honorarios', 'tipodehonorarios', 'contrato') || '').trim();
    const feePct = String(getVal('percentual', 'porcentagem', 'exito') || '').trim();
    const taskTitle = String(getVal('tarefa', 'compromisso', 'titulo', 'prazo', 'atividade') || '').trim();
    const deadline = excelSerialToIsoDate(getVal('datalimite', 'vencimento', 'prazo', 'data') || '');
    const responsible = String(getVal('responsavel', 'destinatario', 'advogado') || '').trim();

    if (procNumber || (author && (locality || classe || subject || lastEvent))) {
      processes.push({
        id: `proc-${randomBytes(6).toString('hex')}`,
        number: procNumber,
        client: author || 'Cliente não informado',
        opposingParty: defendant,
        court: locality ? (locality.toLowerCase().startsWith('tj') || locality.toLowerCase().startsWith('trf') ? locality : `TJRS · ${locality}`) : 'eproc',
        caseFolder: unitCode,
        actionType: [classe, subject].filter(Boolean).join(' · ') || 'Processo Judicial',
        stage: 'Em andamento',
        feeType: feeType ? feeType.toLowerCase() : feePct ? 'exito' : '',
        feePercentage: feePct ? feePct.replace(/\D/g, '') : '',
        feeAmount: causeValue ? String(causeValue) : '',
        feeStatus: (feeType || feePct) ? 'pendente' : '',
        registeredAt: distribDate || new Date().toISOString().slice(0, 10),
        lastMovement: lastEvent || 'Importado do eproc',
        lastMovementAt: lastEventDate || new Date().toISOString().slice(0, 10),
        monitoring: 'active',
        source: filename.toLowerCase().includes('eproc') || filename.toLowerCase().includes('relatorio') ? 'eproc TJRS' : 'Planilha'
      });
    }

    if (author) {
      contacts.push({
        id: `contact-${randomBytes(6).toString('hex')}`,
        name: author,
        document: doc,
        mobile,
        email,
        city: locality,
        origin: filename.toLowerCase().includes('eproc') || filename.toLowerCase().includes('relatorio') ? 'eproc TJRS' : 'Planilha',
        registeredAt: distribDate || new Date().toISOString().slice(0, 10)
      });
    }

    if (taskTitle) {
      tasks.push({
        id: `task-${randomBytes(6).toString('hex')}`,
        title: taskTitle,
        description: `Importado de planilha: ${filename || 'lote'}`,
        client: author || '',
        process: procNumber || '',
        deadline: deadline || new Date().toISOString().slice(0, 10),
        priority: 'normal',
        status: 'triagem',
        responsible: responsible || 'Advogado',
        source: 'Planilha',
        createdAt: new Date().toISOString()
      });
    }
  }

  // Deduplicar contatos por nome
  const uniqueContacts = [...new Map(contacts.map(c => [c.name.toUpperCase(), c])).values()];

  return {
    filename,
    totalRows: rows.length,
    preview: rows.slice(0, 8),
    contacts: uniqueContacts,
    processes,
    tasks
  };
}

function buildOfficeFullContext(state, runtime) {
  const contacts = state.contacts || [];
  const processes = mergeBy(state.processes || [], runtime?.processes || [], 'number');
  const intimations = mergeBy(state.intimations || [], runtime?.intimations || [], 'id');
  const tasks = mergeBy(state.tasks || [], runtime?.tasks || [], 'id');
  const agenda = mergeBy(state.agenda || [], runtime?.events || [], 'id');
  const terms = state.terms || [];

  let summary = `\n=== DADOS COMPLETOS E REAIS DO ESCRITÓRIO (CONSULTA DIRETA DA IA) ===\n`;

  // 1. Termos e Advogados Monitorados
  if (terms.length) {
    summary += `\n[ADVOGADOS E TERMOS MONITORADOS (${terms.length})]\n`;
    terms.forEach(t => {
      summary += `- ${t.name || 'Advogado'} · OAB/${t.oabUf || 'RS'} ${t.registration || ''} · Abrangência: ${t.court || 'Todos os Tribunais'}\n`;
    });
  }

  // 2. Contatos / Clientes
  if (contacts.length) {
    summary += `\n[CLIENTES E CONTATOS DO ESCRITÓRIO (${contacts.length})]\n`;
    contacts.forEach(c => {
      summary += `- Nome: ${c.name} | Doc: ${c.document || c.cpf || 'N/I'} | Tel/Whats: ${c.phone || 'N/I'} | Email: ${c.email || 'N/I'} | Cidade: ${c.city || ''}/${c.state || ''} ${c.notes ? `| Detalhes: ${c.notes}` : ''}\n`;
    });
  }

  // 3. Processos e Movimentações
  if (processes.length) {
    summary += `\n[ACERVO DE PROCESSOS ATIVOS (${processes.length})]\n`;
    processes.forEach(p => {
      summary += `- Processo: ${p.number} | Cliente: ${p.client || 'N/I'} | Parte Contrária: ${p.opposingParty || 'N/I'} | Foro/Vara: ${p.court || 'N/I'} | Ação: ${p.actionType || 'Cível'} (${p.stage || 'Em andamento'}) | Último Andamento: ${p.lastMovement || 'Sem movimentação registrada'}\n`;
    });
  }

  // 4. Intimações do DJEN e Diários Oficiais
  if (intimations.length) {
    summary += `\n[INTIMAÇÕES JUDICIAIS E DIÁRIOS (${intimations.length})]\n`;
    intimations.forEach(it => {
      const statusLabel = it.status === 'conferida' ? 'CONFERIDA' : 'PENDENTE DE TRIAGEM';
      const urgentLabel = it.isUrgent ? ' [URGENTE]' : '';
      summary += `- [${statusLabel}${urgentLabel}] Processo: ${it.process || 'N/I'} | Cliente: ${it.client || 'N/I'} | Vara/Tribunal: ${it.court || 'N/I'} | Publicação: ${it.publishedAt || 'N/I'} | Prazo Fatal: ${it.fatalDate || 'N/I'} | Teor/Texto: ${String(it.text || it.summary || '').substring(0, 300)}\n`;
    });
  }

  // 5. Tarefas e Prazos do Kanban
  if (tasks.length) {
    summary += `\n[QUADRO KANBAN DE TAREFAS E PRAZOS (${tasks.length})]\n`;
    tasks.forEach(t => {
      const statusLabel = t.status || 'pendente';
      const urgentLabel = t.priority === 'urgente' ? ' [URGENTE]' : '';
      summary += `- [Coluna: ${statusLabel}${urgentLabel}] ${t.title} | Processo: ${t.process || 'Geral'} | Cliente: ${t.client || 'N/I'} | Prazo Limite: ${t.dueDate || 'S/D'} | Responsável: ${t.lawyer || 'Dr(a). Advogado(a)'} | Pontuação: ${t.points || 10} pts\n`;
    });
  }

  // 6. Agenda de Audiências e Compromissos
  if (agenda.length) {
    summary += `\n[AGENDA DE AUDIÊNCIAS E COMPROMISSOS (${agenda.length})]\n`;
    agenda.forEach(a => {
      summary += `- Data: ${a.date} às ${a.time || '00:00'} | Evento: ${a.title} | Cliente: ${a.client || 'N/I'} | Processo: ${a.process || 'N/I'}\n`;
    });
  }

  return summary;
}

async function callGeminiApi(apiKey, systemInstruction, contents) {
  const models = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const payload = {
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      };
      if (systemInstruction) {
        payload.system_instruction = {
          parts: [{ text: systemInstruction }]
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('A API do Gemini retornou uma resposta sem conteúdo.');
      return { text, model };
    } catch (err) {
      lastError = err;
      const msg = String(err.message).toLowerCase();
      if (msg.includes('not found') || msg.includes('404') || msg.includes('no longer available') || msg.includes('deprecated') || msg.includes('is not supported')) {
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Não foi possível conectar aos modelos do Google Gemini.');
}

function extractOabAndUf(term, fallbackReg = 'OAB/RS 135294') {
  let uf = String(term?.oabUf || '').trim().toUpperCase();
  let num = String(term?.oabNumber || '').replace(/\D/g, '');

  if (!num || !uf || uf === 'UF') {
    const reg = String(term?.registration || fallbackReg);
    const ufMatch = reg.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i) ||
                    reg.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i) ||
                    reg.match(/[\/\-]\s*([A-Z]{2})/i);
    if (ufMatch) uf = ufMatch[1].toUpperCase();

    const numMatch = reg.replace(/\D/g, '');
    if (numMatch) num = numMatch;
  }

  if (!uf || uf === 'UF') uf = 'RS';
  if (!num || num === '000000' || num === '00000') num = '135294';
  return { uf, num };
}

function mergeBy(left = [], right = [], key = 'externalId') {
  const result = [...left];
  for (const record of right) {
    const value = record?.[key] ?? record?.id; const index = result.findIndex(item => (item?.[key] ?? item?.id) === value);
    if (index >= 0) result[index] = { ...result[index], ...record }; else result.unshift(record);
  }
  return result;
}
function sanitizeArray(value, max = 10_000) { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, max) : []; }
function collectorAuthorized(req) {
  const authorization = String(req.headers.authorization || '');
  const expected = `Bearer ${process.env.COLLECTOR_INGEST_TOKEN}`;
  return authorization.length === expected.length && timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
function assertAuthenticated(req, requireCsrf = false) {
  const session = security.requireSession(req);
  if (requireCsrf) security.requireCsrf(req, session);
  return session;
}
function remoteAddress(req) { return req.socket.remoteAddress || ''; }

async function serveStatic(req, res) {
  const rawPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  let requested;
  try { requested = decodeURIComponent(rawPath); } catch { return json(res, 400, { message: 'Caminho inválido.' }); }
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '').replaceAll('\\', '/');
  const allowed = publicFiles.has(relative) || publicDirectories.some(directory => relative.startsWith(directory));
  if (!allowed || relative.includes('..') || relative.startsWith('.')) return json(res, 404, { message: 'Arquivo não encontrado.' });
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`)) return json(res, 404, { message: 'Arquivo não encontrado.' });
  try {
    const info = await stat(file); if (!info.isFile()) throw new Error('not-file');
    const body = await readFile(file); applySecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store, private' });
    if (req.method !== 'HEAD') res.end(body); else res.end();
  } catch { json(res, 404, { message: 'Arquivo não encontrado.' }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/auth/status') return json(res, 200, security.publicStatus(req));
    if (req.method === 'POST' && url.pathname === '/api/auth/setup') return json(res, 200, await security.beginSetup(await readJson(req), remoteAddress(req)));
    if (req.method === 'POST' && url.pathname === '/api/auth/setup/verify') {
      const result = await security.finishSetup(await readJson(req));
      return json(res, 200, { authenticated: true, csrfToken: result.csrfToken, user: result.user, recoveryCodes: result.recoveryCodes }, { 'Set-Cookie': security.sessionCookie(result.token) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const result = await security.login(await readJson(req), remoteAddress(req), req.headers['user-agent'] || '');
      const cookies = [security.sessionCookie(result.token)];
      if (result.trustedToken) cookies.push(security.trustedDeviceCookie(result.trustedToken));
      return json(res, 200, { authenticated: true, csrfToken: result.csrfToken, user: result.user, trustedDevice: Boolean(result.trustedToken) }, { 'Set-Cookie': cookies });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const session = assertAuthenticated(req, true); await security.logout(req);
      return json(res, 200, { ok: true, user: session.username }, { 'Set-Cookie': [security.clearCookie(), security.clearTrustedDeviceCookie()] });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      const result = await security.registerUser(await readJson(req));
      return json(res, 200, result);
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/users') {
      const session = assertAuthenticated(req);
      return json(res, 200, { users: security.listUsers(), currentRole: session.role || 'collaborator' });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/users/manage') {
      const session = assertAuthenticated(req, true);
      if (session.role !== 'master_admin') throw Object.assign(new Error('Apenas o Administrador Master (Dr. Ricardo Rossetto) pode gerenciar usuários.'), { statusCode: 403 });
      const body = await readJson(req);
      const user = await security.updateUserStatus(body.userId, body);
      return json(res, 200, { ok: true, user });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/sync') {
      assertAuthenticated(req, true);
      const config = await readPortalConfiguration();
      const enabledIds = config.portals.filter(p => p.enabled || p.strategy === 'djen' || p.strategy === 'datajud').map(p => p.id);
      spawn(process.execPath, [COLLECTOR_AGENT_FILE], {
        cwd: ROOT,
        env: { ...process.env, CENTRAL_URL: `http://${HOST}:${PORT}`, COLLECTOR_HEADLESS: 'true', COLLECTOR_PORTAL_IDS: enabledIds.join(',') },
        windowsHide: true,
        stdio: 'ignore'
      });
      return json(res, 200, { ok: true, message: 'Sincronização com DJEN, DataJud e tribunais disparada em segundo plano.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/trusted-device/revoke') {
      assertAuthenticated(req, true); const revoked = await security.revokeTrustedDevice(req);
      return json(res, 200, { ok: true, revoked }, { 'Set-Cookie': security.clearTrustedDeviceCookie() });
    }

    if (req.method === 'POST' && url.pathname === '/api/tjrs/consult') {
      assertAuthenticated(req);
      const body = await readJson(req);
      const rawNumber = String(body.processNumber || '').trim();
      const cleanNumber = rawNumber.replace(/\D/g, '');
      if (cleanNumber.length < 15) throw Object.assign(new Error('Número de processo CNJ inválido.'), { statusCode: 400 });
      
      const isTrf4 = rawNumber.includes('.4.04.') || cleanNumber.includes('404');
      const is2G = rawNumber.includes('.8.21.') && (body.grau === '2' || body.courtUnit?.includes('Turma') || body.courtUnit?.includes('Câmara'));
      
      const eprocUrl = isTrf4
        ? `https://eproc.trf4.jus.br/eproc2trf4/controlador.php?acao=processo_selecionar&num_processo=${cleanNumber}`
        : is2G
        ? `https://eproc2g.tjrs.jus.br/eproc/externo_controlador.php?acao=processo_selecionar&num_processo=${cleanNumber}`
        : `https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php?acao=processo_selecionar&num_processo=${cleanNumber}`;

      const buscaUrl = isTrf4
        ? eprocUrl
        : `https://www.tjrs.jus.br/novo/busca/?return=proc&client=wp_index&q=${cleanNumber}`;

      return json(res, 200, {
        ok: true,
        directUrl: eprocUrl,
        buscaUrl,
        courtName: isTrf4 ? 'TRF4 (eproc)' : 'TJRS (eproc 1º/2º Grau)',
        message: `Processo pronto para consulta oficial no ${isTrf4 ? 'TRF4' : 'TJRS'}.`
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      assertAuthenticated(req); const runtime = await readRuntime();
      let hasCalendar = Boolean(process.env.EXTERNAL_CALENDAR_URL || process.env.ADVBOX_WEBCAL_URL);
      try {
        const env = await readAppStateEnvelope();
        if (env?.state?.settings?.calendarUrl) hasCalendar = true;
      } catch {}
      return json(res, 200, { mode: 'local-protected', calendarConfigured: hasCalendar, collectorConfigured: Boolean(runtime.updatedAt), lastCollectorRun: runtime.updatedAt, authentication: 'password+totp' });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') { assertAuthenticated(req); return json(res, 200, await readRuntime()); }
    if (req.method === 'GET' && url.pathname === '/api/state') { assertAuthenticated(req); return json(res, 200, await readAppStateEnvelope()); }
    if (req.method === 'POST' && url.pathname === '/api/state') {
      assertAuthenticated(req, true); const body = await readJson(req, 3_000_000); const saved = await saveAppState(body.state, body.revision ?? null);
      return json(res, 200, { ok: true, ...saved });
    }

    // Assistente IA (Google Gemini)
    if (req.method === 'GET' && url.pathname === '/api/ai/status') {
      assertAuthenticated(req);
      let configured = Boolean(process.env.GEMINI_API_KEY);
      try {
        const env = await readAppStateEnvelope();
        if (env?.state?.settings?.geminiApiKey) configured = true;
      } catch {}
      return json(res, 200, { configured, model: 'gemini-2.5-flash' });
    }

    if (req.method === 'POST' && url.pathname === '/api/ai/configure') {
      assertAuthenticated(req, true);
      const body = await readJson(req);
      const apiKey = String(body.apiKey || '').trim();
      if (!apiKey || apiKey.length < 20) {
        throw Object.assign(new Error('Chave de API do Gemini inválida ou muito curta.'), { statusCode: 400 });
      }

      const testResult = await callGeminiApi(apiKey, null, [{ role: 'user', parts: [{ text: 'Responda apenas com a palavra OK' }] }]);

      const envelope = await readAppStateEnvelope().catch(() => ({ state: {} }));
      const state = envelope?.state || {};
      state.settings ||= {};
      state.settings.geminiApiKey = apiKey;
      const saveResult = await saveAppState(state, envelope.revision);

      return json(res, 200, { ok: true, message: 'Chave do Google Gemini ativada e validada com sucesso!', model: testResult.model, revision: saveResult.revision });
    }

    if (req.method === 'POST' && url.pathname === '/api/ai/chat') {
      assertAuthenticated(req, true);
      const body = await readJson(req, 2_000_000);
      const message = String(body.message || '').trim();
      if (!message) throw Object.assign(new Error('Mensagem vazia.'), { statusCode: 400 });

      const envelope = await readAppStateEnvelope().catch(() => ({ state: {} }));
      const state = envelope?.state || {};
      const apiKey = String(body.apiKey || state.settings?.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        throw Object.assign(new Error('Chave de API do Google Gemini não configurada. Configure sua chave gratuita em Assistente IA.'), { statusCode: 400 });
      }

      const office = state.settings || {};
      const runtime = await readRuntime().catch(() => ({}));
      const fullOfficeContext = buildOfficeFullContext(state, runtime);

      const systemPrompt = `Você é o Assistente Jurídico Inteligente da Central Keller, plataforma do escritório Keller Advogados.
Escritório: ${office.officeName || 'Keller Advogados'} (${office.lawyerName || 'Dr(a). Advogado(a) Titular'} - ${office.lawyerOab || 'OAB'})

${fullOfficeContext}

Diretrizes essenciais:
1. Especialista em Direito Brasileiro: CPC/2015, CPP, CLT, Legislação Previdenciária, Tributária, Consumidor e Direito Público.
2. Acesso Total aos Dados do Escritório: Você conhece todos os clientes cadastrados, processos em andamento, movimentações, intimações do DJEN/diários, tarefas do Kanban, prazos fatais e audiências listados acima. Quando o usuário perguntar sobre qualquer processo, cliente, intimação ou prazo, consulte e responda com base nos dados reais do escritório com precisão.
3. Contagem e Estratégia de Prazos: Domínio do Art. 219 (dias úteis), Art. 224 (termo inicial e final) e regras do CPC/2015 e CLT. Sempre calcule e explique o termo a quo, os dias úteis e o prazo fatal com clareza matemática.
4. Análise de Intimações do DJEN / DJe / eproc: Sintetize o que o juízo/tribunal determinou, identifique o tipo de ato (despacho, decisão, sentença, acórdão) e a medida cabível (ex: agravo, apelação, embargos, réplica).
5. Produção de Peças e Minutas: Redija petições, manifestações, cláusulas contratuais e procurações com técnica apurada, formatação em Markdown e fundamentação em lei e jurisprudência dos tribunais superiores (STJ/STF/TST).
6. Formatação: Seja direto, organizado, use títulos em markdown, listas e bullet points. NÃO use emojis. Use termos jurídicos precisos.`;

      const history = Array.isArray(body.history) ? body.history : [];
      const contents = [];

      if (body.context?.intimation) {
        const it = body.context.intimation;
        contents.push({
          role: 'user',
          parts: [{ text: `[Contexto da Intimação Selecionada no Sistema]\nProcesso: ${it.process || 'N/I'}\nCliente: ${it.client || 'N/I'}\nTribunal: ${it.court || 'N/I'}\nData da Publicação: ${it.publishedAt || 'N/I'}\nTexto Original do Diário:\n${it.text || ''}` }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Entendido. Tenho o contexto completo da intimação judicial carregado e pronto para análise.' }]
        });
      }

      if (body.context?.process) {
        const pr = body.context.process;
        contents.push({
          role: 'user',
          parts: [{ text: `[Contexto do Processo Selecionado no Sistema]\nNúmero CNJ: ${pr.number || 'N/I'}\nCliente: ${pr.client || 'N/I'}\nParte Contrária: ${pr.opposingParty || 'N/I'}\nTribunal/Comarca: ${pr.court || 'N/I'}\nAção/Fase: ${pr.actionType || ''} (${pr.stage || ''})\nÚltimo Andamento: ${pr.lastMovement || ''}` }]
        });
        contents.push({
          role: 'model',
          parts: [{ text: 'Entendido. Tenho o contexto do processo judicial carregado.' }]
        });
      }

      for (const h of history.slice(-10)) {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.text) }]
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await callGeminiApi(apiKey, systemPrompt, contents);
      return json(res, 200, { ok: true, reply: response.text, model: response.model });
    }

    // Configuração de Agenda Externa (Webcal / iCal)
    if (req.method === 'POST' && url.pathname === '/api/calendar/configure') {
      assertAuthenticated(req, true);
      const body = await readJson(req);
      const calendarUrl = String(body.calendarUrl || '').trim();

      const envelope = await readAppStateEnvelope().catch(() => ({ state: {} }));
      const state = envelope?.state || {};
      state.settings ||= {};
      state.settings.calendarUrl = calendarUrl;
      const saveResult = await saveAppState(state, envelope.revision);

      let importedCount = 0;
      let errorDetail = null;
      if (calendarUrl) {
        try {
          const fetchUrl = calendarUrl.replace(/^webcal:/i, 'https:');
          const response = await fetch(fetchUrl, { headers: { 'User-Agent': 'JurisFlow-Central-Juridica/1.0' }, redirect: 'follow' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = calendarPayload(parseCalendar(await response.text()));
          const runtime = await readRuntime();
          runtime.events = mergeBy(runtime.events, parsed.events);
          runtime.tasks = mergeBy(runtime.tasks, parsed.tasks);
          importedCount = parsed.events.length;
          runtime.sources = mergeBy(runtime.sources, [{
            id: 'external-calendar',
            name: 'Agenda Externa',
            short: 'CAL',
            method: 'Webcal/iCal',
            status: 'ok',
            lastCheck: new Date().toISOString(),
            detail: `${parsed.events.length} compromisso(s) sincronizado(s)`
          }], 'id');
          await saveRuntime(runtime);
        } catch (err) {
          errorDetail = err.message;
        }
      }

      return json(res, 200, {
        ok: true,
        calendarUrl,
        imported: importedCount,
        error: errorDetail,
        message: errorDetail ? `URL salva, mas a leitura da agenda retornou: ${errorDetail}` : `Agenda configurada com sucesso! ${importedCount} evento(s) sincronizado(s).`
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/integrations/judicial') {
      assertAuthenticated(req); return json(res, 200, await judicialIntegrationStatus());
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/certificate') {
      assertAuthenticated(req, true); const result = await saveUploadedCertificate(await readJson(req, 7_500_000));
      return json(res, 200, { ok: true, certificate: { valid: true, fileName: result.fileName, expiresAt: result.expiresAt || null } });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/2fa') {
      assertAuthenticated(req, true); const body = await readJson(req); const config = await readPortalConfiguration();
      let portal = config.portals.find(item => item.id === String(body.portalId || ''));
      if (!portal) {
        const portalId = String(body.portalId || 'pje-custom');
        portal = { id: portalId, name: String(body.portalName || portalId || 'Portal Judicial'), usesCertificate: true };
      }
      const secrets = await readJudicialSecrets(); secrets.totpSecrets ||= {};
      if (body.remove === true) {
        delete secrets.totpSecrets[portal.id];
        secrets.allowAutomatedTotp = Object.keys(secrets.totpSecrets).length > 0;
        await saveJudicialSecrets(secrets);
        return json(res, 200, { ok: true, removed: true });
      }
      const secret = extractTotpSecret(body.secret);
      if (!verifyTotp(secret, body.code)) throw Object.assign(new Error('O código de seis dígitos não confere com esse QR ou chave manual. Gere um código atual e tente novamente.'), { statusCode: 400 });
      secrets.totpSecrets[portal.id] = { secret, configuredAt: new Date().toISOString(), label: portal.name };
      secrets.allowAutomatedTotp = true;
      await saveJudicialSecrets(secrets);
      return json(res, 200, { ok: true, portalId: portal.id, verified: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/portals') {
      assertAuthenticated(req, true); const body = await readJson(req); const result = await updatePortalCoverage(body.enabledIds);
      return json(res, 200, { ok: true, ...result });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/reset') {
      assertAuthenticated(req, true); const body = await readJson(req);
      if (body.confirm !== 'ZERAR_ACESSOS_JUDICIAIS') throw Object.assign(new Error('Confirmação de segurança inválida.'), { statusCode: 400 });
      return json(res, 200, { ok: true, ...(await resetJudicialConnections()) });
    }
    if (req.method === 'POST' && url.pathname === '/api/integrations/judicial/connect') {
      assertAuthenticated(req, true); const body = await readJson(req); return json(res, 202, await startInteractiveCollector(body.portalIds));
    }
    if (req.method === 'POST' && url.pathname === '/api/ingest') {
      if (!collectorAuthorized(req)) return json(res, 401, { message: 'Coletor não autorizado.' });
      const incoming = await readJson(req, 5_000_000); const runtime = await readRuntime();
      const next = {
        events: mergeBy(runtime.events, sanitizeArray(incoming.events)), tasks: mergeBy(runtime.tasks, sanitizeArray(incoming.tasks)),
        intimations: mergeBy(runtime.intimations, sanitizeArray(incoming.intimations)), processes: mergeBy(runtime.processes, sanitizeArray(incoming.processes), 'number'),
        sources: mergeBy(runtime.sources, sanitizeArray(incoming.sources), 'id'), updatedAt: new Date().toISOString()
      };
      await saveRuntime(next);
      const imported = ['events', 'tasks', 'intimations', 'processes'].reduce((sum, key) => sum + sanitizeArray(incoming[key]).length, 0);
      return json(res, 200, { ok: true, imported, updatedAt: next.updatedAt });
    }
    if (req.method === 'GET' && url.pathname === '/api/import/template') {
      const type = url.searchParams.get('type') || 'processes';
      let csvContent = '';
      let filename = 'modelo.csv';
      if (type === 'contacts') {
        filename = 'modelo-contatos-jurisflow.csv';
        csvContent = 'Nome;CPF/CNPJ;Telefone / WhatsApp;E-mail;Cidade;Estado;Profissão\nMaria de Souza;123.456.789-00;(51) 99999-8888;maria@exemplo.com;Porto Alegre;RS;Servidora Pública\nJoão da Silva;987.654.321-11;(51) 98888-7777;joao@exemplo.com;Canoas;RS;Aposentado';
      } else if (type === 'tasks') {
        filename = 'modelo-tarefas-prazos-jurisflow.csv';
        csvContent = 'Título da Tarefa;Processo;Cliente;Data Limite;Responsável;Pontos\nElaborar Petição Inicial;5001234-56.2024.4.04.7100;Maria de Souza;2026-08-30;Dr. Advogado;10\nInterpor Recurso de Apelação;5009876-54.2023.8.21.0001;João da Silva;2026-08-25;Dr. Advogado;15';
      } else {
        filename = 'modelo-processos-jurisflow.csv';
        csvContent = 'Número do Processo;Nome do Cliente;Tribunal / Comarca;Tipo de Ação;Etapa;Tipo de Honorários;Percentual de Êxito;Valor Fixo\n5001234-56.2024.4.04.7100;Maria de Souza;TRF4 · 1ª Vara Federal;Previdenciário;Instrução;exito;30;\n5009876-54.2023.8.21.0001;João da Silva;TJRS · 2ª Vara Cível;Cobrança;Execução;misto;20;1500';
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      });
      return res.end('\uFEFF' + csvContent);
    }
    if (req.method === 'POST' && url.pathname === '/api/import/spreadsheet') {
      assertAuthenticated(req, true);
      const body = await readJson(req, 10_000_000);
      const parsed = await parseUploadedSpreadsheet(body);
      return json(res, 200, { ok: true, ...parsed });
    }
    if (req.method === 'POST' && url.pathname === '/api/sync') {
      assertAuthenticated(req, true);
      const runtime = await readRuntime();
      let events = runtime.events;
      let tasks = runtime.tasks;
      let intimations = runtime.intimations;
      let processes = runtime.processes;
      let calendarImported = 0;
      let djenImported = 0;
      const sources = [...runtime.sources];
      let appState = null;
      try {
        const envelope = await readAppStateEnvelope();
        if (envelope?.state) appState = envelope.state;
      } catch { /* sem estado salvo */ }

      // 1. Sincronização automática com DJEN / CNJ Oficial para os termos monitorados
      if (process.env.KELLER_SKIP_COLLECTOR_ENV !== 'true') {
        try {
          const terms = appState?.terms?.length ? appState.terms : [{ name: 'Ricardo De Luca Rossetto', registration: 'OAB/RS 135294' }];
          for (const term of terms) {
            const { uf, num } = extractOabAndUf(term);
            if (num && num.length >= 3) {
              const target = { intimations: [], tasks: [], processes: [], sources: [] };
              const portal = {
                id: 'djen-cnj',
                name: 'DJEN / CNJ Oficial',
                url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
                lookbackDays: 30,
                queryOabVariants: false,
                ufOab: uf,
                numeroOab: num,
                timeoutMs: 25_000
              };
              const djenResult = await collectDjen(portal, { monitoredTerm: { ...term, oabUf: uf, oabNumber: num } }, target);
              if (target.intimations.length) {
                intimations = mergeBy(intimations, target.intimations, 'externalId');
                tasks = mergeBy(tasks, target.tasks, 'externalId');
                djenImported += target.intimations.length;
              }
              const sourceIdx = sources.findIndex(s => s.id === 'djen-cnj' || s.id === 'djen');
              const updatedSource = {
                id: 'djen-cnj',
                name: 'DJEN / CNJ Oficial',
                short: 'CNJ',
                method: 'API pública oficial',
                status: 'ok',
                lastCheck: new Date().toISOString(),
                detail: `${djenResult.records || 0} publicação(ões) lida(s) para OAB/${uf} ${num}`
              };
              if (sourceIdx >= 0) sources[sourceIdx] = updatedSource;
              else sources.push(updatedSource);
            }
          }
        } catch (error) {
          const sourceIdx = sources.findIndex(s => s.id === 'djen-cnj' || s.id === 'djen');
          const errorSource = {
            id: 'djen-cnj',
            name: 'DJEN / CNJ Oficial',
            short: 'CNJ',
            method: 'API pública oficial',
            status: 'attention',
            lastCheck: new Date().toISOString(),
            detail: `Aviso DJEN: ${String(error.message).slice(0, 120)}`
          };
          if (sourceIdx >= 0) sources[sourceIdx] = errorSource;
          else sources.push(errorSource);
        }
      }

      // 2. Sincronização com Agenda Externa (Webcal / iCalendar)
      const calUrl = appState?.settings?.calendarUrl || process.env.EXTERNAL_CALENDAR_URL || process.env.ADVBOX_WEBCAL_URL;
      if (calUrl) {
        try {
          const calendarUrl = calUrl.replace(/^webcal:/i, 'https:');
          const response = await fetch(calendarUrl, { headers: { 'User-Agent': 'JurisFlow-Central-Juridica/1.0' }, redirect: 'follow' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = calendarPayload(parseCalendar(await response.text()));
          events = mergeBy(events, parsed.events);
          tasks = mergeBy(tasks, parsed.tasks);
          calendarImported = parsed.events.length;
          sources.push({ id: 'external-calendar', name: 'Agenda Externa', short: 'CAL', method: 'Webcal/iCal', status: 'ok', lastCheck: new Date().toISOString(), detail: `${parsed.events.length} compromisso(s) lido(s)` });
        } catch (error) {
          sources.push({ id: 'external-calendar', name: 'Agenda Externa', short: 'CAL', method: 'Webcal/iCal', status: 'error', lastCheck: new Date().toISOString(), detail: `Falha na leitura: ${String(error.message).slice(0, 120)}` });
        }
      }

      const updatedRuntime = {
        events,
        tasks,
        intimations,
        processes,
        sources: mergeBy([], sources, 'id'),
        updatedAt: new Date().toISOString()
      };
      await saveRuntime(updatedRuntime);

      return json(res, 200, {
        ...updatedRuntime,
        imported: calendarImported + djenImported
      });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
    json(res, 405, { message: 'Método não permitido.' });
  } catch (error) {
    const headers = error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {};
    const message = error instanceof SyntaxError ? 'JSON inválido.' : error.statusCode ? error.message : 'Falha interna da central.';
    if (!error.statusCode) console.error(error);
    json(res, error.statusCode || 500, { message }, headers);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Atrium Senda — Plataforma de Gestão Jurídica Inteligente: http://${HOST}:${PORT}`);
  console.log('Autenticação segura ativa (AES-256-GCM + TOTP 2FA).');
});
