import assert from 'node:assert/strict';
import { isPjePautaEmpty, parsePjePautaRow, parsePjePautaRows, parsePjeSessionMode } from '../lib/judicial/pje/collectors/pauta.mjs';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

console.log('--- Iniciando Testes: pauta do PJe (2º grau) ---');

// Sessão presencial com data e hora.
const presencial = parsePjePautaRow(
  '5000000-00.2026.8.21.0001 1ª Câmara Cível Sessão de Julgamento Presencial 15/11/2026 às 14:00 Sequencial: 12',
  { portalId: 'pje-tjmt-2g' }
);
ok(presencial, 'linha presencial reconhecida');
eq(presencial.cnj, '50000000020268210001', 'CNJ normalizado');
eq(presencial.sessionStart, '2026-11-15T14:00:00', 'início da sessão');
eq(presencial.sessionMode, 'PRESENCIAL', 'modalidade presencial');
eq(presencial.panel, '1ª Câmara Cível', 'órgão julgador');
eq(presencial.sequential, '12', 'sequencial');
eq(presencial.status, 'DESIGNADA', 'situação');

// Sessão virtual assíncrona por período.
const assincrona = parsePjePautaRow(
  '5000000-00.2026.8.21.0002 15ª Câmara Cível Sessão Virtual Assíncrona Período da sessão: 28/10/2026 00:00 a 30/10/2026 17:00 Sequencial: 341',
  { portalId: 'pje-tjmt-2g' }
);
ok(assincrona, 'linha assíncrona reconhecida');
eq(assincrona.sessionMode, 'VIRTUAL_ASSINCRONA', 'modalidade assíncrona');
eq(assincrona.sessionStart, '2026-10-28T00:00:00', 'início do período');
eq(assincrona.sessionEnd, '2026-10-30T17:00:00', 'fim do período');
eq(assincrona.location, 'Sessão virtual assíncrona', 'local da assíncrona');

// Sessão cancelada.
const cancelada = parsePjePautaRow(
  '5000000-00.2026.8.21.0003 2ª Turma Cível Sessão de Julgamento Virtual 03/12/2026 09:30 Cancelada',
  { portalId: 'pje-tjmt-2g' }
);
eq(cancelada.status, 'CANCELADA', 'situação cancelada');
eq(cancelada.sessionMode, 'VIRTUAL', 'modalidade virtual');

// Linha sem CNJ é descartada.
eq(parsePjePautaRow('Sessão de Julgamento 15/11/2026', { portalId: 'x' }), null, 'linha sem CNJ descartada');

// Deduplicação e ordenação de entrada.
const rows = [
  { text: '5000000-00.2026.8.21.0001 1ª Câmara Cível Sessão Presencial 15/11/2026 14:00' },
  { text: '5000000-00.2026.8.21.0001 1ª Câmara Cível Sessão Presencial 15/11/2026 14:00' },
  { text: '5000000-00.2026.8.21.0002 2ª Câmara Cível Sessão Virtual 16/11/2026 10:00' }
];
eq(parsePjePautaRows(rows, { portalId: 'pje-tjmt-2g' }).length, 2, 'linhas repetidas são deduplicadas');

// Estado vazio reconhecido.
ok(isPjePautaEmpty('Aviso Não há quaisquer intimações aptas para a pauta a serem exibidas para este usuário.'), 'aviso de lista vazia');
eq(isPjePautaEmpty('Sessão de Julgamento 15/11/2026'), false, 'texto comum não é vazio');

// Modalidades.
eq(parsePjeSessionMode('Sessão Telepresencial'), 'TELEPRESENCIAL', 'telepresencial');
eq(parsePjeSessionMode('Sessão de Julgamento'), 'SESSAO', 'sessão genérica');

console.log(`✓ ${assertions} verificações aprovadas.`);
console.log('PASS: pauta do PJe validada.');
