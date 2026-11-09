import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { downloadProcessWithA1 } from '../lib/judicial/eproc-a1-downloader.mjs';
import { SecurityManager } from '../lib/security.mjs';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));
const ENV_FILE = path.join(ROOT, '.env');
const DATA_DIR = path.join(ROOT, 'data');

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
await loadEnv(ENV_FILE);

export { downloadProcessWithA1 };

// CLI Execution if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getArg = (flag, def = null) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const cnj = getArg('--cnj', null);
  const pfxPass = getArg('--pfx-pass', process.env.A1_PFX_PASSPHRASE || null);
  const headed = args.includes('--headed');

  if (!pfxPass) {
    console.error('Informe a passphrase do certificado A1 via --pfx-pass ou pela variável de ambiente A1_PFX_PASSPHRASE. Nenhuma senha padrão é embutida.');
    process.exit(1);
  }

  if (!cnj) {
    console.error('Informe o CNJ do processo via --cnj. Nenhum processo real é usado como padrão.');
    process.exit(1);
  }

  console.log(`Iniciando download dos autos integrais via Certificado A1 para o CNJ: ${cnj}...`);
  const securityManager = new SecurityManager({
    dataDirectory: DATA_DIR,
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY
  });
  await securityManager.init();
  const credentialManager = new JudicialCredentialManager({ dataDirectory: DATA_DIR, securityManager });
  downloadProcessWithA1({ cnj, passphrase: pfxPass, headed, securityManager, credentialManager })
    .then(res => {
      console.log(`Operação concluída: ${res.piecesCount || 0} peça(s) oficial(is) ingerida(s).`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Falha na operação:', err.message);
      process.exit(1);
    });
}
