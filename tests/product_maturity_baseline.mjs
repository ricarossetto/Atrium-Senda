import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = relative => readFile(path.join(ROOT, relative), 'utf8');

const [searchSpec, documentSpec, davSpec, apiSpec, roadmap, baseline, packageSource, license, serverSource, davSource, searchSource, intelligenceSource, storageSource] = await Promise.all([
  read('specs/full-text-search.md'),
  read('specs/document-management.md'),
  read('specs/dav-integrations.md'),
  read('specs/api-evolution.md'),
  read('docs/development/ROADMAP.md'),
  read('docs/development/PRODUCT_MATURITY_BASELINE.md'),
  read('package.json'),
  read('LICENSE'),
  read('server.mjs'),
  read('lib/dav/dav-integration-service.mjs'),
  read('lib/search-index.mjs'),
  read('lib/documents/document-intelligence.mjs'),
  read('lib/documents/document-storage-provider.mjs')
]);

assert.match(searchSpec, /Status: \*\*CURRENT\*\*/);
assert.match(searchSpec, /DERIVED \/ REBUILDABLE/i);
assert.match(searchSpec, /Nenhuma persistência canônica nova/i);
assert.match(documentSpec, /provider CURRENT é local, privado e cifrado/i);
assert.match(documentSpec, /\*\*FUTURE\*\* para classificação, versionamento e colaboração avançada/i);
assert.doesNotMatch(documentSpec, /- CURRENT: classificação automática/i);
assert.match(davSpec, /EXPERIMENTAL \/ UNVERIFIED/i);
assert.match(davSpec, /não existe timer, sync bidirecional ou reconciliação automática/i);
assert.match(apiSpec, /POLICY-ONLY \/ FUTURE/i);
assert.match(apiSpec, /publicApi: false|nenhuma rota atual/i);

for (const gate of ['26D', '26E', '26F', '26G']) assert.match(roadmap, new RegExp(`Gate ${gate}:`));
assert.match(baseline, /Trabalho genuinamente futuro/i);
assert.match(baseline, /não altera `main`, visibilidade, LICENSE nem cria release/i);

const pkg = JSON.parse(packageSource);
assert.equal(pkg.license, 'MIT');
assert.match(license, /MIT License/i);
assert.doesNotMatch(serverSource, /dav-integration-service/, 'DAV experimental não pode ganhar exposição HTTP incidental.');
assert.doesNotMatch(searchSource, /node:fs|writeFile|appendFile/, 'Índice derivado não pode persistir plaintext.');
assert.match(intelligenceSource, /finally\s*\{[\s\S]*?rm\(directory, \{ recursive: true, force: true \}\)/);
assert.match(storageSource, /\^\[a-f0-9\]\{64\}\$/);
assert.match(davSource, /responseLimit/);
assert.match(davSource, /isPrivateAddress/);
assert.match(davSource, /AbortSignal\.timeout/);

async function executableSources(directory) {
  const entries = await readdir(path.join(ROOT, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await executableSources(relative));
    else if (/\.(?:m?js|css|html|svg)$/i.test(entry.name)) files.push(relative);
  }
  return files;
}

const executableFiles = ['server.mjs', ...await executableSources('lib'), ...await executableSources('js')];
const executableText = (await Promise.all(executableFiles.map(read))).join('\n');
assert.doesNotMatch(executableText, /j-?lawyer|GNU AFFERO|AGPL/i, 'Baseline não pode incorporar implementação ou marca AGPL concorrente.');
assert.doesNotMatch(executableText, /BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY|BEGIN CERTIFICATE/);

console.log('✓ Product maturity baseline: specs verdadeiras, limites futuros, segurança, MIT e clean-room PASS.');
