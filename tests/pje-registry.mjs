import assert from 'node:assert/strict';
import {
  PJE_PORTALS,
  PJE_CREDENTIAL_SCOPE,
  getPjePortalById,
  normalizePjePortalId,
  isPjePortalId,
  isPjeCredentialPortalId,
  getPjeCredentialScope,
  listPjePortals,
  resolvePjeCollector,
  resolvePjeRuntime,
  buildPjeClientCertificateOrigins,
  getAllowedPjeOrigins
} from '../lib/judicial/pje/portal-registry.mjs';
import { getCredentialScopeForPortal } from '../lib/judicial/eproc/portal-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — REGISTRY PJe (CATÁLOGO, ESCOPO PDPJ E RUNTIMES)     ');
console.log('===============================================================\n');

console.log('[T1] Catálogo PJe íntegro e oficial...');
assert.ok(PJE_PORTALS.length >= 50, `Esperado catálogo amplo de portais PJe; encontrados ${PJE_PORTALS.length}.`);
const ids = PJE_PORTALS.map(portal => portal.id);
assert.equal(new Set(ids).size, ids.length, 'IDs de portais PJe não podem se repetir.');
for (const portal of PJE_PORTALS) {
  const parsed = new URL(portal.url);
  assert.equal(parsed.protocol, 'https:', `Portal ${portal.id} deve usar HTTPS.`);
  assert.match(parsed.hostname, /(^|\.)jus\.br$/i, `Portal ${portal.id} deve apontar para domínio jus.br.`);
  assert.equal(portal.credentialScope, PJE_CREDENTIAL_SCOPE, `Portal ${portal.id} deve usar escopo pdpj.`);
  assert.equal(portal.requiresBrowser, true, `Portal ${portal.id} exige browser real.`);
  assert.equal(portal.enabled, false, `Portal ${portal.id} não pode nascer habilitado.`);
  assert.ok(['server', 'local_sidecar', 'auto'].includes(portal.runtime), `Runtime inválido em ${portal.id}.`);
  assert.ok(portal.trustedAuthOrigins.includes('https://sso.cloud.pje.jus.br'), `Portal ${portal.id} deve confiar no SSO PDPJ.`);
}
console.log(`  ✓ ${PJE_PORTALS.length} portais PJe válidos e desabilitados por padrão.`);

console.log('[T2] Rotas confirmadas apenas onde há evidência...');
const tjmt1 = getPjePortalById('pje-tjmt-1g');
const tjmt2 = getPjePortalById('pje-tjmt-2g');
const trt41 = getPjePortalById('pje-trt4-1g');
assert.equal(tjmt1.routeStatus, 'confirmed');
assert.equal(tjmt1.confirmedRoutes.panel, 'https://pje.tjmt.jus.br/pje/Painel/painel_usuario/advogado.seam');
assert.equal(tjmt2.routeStatus, 'confirmed');
assert.equal(tjmt2.confirmedRoutes.panel, 'https://pje2.tjmt.jus.br/pje2/Painel/painel_usuario/advogado.seam');
assert.equal(trt41.routeStatus, 'confirmed');
assert.equal(trt41.confirmedRoutes.panel, 'https://pje.trt4.jus.br/primeirograu/Painel/painel_usuario/list.seam');
assert.equal(trt41.layoutFamily, 'trabalhista');
assert.equal(getPjePortalById('pje-tjac-1g').routeStatus, 'discovery_pending', 'Portais sem evidência não podem declarar rota confirmada.');
for (const portal of listPjePortals({ routeStatus: 'discovery_pending' })) {
  assert.equal(Object.keys(portal.confirmedRoutes).length, 0, `Portal ${portal.id} sem evidência não pode ter rotas fixadas.`);
}
console.log('  ✓ TJMT 1G/2G e TRT4 1G confirmados; demais em discovery honesto.');

console.log('[T3] Resolução de collector por família...');
const collectorTjmt = resolvePjeCollector('pje-tjmt-1g');
assert.equal(collectorTjmt.collectorKey, 'standard');
assert.equal(collectorTjmt.status, 'implemented', 'Collector standard (TJMT) validado live na F1.');
const collectorTr = resolvePjeCollector('pje-trt4-1g');
assert.equal(collectorTr.collectorKey, 'trabalhista');
assert.equal(collectorTr.status, 'implemented', 'Collector trabalhista (pje-jt/TRT4) já implementado na F2.');
const collectorTse = resolvePjeCollector('pje-tse');
assert.equal(collectorTse.collectorKey, null);
assert.equal(collectorTse.status, 'pending_collector');
assert.equal(collectorTse.layoutFamily, 'eleitoral');
assert.equal(resolvePjeCollector('pje-desconhecido').status, 'unknown_portal');
console.log('  ✓ Famílias compatíveis referenciam collector; eleitoral/PJeCor ficam pending_collector.');

console.log('[T4] Runtime padrão server com fallback desenhado...');
const auto = resolvePjeRuntime(tjmt1, 'auto');
assert.equal(auto.runtime, 'server');
assert.deepEqual([...auto.fallbacks], ['local_sidecar']);
const forcedSidecar = resolvePjeRuntime(tjmt1, 'local_sidecar');
assert.equal(forcedSidecar.runtime, 'local_sidecar');
assert.deepEqual([...forcedSidecar.fallbacks], []);
assert.equal(resolvePjeRuntime(tjmt1, 'inexistente').runtime, 'server', 'Runtime inválido deve cair no padrão server.');
console.log('  ✓ server é primário; local_sidecar é fallback explícito do modo auto.');

console.log('[T5] Escopo compartilhado pdpj para todo portal PJe...');
assert.equal(getPjeCredentialScope('pje-tjmt-1g'), 'pdpj');
assert.equal(getPjeCredentialScope('pje-custom'), 'pdpj', 'Portal pje-* fora do registry também usa pdpj.');
assert.equal(getPjeCredentialScope('eproc-tjrs-1g'), null);
assert.equal(isPjeCredentialPortalId('pje-qualquer'), true);
assert.equal(isPjePortalId('pje-qualquer'), false, 'Somente IDs oficiais são "conhecidos".');
assert.equal(normalizePjePortalId('PJE-TRT4-1G'), 'pje-trt4-1g');
assert.equal(normalizePjePortalId('pje-inexistente'), null);
assert.equal(getCredentialScopeForPortal('pje-trt4-1g'), 'pdpj');
assert.equal(getCredentialScopeForPortal('pje-custom'), 'pdpj');
assert.equal(getCredentialScopeForPortal('tjrs-eproc-1g'), 'tjrs-eproc', 'Escopo eproc existente não pode mudar.');
assert.equal(getCredentialScopeForPortal('trf4-eproc-2g'), 'trf4-eproc', 'Escopo eproc existente não pode mudar.');
assert.notEqual(getCredentialScopeForPortal('eproc-jfrs-1g'), 'pdpj', 'Portal eproc nunca pode cair no escopo pdpj.');
console.log('  ✓ pdpj unificado para PJe; eproc preservado.');

console.log('[T6] Origens de certificado e allowlist...');
const certOrigins = buildPjeClientCertificateOrigins(tjmt1);
assert.ok(certOrigins.includes('https://pje.tjmt.jus.br'));
assert.ok(certOrigins.includes('https://sso.cloud.pje.jus.br'));
const allowed = getAllowedPjeOrigins(tjmt1);
assert.ok(allowed.includes('https://pje.tjmt.jus.br'));
assert.ok(allowed.includes('https://sso.cloud.pje.jus.br'));
assert.equal(Object.isFrozen(certOrigins), true);
console.log('  ✓ Portal + SSO recebem o A1; allowlist derivada do registry.');

console.log('\n>>> REGISTRY PJe F0: PASS <<<\n');
