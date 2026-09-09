import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'dist');
const apiBaseUrl = validateApiBaseUrl(process.env.ATRIUM_API_BASE_URL);

if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Diretório de saída inválido.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'css', 'js', 'assets']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}

await writeFile(path.join(output, 'js', 'runtime-config.js'),
  `globalThis.ATRIUM_CONFIG = Object.freeze(${JSON.stringify({ apiBaseUrl })});\n`, 'utf8');
await writeFile(path.join(output, '_headers'), buildHeaders(apiBaseUrl), 'utf8');

const html = await readFile(path.join(output, 'index.html'), 'utf8');
if (!html.includes('js/runtime-config.js')) throw new Error('index.html não carrega a configuração de runtime.');
console.log(`Frontend cloud gerado em ${output} para API ${apiBaseUrl}`);

function validateApiBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) throw new Error('Defina ATRIUM_API_BASE_URL com a origem HTTPS do backend.');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('ATRIUM_API_BASE_URL deve ser apenas uma origem HTTPS, sem caminho, credenciais ou parâmetros.');
  }
  return parsed.origin;
}

function buildHeaders(apiBase) {
  return `/*
  Cache-Control: no-store
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${apiBase}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/assets/*
  Cache-Control: public, max-age=3600
`;
}
