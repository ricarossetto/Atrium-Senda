import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');

assert.match(pkg.engines?.node || '', /^>=24(?:\.0){0,2}$/);
assert.equal(pkg.packageManager, 'pnpm@11.19.0');
assert.equal(pkg.scripts.start, 'node server.mjs');

const setupNodeVersions = [...workflow.matchAll(/node-version:\s*['"]?(\d+)/g)].map(match => Number(match[1]));
assert.ok(setupNodeVersions.length >= 3 && setupNodeVersions.every(version => version === 24));
assert.match(workflow, /corepack prepare pnpm@11\.19\.0 --activate/);
assert.ok((workflow.match(/pnpm install --frozen-lockfile/g) || []).length >= 3);
for (const name of ['ci.yml', 'ci-fast.yml', 'ci-judicial.yml', 'ci-ui.yml']) {
  const source = await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
  assert.match(source, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(source, /^  (?:push|pull_request):/m);
}
assert.match(workflow, /node tests\/judicial_sandbox\.mjs/);
for (const extension of ['bat', 'cmd', 'ps1']) assert.match(attributes, new RegExp(`^\\*\\.${extension} text eol=crlf$`, 'm'));

// Edição aberta: launchers end-user presentes e funcionais; CI do desktop publica releases.
for (const path of ['ATRIUM.bat', 'install.ps1', 'scripts/windows/atrium-bootstrap.ps1', 'scripts/windows/atrium-server.ps1', 'scripts/windows/iniciar-atrium.bat', 'scripts/windows/instalar-atrium.bat', 'scripts/windows/iniciar-coletor.bat']) {
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path}: launcher end-user deve estar presente`);
}
for (const path of ['collector/install-scheduler.ps1', 'collector/run-collector.ps1']) {
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path}: ferramenta técnica preservada`);
}
assert.equal(existsSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url)), true, 'release do aplicativo desktop deve existir');
assert.equal(existsSync(new URL('../desktop/src-tauri/tauri.conf.json', import.meta.url)), true, 'empacotamento Tauri deve existir');

console.log('Toolchain da edição aberta: Node 24, pnpm congelado, workflows manuais, launchers locais e desktop publicáveis.');
