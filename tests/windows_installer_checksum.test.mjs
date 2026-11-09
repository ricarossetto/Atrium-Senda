import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// Edição aberta: o instalador de end-user é parte do produto (desktop + lançador manual).
for (const path of ['ATRIUM.bat', 'install.ps1', 'scripts/windows/atrium-bootstrap.ps1', 'scripts/windows/atrium-server.ps1', 'scripts/windows/iniciar-atrium.bat', 'scripts/windows/instalar-atrium.bat', 'scripts/windows/iniciar-coletor.bat']) {
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path}: lançador Windows end-user deve estar presente`);
}
for (const path of ['collector/install-scheduler.ps1', 'collector/run-collector.ps1']) {
  assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path}: script técnico permanece`);
}
const installer = await readFile(new URL('../install.ps1', import.meta.url), 'utf8');
assert.match(installer, /v3\.0\.2/, 'install.ps1 deve preparar a release v3.0.2');
console.log('Lançador Windows presente e coerente com a release v3.0.2.');
