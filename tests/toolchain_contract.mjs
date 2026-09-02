import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

console.log('\n=== CONTRATO CANÔNICO DE TOOLCHAIN ===\n');

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const launcher = await readFile(new URL('../ATRIUM.bat', import.meta.url), 'utf8');
const legacyWrapper = await readFile(new URL('../iniciar-atrium.bat', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('../scripts/windows/atrium-bootstrap.ps1', import.meta.url), 'utf8');
const serverLauncher = await readFile(new URL('../scripts/windows/atrium-server.ps1', import.meta.url), 'utf8');
const installer = await readFile(new URL('../install.ps1', import.meta.url), 'utf8');
const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

assert.match(pkg.engines?.node || '', /^>=24(?:\.0){0,2}$/);
assert.equal(pkg.packageManager, 'pnpm@11.19.0');

const setupNodeVersions = [...workflow.matchAll(/node-version:\s*['"]?(\d+)/g)].map(match => Number(match[1]));
assert.ok(setupNodeVersions.length >= 3 && setupNodeVersions.every(version => version === 24), 'Todos os jobs devem usar Node 24.');
assert.match(workflow, /corepack prepare pnpm@11\.19\.0 --activate/);
assert.ok((workflow.match(/pnpm install --frozen-lockfile/g) || []).length >= 3, 'Cada job deve instalar pelo lockfile congelado.');

assert.match(launcher, /chcp 65001/i);
assert.match(launcher, /pushd "%~dp0"/i);
assert.match(launcher, /--doctor/i);
assert.match(launcher, /--install-only/i);
assert.match(launcher, /scripts\\windows\\atrium-bootstrap\.ps1/i);
assert.match(launcher, /if not "%ATRIUM_EXIT%"=="0"/i);
assert.match(launcher, /\bpause\b/i);
assert.match(legacyWrapper, /call "%~dp0ATRIUM\.bat" %\*/i);

assert.match(attributes, /^\*\.bat text eol=crlf$/m);
assert.match(attributes, /^\*\.cmd text eol=crlf$/m);
assert.match(attributes, /^\*\.ps1 text eol=crlf$/m);

assert.match(installer, /archive\/refs\/tags\/\$ReleaseTag\.zip/);
assert.match(installer, /LocalApplicationData/);
assert.match(installer, /preservando \.env, \.env\.collector e data/i);
assert.match(installer, /scripts\\windows\\atrium-bootstrap\.ps1/i);
assert.match(installer, /scripts\\windows\\atrium-server\.ps1/i);
assert.match(installer, /archive\/refs\/heads\/\$SourceRef\.zip/);
assert.match(installer, /WScript\.Shell/);

assert.match(bootstrap, /process\.versions\.node/);
assert.match(bootstrap, /\$RequiredNodeMajor\s*=\s*24/);
assert.match(bootstrap, /\$RequiredPnpm\s*=\s*'11\.19\.0'/);
assert.match(bootstrap, /OpenJS\.NodeJS\.LTS/);
assert.match(bootstrap, /winget \$verb/);
assert.match(bootstrap, /Refresh-ProcessPath/);
assert.match(bootstrap, /corepack enable/);
assert.match(bootstrap, /corepack prepare "pnpm@\$RequiredPnpm" --activate/);
assert.match(bootstrap, /corepack --version/);
assert.match(bootstrap, /corepack pnpm --version/);
assert.match(bootstrap, /corepack pnpm install --frozen-lockfile/);
assert.match(bootstrap, /chromium\.executablePath\(\)/);
assert.match(bootstrap, /corepack pnpm exec playwright install chromium/);
assert.match(bootstrap, /\/api\/auth\/status/);
assert.match(serverLauncher, /corepack pnpm start/);
assert.match(bootstrap, /Get-AtriumServerState/);
assert.match(bootstrap, /Wait-AtriumHealthy/);

for (const source of [launcher, legacyWrapper, bootstrap, serverLauncher, installer]) {
  assert.doesNotMatch(source, /\brunas\b|net\s+session/i, 'O inicializador não pode exigir elevação administrativa própria.');
  assert.doesNotMatch(source, /\bnpm\s+install\b/i);
  assert.doesNotMatch(source, /\bpnpm\s+(?:add|update|up|remove)\b|--no-frozen-lockfile/i);
  assert.doesNotMatch(source, /collector[\\/](?:agent|start)|pnpm\s+collector/i, 'O inicializador não pode ativar o coletor judicial automaticamente.');
}

console.log('✓ ATRIUM.bat usa Node 24 + Corepack/pnpm 11.19.0, lockfile congelado, Chromium idempotente e start único sem coletor.');
