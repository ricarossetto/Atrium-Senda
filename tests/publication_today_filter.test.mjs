import assert from 'node:assert/strict';
import { filterPublications } from '../js/features/publications.js';

console.log('\n===============================================================');
console.log('  ATRIUM - FILA DO DIA EM PUBLICAÇÕES                        ');
console.log('===============================================================\n');

const now = new Date(2026, 9, 30, 12, 0, 0);
const base = {
  publishedAt: '2026-10-30',
  text: 'Texto sintético da publicação.',
  unread: true
};
const items = [
  { ...base, id: 'pub-alta', treatmentStatus: 'untreated' },
  { ...base, id: 'pub-prazo', treatmentStatus: 'in_review', sourceReportedDeadlineAt: '2026-10-31' },
  { ...base, id: 'pub-revisar', treatmentStatus: 'untreated' },
  { ...base, id: 'pub-normal', treatmentStatus: 'untreated' },
  { ...base, id: 'pub-tratada', treatmentStatus: 'treated' },
  { ...base, id: 'pub-descartada', treatmentStatus: 'discarded' },
  { ...base, id: 'pub-vencida', treatmentStatus: 'untreated', deadline: '2026-10-20' },
  { ...base, id: 'pub-vencida-recente', treatmentStatus: 'untreated', deadline: '2026-10-28' },
  { ...base, id: 'pub-urgente', treatmentStatus: 'untreated', urgent: true },
  { ...base, id: 'pub-importante', treatmentStatus: 'untreated', important: true },
  { ...base, id: 'pub-domicilio', treatmentStatus: 'in_review', sourceReportedDeadlineAt: '2026-10-30', sourceReportedDeadlineSource: 'domicilio' },
  { ...base, id: 'pub-domicilio-combinado', treatmentStatus: 'in_review', sourceReportedDeadlineAt: '2026-10-30', deadlineSource: 'domicilio' },
  { ...base, id: 'pub-domicilio-humano', treatmentStatus: 'untreated', sourceReportedDeadlineAt: '2026-10-29', sourceReportedDeadlineSource: 'domicilio', deadline: '2026-10-31', deadlineSource: 'manual' },
  { ...base, id: 'pub-tratada-alta', treatmentStatus: 'treated' }
];
const suggestions = new Map([
  ['pub-alta', { area: 'civil', priority: 'alta', action: 'suggest', areaConfidence: 0.9 }],
  ['pub-revisar', { area: 'civil', priority: 'normal', action: 'review', areaConfidence: 0.4 }],
  ['pub-tratada-alta', { area: 'civil', priority: 'alta', action: 'suggest', areaConfidence: 0.9 }]
]);

const today = filterPublications(items, { filter: 'today', aiSuggestions: suggestions, now, cutoff: 'all' });
const ids = new Set(today.map(item => item.id));
for (const expected of ['pub-alta', 'pub-prazo', 'pub-revisar', 'pub-vencida-recente', 'pub-urgente', 'pub-domicilio-humano']) {
  assert.equal(ids.has(expected), true, `${expected} deve entrar na fila do dia.`);
}
for (const excluded of ['pub-normal', 'pub-tratada', 'pub-descartada', 'pub-vencida', 'pub-importante', 'pub-domicilio', 'pub-domicilio-combinado', 'pub-tratada-alta']) {
  assert.equal(ids.has(excluded), false, `${excluded} não deve entrar na fila do dia.`);
}

const plainObjectToday = filterPublications(items, {
  filter: 'today',
  aiSuggestions: Object.fromEntries(suggestions),
  now,
  cutoff: 'all'
});
assert.deepEqual([...new Set(plainObjectToday.map(item => item.id))].sort(), [...ids].sort(), 'Mapa simples deve funcionar igual.');

const withoutAi = filterPublications(items, { filter: 'today', aiSuggestions: new Map(), now, cutoff: 'all' });
const withoutAiIds = new Set(withoutAi.map(item => item.id));
assert.equal(withoutAiIds.has('pub-prazo'), true, 'Prazo da fonte entra mesmo sem Atrium IA.');
assert.equal(withoutAiIds.has('pub-urgente'), true, 'Urgente entra mesmo sem Atrium IA.');
assert.equal(withoutAiIds.has('pub-alta'), false, 'Prioridade alta depende da classificação.');

const all = filterPublications(items, { filter: 'all', aiSuggestions: suggestions, now, cutoff: 'all' });
assert.equal(all.some(item => item.id === 'pub-tratada'), true, 'Todas mantém a publicação tratada.');
assert.equal(all.some(item => item.id === 'pub-descartada'), true, 'Todas inclui descartadas; o filtro próprio separa.');

console.log('V Fila do dia inclui prioridade alta, prazo da fonte, revisão e urgente; exclui tratada, antiga e normal.');
console.log('\n>>> FILA DO DIA: PASS <<<\n');
