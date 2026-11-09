import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileEprocHearings, hearingExternalId } from '../lib/judicial/eproc/sync/hearings-sync.mjs';
import { parseEprocHearings } from '../lib/judicial/eproc/parsers/hearing-parser.mjs';
import { EPROC_READ_ONLY_ACTIONS } from '../lib/judicial/managed-connectivity.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);
const PORTAL_ID = 'tjrs-eproc-1g';
const COLLECTED_AT = '2026-09-17T12:00:00.000Z';

const SAMPLE_HTML = `
<table class="infraTable" summary="Audiências">
  <thead>
    <tr><th>Processo</th><th>Data/Hora</th><th>Tipo</th><th>Situação</th><th>Modalidade / Local</th><th>Órgão Julgador</th><th>Observações</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="controlador.php?acao=processo_selecionar&proc=50000010020268210016">5000001-00.2026.8.21.0016</a></td>
      <td>18/09/2026 14:30</td>
      <td>Audiência de Conciliação</td>
      <td>DESIGNADA</td>
      <td>Telepresencial via Zoom</td>
      <td>Vara Cível de Porto Alegre</td>
      <td>Link encaminhado por intimação</td>
    </tr>
    <tr>
      <td><a href="controlador.php?acao=processo_selecionar&proc=50000020020268210016">5000002-00.2026.8.21.0016</a></td>
      <td>25/09/2026 10:00</td>
      <td>Audiência de Instrução e Julgamento</td>
      <td>DESIGNADA</td>
      <td>Presencial</td>
      <td>1ª Vara Cível de Canoas</td>
      <td>Comparecimento obrigatório</td>
    </tr>
  </tbody>
</table>
`;

async function run() {
  console.log('=== TESTE FOCAL: AUDIÊNCIAS EPROC -> AGENDA CANÔNICA ===\n');

  assert.ok(EPROC_READ_ONLY_ACTIONS.has('audiencia_listar'), 'Ação de audiências deve estar na allowlist read-only');
  assert.ok(EPROC_READ_ONLY_ACTIONS.has('audiencia_conciliacao_listar'), 'Ação de conciliação deve estar na allowlist read-only');

  const parsed = parseEprocHearings(SAMPLE_HTML, { portalId: PORTAL_ID });
  assert.equal(parsed.length, 2);
  const hearings = parsed.map(hearing => ({ ...hearing, portalId: PORTAL_ID }));

  const state = {
    agenda: [
      { id: 'manual-1', title: 'Compromisso interno', date: '2026-09-18', time: '09:00', source: 'Interna' }
    ]
  };

  const first = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: COLLECTED_AT,
    hearings,
    collectionStatus: { discovered: true, collected: true }
  });
  assert.deepEqual(first, { created: 2, updated: 0, inactive: 0, unchanged: 0 });
  assert.equal(state.agenda.length, 3);
  const event = state.agenda.find(item => item.externalId === hearingExternalId(PORTAL_ID, hearings[0]));
  assert.ok(event, 'Evento de audiência deve ter identidade externa estável');
  assert.equal(event.date, '2026-09-18');
  assert.equal(event.time, '14:30');
  assert.equal(event.process, '5000001-00.2026.8.21.0016');
  assert.equal(event.client, '', 'Audiência nunca infere cliente');
  assert.equal(event.modality, 'TELEPRESENCIAL');
  assert.equal(event.status, 'DESIGNADA');
  assert.equal(event.sourceStatus, 'active');
  assert.equal(event.deadline, undefined, 'Audiência não pode criar prazo fatal');
  assert.equal(event.fatalDeadline, undefined);
  assert.equal(event.taskId, undefined, 'Audiência não cria tarefa automática');
  assert.equal(state.agenda.find(item => item.id === 'manual-1').title, 'Compromisso interno', 'Evento manual preservado');
  console.log('✓ 1. Audiências viram eventos de agenda idempotentes, sem prazo e sem tocar eventos manuais.');

  const second = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: '2026-09-17T13:00:00.000Z',
    hearings,
    collectionStatus: { discovered: true, collected: true }
  });
  assert.deepEqual(second, { created: 0, updated: 0, inactive: 0, unchanged: 2 }, 'Releitura idêntica é no-op');
  assert.equal(state.agenda.length, 3, 'Nenhuma duplicata');

  const updatedHearings = [{ ...hearings[0], status: 'CANCELADA', notes: 'Acordo homologado' }];
  const third = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: '2026-09-17T14:00:00.000Z',
    hearings: updatedHearings,
    collectionStatus: { discovered: true, collected: true }
  });
  assert.deepEqual(third, { created: 0, updated: 1, inactive: 1, unchanged: 0 });
  const cancelled = state.agenda.find(item => item.externalId === hearingExternalId(PORTAL_ID, hearings[0]));
  assert.equal(cancelled.status, 'CANCELADA');
  const removed = state.agenda.find(item => item.externalId === hearingExternalId(PORTAL_ID, hearings[1]));
  assert.equal(removed.sourceStatus, 'not_present', 'Ausência em listagem reconhecida vira sinal de auditoria');
  assert.equal(removed.active, false);
  assert.equal(removed.date, '2026-09-25', 'Histórico da audiência não é apagado');
  console.log('✓ 2. Atualização, ausência e cancelamento são reconciliados sem exclusão destrutiva.');

  const reactivation = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: '2026-09-17T14:30:00.000Z',
    hearings: [hearings[1]],
    collectionStatus: { discovered: true, collected: true }
  });
  assert.equal(reactivation.updated, 1, 'Reaparecimento reativa a audiência ausente');
  const reactivated = state.agenda.find(item => item.externalId === hearingExternalId(PORTAL_ID, hearings[1]));
  assert.equal(reactivated.sourceStatus, 'active', 'Audiência que reaparece na fonte volta a ativa');

  const unparseableRow = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: '2026-09-17T14:40:00.000Z',
    hearings: [{ ...hearings[1], scheduledAt: null, hearingDate: '', hearingTime: '' }],
    collectionStatus: { discovered: true, collected: true }
  });
  assert.equal(unparseableRow.inactive, 0, 'Linha sem data/hora ainda é presença na fonte e não pode gerar ausência');
  assert.equal(reactivated.sourceStatus, 'active');

  const partial = reconcileEprocHearings(state, {
    portalId: PORTAL_ID,
    portalLabel: 'TJRS 1G',
    collectedAt: '2026-09-17T15:00:00.000Z',
    hearings: [],
    collectionStatus: { discovered: true, collected: false }
  });
  assert.equal(partial.inactive, 0, 'Sem coleta confirmada, ausência não é marcada');
  console.log('✓ 3. Coleta não confirmada nunca marca ausência.');

  const otherPortal = reconcileEprocHearings(state, {
    portalId: 'trf4-eproc-2g',
    portalLabel: 'TRF4 2G',
    collectedAt: '2026-09-17T16:00:00.000Z',
    hearings: [],
    collectionStatus: { discovered: true, collected: true }
  });
  assert.equal(otherPortal.inactive, 0, 'Reconciliação de um portal não afeta eventos de outro');

  const collectorSource = await readFile(path.join(ROOT, 'collector', 'adapters', 'eproc.mjs'), 'utf8');
  assert.match(collectorSource, /export async function collectEprocHearings/, 'Coletor de audiências deve existir no adapter');
  assert.match(collectorSource, /parseEprocHearings/, 'Coletor deve usar o parser oficial de audiências');
  const hearingsStart = collectorSource.indexOf('export async function collectEprocHearings');
  const hearingsBlock = collectorSource.slice(hearingsStart, hearingsStart + 3_000);
  assert.match(hearingsBlock, /navigateReadOnly/, 'Coleta de audiências usa apenas navegação read-only');
  assert.match(hearingsBlock, /assertReadOnlyEprocTarget/, 'Paginação de audiências passa pelo gate default-deny');
  assert.match(collectorSource, /EPROC_REPORT_TRIGGER_DENY/, 'Lista de comandos perigosos deve existir no adapter');
  console.log('✓ 4. Coletor é read-only e escopado por portal.');

  console.log('\n>>> EPROC HEARINGS SYNC TEST PASSED! <<<\n');
}

run().catch(error => {
  console.error('Falha no teste de audiências eproc:', error);
  process.exit(1);
});
