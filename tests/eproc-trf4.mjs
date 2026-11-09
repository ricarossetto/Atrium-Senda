/**
 * Test Suite: TRF4 Family Eproc Adapter (TRF4, JFRS, JFSC, JFPR)
 *
 * Verifies profile resolution, synthetic discovery, case details parsing,
 * and read-only compliance for the 4th Federal Region.
 */

import assert from 'node:assert/strict';
import { EprocReadOnlyAdapter, getEprocPortalById } from '../lib/judicial/eproc/index.mjs';

console.log('=== TESTE DO ADAPTADOR EPROC FAMÍLIA TRF4 (JFRS, JFSC, JFPR, TRF4) ===\n');

const trf4Portals = ['trf4-eproc-2g', 'jfrs-eproc-1g', 'jfsc-eproc-1g', 'jfpr-eproc-1g'];

for (const portalId of trf4Portals) {
  const portal = getEprocPortalById(portalId);
  assert.ok(portal, `Portal ${portalId} deve existir no registry`);
  assert.equal(portal.courtCode, '4.04');
  assert.equal(portal.branch, 'federal');

  const adapter = new EprocReadOnlyAdapter(portalId, {
    mockAuth: { success: true },
    mockPanelHtml: `
      <table>
        <tr><th>Número Processo</th><th>Classe</th><th>Autor</th><th>Réu</th><th>Localização</th><th>Assunto</th><th>Último Evento</th><th>Data</th><th>Distribuição</th><th>Valor</th></tr>
        <tr>
          <td><a href="controlador.php?acao=processo_selecionar&amp;num_processo=50012345620244047100">5001234-56.2024.4.04.7100</a></td>
          <td>AÇÃO PREVIDENCIÁRIA</td>
          <td>SEGURADO DA SILVA</td>
          <td>INSS</td>
          <td>1ª VF Porto Alegre</td>
          <td>Aposentadoria</td>
          <td>Sentença Procedente</td>
          <td>10/09/2026</td>
          <td>01/01/2024</td>
          <td>R$ 50.000,00</td>
        </tr>
      </table>
    `,
    mockCaseHtml: `
      <div>Número: 5001234-56.2024.4.04.7100</div>
      <div>Classe: Ação Previdenciária</div>
      <div>Órgão Julgador: 1ª Vara Federal</div>
      <span id="spnChaveProcesso">1234567890</span>
    `
  });

  // 1. Health check
  const health = await adapter.health();
  assert.equal(health.ok, true);
  assert.equal(health.readOnly, true);

  // 2. Authenticate
  const auth = await adapter.authenticate({ userId: 'u1' });
  assert.equal(auth.ok, true);
  assert.equal(auth.state, 'CONNECTED');

  // 3. Discover cases
  const discovered = await adapter.discoverCases();
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].number, '5001234-56.2024.4.04.7100');
  assert.equal(discovered[0].plaintiff, 'SEGURADO DA SILVA');
  assert.equal(discovered[0].readOnly, true);

  // 4. Fetch case details
  const caseData = await adapter.fetchCase({ cnj: '5001234-56.2024.4.04.7100' });
  assert.equal(caseData.number, '5001234-56.2024.4.04.7100');
  assert.equal(caseData.accessKey, '1234567890');

  // 5. Disconnect
  const disco = await adapter.disconnect();
  assert.equal(disco.ok, true);
}

console.log(`✓ Família TRF4 (TRF4, JFRS, JFSC, JFPR) 100% validada em todas as 4 instâncias com dados sintéticos.`);
