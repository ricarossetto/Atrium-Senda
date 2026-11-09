import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM — POSICIONAMENTO DA SEÇÃO PJe NO MODAL JUDICIAL      ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');

const backdropIndex = html.indexOf('id="judicialSetupBackdrop"');
assert.ok(backdropIndex > 0, 'judicialSetupBackdrop precisa existir');
const nextBackdrop = html.indexOf('class="modal-backdrop', backdropIndex + 1);
assert.ok(nextBackdrop > backdropIndex, 'precisa existir o próximo backdrop após o judicial');

const coverageListIndex = html.indexOf('id="managedCoverageList"');
assert.ok(coverageListIndex > backdropIndex && coverageListIndex < nextBackdrop, 'managedCoverageList precisa estar dentro do modal judicial');

const sectionIndex = html.indexOf('id="pjeCoverageSection"');
assert.ok(sectionIndex > 0, 'pjeCoverageSection precisa existir');
assert.ok(sectionIndex > coverageListIndex, 'pjeCoverageSection deve vir depois de managedCoverageList');
assert.ok(sectionIndex < nextBackdrop, 'pjeCoverageSection deve estar DENTRO do judicialSetupBackdrop');
assert.ok(html.slice(Math.max(0, sectionIndex - 120), sectionIndex).includes('<details'), 'pjeCoverageSection precisa ser um <details>');
assert.equal(html.indexOf('id="pjeIntegrationsSection"'), -1, 'a seção órfã pjeIntegrationsSection não pode permanecer no index.html');

const pjeIds = [
  'pjeEnabledToggle', 'pjeAutomaticSyncToggle', 'pjeSyncIntervalInput', 'pjeRuntimeSelect',
  'pjeConfigSave', 'pjePortalsGrid', 'pjeCommunicationsPanel', 'pjeCommunicationsList',
  'pjeCommunicationsPager'
];
for (const id of pjeIds) {
  const first = html.indexOf(`id="${id}"`);
  const last = html.lastIndexOf(`id="${id}"`);
  assert.ok(first > 0, `${id} precisa existir no index.html`);
  assert.equal(first, last, `${id} não pode estar duplicado`);
  assert.ok(first > sectionIndex && first < nextBackdrop, `${id} deve estar dentro de pjeCoverageSection, no modal judicial`);
}

// A view de integrações continua sendo o ponto de entrada do modal oficial.
const viewStart = html.indexOf('id="view-integrations"');
assert.ok(viewStart > 0, 'view-integrations precisa existir');
const nextView = html.indexOf('<section class="view"', viewStart + 1);
assert.ok(nextView > viewStart, 'precisa existir a próxima view após integrations');
const guideIndex = html.indexOf('id="certificateGuideButton"');
assert.ok(guideIndex > viewStart && guideIndex < nextView, 'gatilho do modal deve permanecer na view de integrações');
assert.match(html.slice(0, viewStart), /<section class="view active" id="view-dashboard"/, 'dashboard segue como view inicial');

console.log('  ✓ Seção PJe montada no modal oficial, após a cobertura, sem ids duplicados e com o gatilho preservado.');

console.log('\n>>> POSICIONAMENTO SEÇÃO PJe: PASS <<<\n');
