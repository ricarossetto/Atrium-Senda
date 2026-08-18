import http from 'node:http';
import { appendFile, readFile, writeFile, mkdir, stat, unlink, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager, verifyTotp } from './lib/security.mjs';
import { collectDjen } from './collector/adapters/djen.mjs';

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
const publicFiles = new Set(['index.html', 'css/portal.css', 'js/auth.js', 'js/portal.js']);
const publicDirectories = ['assets/images/', 'assets/fonts/'];
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
  for (const key of ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts']) {
    if (!Array.isArray(value[key]) || value[key].length > 10_000) throw Object.assign(new Error(`Coleção inválida: ${key}.`), { statusCode: 400 });
  }
  const current = await readAppStateEnvelope();
  if (current.revision && expectedRevision !== current.revision) throw Object.assign(new Error('Os dados foram atualizados em outra aba ou pelo importador. Recarregue a Central antes de salvar.'), { statusCode: 409 });
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

function extractTotpSecret(value) {
  const raw = String(value || '').trim();
  if (/^otpauth-migration:/i.test(raw)) throw Object.assign(new Error('Use o QR de ativação gerado pelo portal, não um QR de exportação do Google Authenticator.'), { statusCode: 400 });
  let secret = raw;
  if (/^otpauth:/i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { throw Object.assign(new Error('O QR de 2FA não contém um endereço TOTP válido.'), { statusCode: 400 }); }
    if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') throw Object.assign(new Error('Somente QR Codes TOTP de ativação são aceitos.'), { statusCode: 400 });
    secret = url.searchParams.get('secret') || '';
  }
  secret = secret.toUpperCase().replace(/[\s=-]/g, '');
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) throw Object.assign(new Error('O segredo TOTP não é válido. Gere um QR novo no portal ou informe a chave manual.'), { statusCode: 400 });
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
  interactiveCollector = spawn(process.execPath, [COLLECTOR_AGENT_FILE], {
    cwd: ROOT,
    env: { ...process.env, COLLECTOR_HEADLESS: 'false', COLLECTOR_INTERACTIVE: 'true', LOGIN_WAIT_SECONDS: '240', COLLECTOR_PORTAL_IDS: selected.join(',') },
    windowsHide: true,
    stdio: 'ignore'
  });
  interactiveCollector.once('exit', () => { interactiveCollector = null; });
  interactiveCollector.once('error', () => { interactiveCollector = null; });
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
    if (req.method === 'POST' && url.pathname === '/api/auth/trusted-device/revoke') {
      assertAuthenticated(req, true); const revoked = await security.revokeTrustedDevice(req);
      return json(res, 200, { ok: true, revoked }, { 'Set-Cookie': security.clearTrustedDeviceCookie() });
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      assertAuthenticated(req); const runtime = await readRuntime();
      return json(res, 200, { mode: 'local-protected', calendarConfigured: Boolean(process.env.ADVBOX_WEBCAL_URL), collectorConfigured: Boolean(runtime.updatedAt), lastCollectorRun: runtime.updatedAt, authentication: 'password+totp' });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') { assertAuthenticated(req); return json(res, 200, await readRuntime()); }
    if (req.method === 'GET' && url.pathname === '/api/state') { assertAuthenticated(req); return json(res, 200, await readAppStateEnvelope()); }
    if (req.method === 'POST' && url.pathname === '/api/state') {
      assertAuthenticated(req, true); const body = await readJson(req, 3_000_000); const saved = await saveAppState(body.state, body.revision ?? null);
      return json(res, 200, { ok: true, ...saved });
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
      const portal = config.portals.find(item => item.id === String(body.portalId || '') && item.usesCertificate && (item.strategy === 'pje' || item.autoTotpEnv));
      if (!portal) throw Object.assign(new Error('Portal de 2FA não reconhecido.'), { statusCode: 400 });
      const secrets = await readJudicialSecrets(); secrets.totpSecrets ||= {};
      if (body.remove === true) {
        delete secrets.totpSecrets[portal.id];
        secrets.allowAutomatedTotp = Object.keys(secrets.totpSecrets).length > 0;
        await saveJudicialSecrets(secrets);
        return json(res, 200, { ok: true, removed: true });
      }
      const secret = extractTotpSecret(body.secret);
      if (!verifyTotp(secret, body.code)) throw Object.assign(new Error('O código de seis dígitos não confere com esse QR. Gere um código atual e tente novamente.'), { statusCode: 400 });
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

      // 1. Sincronização automática com DJEN / CNJ Oficial para os termos monitorados
      try {
        let appState = null;
        try {
          const envelope = await readAppStateEnvelope();
          if (envelope?.state) appState = envelope.state;
        } catch { /* sem estado salvo */ }

        const terms = appState?.terms?.length ? appState.terms : [{ name: 'Dr(a). Advogado(a) Titular', registration: 'OAB/RS 135294' }];
        for (const term of terms) {
          const reg = String(term.registration || '');
          let uf = (reg.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i) || reg.match(/([A-Z]{2})\s*\d+/i) || reg.match(/\d+\s*[\/\-]?\s*([A-Z]{2})/i))?.[1] || '';
          const num = reg.replace(/\D/g, '');
          if (num && num.length >= 4) {
            if (!uf) uf = 'RS';
            const target = { intimations: [], tasks: [], processes: [], sources: [] };
            const portal = {
              id: 'djen-cnj',
              name: 'DJEN / CNJ Oficial',
              url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
              lookbackDays: 15,
              queryOabVariants: true,
              ufOab: uf.toUpperCase(),
              numeroOab: num,
              timeoutMs: 15_000
            };
            const djenResult = await collectDjen(portal, { monitoredTerm: term }, target);
            if (target.intimations.length) {
              intimations = mergeBy(intimations, target.intimations, 'externalId');
              tasks = mergeBy(tasks, target.tasks, 'externalId');
              djenImported += target.intimations.length;
            }
            sources.push({
              id: 'djen-cnj',
              name: 'DJEN / CNJ Oficial',
              short: 'CNJ',
              method: 'API pública oficial',
              status: 'ok',
              lastCheck: new Date().toISOString(),
              detail: `${djenResult.records || 0} publicação(ões) lida(s) para OAB/${uf.toUpperCase()} ${num}`
            });
          }
        }
      } catch (error) {
        sources.push({
          id: 'djen-cnj',
          name: 'DJEN / CNJ Oficial',
          short: 'CNJ',
          method: 'API pública oficial',
          status: 'attention',
          lastCheck: new Date().toISOString(),
          detail: `Aviso DJEN: ${String(error.message).slice(0, 120)}`
        });
      }

      // 2. Sincronização com Agenda Externa (Webcal / iCalendar)
      const calUrl = process.env.EXTERNAL_CALENDAR_URL || process.env.ADVBOX_WEBCAL_URL;
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
  console.log(`JurisFlow — Gestão Jurídica & Kanban: http://${HOST}:${PORT}`);
  console.log('Autenticação segura ativa (AES-256-GCM + TOTP 2FA).');
});
