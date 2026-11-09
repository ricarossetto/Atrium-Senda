import assert from 'node:assert/strict';
import {
  parsePjeSituationList,
  parsePjeProcessRows,
  reconcilePjeCollection,
  expedienteIdentityFor,
  decisionsFromGroups,
  parseExpedienteCellId,
  selectExpedienteCells,
  PJE_COLLECTION_STATES
} from '../lib/judicial/pje/collectors/standard-painel.mjs';
import { buildPjeCommunications } from '../lib/judicial/pje/sync/judicial-communications.mjs';
import { projectPjeCommunicationToIntimation } from '../lib/judicial/pje/sync/project-intimations.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — COLLECTOR PJe STANDARD (PARSERS PUROS TJMT)         ');
console.log('===============================================================\n');

console.log('[T1] Situações são extraídas do painel sem números de processo...');
const panelText = [
  'Pendentes de ciência ou de resposta 2',
  'DIAMANTINO 2',
  'Apenas pendentes de ciência 0',
  'Ciência dada pelo destinatário direto ou indireto - pendente de resposta 0',
  'Ciência dada pelo Judiciário - pendente de resposta 2',
  'Cujo prazo findou nos últimos 10 dias - sem resposta 0',
  'Sem prazo 0',
  'Respondidos nos últimos 10 dias 2',
  'Apenas pendentes de resposta 2',
  'Advogado Teste Último acesso: 17/09/2026 - 17:12:19'
].join('\n');
const situations = parsePjeSituationList(panelText);
assert.equal(situations.length, 8, `Esperadas 8 situações de expediente; obtidas ${situations.length}.`);
assert.deepEqual(situations[0], { label: 'Pendentes de ciência ou de resposta', count: 2 });
assert.ok(situations.some(item => item.label === 'Cujo prazo findou nos últimos 10 dias - sem resposta' && item.count === 0));
assert.ok(!situations.some(item => item.label.includes('DIAMANTINO')), 'Jurisdição não pode virar situação.');
assert.equal(situations.reduce((sum, item) => sum + item.count, 0), 8);
console.log('  ✓ 8 situações com contagens reais; jurisdição e rodapé ignorados.');

console.log('[T2] Linhas de processo são normalizadas e deduplicadas...');
const rows = [
  { id: 'row-1', text: '5001234-56.2025.8.12.0001 Expediente: intimação para manifestação 10/09/2026 12/09/2026' },
  { id: 'row-2', text: '5001234-56.2025.8.12.0001 duplicado na mesma tabela 11/09/2026' },
  { id: 'row-3', text: '5009876-54.2025.8.12.0002 Decisão publicada 02/09/2026' },
  { id: 'row-4', text: 'Sem número de processo aqui' }
];
const processes = parsePjeProcessRows(rows);
assert.equal(processes.length, 2);
assert.equal(processes[0].processNumber, '5001234-56.2025.8.12.0001');
assert.equal(processes[0].lastDate, '12/09/2026');
assert.deepEqual(processes[0].dates, ['10/09/2026', '12/09/2026']);
assert.equal(processes[1].processNumber, '5009876-54.2025.8.12.0002');
console.log('  ✓ Dois processos únicos, com datas preservadas e resumo truncado.');

console.log('[T3] Entradas vazias ou irrelevantes não quebram o parser...');
assert.deepEqual(parsePjeSituationList(''), []);
assert.deepEqual(parsePjeSituationList(null), []);
assert.deepEqual(parsePjeProcessRows([]), []);
assert.deepEqual(parsePjeProcessRows(null), []);
assert.deepEqual(parsePjeProcessRows([{ text: 'apenas texto sem processo' }]), []);
console.log('  ✓ Parsers tolerantes a ausência de dados.');

console.log('[T4] Reconciliação distingue loaded de vazio confirmado e de falha...');
assert.equal(reconcilePjeCollection({ expected: 6, collected: 6 }).state, PJE_COLLECTION_STATES.LOADED);
assert.equal(reconcilePjeCollection({ expected: 0, collected: 0 }).state, PJE_COLLECTION_STATES.EMPTY_CONFIRMED);
const partial = reconcilePjeCollection({ expected: 6, collected: 2 });
assert.equal(partial.state, PJE_COLLECTION_STATES.PARTIAL);
assert.equal(partial.missing, 4);
const timeout = reconcilePjeCollection({ expected: 6, collected: 0 });
assert.equal(timeout.state, PJE_COLLECTION_STATES.LOAD_TIMEOUT, 'Zero sem carregamento comprovado nunca é vazio confirmado.');
assert.equal(reconcilePjeCollection({ expected: 2, collected: 3 }).excess, 1);
console.log('  ✓ loaded/empty_confirmed/partial/load_timeout derivados das contagens.');

console.log('[T4b] Seção ausente nunca é vazio confirmado nem sucesso...');
assert.equal(
  decisionsFromGroups([], { situationsFound: false }),
  PJE_COLLECTION_STATES.SECTION_NOT_FOUND,
  'Sem lista de situações a seção não foi encontrada; não pode ser vazio confirmado.'
);
assert.equal(
  decisionsFromGroups([], { situationsFound: true }),
  PJE_COLLECTION_STATES.EMPTY_CONFIRMED,
  'Lista presente com todas as contagens zero é vazio confirmado.'
);
assert.equal(
  decisionsFromGroups([{ state: PJE_COLLECTION_STATES.LOAD_TIMEOUT }], { situationsFound: true }),
  PJE_COLLECTION_STATES.PARTIAL
);
assert.notEqual(PJE_COLLECTION_STATES.SECTION_NOT_FOUND, PJE_COLLECTION_STATES.EMPTY_CONFIRMED);
console.log('  ✓ section_not_found distinto de vazio confirmado.');

console.log('[T5] Identidade de expediente não colapsa dois expedientes do mesmo CNJ...');
const cnj = '1003127-91.2024.8.11.0005';
const expedienteA = expedienteIdentityFor({ expedienteId: '53180112', processNumber: cnj, summary: 'ProceComCiv intimação A' });
const expedienteB = expedienteIdentityFor({ expedienteId: '53180115', processNumber: cnj, summary: 'ProceComCiv intimação A' });
assert.notEqual(expedienteA, expedienteB, 'IDs externos distintos devem gerar identidades distintas.');
assert.ok(expedienteA.startsWith('id:'));
const fingerprintA = expedienteIdentityFor({ processNumber: cnj, summary: 'ProceComCiv intimação 01/09/2026' });
const fingerprintB = expedienteIdentityFor({ processNumber: cnj, summary: 'ProceComCiv intimação 02/09/2026' });
assert.notEqual(fingerprintA, fingerprintB, 'Datas diferentes no texto geram identidades diferentes.');
assert.ok(fingerprintA.startsWith('fp:'));
assert.equal(fingerprintA, expedienteIdentityFor({ processNumber: cnj, summary: 'ProceComCiv   intimação 01/09/2026' }), 'Mesmo texto normalizado mantém a mesma identidade.');
console.log('  ✓ ID externo prioritário; fingerprint preserva datas e normaliza espaços.');

console.log('[T6] DOM repetido: índice JSF e texto volátil não mudam a identidade...');
const contentBase = {
  processNumber: cnj,
  situation: 'Pendentes de ciência ou de resposta',
  dates: ['10/09/2026', '15/09/2026'],
  summary: 'Expediente 2 itens 10/09/2026'
};
const firstRender = expedienteIdentityFor({ ...contentBase, rowId: 'tbExpedientes:0:j_idt12', rowIndex: '0' });
const secondRender = expedienteIdentityFor({ ...contentBase, rowId: 'tbExpedientes:17:j_idt98', rowIndex: '17', summary: 'Expediente 1 item 10/09/2026' });
assert.equal(firstRender, secondRender, 'Índice de renderização JSF e contador mutável não podem gerar duplicata.');
assert.ok(firstRender.startsWith('fp:'));
const otherSituation = expedienteIdentityFor({ ...contentBase, situation: 'Apenas pendentes de resposta' });
assert.notEqual(firstRender, otherSituation, 'Situação compõe o conteúdo normalizado do fallback.');
const withExternalId = expedienteIdentityFor({ ...contentBase, rowId: 'tbExpedientes:7:j_idt99', externalId: '53180112' });
assert.equal(withExternalId, 'id:53180112', 'ID externo estável prevalece sobre o fingerprint.');
console.log('  ✓ Mesmo conteúdo em páginas/tabelas diferentes mantém identidade única.');

console.log('[T7] Seleção aceita só célula de expediente com id vinculado ao texto...');
assert.equal(parseExpedienteCellId('formExpedientes:tbExpedientes:66338074:j_id5xx'), '66338074');
assert.equal(parseExpedienteCellId('formExpedientes:tbExpedientes'), '');
assert.equal(parseExpedienteCellId('formExpedientes:tbExpedientes:tb'), '');
assert.equal(parseExpedienteCellId('formExpedientes:tbExpedientes:scPendentes'), '');
assert.equal(parseExpedienteCellId('formExpedientes:tbExpedientes:j_id5header'), '');
const selHeaderOnly = selectExpedienteCells([
  { rowId: 'formExpedientes:tbExpedientes', text: 'Expedientes 2 resultados encontrados Cliente Teste 5001234-56.2025.8.12.0001', externalId: '' }
]);
assert.equal(selHeaderOnly.rows.length, 0, 'Cabeçalho/tabela não podem virar expediente.');
assert.equal(selHeaderOnly.stats.foraCelula, 1);
const selUnlinked = selectExpedienteCells([
  { rowId: 'formExpedientes:tbExpedientes:66338074:j_id5xx', text: 'Texto sem menção ao id entre parênteses 5001234-56.2025.8.12.0001', externalId: '' }
]);
assert.equal(selUnlinked.rows.length, 0, 'Id do DOM precisa aparecer no texto entre parênteses.');
assert.equal(selUnlinked.stats.semVinculo, 1);
// Cenário real TJMT 2G: nó de ação + linha real do mesmo expediente colapsam em 1;
// dois expedientes distintos (Acórdão 66338074 e Intimação 65554026) geram 2 linhas.
const sel2g = selectExpedienteCells([
  { rowId: 'formExpedientes:tbExpedientes', text: 'Expedientes 2 resultados encontrados 5001234-56.2025.8.12.0001', externalId: '' },
  { rowId: 'formExpedientes:tbExpedientes:66338074:toolb', text: 'RESPONDER Acórdão (66338074) 5001234-56.2025.8.12.0001 19/09/2026', externalId: '66338074' },
  { rowId: 'formExpedientes:tbExpedientes:66338074:j_idt5', text: 'Acórdão (66338074) 5001234-56.2025.8.12.0001 19/09/2026 Diário Eletrônico', externalId: '66338074' },
  { rowId: 'formExpedientes:tbExpedientes:65554026:j_idt5', text: 'Intimação de pauta (65554026) 5001234-56.2025.8.12.0001 06/09/2026', externalId: '' }
]);

const prazoExplicitado = selectExpedienteCells([{
  rowId: 'formExpedientes:tbExpedientes:66338074:j_idt5',
  text: 'Decisão (66338074) Diário Eletrônico (23/10/2026 11:48) Prazo: 15 dias O sistema registrou ciência em 27/10/2026 00:00 Data limite prevista para manifestação: 23/11/2026 23:59 5001234-56.2025.8.12.0001 Último movimento: 27/10/2026'
}]).rows[0];
assert.equal(prazoExplicitado.prazoFinal, '23/11/2026');
assert.equal(prazoExplicitado.cienciaAt, '27/10/2026');
const [communication] = buildPjeCommunications({ portalId: 'pje-teste', expedientes: { expedientes: [{ ...prazoExplicitado, identity: 'id:66338074' }] } });
assert.equal(projectPjeCommunicationToIntimation(communication).sourceReportedDeadlineAt, '2026-11-23');
const semDataLimite = selectExpedienteCells([{
  rowId: 'formExpedientes:tbExpedientes:66338074:j_idt5',
  text: 'Decisão (66338074) Prazo: 15 dias 5001234-56.2025.8.12.0001 27/10/2026'
}]).rows[0];
assert.equal(semDataLimite.prazoFinal, '');
const dataInvalida = selectExpedienteCells([{
  rowId: 'formExpedientes:tbExpedientes:66338074:j_idt5',
  text: 'Decisão (66338074) Data limite prevista para manifestação: 31/02/2026 5001234-56.2025.8.12.0001'
}]).rows[0];
assert.equal(dataInvalida.prazoFinal, '');
assert.equal(sel2g.rows.length, 2, 'Dois expedientes reais geram 2 linhas; cabeçalho e ação duplicada fora.');
assert.equal(sel2g.stats.cabecalhos, 0, 'Cabeçalho cai em foraCelula (sem segmento de id).');
assert.equal(sel2g.stats.foraCelula, 1);
assert.equal(sel2g.stats.agrupados, 1, 'Nó de ação e linha real do mesmo expediente colapsam.');
assert.equal(sel2g.rows[0].externalId, '66338074');
assert.equal(sel2g.rows[1].externalId, '65554026');
assert.equal(sel2g.rows[1].rowIndex, '65554026', 'Sem link, o id estável vem do próprio id do DOM.');
console.log('  ✓ Célula válida, vínculo texto↔id, dedupe por expediente e cenário 2G.');

console.log('\n>>> COLLECTOR PJe STANDARD F1: PASS <<<\n');
