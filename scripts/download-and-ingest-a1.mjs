import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { downloadProcessWithA1 } from '../lib/judicial/eproc-a1-downloader.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));
const ENV_FILE = path.join(ROOT, '.env');

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
  const cnj = getArg('--cnj', '5007196-18.2026.8.21.0016');
  const pfxPass = getArg('--pfx-pass', process.env.A1_PFX_PASSPHRASE || 'Leandro/1968');
  const headed = args.includes('--headed');

  console.log(`Iniciando download dos autos integrais via Certificado A1 para o CNJ: ${cnj}...`);
  downloadProcessWithA1({ cnj, passphrase: pfxPass, headed })
    .then(res => {
      console.log('✓ Operação concluída com sucesso:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Falha na operação:', err);
      process.exit(1);
    });
}
