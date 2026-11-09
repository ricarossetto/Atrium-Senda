import assert from 'node:assert/strict';
import { assertReadOnlyEprocTarget } from '../lib/judicial/managed-connectivity.mjs';
import { isEnrichmentMarked, parseEprocCnj, selectEprocSweepTargets } from '../lib/judicial/eproc-a1-downloader.mjs';
import { getEprocPortalById, isEprocPortalLiveSyncVerified } from '../lib/judicial/eproc/portal-registry.mjs';

for (const id of ['jfrs-eproc-1g', 'trf4-eproc-2g']) {
  const portal = getEprocPortalById(id);
  assert.equal(portal.auth.totp, true, 'Federal SSO must load the configured TOTP credential');
  assert.equal(portal.auth.mtlsOrigin, 'https://eproc-sso-certificado.trf4.jus.br');
  assert.equal(isEprocPortalLiveSyncVerified(id), false, 'Auth support is not live-sync verification');
}

assert.doesNotThrow(() => assertReadOnlyEprocTarget({
  operation: 'navigateReadOnly',
  url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar'
}));
assert.doesNotThrow(() => assertReadOnlyEprocTarget({
  operation: 'navigateReadOnly',
  url: 'https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=processo_listar'
}));
assert.doesNotThrow(() => assertReadOnlyEprocTarget({
  operation: 'navigateReadOnly',
  url: 'https://eproc.trf4.jus.br/eproc2trf4/controlador.php?acao=processo_listar'
}));
assert.throws(() => assertReadOnlyEprocTarget({
  operation: 'navigateReadOnly',
  url: 'https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=protocolar_peticao'
}), /Ação eproc bloqueada/);

assert.equal(isEnrichmentMarked({ number: '0000000-00.2026.8.21.0001', client: '', court: 'TJRS' }), true);
assert.equal(isEnrichmentMarked({ number: '0000000-00.2026.4.04.7100', client: '', court: 'JFRS' }), false);
assert.equal(isEnrichmentMarked({ number: '0000000-00.2026.8.21.0001', client: 'Parte identificada', tags: ['Enriquecimento eproc'] }), true);
assert.equal(parseEprocCnj('0000000-00.2026.1.01.7100').justiceRegion, '101');

const tjrs1g = '0000000-00.2026.8.21.0001';
const tjrs2g = '0000000-00.2026.8.21.7000';
const jfrs1g = '0000000-00.2026.4.04.7100';
const trf4_2g = '0000000-00.2026.4.04.0000';
assert.equal(selectEprocSweepTargets([{ number: tjrs1g, client: '' }], 'tjrs-eproc-1g').length, 1);
assert.equal(selectEprocSweepTargets([{ number: tjrs2g, client: '' }], 'tjrs-eproc-2g').length, 1);
assert.equal(selectEprocSweepTargets([{ number: jfrs1g, client: '' }], 'jfrs-eproc-1g').length, 1);
assert.equal(selectEprocSweepTargets([{ number: trf4_2g, client: '' }], 'trf4-eproc-2g').length, 1);
assert.equal(selectEprocSweepTargets([{ number: '0000000-00.2026.1.01.7100', client: '' }], 'jfrs-eproc-1g').length, 0);

const marked = [1, 2, 3].map(index => ({
  number: `000000${index}-00.2026.8.21.000${index}`,
  client: 'Parte identificada',
  tags: ['Enriquecimento eproc']
}));
const ordinary = [4, 5, 6].map(index => ({ number: `000000${index}-00.2026.8.21.000${index}`, client: 'Parte identificada' }));
const selected = selectEprocSweepTargets([...marked, ...ordinary], 'tjrs-eproc-1g', { maxProcesses: 1 });
assert.equal(selected.length, 4, 'Todos os explicitamente marcados devem ser processados, preservando o limite apenas para candidatos automáticos.');
assert.deepEqual(selected.slice(0, 3), marked);
const explicitlyTaggedComplete = {
  number: '0000007-00.2026.8.21.0007',
  client: 'Parte identificada',
  judge: 'Juízo Teste',
  court: 'TJRS',
  actionClass: 'Classe Teste',
  accessKey: 'synthetic-key',
  opposingParty: 'Parte Contrária Teste',
  tags: ['Enriquecimento eproc']
};
assert.deepEqual(
  selectEprocSweepTargets([explicitlyTaggedComplete], 'tjrs-eproc-1g', { maxProcesses: 0 }),
  [explicitlyTaggedComplete],
  'Tag explícita Enriquecimento eproc não pode ser cortada pelo limite dos demais candidatos.'
);

assert.equal(isEprocPortalLiveSyncVerified('tjrs-eproc-1g'), true);
for (const portalId of ['tjrs-eproc-2g', 'jfrs-eproc-1g', 'trf4-eproc-2g', 'jfsc-eproc-1g', 'jfpr-eproc-1g']) {
  assert.equal(isEprocPortalLiveSyncVerified(portalId), false);
}

console.log('EPROC MULTITRIBUNAL ROUTING/GATE: PASS');
