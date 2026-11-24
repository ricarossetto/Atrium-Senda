import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
const sourcePath = path.join(ROOT, 'packaging/arch/PKGBUILD');
const source = fs.readFileSync(sourcePath, 'utf8');
const workflow = read('.github/workflows/desktop-release.yml');

assert.match(source, new RegExp(`^pkgver=${version.replace(/\./g, '\\.')}$`, 'm'));
const sourceSums = source.match(/^sha256sums=\([^)]*\)/m)?.[0] || '';
const invalidTemplateSums = ['0'.repeat(64), '0'.repeat(64), '0'.repeat(64)];
assert.deepEqual([...sourceSums.matchAll(/'([^']+)'/g)].map(match => match[1]), invalidTemplateSums);
assert.doesNotMatch(source, /SKIP/);
assert.match(workflow, /node scripts\/generate-arch-pkgbuild\.mjs/);
assert.match(workflow, /--output dist\/PKGBUILD/);
const releaseFiles = workflow.match(/files: \|([\s\S]*?)(?:\n\s{8}\S|\n\s{6}\S|$)/)?.[1] || '';
assert.match(releaseFiles, /dist\/PKGBUILD/);
assert.doesNotMatch(releaseFiles, /packaging\/arch\/PKGBUILD/);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-senda-release-3.3.1-pkgbuild-'));
const fixture = {
  appimage: path.join(temporaryDirectory, `ATRIUM_${version}_amd64.AppImage`),
  desktopEntry: path.join(temporaryDirectory, 'atrium-senda.desktop'),
  icon: path.join(temporaryDirectory, 'icon.png')
};
const contents = {
  appimage: Buffer.from('AppImage sintético para teste do gerador\n'),
  desktopEntry: Buffer.from('[Desktop Entry]\nName=ATRIUM Teste\n'),
  icon: Buffer.from('PNG sintético\n')
};
for (const [key, filePath] of Object.entries(fixture)) fs.writeFileSync(filePath, contents[key]);

const outputPath = path.join(temporaryDirectory, 'dist', 'PKGBUILD');
const generatorPath = path.join(ROOT, 'scripts/generate-arch-pkgbuild.mjs');
const args = [
  generatorPath,
  '--source', sourcePath,
  '--appimage', fixture.appimage,
  '--desktop-entry', fixture.desktopEntry,
  '--icon', fixture.icon,
  '--version', version,
  '--output', outputPath
];

try {
  const generated = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  assert.equal(generated.error, undefined, generated.error?.message);
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);

  const output = fs.readFileSync(outputPath, 'utf8');
  const expectedSums = Object.values(contents).map(content => createHash('sha256').update(content).digest('hex'));
  const generatedSums = [...(output.match(/^sha256sums=\([^)]*\)/m)?.[0] || '').matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(generatedSums, expectedSums);
  assert.match(output, new RegExp(`^pkgver=${version.replace(/\./g, '\\.')}$`, 'm'));
  assert.doesNotMatch(output, /SKIP/);
  assert.match(output, new RegExp(`# Gerado pelo workflow de release para os artefatos ${version.replace(/\./g, '\\.')}\.`));
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source, 'O PKGBUILD-fonte não pode ser alterado pelo gerador.');

  const rejectedOutput = path.join(temporaryDirectory, 'dist', 'PKGBUILD-incorreto');
  const rejected = spawnSync(process.execPath, [
    ...args.slice(0, -4),
    '--version', '9.9.9',
    '--output', rejectedOutput
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /PKGBUILD-fonte está em/);
  assert.equal(fs.existsSync(rejectedOutput), false);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`PKGBUILD de release gerado com hashes sintéticos da versão ${version}, sem SKIP e sem alterar o modelo.`);
