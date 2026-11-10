/**
 * Monta os recursos do aplicativo desktop em desktop/resources/:
 * 1. Copia o runtime do ATRIUM Senda (sem testes, docs nem segredos).
 * 2. Instala apenas as dependências de produção no diretório de recursos.
 * 3. Baixa o Node.js win-x64 oficial e empacota node.exe.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktopDir, '..');
const resources = path.join(desktopDir, 'resources');
const appDir = path.join(resources, 'app');
const nodeDir = path.join(resources, 'node');

if (!root || path.basename(root) !== 'Atrium-Senda') {
  // segurança: só mexemos dentro da própria pasta do projeto
  throw new Error(`Raiz inesperada para staging: ${root}`);
}

const COPY_FILES = ['server.mjs', 'index.html', 'favicon.ico', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const COPY_DIRS = ['collector', 'js', 'css', 'lib', 'assets'];
const EXCLUDE_IMAGE_PATTERN = /^assets\/images\/(atrium-visual-|discover-ambient|discover-film-|preview-)/; // peças da página divulgada, não do app local
const EXCLUDE_EXT = ['.md'];

function copyDirRecursive(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDirRecursive(from, to);
      continue;
    }
    const rel = path.relative(root, from).split(path.sep).join('/');
    if (EXCLUDE_IMAGE_PATTERN.test(rel)) continue;
    if (EXCLUDE_EXT.includes(path.extname(entry.name))) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function rmrf(dir) {
  if (!fs.existsSync(dir)) return;
  const real = fs.realpathSync(dir);
  if (!real.startsWith(desktopDir + path.sep)) {
    throw new Error(`Recusa a apagar fora de desktop/: ${real}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('[1/3] Copiando o runtime do ATRIUM Senda…');
rmrf(resources);
fs.mkdirSync(appDir, { recursive: true });
for (const file of COPY_FILES) {
  const from = path.join(root, file);
  if (!fs.existsSync(from)) throw new Error(`Arquivo obrigatório ausente: ${file}`);
  fs.copyFileSync(from, path.join(appDir, file));
}
for (const dir of COPY_DIRS) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) throw new Error(`Pasta obrigatória ausente: ${dir}`);
  copyDirRecursive(from, path.join(appDir, dir));
}

console.log('[2/3] Instalando dependências de produção no diretório de recursos…');
// node-linker=hoisted gera uma árvore de pastas reais (sem junctions), que o
// empacotamento e a instalação preservam. Sem isso, o instalador não leva os
// links do pnpm e o servidor morre com ERR_MODULE_NOT_FOUND em app/node_modules.
const installArgs = ['install', '--prod', '--frozen-lockfile', '--config.node-linker=hoisted'];
execFileSync('pnpm', installArgs, {
  cwd: appDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CI: 'true' }
});

console.log('[3/3] Baixando o Node.js oficial (win-x64)…');
const index = await fetch('https://nodejs.org/dist/index.json').then(res => res.json());
const latest = index.find(entry => entry.version.startsWith('v24.'));
if (!latest) throw new Error('Nenhuma versão do Node 24 encontrada no índice oficial.');
const version = latest.version;
const zipName = `node-${version}-win-x64.zip`;
const zipUrl = `https://nodejs.org/dist/${version}/${zipName}`;
const tmpZip = path.join(resources, zipName);
const response = await fetch(zipUrl);
if (!response.ok) throw new Error(`Falha ao baixar ${zipUrl}: HTTP ${response.status}`);
fs.writeFileSync(tmpZip, Buffer.from(await response.arrayBuffer()));
const extractDir = path.join(resources, 'node-extract');
execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${tmpZip}" -DestinationPath "${extractDir}" -Force`], { stdio: 'inherit' });
const extracted = path.join(extractDir, `node-${version}-win-x64`);
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(path.join(extracted, 'node.exe'), path.join(nodeDir, 'node.exe'));
fs.copyFileSync(path.join(extracted, 'LICENSE'), path.join(nodeDir, 'LICENSE'));
rmrf(extractDir);
fs.rmSync(tmpZip);

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else total += fs.statSync(full).size;
  }
  return total;
}
const appSize = dirSizeBytes(appDir);
const nodeSize = dirSizeBytes(nodeDir);
const mb = bytes => (bytes / 1024 / 1024).toFixed(1);
console.log(`\nRecursos prontos:`);
console.log(`  app/   ${mb(appSize)} MB (servidor + interface + dependências de produção)`);
console.log(`  node/  ${mb(nodeSize)} MB (Node ${version} win-x64)`);
console.log(`  total  ${mb(appSize + nodeSize)} MB`);
