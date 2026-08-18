import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDirectory = path.join(ROOT, 'data');
const integrationFile = path.join(dataDirectory, 'judicial-integrations.json');
const portalsFile = path.join(ROOT, 'collector', 'portals.json');
const collectorEnvFile = path.join(ROOT, '.env.collector');
const profileDirectory = path.resolve(ROOT, 'collector', '.profile');
const collectorDirectory = path.resolve(ROOT, 'collector');

const baseEnv = parseEnv(await readFile(path.join(ROOT, '.env'), 'utf8'));
const security = new SecurityManager({
  dataDirectory,
  sessionSecret: baseEnv.AUTH_SESSION_SECRET,
  encryptionKey: baseEnv.AUTH_ENCRYPTION_KEY,
  secureCookies: false
});
await security.init();

if (!existsSync(integrationFile)) throw new Error('O cofre judicial não existe; não há configuração para preservar.');
const envelope = JSON.parse(await readFile(integrationFile, 'utf8'));
const secrets = JSON.parse(security.decrypt(envelope.encrypted));
if (!secrets.certificate?.path || !secrets.certificate?.passphrase) throw new Error('O certificado A1 não está configurado no cofre; redefinição interrompida para evitar perda indevida.');

const removedTotpCount = Object.keys(secrets.totpSecrets || {}).length;
secrets.totpSecrets = {};
secrets.allowAutomatedTotp = false;
secrets.connectionsResetAt = new Date().toISOString();
await atomicWrite(integrationFile, JSON.stringify({
  version: 1,
  algorithm: 'aes-256-gcm',
  encrypted: security.encrypt(JSON.stringify(secrets)),
  updatedAt: new Date().toISOString()
}, null, 2));

const portalConfig = JSON.parse(await readFile(portalsFile, 'utf8'));
let disabledPortalCount = 0;
for (const portal of portalConfig.portals || []) {
  if (!portal.usesCertificate) continue;
  if (portal.enabled) disabledPortalCount += 1;
  portal.enabled = false;
}
await atomicWrite(portalsFile, `${JSON.stringify(portalConfig, null, 2)}\n`);

if (existsSync(collectorEnvFile)) {
  const source = await readFile(collectorEnvFile, 'utf8');
  const sanitized = source.split(/\r?\n/)
    .filter(line => !/^(?:PJE_TOTP_SECRET|ALLOW_AUTOMATED_PORTAL_TOTP)=/.test(line))
    .filter((line, index, values) => line || index < values.length - 1);
  sanitized.push('ALLOW_AUTOMATED_PORTAL_TOTP=false');
  await atomicWrite(collectorEnvFile, `${sanitized.join('\n')}\n`);
}

if (path.dirname(profileDirectory) !== collectorDirectory || path.basename(profileDirectory) !== '.profile') {
  throw new Error('O diretório de sessão judicial não passou na validação de segurança.');
}
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(profileDirectory, { recursive: true, mode: 0o700 });

console.log(`Redefinição concluída: certificado A1 preservado; ${removedTotpCount} vínculo(s) 2FA removido(s); ${disabledPortalCount} portal(is) desabilitado(s); sessões judiciais locais apagadas.`);

async function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
}

function parseEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}
