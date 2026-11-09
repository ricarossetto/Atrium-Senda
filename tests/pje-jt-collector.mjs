import assert from 'node:assert/strict';
import { parsePjeJtAcervoRow, parsePjeJtExpedienteRow, PJE_JT_ROUTES, readPjeJtStructure } from '../lib/judicial/pje/collectors/pje-jt.mjs';
import { reconcilePjeAcervoHearings } from '../lib/judicial/pje/sync/acervo-hearings-sync.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — COLLECTOR PJe-JT (TRT4: ACERVO GERAL E EXPEDIENTES) ');
console.log('===============================================================\n');

console.log('[T1] Linha do Acervo Geral é normalizada...');
const acervoRow = 'Processo ATOrd 0000000-00.2026.5.04.0001 Órgão Julgador Colegiado VARA DO TRABALHO DE IJUÍ IJU601 Data da Audiência 18/11/2026 08:10 18/11/2026 08:10 Data da Autuação 18/08/2026 18/08/2026 Abrir o Peticionar, processo 0000000-00.2026.5.04.0001';
const acervo = parsePjeJtAcervoRow(acervoRow);
assert.equal(acervo.processNumber, '0000000-00.2026.5.04.0001');
assert.equal(acervo.classe, 'ATOrd');
assert.match(acervo.orgaoJulgador, /VARA DO TRABALHO/);
assert.equal(acervo.dataAudiencia, '18/11/2026');
assert.equal(acervo.dataAutuacao, '18/08/2026');
assert.equal(parsePjeJtAcervoRow('linha sem processo'), null);
console.log('  ✓ CNJ, classe, órgão, audiência e autuação extraídos.');

console.log('[T2] Linha de Meus Expedientes é normalizada...');
const expedienteRow = 'Detalhes do Processo ATSum 0000000-00.2026.5.04.0001 Processo ATSum 0000000-00.2026.5.04.0001 Órgão Julgador Colegiado IJU601 IJU601 Data de Criação 11/09/2026 11/09/2026 Data da Audiência - - Data da Ciência 15/09/2026 15/09/2026 Prazo Final 25/09/2026 25/09/2026';
const expediente = parsePjeJtExpedienteRow(expedienteRow, { externalId: '321' });
assert.equal(expediente.expedienteIdentity, 'id:321');
assert.equal(expediente.processNumber, '0000000-00.2026.5.04.0001');
assert.match(expediente.orgaoJulgador, /IJU601/);
assert.equal(expediente.createdAt, '11/09/2026');
assert.equal(expediente.audienciaAt, '');
assert.equal(expediente.cienciaAt, '15/09/2026');
assert.equal(expediente.prazoFinal, '25/09/2026');
console.log('  ✓ Criação, ciência, audiência e prazo final extraídos (prazo como dado da fonte).');

console.log('[T3] Identidade de expediente não colapsa comunicações distintas...');
const semIdA = parsePjeJtExpedienteRow(expedienteRow);
const semIdB = parsePjeJtExpedienteRow(expedienteRow.replace('25/09/2026', '27/09/2026'));
assert.ok(semIdA.expedienteIdentity.startsWith('fp:'));
assert.notEqual(semIdA.expedienteIdentity, semIdB.expedienteIdentity, 'Prazos diferentes geram identidades diferentes.');
assert.equal(semIdA.expedienteIdentity, parsePjeJtExpedienteRow(expedienteRow).expedienteIdentity);
console.log('  ✓ ID externo prioritário; fingerprint sensível a campos distintos.');

console.log('[T4] Rotas confirmadas do TRT4 são oficiais...');
assert.equal(PJE_JT_ROUTES.acervo, '/pjekz/painel/usuario-externo/acervo-geral');
assert.equal(PJE_JT_ROUTES.expedientes, '/pjekz/painel/usuario-externo/pendentes-manifestacao');
console.log('  ✓ Rotas descobertas em live, sem invenção de path.');

console.log('[T5] DOM repetido: texto volátil de links e tabelas não cria expediente novo...');
const renderedTwiceA = parsePjeJtExpedienteRow(expedienteRow);
const renderedTwiceB = parsePjeJtExpedienteRow(expedienteRow + ' Abrir o Peticionar 18/09/2026 12:34:56');
assert.equal(renderedTwiceA.expedienteIdentity, renderedTwiceB.expedienteIdentity, 'Links e horários da renderização não podem alterar a identidade.');
assert.ok(renderedTwiceA.expedienteIdentity.startsWith('fp:'));
const outraAudiencia = parsePjeJtExpedienteRow(expedienteRow.replace('Data da Audiência - -', 'Data da Audiência 20/10/2026 20/10/2026'));
assert.notEqual(renderedTwiceA.expedienteIdentity, outraAudiencia.expedienteIdentity, 'Campo estrutural distinto gera identidade distinta.');
assert.equal(parsePjeJtExpedienteRow(expedienteRow, { externalId: '889900' }).expedienteIdentity, 'id:889900');
console.log('  ✓ Fingerprint estrutural estável por processo, órgão e datas.');

console.log('[T6] Estrutura observada mede tabela e cards sem copiar texto...');
{
  const el = innerText => ({ innerText, getClientRects: () => [1], id: '', className: '' });
  const tables = [el('x'.repeat(5000))];
  const cards = [el('3 Meus Expedientes'), el('7 Acervo Geral'), el('Menu sem numero')];
  const fakeDocument = {
    title: 'Meus Expedientes - PJE',
    body: { innerText: 'corpo' },
    querySelectorAll: selector => {
      if (selector === 'table') return tables;
      if (selector === 'mat-card') return cards;
      return [];
    }
  };
  const fakePage = { evaluate: async fn => {
    const prevDocument = globalThis.document;
    const prevLocation = globalThis.location;
    globalThis.document = fakeDocument;
    globalThis.location = { href: 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/pendentes-manifestacao' };
    try {
      return await fn();
    } finally {
      globalThis.document = prevDocument;
      globalThis.location = prevLocation;
    }
  } };
  const structure = await readPjeJtStructure(fakePage);
  assert.equal(structure.title, 'Meus Expedientes - PJE');
  assert.equal(structure.tableTextLen, 5000);
  assert.equal(structure.counts.tables, 1);
  assert.equal(structure.counts.matCard, 3);
  assert.deepEqual(structure.cardProbe.map(card => card.matched), [true, true, false]);
  console.log('  ✓ Tamanho de tabela e casamento de card sem PII.');
}

console.log('[T7] Audiência do Acervo traz data, hora, partes e vara...');
{
  const cnj = '0000000-00.2026.5.04.0001';
  const row = `ATOrd ${cnj} PESSOA TESTE x EMPRESA TESTE LTDA Audiência em: 18/11/2026 08:10 Órgão Julgador Colegiado VARA DO TRABALHO DE TESTE VARA DO TRABALHO DE TESTE Data da Audiência 18/11/2026 08:10 18/11/2026 08:10 Data da Autuação 18/08/2026 18/08/2026`;
  const parsed = parsePjeJtAcervoRow(row);
  assert.equal(parsed.classe, 'ATOrd');
  assert.deepEqual(parsed.hearing, { date: '18/11/2026', time: '08:10', scheduledAt: '2026-11-18T08:10:00', parties: 'PESSOA TESTE x EMPRESA TESTE LTDA', court: 'VARA DO TRABALHO DE TESTE' });
  assert.equal(parsePjeJtAcervoRow(`HTE ${cnj} PESSOA x OUTRA Data da Audiência - - Data da Autuação 29/09/2026 29/09/2026`).hearing, null, 'Traço na coluna não é audiência.');
  assert.equal(parsePjeJtAcervoRow(`HTE ${cnj} VARA DO TRABALHO DE TESTE - 29/09/2026`).hearing, null, 'Data da autuação nunca vira audiência.');
  assert.equal(parsePjeJtAcervoRow(acervoRow).hearing.time, '08:10', 'Coluna sozinha também serve.');
  console.log('  ✓ Sem marcador de audiência, nenhum evento.');
}

console.log('[T8] Audiências do Acervo entram na Agenda sem duplicar e sem criar prazo...');
{
  const cnj = '0000000-00.2026.5.04.0001';
  const outro = '0000001-00.2026.5.04.0001';
  const hearing = (at, time) => ({ date: '', time, scheduledAt: at, parties: 'PESSOA TESTE x EMPRESA TESTE', court: 'VARA DO TRABALHO DE TESTE' });
  const inventory = (processes, state = 'loaded') => ({ portalId: 'trt4-1g', portalName: 'TRT4 · PJe 1º grau', collectedAt: '2026-11-09T12:00:00.000Z', acervo: { state, processes } });
  const manual = { id: 'manual-1', title: 'Audiência manual', date: '2026-11-20', processNumber: cnj };
  const state = { agenda: [manual] };
  const primeira = { processNumber: cnj, classe: 'ATOrd', hearing: hearing('2026-11-18T08:10:00', '08:10') };
  const semAudiencia = { processNumber: outro, classe: 'HTE', hearing: null };

  assert.equal(reconcilePjeAcervoHearings(state, inventory([primeira, semAudiencia])).created, 1);
  assert.equal(state.agenda.length, 2);
  const event = state.agenda[0];
  assert.equal(event.title, 'Audiência — PESSOA TESTE x EMPRESA TESTE');
  assert.equal(event.processNumber, cnj);
  assert.equal(event.date, '2026-11-18');
  assert.equal(event.time, '08:10');
  assert.equal(event.description, 'PESSOA TESTE x EMPRESA TESTE');
  assert.equal(event.hearingType, 'AUDIÊNCIA');
  assert.ok(!('deadline' in event) && !('fatalDeadline' in event) && !('taskId' in event));

  assert.equal(reconcilePjeAcervoHearings(state, inventory([primeira])).unchanged, 1, 'Nova coleta é idempotente.');
  const remarcada = { ...primeira, hearing: hearing('2026-12-01T10:00:00', '10:00') };
  assert.equal(reconcilePjeAcervoHearings(state, inventory([remarcada])).updated, 1);
  assert.equal(state.agenda.length, 2, 'Remarcação não duplica.');
  assert.equal(state.agenda[0].date, '2026-12-01');

  assert.equal(reconcilePjeAcervoHearings(state, inventory([], 'partial')).inactive, 0, 'Leitura parcial não prova ausência.');
  assert.equal(reconcilePjeAcervoHearings(state, inventory([])).inactive, 1, 'Acervo completo sem a audiência futura a desativa.');
  assert.equal(state.agenda[0].active, false);

  const passada = { agenda: [] };
  reconcilePjeAcervoHearings(passada, { ...inventory([primeira]), collectedAt: '2026-11-10T12:00:00.000Z' });
  assert.equal(reconcilePjeAcervoHearings(passada, { ...inventory([]), collectedAt: '2026-11-19T12:00:00.000Z' }).inactive, 0, 'Audiência já ocorrida fica no histórico.');
  assert.equal(passada.agenda[0].sourceStatus, 'active');
  assert.deepEqual(state.agenda[1], manual, 'Evento manual fica intacto.');
  console.log('  ✓ Idempotente, remarcação atualiza, parcial não apaga, histórico e manual preservados.');
}

console.log('\n>>> COLLECTOR PJe-JT F1/F2: PASS <<<\n');
