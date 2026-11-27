import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plural, contar } from '../lib/plural.mjs';
import * as web from '../js/core/plural.js';

for (const mod of [{ plural, contar }, web]) {
  assert.equal(mod.plural(1, 'publicação', 'publicações'), 'publicação');
  assert.equal(mod.plural(0, 'publicação', 'publicações'), 'publicações');
  assert.equal(mod.plural(7, 'lida', 'lidas'), 'lidas');
  assert.equal(mod.plural('1', 'item', 'itens'), 'item');
  assert.equal(mod.contar(1, 'termo', 'termos'), '1 termo');
  assert.equal(mod.contar(3, 'processo', 'processos'), '3 processos');
  assert.equal(mod.contar(undefined, 'erro', 'erros'), '0 erros');
}

// Textos de e-mail e de integrações judiciais não podem voltar a usar plural com parênteses.
const guarded = [
  'lib/email/email-service.mjs',
  'lib/notifications/templates/email-templates.mjs',
  'lib/judicial/eproc-a1-downloader.mjs',
  'lib/judicial/domicilio/domicilio-portal.mjs',
  'lib/judicial/eproc/sync/report-sync.mjs',
  'lib/http/judicial-routes.mjs',
  'lib/http/tjrs-sidecar-routes.mjs',
  'lib/http/documents-routes.mjs',
  'server.mjs',
  'js/features/judicial-integrations.js',
  'js/features/calculations.js',
  'js/features/configuration.js',
  'js/features/tasks.js',
  'js/views/ui-v2/calculations-presenter.js',
  'js/views/ui-v2/calculations-civel-suite.js',
  'js/views/ui-v2/financial-chart.js'
];
for (const file of guarded) {
  const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const hit = /(?<![.\w])(?!test|http)\p{L}{3,}\((?:s|ões|ns|is|es)\)/u.exec(src);
  assert.equal(hit, null, `${file} ainda usa plural com parênteses: ${hit?.[0]}`);
}
console.log('PASS plural contract');
