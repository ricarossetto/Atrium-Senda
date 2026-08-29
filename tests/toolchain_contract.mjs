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
assert.match(starter, /corepack enable/);
assert.match(starter, /corepack prepare pnpm@11\.19\.0 --activate/);
assert.match(starter, /pnpm install --frozen-lockfile/);
assert.match(starter, /pnpm start/);
assert.doesNotMatch(starter, /\bnpm\s+install\b/i);
assert.doesNotMatch(starter, /\bpnpm\s+(?:add|update|up|remove)\b|--no-frozen-lockfile/i);

console.log('✓ Node 24, pnpm 11.19.0 e frozen lock estão alinhados entre pacote, CI e starter Windows.');
