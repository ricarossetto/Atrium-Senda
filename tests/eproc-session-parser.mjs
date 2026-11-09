import assert from 'node:assert/strict';
import { parseEprocSessions, isEprocSessionsPage } from '../lib/judicial/eproc/parsers/session-parser.mjs';

console.log('--- Iniciando Testes: Parser de Sessões de Julgamento (eproc 2º grau) ---');

const html = `<!doctype html><html><body>
<h1>Lista de Processos em Pauta (2 registros)</h1>
<table class="infraTable">
  <thead><tr>
    <th>Processo</th><th>Assunto</th><th>Evento</th><th>Data Sessão</th><th>Sequencial</th><th>Composição prevista do Julgamento</th><th>Visualizado</th>
  </tr></thead>
  <tbody>
    <tr>
      <td>5324899-83.2026.8.21.7000<br>Juízo: FZ<br>Cadastrar Lembrete<br>Colegiado: 19ª Câmara Cível<br>PARTE TESTE LTDA<br>(00000000000000) - AGRAVANTE<br>OUTRA PARTE<br>(11111111111) - AGRAVADO</td>
      <td>Imissão</td>
      <td>Expedida/certificada a comunicação eletrônica<br>Sessão Presencial<br>Data da sessão: 29/10/2026 09:00 - Sala de Sessão 503 - 5º Andar - TJ/RS - Porto Alegre/RS<br>Sequencial: 224<br>(19/10/2026 15:44:19)</td>
      <td>29/10/2026 09:00:00</td>
      <td>224</td>
      <td>FABIANA ZILLES (FZ)<br>RUTE DOS SANTOS ROSSATO (RSR)<br>SERGIO FUSQUINE GONCALVES (SFG)</td>
      <td></td>
    </tr>
    <tr>
      <td>5003144-81.2023.8.21.0016<br>Juízo: CMMR<br>Cadastrar Lembrete<br>Colegiado: 15ª Câmara Cível<br>PARTE TESTE<br>(22222222222) - APELANTE</td>
      <td>Honorários Profissionais</td>
      <td>Expedida/certificada a comunicação eletrônica<br>Sessão Virtual Assíncrona<br>Período da sessão: 28/10/2026 00:00 a 30/10/2026 17:00<br>Sequencial: 341<br>(15/10/2026 18:56:12)</td>
      <td>28/10/2026 00:00:00 a 30/10/2026 17:00:00</td>
      <td>341</td>
      <td>ROBERTO CARVALHO FRAGA (RCF)<br>CLOVIS MOACYR MATTANA RAMOS (CMMR)</td>
      <td></td>
    </tr>
    <tr>
      <td>5000000-00.2026.8.21.0001<br>Juízo: ABC<br>Colegiado: 1ª Câmara Cível</td>
      <td>Cancelamento</td>
      <td>Sessão Presencial<br>Data da sessão: 10/11/2026 14:00<br>Cancelada pelo tribunal</td>
      <td>10/11/2026 14:00:00</td>
      <td>77</td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>
</body></html>`;

const sessions = parseEprocSessions(html, { portalId: 'tjrs-eproc-2g' });
assert.equal(sessions.length, 3, 'três sessões reconhecidas');

const presencial = sessions[0];
assert.equal(presencial.processNumber, '5324899-83.2026.8.21.7000');
assert.equal(presencial.cnj, '53248998320268217000');
assert.equal(presencial.courtUnit, 'FZ');
assert.equal(presencial.panel, '19ª Câmara Cível');
assert.equal(presencial.sessionMode, 'PRESENCIAL');
assert.equal(presencial.sessionStart, '2026-10-29T09:00:00');
assert.equal(presencial.sessionEnd, '');
assert.equal(presencial.sequential, '224');
assert.match(presencial.location, /Sala de Sessão 503/);
assert.equal(presencial.status, 'DESIGNADA');

const assincrona = sessions[1];
assert.equal(assincrona.sessionMode, 'VIRTUAL_ASSINCRONA');
assert.equal(assincrona.sessionStart, '2026-10-28T00:00:00');
assert.equal(assincrona.sessionEnd, '2026-10-30T17:00:00');
assert.equal(assincrona.panel, '15ª Câmara Cível');
assert.equal(assincrona.sequential, '341');

const cancelada = sessions[2];
assert.equal(cancelada.status, 'CANCELADA');

assert.equal(isEprocSessionsPage(html), true);
assert.equal(isEprocSessionsPage('<html><body>Nenhum registro</body></html>'), false);
assert.deepEqual(parseEprocSessions(''), []);

console.log('  OK: presencial, assíncrona (período) e cancelada, com juízo, colegiado, sala e sequencial.');
console.log('\n[PASS] Parser de sessões validado.\n');
