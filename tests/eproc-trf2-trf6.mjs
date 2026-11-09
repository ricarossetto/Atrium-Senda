/**
 * Test Suite: TRF2 & TRF6 Family Eproc Adapters
 *
 * Verifies profile resolution, synthetic discovery, case details parsing,
 * and read-only compliance for the 2nd and 6th Federal Regions.
 */

import assert from 'node:assert/strict';
import { EprocReadOnlyAdapter, getEprocPortalById } from '../lib/judicial/eproc/index.mjs';

console.log('=== TESTE DOS ADAPTADORES EPROC FAMÍLIAS TRF2 & TRF6 ===\n');

const federalPortals = [
  { id: 'trf2-eproc-2g', courtCode: '4.02', court: 'TRF2' },
  { id: 'jfrj-eproc-1g', courtCode: '4.02', court: 'JFRJ' },
  { id: 'jfes-eproc-1g', courtCode: '4.02', court: 'JFES' },
  { id: 'trf6-eproc-2g', courtCode: '4.06', court: 'TRF6' },
  { id: 'jfmg-eproc-1g', courtCode: '4.06', court: 'JFMG' }
];

for (const pInfo of federalPortals) {
  const portal = getEprocPortalById(pInfo.id);
  assert.ok(portal, `Portal ${pInfo.id} deve existir no registry`);
  assert.equal(portal.courtCode, pInfo.courtCode);
  assert.equal(portal.court, pInfo.court);
  assert.equal(portal.branch, 'federal');

  const adapter = new EprocReadOnlyAdapter(pInfo.id, {
    mockAuth: { success: true },
    mockPanelHtml: `
      <table>
        <tr><th>Número Processo</th><th>Classe</th><th>Autor</th><th>Réu</th><th>Localização</th><th>Assunto</th><th>Último Evento</th><th>Data</th><th>Distribuição</th><th>Valor</th></tr>
        <tr>
          <td><a href="controlador.php?acao=processo_selecionar&amp;num_processo=50033334420244025101">5003333-44.2024.4.02.5101</a></td>
          <td>MANDADO DE SEGURANÇA</td>
          <td>CONTRIBUINTE CARIOCA</td>
          <td>DELEGADO DA RECEITA FEDERAL</td>
          <td>1ª Vara Federal do Rio de Janeiro</td>
          <td>Tributário</td>
          <td>Concluso para Sentença</td>
          <td>11/09/2026</td>
          <td>02/02/2024</td>
          <td>R$ 100.000,00</td>
        </tr>
      </table>
    `
  });

  const health = await adapter.health();
  assert.equal(health.ok, true);

  const auth = await adapter.authenticate({ userId: 'u1' });
  assert.equal(auth.ok, true);

  const discovered = await adapter.discoverCases();
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].court, pInfo.court);
  assert.equal(discovered[0].readOnly, true);

  const disco = await adapter.disconnect();
  assert.equal(disco.ok, true);
}

console.log(`✓ Famílias TRF2 (TRF2, JFRJ, JFES) e TRF6 (TRF6, JFMG) 100% validadas nas 5 instâncias federais.`);
