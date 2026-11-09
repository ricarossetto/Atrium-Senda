import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  normalizeIdentityText,
  computeIntimationIdentity,
  groupDuplicateCandidates,
  DATE_TOLERANCE_DAYS
} from '../lib/publications/intimation-identity.mjs';

const sha = (...parts) => createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
const CNJ_A = '5001234-56.2024.8.21.0001';
const CNJ_B = '5001234-56.2024.8.21.0002';
const CNJ_C = '5001234-56.2024.8.21.0003';
const CNJ_D = '5001234-56.2024.8.21.0004';

console.log('--- Iniciando Testes Unitários: Identidade de Intimações (duplicadas) ---');

// 1. Normalização: acentos, caixa pt-BR, pontuação e espaços colapsados
{
  assert.equal(
    normalizeIdentityText('  Intimação   Nº 123/2024 — João D`Ávila  '),
    'intimacao n 123 2024 joao d avila'
  );
  assert.equal(normalizeIdentityText('INTIMACAO n° 123//2024'), 'intimacao n 123 2024');
  assert.equal(normalizeIdentityText('Art. 1º'), 'art 1');
  assert.equal(normalizeIdentityText('Decisão'), normalizeIdentityText('decisao'));
  assert.equal(normalizeIdentityText(null), '');
  assert.equal(normalizeIdentityText(undefined), '');
  assert.notEqual(normalizeIdentityText('Joana'), normalizeIdentityText('João'));
  console.log('✓ Cenário 1: normalização NFD, minúsculas e colapso de pontuação/ordinais');
}

// 2. Chave forte e fallback determinísticas
{
  const record = {
    id: 'djen:1001',
    externalId: 'djen:1001',
    process: CNJ_A,
    publishedAt: '2026-09-10',
    title: 'Intimação · Decisão',
    text: 'Fica a parte intimada a manifestar-se, querendo, no prazo legal.'
  };
  const identity = computeIntimationIdentity(record);
  assert.equal(identity.eligible, true);
  assert.equal(identity.matchable, true);
  assert.equal(identity.source, 'djen');
  assert.equal(identity.cnj, '50012345620248210001');
  assert.equal(identity.dataISO, '2026-09-10');
  assert.equal(identity.strong, sha(identity.cnj, '2026-09-10', normalizeIdentityText(record.title)));
  assert.equal(identity.fallback, sha(identity.cnj, '2026-09-10', normalizeIdentityText(record.text).slice(0, 160)));
  assert.equal(identity.strong, computeIntimationIdentity({ ...record }).strong, 'hash determinística');
  console.log('✓ Cenário 2: strong/fallback sha256 determinísticas por CNJ|data|evento/texto');
}

// 3. Evento alterado muda strong, não fallback; fallback limita a 160 caracteres
{
  const base = {
    externalId: 'djen:1002',
    process: CNJ_A,
    publishedAt: '2026-09-10',
    title: 'Intimação · Decisão',
    text: 'Corpo textual idêntico para ambos.'
  };
  const renamed = { ...base, title: 'Intimação · Sentença' };
  const baseIdentity = computeIntimationIdentity(base);
  const renamedIdentity = computeIntimationIdentity(renamed);
  assert.notEqual(baseIdentity.strong, renamedIdentity.strong);
  assert.equal(baseIdentity.fallback, renamedIdentity.fallback);

  const longText = 'a'.repeat(200);
  const shortText = `${'a'.repeat(160)}diferenca`;
  const longIdentity = computeIntimationIdentity({ ...base, text: longText });
  const shortIdentity = computeIntimationIdentity({ ...base, text: shortText });
  assert.equal(longIdentity.fallback, shortIdentity.fallback, 'fallback usa somente os 160 primeiros caracteres normalizados');
  console.log('✓ Cenário 3: strong sensível ao evento; fallback truncado em 160 caracteres');
}

// 4. dataISO: publishedAt (DJEN) e sourceReportedAt || collected (eproc)
{
  const djen = computeIntimationIdentity({
    externalId: 'djen:1003',
    process: CNJ_A,
    publishedAt: '2026-09-11',
    sourceReportedAt: '2026-09-12',
    title: 'Ato',
    text: 'Texto.'
  });
  assert.equal(djen.dataISO, '2026-09-11', 'DJEN usa publishedAt');

  const eprocReported = computeIntimationIdentity({
    externalId: 'eproc:tjrs:aaaa1111',
    processNumber: CNJ_A,
    publishedAt: '2026-09-13',
    sourceReportedAt: '2026-09-11',
    sourceCollectedAt: '2026-09-14T18:30:00.000Z',
    event: 'Intimação',
    sourceText: 'Texto.'
  });
  assert.equal(eprocReported.dataISO, '2026-09-11', 'eproc prioriza sourceReportedAt sobre publishedAt');

  const eprocCollected = computeIntimationIdentity({
    externalId: 'eproc:tjrs:bbbb2222',
    processNumber: CNJ_A,
    sourceCollectedAt: '2026-09-14T18:30:00.000Z',
    event: 'Intimação',
    sourceText: 'Texto.'
  });
  assert.equal(eprocCollected.dataISO, '2026-09-14', 'eproc cai para sourceCollectedAt');

  const eprocCreated = computeIntimationIdentity({
    externalId: 'eproc:tjrs:cccc3333',
    processNumber: CNJ_A,
    createdAt: '2026-09-15T09:00:00.000Z',
    event: 'Intimação',
    sourceText: 'Texto.'
  });
  assert.equal(eprocCreated.dataISO, '2026-09-15', 'eproc cai para createdAt');

  const domicilioReported = computeIntimationIdentity({
    externalId: 'domicilio:123456789',
    processNumber: CNJ_A,
    publishedAt: '2026-09-13',
    sourceReportedAt: '2026-09-11',
    sourceCollectedAt: '2026-09-14T18:30:00.000Z',
    event: 'Intimação',
    sourceText: 'Texto.'
  });
  assert.equal(domicilioReported.source, 'domicilio');
  assert.equal(domicilioReported.dataISO, '2026-09-11', 'Domicílio prioriza a data da comunicação informada pela fonte');

  const domicilioCollected = computeIntimationIdentity({
    externalId: 'domicilio:987654321',
    processNumber: CNJ_A,
    sourceCollectedAt: '2026-09-14T18:30:00.000Z',
    event: 'Intimação',
    sourceText: 'Texto.'
  });
  assert.equal(domicilioCollected.dataISO, '2026-09-14', 'Domicílio cai para a data de coleta quando a fonte não declara data');

  const invalidDate = computeIntimationIdentity({
    externalId: 'djen:1004',
    process: CNJ_A,
    publishedAt: '2026-02-31',
    createdAt: '2026-09-16T09:00:00.000Z',
    title: 'Ato',
    text: 'Texto.'
  });
  assert.equal(invalidDate.dataISO, '2026-09-16', 'data inválida é descartada');
  console.log('✓ Cenário 4: resolução de dataISO por fonte, com validação de calendário');
}

// 5. Inelegíveis: manuais, prefixos fora do escopo e registros sem CNJ/data
{
  const manual = computeIntimationIdentity({ id: 'int-1', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' });
  assert.equal(manual.eligible, false);
  assert.equal(manual.matchable, false);
  assert.equal(manual.strong, null);
  assert.equal(manual.fallback, null);

  const manualPrefixed = computeIntimationIdentity({ id: 'manual:abc', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' });
  assert.equal(manualPrefixed.eligible, false);

  const pjeSource = computeIntimationIdentity({ id: 'pje:pje-tjmt-2g:id:53180112', process: CNJ_A, sourceReportedAt: '2026-09-10', event: 'Ato', text: 'Texto.' });
  assert.equal(pjeSource.eligible, true, 'pje: é fonte elegível: a projeção PJe entra no acervo de Publicações.');
  assert.equal(pjeSource.source, 'pje');
  assert.equal(pjeSource.dataISO, '2026-09-10', 'A data de identidade do PJe é a informada na fonte, não a da coleta.');

  const otherSource = computeIntimationIdentity({ id: 'inpi:123', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' });
  assert.equal(otherSource.eligible, false, 'Fontes fora do escopo continuam inelegíveis.');

  const legacyEproc = computeIntimationIdentity({ id: 'intimation:eproc:50084381720238210', process: CNJ_A, publishedAt: '2026-09-10', event: 'Ato', text: 'Texto.' });
  assert.equal(legacyEproc.eligible, true, 'legado intimation:eproc: é elegível como eproc');
  assert.equal(legacyEproc.source, 'eproc');

  const domicilio = computeIntimationIdentity({ id: 'domicilio:555', process: CNJ_A, sourceReportedAt: '2026-09-10', event: 'Ato', text: 'Texto.' });
  assert.equal(domicilio.eligible, true, 'prefixo domicilio: é elegível para reconciliação');
  assert.equal(domicilio.source, 'domicilio');
  assert.equal(domicilio.matchable, true, 'CNJ + data da fonte + evento produzem identidade calculável');

  const legacyDomicilio = computeIntimationIdentity({ id: 'intimation:domicilio:777', process: CNJ_A, sourceReportedAt: '2026-09-10', event: 'Ato', text: 'Texto.' });
  assert.equal(legacyDomicilio.eligible, true, 'legado intimation:domicilio: é elegível como domicilio');
  assert.equal(legacyDomicilio.source, 'domicilio');

  const noCnj = computeIntimationIdentity({ id: 'djen:9999', publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' });
  assert.equal(noCnj.eligible, true, 'elegibilidade é definida pelo prefixo do externalId');
  assert.equal(noCnj.matchable, false, 'sem CNJ de 20 dígitos não há identidade calculável');

  const noDate = computeIntimationIdentity({ id: 'eproc:tjrs:dddd4444', processNumber: CNJ_A, event: 'Ato', sourceText: 'Texto.' });
  assert.equal(noDate.eligible, true);
  assert.equal(noDate.matchable, false, 'sem data oficial não há identidade calculável');
  console.log('✓ Cenário 5: inelegíveis (manual/sem externalId) nunca entram na fusão');
}

// 6. Agrupamento exato e matriz eproc×djen/eproc×eproc/djen×djen
{
  const records = [
    { externalId: 'djen:1', process: CNJ_A, publishedAt: '2026-09-10', title: 'Intimação · Decisão', text: 'Texto A.' },
    { externalId: 'djen:2', process: CNJ_A, publishedAt: '2026-09-10', title: 'Intimação · Decisão', text: 'Texto A.' },
    { externalId: 'eproc:tjrs:x1', processNumber: CNJ_A, sourceReportedAt: '2026-09-10', event: 'Intimação · Decisão', sourceText: 'Texto A.' },
    { externalId: 'eproc:tjrs:x2', processNumber: CNJ_B, sourceReportedAt: '2026-09-12', event: 'Despacho', sourceText: 'Texto B.' },
    { externalId: 'eproc:tjrs:x3', processNumber: CNJ_B, sourceReportedAt: '2026-09-12', event: 'Despacho', sourceText: 'Texto B.' },
    { externalId: 'domicilio:4001', processNumber: CNJ_A, sourceReportedAt: '2026-09-10', event: 'Intimação · Decisão', sourceText: 'Texto A.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 2);
  const groupA = result.groups.find(group => group.members.some(member => member.index === 0));
  assert.deepEqual(groupA.members.map(member => member.index), [0, 1, 2, 5]);
  assert.deepEqual(groupA.sources, ['djen', 'domicilio', 'eproc']);
  assert.equal(groupA.strongKeys.length, 1);
  assert.equal(groupA.fallbackKeys.length, 1);
  assert.equal(groupA.sourcePair, 'djen×domicilio');
  const groupB = result.groups.find(group => group.members.some(member => member.index === 3));
  assert.deepEqual(groupB.members.map(member => member.index), [3, 4]);
  assert.equal(groupB.sourcePair, 'eproc×eproc');
  assert.deepEqual(result.sourceMatrix, { 'djen×djen': 1, 'djen×domicilio': 2, 'djen×eproc': 2, 'domicilio×eproc': 1, 'eproc×eproc': 1 });
  assert.equal(result.stats.total, 6);
  assert.equal(result.stats.eligible, 6);
  assert.equal(result.stats.matchable, 6);
  assert.equal(result.stats.groups, 2);
  assert.equal(result.stats.grouped, 6);
  assert.equal(result.stats.exactPairs, 7);
  console.log('✓ Cenário 6: grupos exatos e matriz de pares djen×djen/djen×domicilio/djen×eproc/eproc×eproc');
}

// 6b. Legado intimation:eproc: agrupa com o oficial eproc por CNJ+data+evento
{
  const records = [
    { externalId: 'eproc:tjrs-eproc-1g:abc123', processNumber: CNJ_A, publishedAt: '2026-09-07', event: 'Ato ordinatório', sourceText: 'Linha do painel eproc.' },
    { externalId: 'intimation:eproc:50084381720238210', process: CNJ_A, publishedAt: '2026-09-07', event: 'Ato ordinatório', text: 'Linha do painel eproc.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 1, 'legado e oficial devem formar um grupo');
  assert.deepEqual(result.groups[0].members.map(member => member.index), [0, 1]);
  assert.equal(result.groups[0].sourcePair, 'eproc×eproc');
  assert.equal(result.groups[0].members[1].source, 'eproc');
  console.log('✓ Cenário 6b: legado intimation:eproc: agrupa com o oficial eproc');
}

// 7. Grupo somente por fallback (eventos divergentes, texto idêntico)
{
  const records = [
    { externalId: 'djen:10', process: CNJ_C, publishedAt: '2026-09-14', title: 'Intimação · Decisão', text: 'Mesmo corpo textual.' },
    { externalId: 'eproc:tjrs:y1', processNumber: CNJ_C, sourceReportedAt: '2026-09-14', event: 'Despacho', sourceText: 'Mesmo corpo textual.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].strongKeys.length, 0, 'eventos divergentes não compartilham strong');
  assert.equal(result.groups[0].fallbackKeys.length, 1);
  assert.equal(result.pairs[0].exact, 'fallback');
  console.log('✓ Cenário 7: fallback agrupa texto idêntico mesmo com evento divergente');
}

// 7b. Prefixo de fallback (160 chars) sem texto integral idêntico NÃO funde: só candidatura
{
  const base = { process: CNJ_C, publishedAt: '2026-09-14', title: 'Publicação' };
  const longPrefix = 'corpo '.repeat(30);
  const records = [
    { ...base, externalId: 'djen:60', text: `${longPrefix}desfecho A` },
    { ...base, externalId: 'eproc:tjrs:y9', event: 'Despacho', sourceReportedAt: '2026-09-14', sourceText: `${longPrefix}desfecho B` }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 0, 'prefixo de 160 chars não autoriza fusão automática');
  assert.equal(result.fallbackCandidates.length, 1);
  assert.equal(result.fallbackCandidates[0].autoSafe, false);
  assert.equal(result.fallbackCandidates[0].matchedBy, 'fallback');
  assert.equal(result.stats.fallbackCandidates, 1);

  const identical = groupDuplicateCandidates([records[0], { ...records[1], sourceText: records[0].text }]);
  assert.equal(identical.groups.length, 1, 'texto normalizado integral idêntico autoriza a fusão');
  assert.equal(
    computeIntimationIdentity(records[0]).fallback,
    computeIntimationIdentity(records[1]).fallback,
    'fallback continua determinístico para candidatura'
  );
  assert.notEqual(
    computeIntimationIdentity(records[0]).fullTextKey,
    computeIntimationIdentity(records[1]).fullTextKey,
    'texto integral divergente não compartilha fullTextKey'
  );
  console.log('✓ Cenário 7b: fallback de 160 chars só candidata; texto integral idêntico funde');
}

// 8. Não-colisão entre processos distintos
{
  const records = [
    { externalId: 'djen:11', process: CNJ_A, publishedAt: '2026-09-10', title: 'Intimação · Decisão', text: 'Mesmo texto.' },
    { externalId: 'eproc:tjrs:y2', processNumber: CNJ_B, sourceReportedAt: '2026-09-10', event: 'Intimação · Decisão', sourceText: 'Mesmo texto.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 0, 'processos distintos nunca colidem');
  assert.notEqual(
    computeIntimationIdentity(records[0]).strong,
    computeIntimationIdentity(records[1]).strong
  );
  console.log('✓ Cenário 8: sem colisão entre processos distintos');
}

// 9. Tolerância de ±1 dia apenas como candidatura; nunca fusão automática
{
  assert.equal(DATE_TOLERANCE_DAYS, 1);
  const records = [
    { externalId: 'djen:20', process: CNJ_C, publishedAt: '2026-09-15', title: 'Publicação X', text: 'Conteúdo C.' },
    { externalId: 'eproc:tjrs:z1', processNumber: CNJ_C, sourceReportedAt: '2026-09-16', event: 'Publicação X', sourceText: 'Conteúdo C.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 0, 'divergência de data nunca funde automaticamente');
  assert.equal(result.nearDateCandidates.length, 1);
  const candidate = result.nearDateCandidates[0];
  assert.equal(candidate.dayGap, 1);
  assert.equal(candidate.autoSafe, false);
  assert.equal(candidate.matchedBy, 'event+text');
  console.log('✓ Cenário 9: ±1 dia gera candidatura com autoSafe=false');
}

// 10. Evento e texto divergentes (ou gap != 1) não viram candidatura
{
  const diverging = groupDuplicateCandidates([
    { externalId: 'djen:21', process: CNJ_D, publishedAt: '2026-09-15', title: 'Ato Um', text: 'Texto D um.' },
    { externalId: 'djen:22', process: CNJ_D, publishedAt: '2026-09-16', title: 'Ato Dois', text: 'Texto D dois.' }
  ]);
  assert.equal(diverging.groups.length, 0);
  assert.equal(diverging.nearDateCandidates.length, 0, 'evento e texto divergentes não são candidatos');

  const gapTwo = groupDuplicateCandidates([
    { externalId: 'djen:23', process: CNJ_D, publishedAt: '2026-09-15', title: 'Publicação Y', text: 'Conteúdo Y.' },
    { externalId: 'djen:24', process: CNJ_D, publishedAt: '2026-09-17', title: 'Publicação Y', text: 'Conteúdo Y.' }
  ]);
  assert.equal(gapTwo.nearDateCandidates.length, 0, 'gap de 2 dias está fora da tolerância de candidatura');
  console.log('✓ Cenário 10: divergência e gap > 1 dia não geram candidatura');
}

// 11. Registros manuais sem externalId nunca entram em grupos
{
  const records = [
    { externalId: 'djen:30', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' },
    { externalId: 'djen:31', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' },
    { id: 'manual-30', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' },
    { process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' }
  ];
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].members.map(member => member.index), [0, 1]);
  assert.equal(result.stats.eligible, 2);
  assert.equal(result.stats.matchable, 2);
  assert.equal(result.stats.total, 4);
  console.log('✓ Cenário 11: manuais/sem externalId ignorados no agrupamento');
}

// 12. Pureza: entrada não é mutada e entradas inválidas não lançam
{
  const records = [
    { externalId: 'djen:40', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' },
    { externalId: 'djen:41', process: CNJ_A, publishedAt: '2026-09-10', title: 'Ato', text: 'Texto.' }
  ];
  const snapshot = JSON.stringify(records);
  const result = groupDuplicateCandidates(records);
  assert.equal(JSON.stringify(records), snapshot, 'entrada preservada byte a byte');
  assert.equal(result.groups[0].members[0].strong, computeIntimationIdentity(records[0]).strong);

  for (const invalid of [null, undefined, 'texto', 42, {}]) {
    const empty = groupDuplicateCandidates(invalid);
    assert.equal(empty.groups.length, 0);
    assert.equal(empty.stats.total, 0);
  }
  console.log('✓ Cenário 12: funções puras, sem mutação e resilientes a entradas inválidas');
}

// 13. Acervo grande no mesmo CNJ: buckets por data preservam a candidatura de ±1 dia
{
  const dayISO = offset => new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
  const records = [];
  for (let day = 0; day < 300; day += 1) {
    records.push({ externalId: `djen:perf-${day}`, process: CNJ_A, publishedAt: dayISO(day), title: `Ato ${day}`, text: `Texto único ${day}.` });
  }
  const targetDate = dayISO(400);
  const previousDate = dayISO(399);
  records.push({ externalId: 'djen:perf-adj', process: CNJ_A, publishedAt: targetDate, title: 'Publicação Alvo', text: 'Conteúdo alvo.' });
  records.push({ externalId: 'eproc:tjrs:perf-adj', processNumber: CNJ_A, sourceReportedAt: previousDate, event: 'Publicação Alvo', sourceText: 'Conteúdo alvo.' });
  const result = groupDuplicateCandidates(records);
  assert.equal(result.groups.length, 0, 'datas distintas não fundem automaticamente');
  assert.equal(result.nearDateCandidates.length, 1, 'apenas o par adjacente vira candidato');
  assert.equal(result.nearDateCandidates[0].dayGap, 1);
  assert.equal(result.stats.total, 302);
  console.log('✓ Cenário 13: buckets por CNJ/data mantêm a candidatura ±1 dia em acervo grande');
}

console.log('=== TODOS OS TESTES DE IDENTIDADE DE INTIMAÇÕES PASSARAM ===');
