import assert from 'node:assert/strict';
import { collectAgendaActivities } from '../js/features/agenda.js';
import { parsePjePautaRow } from '../lib/judicial/pje/collectors/pauta.mjs';

console.log('--- Agenda: "00:00" não é exibido como horário quando não é horário ---');

const base = { tasks: [], intimations: [], selectedDate: '2026-11-24', today: '2026-11-24', classifyIntimation: () => ({}), getIntimationParties: () => '', totalTimeMinutes: () => 0 };
const labels = agenda => Object.fromEntries(collectAgendaActivities({ ...base, agenda }).activities.map(item => [item.id, item.time]));

const result = labels([
  { id: 'ext-sem-hora', date: '2026-11-24', time: '00:00', title: 'Prazo sintético', source: 'Agenda externa' },
  { id: 'ext-meia-noite', date: '2026-11-24', time: '00:00', title: 'Plantão sintético às 00:00', source: 'Agenda externa' },
  { id: 'eproc-virtual', date: '2026-11-24', time: '00:00', title: 'Sessão sintética', source: 'eproc TJRS 2G', sessionEnd: '2026-11-28T17:00:00' },
  { id: 'interno-meia-noite', date: '2026-11-24', time: '00:00', title: 'Compromisso interno sintético', source: 'Interna' },
  { id: 'sem-hora', date: '2026-11-24', time: '', title: 'Sem hora sintético' },
  { id: 'com-hora', date: '2026-11-24', time: '14:30', title: 'Reunião sintética', source: 'Agenda externa' }
]);
assert.equal(result['ext-sem-hora'], 'Dia inteiro', 'agenda externa T000000 sem horário no texto vira dia inteiro');
assert.equal(result['ext-meia-noite'], '00:00', 'agenda externa que cita 00:00 no texto mantém o horário');
assert.equal(result['eproc-virtual'], 'Sessão virtual · até 28/11 17:00', 'sessão virtual mostra o período');
assert.equal(result['interno-meia-noite'], '00:00', 'compromisso interno às 00:00 não é alterado');
assert.equal(result['sem-hora'], 'Dia inteiro');
assert.equal(result['com-hora'], '14:30');

// Ordem: continua pelo horário gravado (itens 00:00 e sem hora antes do das 14:30).
const order = collectAgendaActivities({ ...base, agenda: [
  { id: 'b', date: '2026-11-24', time: '14:30', title: 'B', source: 'Agenda externa' },
  { id: 'a', date: '2026-11-24', time: '00:00', title: 'A', source: 'Agenda externa' }
] }).activities.map(item => item.id);
assert.deepEqual(order, ['a', 'b'], 'ordenação usa o horário gravado, não o rótulo');

// PJe 2º grau: pauta sem hora marca timeMissing; com hora, não.
const semHora = parsePjePautaRow('5000000-00.2026.8.21.0009 3ª Câmara Cível Sessão de Julgamento 20/11/2026 Sequencial: 7', { portalId: 'pje-teste' });
assert.equal(semHora.timeMissing, true, 'pauta sem hora marca timeMissing');
const comHora = parsePjePautaRow('5000000-00.2026.8.21.0010 3ª Câmara Cível Sessão de Julgamento 20/11/2026 às 09:30', { portalId: 'pje-teste' });
assert.equal(comHora.timeMissing, undefined, 'pauta com hora não marca timeMissing');

console.log('[PASS] Agenda sem "00:00" inventado: agenda externa, sessão virtual e pauta PJe.');
