import assert from 'node:assert/strict';
import { parseEprocHearings } from '../lib/judicial/eproc/parsers/hearing-parser.mjs';

async function runHearingParserTest() {
  console.log('=== TESTE FOCAL: EPROC HEARINGS PARSER (WAVE E) ===\n');

  const sampleHearingsHtml = `
  <table class="infraTable" summary="Audiências">
    <thead>
      <tr>
        <th>Processo</th>
        <th>Data/Hora</th>
        <th>Tipo</th>
        <th>Situação</th>
        <th>Modalidade / Local</th>
        <th>Órgão Julgador</th>
        <th>Observações</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="controlador.php?acao=processo_selecionar&proc=50012341120244047200">5001234-11.2024.4.04.7200</a></td>
        <td>18/09/2026 14:30</td>
        <td>Audiência de Conciliação - Prévia</td>
        <td>DESIGNADA</td>
        <td>Telepresencial via Zoom / Sala Virtual 2</td>
        <td>1ª Vara Federal de Florianópolis</td>
        <td>Link de acesso encaminhado por intimação no evento 42</td>
      </tr>
      <tr>
        <td><a href="controlador.php?acao=processo_selecionar&proc=50056782220244047000">5005678-22.2024.4.04.7000</a></td>
        <td>25/09/2026 10:00</td>
        <td>Audiência de Instrução e Julgamento</td>
        <td>DESIGNADA</td>
        <td>Presencial - Sala de Audiências Principal</td>
        <td>2ª Vara Federal de Curitiba</td>
        <td>Comparecimento obrigatório das partes e testemunhas</td>
      </tr>
      <tr>
        <td><a href="controlador.php?acao=processo_selecionar&proc=50000010020268210016">5000001-00.2026.8.21.0016</a></td>
        <td>10/09/2026 16:00</td>
        <td>Audiência de Tentativa de Conciliação</td>
        <td>CANCELADA</td>
        <td>Telepresencial</td>
        <td>Vara Cível de Porto Alegre</td>
        <td>Acordo extrajudicial homologado</td>
      </tr>
    </tbody>
  </table>
  `;

  const hearings = parseEprocHearings(sampleHearingsHtml, { portalId: 'jfsc-eproc-1g' });
  assert.equal(hearings.length, 3, 'Deve extrair 3 audiências da tabela');

  // Audiência 1: JFSC Telepresencial
  const h0 = hearings[0];
  assert.equal(h0.processNumber, '5001234-11.2024.4.04.7200');
  assert.equal(h0.cnj, '50012341120244047200');
  assert.equal(h0.hearingDate, '18/09/2026');
  assert.equal(h0.hearingTime, '14:30');
  assert.equal(h0.scheduledAt, '2026-09-18T14:30:00');
  assert.equal(h0.hearingType, 'CONCILIAÇÃO');
  assert.equal(h0.status, 'DESIGNADA');
  assert.equal(h0.modality, 'TELEPRESENCIAL');
  assert.equal(h0.judicialUnit, '1ª Vara Federal de Florianópolis');
  assert.ok(h0.notes.includes('Link de acesso'));
  console.log('✓ 1. Audiência telepresencial de conciliação JFSC extraída com metadados exatos.');

  // Audiência 2: JFPR Presencial
  const h1 = hearings[1];
  assert.equal(h1.processNumber, '5005678-22.2024.4.04.7000');
  assert.equal(h1.hearingDate, '25/09/2026');
  assert.equal(h1.hearingTime, '10:00');
  assert.equal(h1.hearingType, 'INSTRUÇÃO E JULGAMENTO');
  assert.equal(h1.status, 'DESIGNADA');
  assert.equal(h1.modality, 'PRESENCIAL');
  assert.equal(h1.judicialUnit, '2ª Vara Federal de Curitiba');
  console.log('✓ 2. Audiência presencial de instrução JFPR extraída.');

  // Audiência 3: Cancelada
  const h2 = hearings[2];
  assert.equal(h2.status, 'CANCELADA');
  assert.equal(h2.hearingType, 'CONCILIAÇÃO');
  console.log('✓ 3. Audiência cancelada extraída com estado atualizado.');

  console.log('\n>>> EPROC HEARINGS PARSER TEST PASSED! <<<\n');
}

runHearingParserTest().catch(err => {
  console.error('Falha no teste de audiências:', err);
  process.exit(1);
});
