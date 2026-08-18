import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager } from '../lib/security.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baseEnvFile = path.join(ROOT, '.env');
const collectorEnvFile = path.join(ROOT, '.env.collector');
const dataDirectory = path.join(ROOT, 'data');
const integrationFile = path.join(dataDirectory, 'judicial-integrations.json');

if (!existsSync(baseEnvFile) || !existsSync(collectorEnvFile)) throw new Error('Os arquivos locais de configuração não foram encontrados.');
const baseSource = await readFile(baseEnvFile, 'utf8');
const collectorSource = await readFile(collectorEnvFile, 'utf8');
const baseEnv = parseEnv(baseSource);
const collectorEnv = parseEnv(collectorSource);
if (!collectorEnv.A1_PFX_PATH || !collectorEnv.A1_PFX_PASSPHRASE) {
  console.log('Nenhuma credencial A1 em texto simples aguardando migração.');
  process.exit(0);
}

const security = new SecurityManager({
  dataDirectory,
  sessionSecret: baseEnv.AUTH_SESSION_SECRET,
  encryptionKey: baseEnv.AUTH_ENCRYPTION_KEY,
  secureCookies: false
});
await security.init();
let current = { certificate: null, totpSecrets: {}, allowAutomatedTotp: false };
if (existsSync(integrationFile)) {
  const envelope = JSON.parse(await readFile(integrationFile, 'utf8'));
  current = { ...current, ...JSON.parse(security.decrypt(envelope.encrypted)) };
}
current.certificate = {
  path: collectorEnv.A1_PFX_PATH,
  passphrase: collectorEnv.A1_PFX_PASSPHRASE,
  fileName: path.basename(collectorEnv.A1_PFX_PATH),
  source: 'encrypted-store',
  configuredAt: new Date().toISOString()
};
await mkdir(dataDirectory, { recursive: true });
await writeFile(integrationFile, JSON.stringify({
  version: 1,
  algorithm: 'aes-256-gcm',
  encrypted: security.encrypt(JSON.stringify(current)),
  updatedAt: new Date().toISOString()
}, null, 2), { encoding: 'utf8', mode: 0o600 });

const sanitized = collectorSource.split(/\r?\n/)
  .filter(line => !/^A1_PFX_(?:PATH|PASSPHRASE)=/.test(line))
  .filter((line, index, values) => line || index < values.length - 1);
sanitized.push('# Certificado A1 e senha migrados para data/judicial-integrations.json com AES-256-GCM.');
await writeFile(collectorEnvFile, `${sanitized.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Credenciais A1 migradas para o cofre cifrado da Central; nenhuma credencial foi exibida.');

function parseEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const separator = line.indexOf('='); if (separator < 1) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}
