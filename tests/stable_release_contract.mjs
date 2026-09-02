import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8').replace(/^\uFEFF/, '');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const index = read('index.html');
const server = read('server.mjs');
const dockerfile = read('Dockerfile');
const compose = read('docker-compose.yml');
const installer = read('install.ps1');

assert.equal(pkg.version, '2.0.0');
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.packageManager, 'pnpm@11.19.0');
assert.match(pkg.engines.node, /^>=24/);
assert.match(pkg.description, /ATRIUM 2\.0/);
assert.match(server, /let APP_VERSION\s*=\s*'2\.0\.0'/);
assert.match(server, /pkg\.version\) APP_VERSION = pkg\.version/);
assert.doesNotMatch(index, /id="uiModeControl"|data-ui-mode=/);
assert.match(index, /ATRIUM/);
assert.match(installer, /\[string\]\$ReleaseTag\s*=\s*'v2\.0\.0'/);
assert.match(installer, /\$Repository\s*=\s*'ricarossetto\/Atrium-Senda'/);
assert.match(installer, /archive\/refs\/tags\/\$ReleaseTag\.zip/);
assert.match(installer, /archive\/refs\/heads\/\$SourceRef\.zip/);
assert.doesNotMatch(installer, /\$PSScriptRoot|\bexit\b/i);

for (const heading of [
  'O que é o ATRIUM', 'Funcionalidades', 'Descoberta judicial', 'Inteligência cadastral brasileira',
  'Segurança', 'Instalação rápida no Windows', 'Instalação manual', 'Armazenamento de dados',
  'Backup e restauração', 'Testes e CI', 'Limitações conhecidas', 'Documentação', 'Licença'
]) {
  assert.match(readme, new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `README sem seção ${heading}.`);
}
assert.match(readme, /\[!\[Node\.js 24\]/);
assert.match(readme, /pnpm 11\.19\.0/);
assert.match(readme, /license-MIT/);
assert.match(readme, /ATRIUM\.bat/);
assert.doesNotMatch(readme, /\bBeta\b|versão beta/i, 'README público deve apresentar a versão estável.');

const requiredDocs = [
  'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/INSTALLATION.md', 'docs/USER_MANUAL.md',
  'docs/ARCHITECTURE.md', 'docs/RELEASE_NOTES_2.0.0.md'
];
for (const file of requiredDocs) assert.equal(existsSync(path.join(ROOT, file)), true, `${file} ausente.`);
assert.match(read('CHANGELOG.md'), /## \[2\.0\.0\] - 2026-09-02/);
assert.match(read('docs/RELEASE_NOTES_2.0.0.md'), /^# ATRIUM 2\.0\.0 — Stable Release 1/m);
assert.match(read('SECURITY.md'), /Divulgação responsável/);

const markdownFiles = ['README.md', ...requiredDocs];
for (const file of markdownFiles) {
  const source = read(file);
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    assert.equal(existsSync(path.resolve(path.dirname(path.join(ROOT, file)), target)), true, `${file}: link local quebrado ${target}.`);
  }
}

const screenshots = [
  'dashboard-light.png', 'dashboard-dark.png', 'publications-workspace.png',
  'process-inspector.png', 'contacts-registry.png', 'integrations.png'
];
for (const name of screenshots) {
  const file = path.join(ROOT, 'docs/assets/screenshots', name);
  const png = readFileSync(file);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${name} não é PNG.`);
  assert.ok(png.readUInt32BE(16) >= 1200, `${name} tem largura insuficiente.`);
  assert.ok(png.readUInt32BE(20) >= 700, `${name} tem altura insuficiente.`);
}

assert.match(dockerfile, /^FROM node:24-alpine/m);
assert.match(dockerfile, /pnpm@11\.19\.0/);
assert.match(dockerfile, /package\.json pnpm-lock\.yaml pnpm-workspace\.yaml/);
assert.match(dockerfile, /pnpm install --prod --frozen-lockfile/);
assert.match(dockerfile, /^USER node$/m);
assert.match(compose, /AUTH_SESSION_SECRET=\$\{AUTH_SESSION_SECRET:\?/);
assert.match(compose, /AUTH_ENCRYPTION_KEY=\$\{AUTH_ENCRYPTION_KEY:\?/);
assert.match(compose, /COLLECTOR_INGEST_TOKEN=\$\{COLLECTOR_INGEST_TOKEN:\?/);
for (const line of compose.split(/\r?\n/).filter(value => /(?:SECRET|KEY|TOKEN)=/.test(value))) {
  assert.match(line, /=\$\{/, 'Compose não pode conter segredo literal.');
}

console.log(`✓ Contrato de release estável: 2.0.0, documentação completa, ${screenshots.length} screenshots sintéticos, links e containers seguros PASS.`);
