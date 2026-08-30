import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

console.log('\n=== CONTRATO CANÔNICO DE TOOLCHAIN ===\n');

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const starter = await readFile(new URL('../iniciar-atrium.bat', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

assert.match(pkg.engines?.node || '', /^>=24(?:\.0){0,2}$/);
assert.equal(pkg.packageManager, 'pnpm@11.19.0');

const setupNodeVersions = [...workflow.matchAll(/node-version:\s*['"]?(\d+)/g)].map(match => Number(match[1]));
assert.ok(setupNodeVersions.length >= 3 && setupNodeVersions.every(version => version === 24), 'Todos os jobs devem usar Node 24.');
assert.match(workflow, /corepack prepare pnpm@11\.19\.0 --activate/);
assert.ok((workflow.match(/pnpm install --frozen-lockfile/g) || []).length >= 3, 'Cada job deve instalar pelo lockfile congelado.');

assert.match(starter, /process\.versions\.node/);
assert.match(starter, /LSS 24/);
assert.match(starter, /corepack --version/);
assert.match(starter, /corepack pnpm --version/);
assert.doesNotMatch(starter, /corepack enable/);
assert.doesNotMatch(starter, /corepack prepare/);
assert.match(starter, /corepack pnpm install --frozen-lockfile/);
assert.match(starter, /chromium\.executablePath\(\)/);
assert.match(starter, /corepack pnpm exec playwright install chromium/);
assert.match(starter, /corepack pnpm start/);
assert.doesNotMatch(starter, /call\s+pnpm\b/i);
assert.doesNotMatch(starter, /\brunas\b|net\s+session/i, 'Starter não pode exigir elevação administrativa.');
assert.doesNotMatch(starter, /Reinstale o Node/i, 'Falha do Corepack não pode acusar falsamente instalação quebrada do Node.');
assert.doesNotMatch(starter, /\bnpm\s+install\b/i);
assert.doesNotMatch(starter, /\bpnpm\s+(?:add|update|up|remove)\b|--no-frozen-lockfile/i);

console.log('✓ Starter Windows usa Node 24 + corepack pnpm diretamente, frozen lock e Chromium idempotente sem elevação.');
