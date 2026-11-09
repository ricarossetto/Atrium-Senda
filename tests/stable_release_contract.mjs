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

assert.equal(pkg.version, '3.0.2');
// Cadeia de entrada com a versão do pacote: sem isso, navegador com cache antigo segue
// executando os módulos antigos (o HTML e o bootstrap são reusados).
const bootstrap = await read('js/app/bootstrap.js');
const escapeVersion = value => value.replace(/\./g, '\\.');
assert.match(index, new RegExp(`js/app/bootstrap\\.js\\?v=${escapeVersion(pkg.version)}`), 'index.html aponta o bootstrap na versão publicada');
assert.match(bootstrap, new RegExp(`portal\\.js\\?v=${escapeVersion(pkg.version)}`), 'bootstrap aponta o portal na versão publicada');
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
