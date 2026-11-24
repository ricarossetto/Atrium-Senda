#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    source: { type: 'string' },
    appimage: { type: 'string' },
    'desktop-entry': { type: 'string' },
    icon: { type: 'string' },
    version: { type: 'string' },
    output: { type: 'string' }
  },
  allowPositionals: false,
  strict: true
});

function fail(message) {
  console.error(`[arch-pkgbuild] ${message}`);
  process.exit(1);
}

const required = ['source', 'appimage', 'desktop-entry', 'icon', 'version', 'output'];
for (const option of required) {
  if (!values[option]) fail(`Informe --${option}.`);
}

const version = values.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`Versão inválida: ${version}. Use o formato X.Y.Z.`);
}

const sourcePath = path.resolve(values.source);
const outputPath = path.resolve(values.output);
if (sourcePath === outputPath) fail('A saída deve ser diferente do PKGBUILD-fonte.');

async function sha256(filePath) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) fail(`Arquivo não encontrado: ${filePath}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n');
const versionMatches = [...source.matchAll(/^pkgver=(.*)$/gm)];
if (versionMatches.length !== 1) fail('O PKGBUILD-fonte deve conter uma única linha pkgver.');
if (versionMatches[0][1].trim() !== version) {
  fail(`O PKGBUILD-fonte está em ${versionMatches[0][1].trim()}, mas o release é ${version}.`);
}

const sumsMatches = [...source.matchAll(/^sha256sums=\([^)]*\)/gm)];
if (sumsMatches.length !== 1) fail('O PKGBUILD-fonte deve conter um único bloco sha256sums.');

const [appimageSum, desktopEntrySum, iconSum] = await Promise.all([
  sha256(path.resolve(values.appimage)),
  sha256(path.resolve(values['desktop-entry'])),
  sha256(path.resolve(values.icon))
]);

const templateNotice = '# PKGBUILD de modelo: os hashes zerados impedem a instalação direta.\n'
  + '# Use o PKGBUILD anexado à release, gerado com as somas reais dos três arquivos.\n';
const generatedNotice = `# Gerado pelo workflow de release para os artefatos ${version}.\n`;
const sums = `sha256sums=('${appimageSum}'\n             '${desktopEntrySum}'\n             '${iconSum}')`;

const output = source
  .replace(templateNotice, generatedNotice)
  .replace(/^pkgver=.*$/m, `pkgver=${version}`)
  .replace(/^sha256sums=\([^)]*\)/m, sums);

if (output.includes('SKIP')) fail('O PKGBUILD final ainda contém SKIP.');
if (!output.includes(generatedNotice)) fail('Não foi possível substituir o aviso de modelo no PKGBUILD final.');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`[arch-pkgbuild] ${outputPath} gerado com as somas SHA-256 da versão ${version}.`);
