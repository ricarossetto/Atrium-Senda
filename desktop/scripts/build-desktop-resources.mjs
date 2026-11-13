/**
 * Monta os recursos do aplicativo desktop em desktop/resources/:
 * 1. Copia o runtime do ATRIUM Senda (sem testes, docs nem segredos).
 * 2. Instala apenas as dependências de produção no diretório de recursos.
 * 3. Baixa o Node.js oficial da plataforma alvo e empacota o binário.
 *
 * Plataformas suportadas: win32-x64, win32-arm64, linux-x64, linux-arm64,
 * darwin-x64, darwin-arm64. O alvo padrão é o host; ATRIUM_DESKTOP_TARGET
 * permite empacotar outro alvo no mesmo sistema (apenas dependências JS puras).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktopDir, '..');
const resources = path.join(desktopDir, 'resources');
const appDir = path.join(resources, 'app');
const nodeDir = path.join(resources, 'node');

if (path.basename(root) !== 'Atrium-Senda') {
  throw new Error(`Raiz inesperada para staging: ${root}`);
}

const HOST = `${process.platform}-${process.arch}`;
const TARGET = process.env.ATRIUM_DESKTOP_TARGET || HOST;
const KNOWN_TARGETS = new Set(['win32-x64', 'win32-arm64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']);
if (!KNOWN_TARGETS.has(TARGET)) {
  throw new Error(`Alvo desktop desconhecido: ${TARGET}. Use um de ${[...KNOWN_TARGETS].join(', ')}.`);
}

const [targetPlatform, targetArch] = TARGET.split('-');
const HOST_PLATFORM = process.platform;
if (targetPlatform !== HOST_PLATFORM) {
  // As dependências do servidor são JS puras hoje; ainda assim, o pnpm no host
  // errado pode gravar binários específicos de plataforma. Bloqueie por padrão.
  if (process.env.ATRIUM_ALLOW_CROSS_TARGET !== '1') {
    throw new Error(
      `Empacotamento cruzado bloqueado (${HOST} -> ${TARGET}). ` +
      'Rode no runner da plataforma alvo ou defina ATRIUM_ALLOW_CROSS_TARGET=1 após revisar as dependências nativas.'
    );
  }
}

const NODE_PLATFORM = { win32: 'win', darwin: 'darwin', linux: 'linux' }[targetPlatform];
const ARCHIVE_EXT = targetPlatform === 'win32' ? 'zip' : targetPlatform === 'darwin' ? 'tar.gz' : 'tar.xz';
const NODE_BIN = targetPlatform === 'win32' ? 'node.exe' : 'node';

const COPY_FILES = ['server.mjs', 'index.html', 'favicon.ico', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
const COPY_DIRS = ['collector', 'js', 'css', 'lib', 'assets'];
const EXCLUDE_IMAGE_PATTERN = /^assets\/images\/(atrium-visual-|discover-ambient|discover-film-|preview-)/;
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

function extractArchive(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  // O tar do Windows 10+ (bsdtar) lê zip, tar.gz e tar.xz. Nos runners Unix,
  // o tar do sistema cobre os mesmos formatos. Sem PowerShell, sem unzip.
  execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: 'inherit' });
}

console.log(`[1/3] Copiando o runtime do ATRIUM Senda (${TARGET})…`);
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
const installArgs = ['install', '--prod', '--frozen-lockfile', '--config.node-linker=hoisted'];
execFileSync('pnpm', installArgs, {
  cwd: appDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CI: 'true' }
});

console.log(`[3/3] Baixando o Node.js oficial (${NODE_PLATFORM}-${targetArch})…`);
const index = await fetch('https://nodejs.org/dist/index.json').then(res => res.json());
const latest = index.find(entry => entry.version.startsWith('v24.'));
if (!latest) throw new Error('Nenhuma versão do Node 24 encontrada no índice oficial.');
const version = latest.version;
const archiveName = `node-${version}-${NODE_PLATFORM}-${targetArch}.${ARCHIVE_EXT}`;
const archiveUrl = `https://nodejs.org/dist/${version}/${archiveName}`;
const tmpArchive = path.join(resources, archiveName);
const response = await fetch(archiveUrl);
if (!response.ok) throw new Error(`Falha ao baixar ${archiveUrl}: HTTP ${response.status}`);
fs.writeFileSync(tmpArchive, Buffer.from(await response.arrayBuffer()));
const extractDir = path.join(resources, 'node-extract');
extractArchive(tmpArchive, extractDir);
const extracted = path.join(extractDir, `node-${version}-${NODE_PLATFORM}-${targetArch}`);
const binaryRelative = targetPlatform === 'win32' ? NODE_BIN : path.join('bin', NODE_BIN);
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(path.join(extracted, binaryRelative), path.join(nodeDir, NODE_BIN));
if (targetPlatform !== 'win32') fs.chmodSync(path.join(nodeDir, NODE_BIN), 0o755);
fs.copyFileSync(path.join(extracted, 'LICENSE'), path.join(nodeDir, 'LICENSE'));
rmrf(extractDir);
fs.rmSync(tmpArchive);

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
console.log(`\nRecursos prontos para ${TARGET}:`);
console.log(`  app/   ${mb(appSize)} MB (servidor + interface + dependências de produção)`);
console.log(`  node/  ${mb(nodeSize)} MB (Node ${version} ${NODE_PLATFORM}-${targetArch})`);
console.log(`  total  ${mb(appSize + nodeSize)} MB`);
