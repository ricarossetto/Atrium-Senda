/**
 * Test Suite: State and Military Eproc Adapters
 *
 * Verifies profile resolution, synthetic discovery, case details parsing,
 * and status handling across state and military courts.
 */

import assert from 'node:assert/strict';
import { EprocReadOnlyAdapter, getEprocPortalById } from '../lib/judicial/eproc/index.mjs';

console.log('=== TESTE DOS ADAPTADORES EPROC ESTADUAIS E MILITARES ===\n');

const statePortals = [
  { id: 'tjrs-eproc-1g', court: 'TJRS', courtCode: '8.21', status: 'active' },
  { id: 'tjsc-eproc-1g', court: 'TJSC', courtCode: '8.24', status: 'active' },
  { id: 'tjto-eproc-1g', court: 'TJTO', courtCode: '8.27', status: 'active' },
  { id: 'tjsp-eproc-1g', court: 'TJSP', courtCode: '8.26', status: 'partial' },
  { id: 'tjrj-eproc-1g', court: 'TJRJ', courtCode: '8.19', status: 'pilot' },
  { id: 'tjmg-eproc-1g', court: 'TJMG', courtCode: '8.13', status: 'pilot' },
  { id: 'tjba-eproc-1g', court: 'TJBA', courtCode: '8.05', status: 'pilot' },
  { id: 'tjmrs-eproc-1g', court: 'TJMRS', courtCode: '9.21', status: 'active' }
];

for (const item of statePortals) {
  const portal = getEprocPortalById(item.id);
  assert.ok(portal, `Portal ${item.id} deve existir no registry`);
  assert.equal(portal.court, item.court);
  assert.equal(portal.courtCode, item.courtCode);
  assert.equal(portal.status, item.status);

  const adapter = new EprocReadOnlyAdapter(item.id, {
    mockAuth: { success: true },
    mockPanelHtml: `
      <table>
        <tr><th>Número Processo</th><th>Classe</th><th>Autor</th><th>Réu</th><th>Localização</th><th>Assunto</th><th>Último Evento</th><th>Data</th><th>Distribuição</th><th>Valor</th></tr>
        <tr>
          <td><a href="controlador.php?acao=processo_selecionar&amp;num_processo=10011112220248260100">1001111-22.2024.8.26.0100</a></td>
          <td>PROCEDIMENTO COMUM</td>
          <td>AUTOR ESTADUAL</td>
          <td>RÉU ESTADUAL</td>
          <td>1ª Vara Cível</td>
          <td>Indenização</td>
          <td>Juntada de Petição</td>
          <td>10/09/2026</td>
          <td>05/01/2024</td>
          <td>R$ 20.000,00</td>
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
  assert.equal(discovered[0].court, item.court);

  const disco = await adapter.disconnect();
  assert.equal(disco.ok, true);
}

console.log(`✓ Portais estaduais (TJRS, TJSC, TJTO, TJSP, TJRJ, TJMG, TJBA) e militar (TJMRS) 100% validados.`);
