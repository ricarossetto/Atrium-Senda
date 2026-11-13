import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const readme = await read('README.md');
const index = await read('index.html');
const server = await read('server.mjs');
const dockerfile = await read('Dockerfile');
const compose = await read('docker-compose.yml');

assert.equal(pkg.version, '3.1.0');
// Cadeia de entrada com a versão do pacote: sem isso, navegador com cache antigo segue
// executando os módulos antigos (o HTML e o bootstrap são reusados).
const bootstrap = await read('js/app/bootstrap.js');
const escapeVersion = value => value.replace(/\./g, '\\.');
assert.match(index, new RegExp(`js/app/bootstrap\\.js\\?v=${escapeVersion(pkg.version)}`), 'index.html aponta o bootstrap na versão publicada');
assert.match(bootstrap, new RegExp(`portal\\.js\\?v=${escapeVersion(pkg.version)}`), 'bootstrap aponta o portal na versão publicada');

// Desktop multiplataforma: a versão do bundle acompanha o pacote e os alvos
// Linux/macOS fazem parte do contrato de release.
const tauri = JSON.parse(await read('desktop/src-tauri/tauri.conf.json'));
assert.equal(tauri.version, pkg.version, 'tauri.conf.json acompanha a versão do pacote');
assert.equal(typeof tauri.bundle.macOS, 'object', 'bundle macOS configurado');
assert.equal(typeof tauri.bundle.linux, 'object', 'bundle Linux configurado');
assert.equal(tauri.bundle.icon.includes('icons/icon.icns'), true, 'ícone .icns presente para o macOS');
for (const path of ['packaging/linux/install.sh', 'packaging/linux/atrium-senda.desktop', 'packaging/arch/PKGBUILD']) {
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path}: instalador multiplataforma presente`);
}
const desktopResources = await read('desktop/scripts/build-desktop-resources.mjs');
assert.match(desktopResources, /darwin/, 'staging baixa Node para macOS');
assert.match(desktopResources, /linux/, 'staging baixa Node para Linux');
assert.match(desktopResources, /win32-arm64/, 'staging baixa Node para Windows ARM64');
const releaseWorkflow = await read('.github/workflows/desktop-release.yml');
assert.match(releaseWorkflow, /ubuntu-22\.04/, 'release compila Linux em Ubuntu 22.04');
assert.match(releaseWorkflow, /windows-11-arm/, 'release compila Windows ARM64 em runner ARM');
assert.match(releaseWorkflow, /win32-arm64/, 'release empacota Node win-arm64');
assert.match(releaseWorkflow, /macos-15/, 'release compila macOS em runner Apple');
assert.match(releaseWorkflow, /darwin-arm64/, 'release cobre Apple Silicon');
assert.match(releaseWorkflow, /darwin-x64/, 'release cobre macOS Intel');
assert.equal(pkg.packageManager, 'pnpm@11.19.0');
assert.match(pkg.engines.node, /^>=24/);
assert.match(server, /GIT_SHA\s*=\s*'unknown'/);
assert.doesNotMatch(server, /GIT_SHA\s*=\s*'[0-9a-f]{40}'/);
assert.doesNotMatch(index, /id="uiModeControl"|data-ui-mode=/);
assert.match(index, /ATRIUM/);
assert.match(readme, /Atrium-Senda/, 'README aponta o repositório aberto');
assert.doesNotMatch(readme, /atrium-pro\.git/);
// Instaladores de end-user estão presentes na edição aberta (desktop + manual)
for (const path of ['ATRIUM.bat', 'install.ps1', 'scripts/windows/atrium-bootstrap.ps1', 'desktop/src-tauri/tauri.conf.json']) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true);
for (const path of ['collector/install-scheduler.ps1', 'collector/run-collector.ps1']) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true);
for (const path of ['docs/CHANGELOG.md', 'docs/INSTALLATION.md', 'docs/USER_MANUAL.md', 'docs/ARCHITECTURE.md', 'specs/README.md']) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true);
assert.match(dockerfile, /^FROM node:24-alpine/m);
assert.match(dockerfile, /pnpm install --prod --frozen-lockfile/);
assert.match(compose, /AUTH_SESSION_SECRET=\$\{AUTH_SESSION_SECRET:\?/);
assert.match(compose, /AUTH_ENCRYPTION_KEY=\$\{AUTH_ENCRYPTION_KEY:\?/);
console.log(`Contrato da edição aberta: runtime e documentos presentes; launchers locais disponíveis; versão ${pkg.version} verificada.`);
