import assert from 'node:assert/strict';
import {
  computeMergePlan,
  chooseKeeper,
  absorbedIntimationKeys,
  selectNewPublicationEvents
} from '../lib/publications/intimation-merge-engine.mjs';
import { groupDuplicateCandidates } from '../lib/publications/intimation-identity.mjs';

const CNJ = '5001234-56.2024.8.21.0001';
const CNJ_DIGITS = CNJ.replace(/\D/g, '');
const EVENT = 'Intimação · Decisão';
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

console.log('--- Iniciando Testes Unitários: Motor de Fusão de Publicações Duplicadas ---');

function canonicalRecord(overrides = {}) {
  return {
    id: 'eproc:tjrs-eproc-1g:deadbeefdeadbeefdeadbeefdeadbeef',
    externalId: 'eproc:tjrs-eproc-1g:deadbeefdeadbeefdeadbeefdeadbeef',
    portalId: 'tjrs-eproc-1g',
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    event: EVENT,
    title: 'Intimação eproc',
    text: 'Teor resumido coletado do Painel do Advogado.',
    sourceText: 'Texto integral do painel.',
    sourceReportedAt: '2026-09-10',
    sourceReportedDeadlineAt: '2026-09-20',
    sourceStatus: 'active',
    sourceProvenance: { system: 'eproc', portalId: 'tjrs-eproc-1g', itemType: 'open_deadline' },
    sourceEvidence: [
      { status: 'active', collectedAt: '2026-09-11T09:00:00.000Z', sourceText: 'primeira' },
      { status: 'active', collectedAt: '2026-09-13T09:00:00.000Z', sourceText: 'terceira' }
    ],
    treatmentStatus: 'treated',
    treatedAt: '2026-09-12T10:00:00.000Z',
    treatedBy: 'Administrador Teste',
    treatmentNote: 'Nota oficial',
    linkedTaskIds: ['task-canonical'],
    taskId: 'task-canonical',
    linkedWorkActions: [{ id: 'work-canonical', type: 'note' }],
    workNotes: [{ id: 'note-canonical', text: 'nota oficial' }],
    status: 'pendente',
    unread: false,
    deadline: '',
    fatalDeadline: '',
    createdAt: '2026-09-11T08:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    ...overrides
  };
}

function legacyRecord(overrides = {}) {
  return {
    id: `intimation:eproc:${CNJ_DIGITS}`,
    externalId: `intimation:eproc:${CNJ_DIGITS}`,
    process: CNJ,
    source: 'eproc',
    event: EVENT,
    title: 'Despacho legado',
    text: 'Texto legado com menos detalhes.',
    sourceReportedAt: '2026-09-10',
    sourceCollectedAt: '2026-09-10T12:00:00.000Z',
    sourceAliases: ['eproc:fingerprint-legado'],
    treatmentStatus: 'in_review',
    treatmentStartedAt: '2026-09-14T09:00:00.000Z',
    treatmentNote: 'Nota legada',
    linkedTaskIds: ['task-legacy'],
    linkedWorkActions: [{ id: 'work-legacy', type: 'deadline' }],
    workNotes: [{ id: 'note-legacy', text: 'nota legada' }],
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-14T09:00:00.000Z',
    ...overrides
  };
}

function djenRecord(overrides = {}) {
  return {
    id: 'djen:9001',
    externalId: 'djen:9001',
    process: CNJ,
    source: 'DJEN',
    event: EVENT,
    title: 'Intimação oficial DJEN',
    text: 'Texto oficial completo publicado no DJEN.',
    rawHtml: '<p>Texto oficial completo publicado no DJEN.</p>',
    publishedAt: '2026-09-10',
    client: 'Recipiente do DJEN',
    sourceStatus: 'not_present',
    createdAt: '2026-09-10T07:00:00.000Z',
    updatedAt: '2026-09-10T07:00:00.000Z',
    ...overrides
  };
}

// 0. Sanidade do agrupamento que alimenta o motor (oficial + legado + DJEN no mesmo grupo)
{
  const records = [canonicalRecord(), legacyRecord(), djenRecord()];
  const grouped = groupDuplicateCandidates(records);
  assert.equal(grouped.groups.length, 1, 'os três registros devem formar um único grupo duplicado');
  assert.equal(grouped.groups[0].members.length, 3);
  assert.equal(grouped.groups[0].sourcePair, 'djen×eproc');
  console.log('✓ Cenário 0: identidade agrupa oficial eproc, legado eproc e DJEN');
}

// 1. chooseKeeper: oficial eproc com portalId/tratamento/tarefas vence; mergedInto nunca é keeper
{
  const canonical = canonicalRecord();
  const legacy = legacyRecord({ updatedAt: '2030-01-01T00:00:00.000Z', text: 'texto com muitos outros campos preenchidos', client: 'Cliente' });
  assert.equal(chooseKeeper(canonical, legacy), canonical, 'oficial eproc vence mesmo com updatedAt mais antigo no legado');
  assert.equal(chooseKeeper(legacy, canonical), canonical, 'ordem dos argumentos não muda o vencedor');

  const disqualified = canonicalRecord({ mergedInto: 'eproc:outro', mergedAt: '2026-09-15T00:00:00.000Z' });
  assert.equal(chooseKeeper(disqualified, legacy), legacy, 'registro já absorvido nunca é keeper');
  assert.equal(chooseKeeper(disqualified, { ...disqualified, id: 'eproc:outro-2' }), null, 'dois aliases não elegem keeper');
  assert.equal(chooseKeeper(null, undefined), null, 'entradas inválidas degradam para null');

  const older = djenRecord();
  const newer = djenRecord({ id: 'djen:9002', externalId: 'djen:9002', updatedAt: '2026-09-12T00:00:00.000Z' });
  assert.equal(chooseKeeper(older, newer), newer, 'empatado em campos, vence updatedAt mais recente');

  const plainDjen = djenRecord({ id: 'djen:9100', externalId: 'djen:9100' });
  const deadlineDjen = djenRecord({ id: 'djen:9101', externalId: 'djen:9101', deadline: '2026-09-30' });
  assert.equal(chooseKeeper(plainDjen, deadlineDjen), deadlineDjen, 'prazo confirmado pontua na escolha do keeper');
  assert.equal(chooseKeeper(deadlineDjen, plainDjen), deadlineDjen, 'escolha é independente da ordem');
  console.log('✓ Cenário 1: preferência por oficial eproc, tratamento/prazo/tarefas e desempate estável');
}

// 2. Conteúdo: DJEN vence texto/título/data/rawHtml; sem DJEN, keeper prevalece e preenche vazios
{
  const plan = computeMergePlan(canonicalRecord(), djenRecord({ publishedAt: '2026-09-11' }));
  assert.equal(plan.mergeable, true);
  assert.equal(plan.merged.text, 'Texto oficial completo publicado no DJEN.');
  assert.equal(plan.merged.title, 'Intimação oficial DJEN');
  assert.equal(plan.merged.rawHtml, '<p>Texto oficial completo publicado no DJEN.</p>');
  assert.equal(plan.merged.publishedAt, '2026-09-11', 'data da fonte DJEN prevalece');
  assert.equal(plan.merged.sourceText, 'Texto integral do painel.', 'campos ausentes no DJEN permanecem do keeper');

  const noDjen = computeMergePlan(canonicalRecord(), legacyRecord({ rawHtml: '<p>html legado</p>' }));
  assert.equal(noDjen.merged.text, 'Teor resumido coletado do Painel do Advogado.', 'sem DJEN o keeper prevalece');
  assert.equal(noDjen.merged.rawHtml, '<p>html legado</p>', 'campo vazio do keeper é preenchido pelo loser');

  const emptyLoser = computeMergePlan(canonicalRecord(), legacyRecord({ text: '', title: '' }));
  assert.equal(emptyLoser.merged.text, 'Teor resumido coletado do Painel do Advogado.', 'valor vazio nunca apaga o keeper');
  console.log('✓ Cenário 2: precedência de conteúdo DJEN e merge aditivo');
}

// 3. Contato/processo: eproc/curadoria vence; recipient DJEN nunca vira client; vazio não apaga
{
  const keeperWithClient = canonicalRecord({ client: 'Cliente Oficial Teste', contactId: 'contact-1' });
  const conflictClient = computeMergePlan(keeperWithClient, legacyRecord({ client: 'Cliente Legado Teste' }));
  assert.equal(conflictClient.merged.client, 'Cliente Oficial Teste', 'keeper eproc prevalece sobre loser eproc');
  assert.equal(conflictClient.merged.contactId, 'contact-1');

  const fillFromLoser = computeMergePlan(canonicalRecord(), legacyRecord({ client: 'Cliente Legado Teste', processId: 'process-9' }));
  assert.equal(fillFromLoser.merged.client, 'Cliente Legado Teste', 'eproc preenche vazio do keeper');
  assert.equal(fillFromLoser.merged.processId, 'process-9');

  const eprocOverDjen = computeMergePlan(djenRecord(), legacyRecord({ client: 'Cliente Legado Teste' }));
  assert.equal(eprocOverDjen.merged.client, 'Cliente Legado Teste', 'eproc vence DJEN no vínculo de cliente');

  const djenOnly = computeMergePlan(djenRecord(), djenRecord({ id: 'djen:9002', externalId: 'djen:9002', client: 'Outro Recipiente' }));
  assert.equal(djenOnly.merged.client, 'Recipiente do DJEN', 'recipient DJEN nunca é importado como client');

  const emptyNeverErases = computeMergePlan(canonicalRecord({ client: 'Cliente Oficial Teste' }), legacyRecord({ client: '' }));
  assert.equal(emptyNeverErases.merged.client, 'Cliente Oficial Teste', 'vazio do loser não sobrescreve contato');
  console.log('✓ Cenário 3: precedência eproc/curadoria e blindagem do vínculo de cliente');
}

// 4. Fonte: eproc vence prazo/status/proveniência; evidência cronológica deduplicada
{
  const keeper = djenRecord({
    sourceEvidence: [
      { status: 'active', collectedAt: '2026-09-11T09:00:00.000Z', sourceText: 'E1' },
      { status: 'active', collectedAt: '2026-09-13T09:00:00.000Z', sourceText: 'E3' }
    ]
  });
  const loser = legacyRecord({
    sourceReportedDeadlineAt: '2026-09-22',
    sourceStatus: 'active',
    sourceProvenance: { system: 'eproc', portalId: 'tjrs-eproc-1g' },
    sourceEvidence: [
      { status: 'active', collectedAt: '2026-09-11T09:00:00.000Z', sourceText: 'E1' },
      { status: 'active', collectedAt: '2026-09-12T09:00:00.000Z', sourceText: 'E2' }
    ]
  });
  const plan = computeMergePlan(keeper, loser);
  assert.equal(plan.merged.sourceReportedDeadlineAt, '2026-09-22', 'prazo informado pela fonte eproc vence');
  assert.equal(plan.merged.sourceStatus, 'active', 'ativo se qualquer fonte estiver ativa');
  assert.deepEqual(plan.merged.sourceProvenance, { system: 'eproc', portalId: 'tjrs-eproc-1g' });
  assert.deepEqual(
    plan.merged.sourceEvidence.map(entry => entry.sourceText),
    ['E1', 'E2', 'E3'],
    'evidência concatenada em ordem cronológica e sem duplicatas'
  );
  assert.equal(plan.merged.deadline || '', '', 'fonte sem aplicação automática não cria prazo');
  assert.equal((plan.merged.deadlineSource ?? null), null);

  const appliedPlan = computeMergePlan(
    djenRecord(),
    legacyRecord({ sourceReportedDeadlineAt: '2026-09-22', deadline: '2026-09-22', deadlineSource: 'eproc' })
  );
  assert.equal(appliedPlan.merged.deadline, '2026-09-22', 'prazo aplicado pela fonte oficial é preservado na fusão');
  assert.equal(appliedPlan.merged.deadlineSource, 'eproc');

  const manualPlan = computeMergePlan(
    djenRecord({ deadline: '2026-09-30', deadlineSource: 'manual' }),
    legacyRecord({ sourceReportedDeadlineAt: '2026-09-22' })
  );
  assert.equal(manualPlan.merged.deadline, '2026-09-30', 'prazo manual do usuário prevalece sobre a fonte');
  assert.equal(manualPlan.merged.deadlineSource, 'manual');

  const inactive = computeMergePlan(
    legacyRecord({ sourceStatus: 'not_present', sourceReportedDeadlineAt: '2026-09-20' }),
    canonicalRecord({ sourceStatus: 'not_present' })
  );
  assert.equal(inactive.merged.sourceStatus, 'not_present', 'sem fonte ativa, mantém o status existente');

  // Domicílio Eletrônico: data declarada é referência da fonte, nunca prazo operativo sozinho.
  const domicilioReference = computeMergePlan(
    djenRecord(),
    legacyRecord({ externalId: 'domicilio:777', sourceReportedDeadlineAt: '2026-09-25', sourceReportedDeadlineSource: 'domicilio' })
  );
  assert.equal(domicilioReference.merged.sourceReportedDeadlineAt, '2026-09-25', 'referência declarada pelo Domicílio é preservada');
  assert.equal(domicilioReference.merged.sourceReportedDeadlineSource, 'domicilio', 'origem da referência fica explícita para a UI');
  assert.equal(domicilioReference.merged.deadline || '', '', 'Domicílio não aplica prazo operativo por si só');

  const eprocOverDomicilio = computeMergePlan(
    legacyRecord({ externalId: 'eproc:tjrs:dom1', sourceReportedDeadlineAt: '2026-09-22', sourceReportedDeadlineSource: 'eproc', deadline: '2026-09-22', deadlineSource: 'eproc' }),
    legacyRecord({ externalId: 'domicilio:778', sourceReportedDeadlineAt: '2026-09-25', sourceReportedDeadlineSource: 'domicilio' })
  );
  assert.equal(eprocOverDomicilio.merged.sourceReportedDeadlineAt, '2026-09-22', 'eproc permanece verdade absoluta do prazo');
  assert.equal(eprocOverDomicilio.merged.sourceReportedDeadlineSource, 'eproc');
  assert.equal(eprocOverDomicilio.merged.deadline, '2026-09-22');
  assert.equal(eprocOverDomicilio.merged.deadlineSource, 'eproc');

  const domicilioNeverManual = computeMergePlan(
    legacyRecord({ externalId: 'domicilio:779', sourceReportedDeadlineAt: '2026-09-25', sourceReportedDeadlineSource: 'domicilio', publishedAt: '2026-09-25', event: 'Intimação', sourceText: 'Texto.' }),
    legacyRecord({ externalId: 'eproc:tjrs:dom2', sourceReportedDeadlineAt: '2026-09-22', sourceReportedDeadlineSource: 'eproc', deadline: '2026-09-22', deadlineSource: 'eproc', publishedAt: '2026-09-25', event: 'Intimação', sourceText: 'Texto.' })
  );
  assert.equal(domicilioNeverManual.merged.sourceReportedDeadlineAt, '2026-09-22', 'data do eproc vence a referência do Domicílio');
  assert.equal(domicilioNeverManual.merged.sourceReportedDeadlineSource, 'eproc');
  assert.equal(domicilioNeverManual.merged.deadline, '2026-09-22', 'prazo do eproc substitui referência do Domicílio');
  assert.equal(domicilioNeverManual.merged.deadlineSource, 'eproc', 'Domicílio não é tratado como prazo humano');
  console.log('✓ Cenário 4: precedência de fonte, status ativo e evidência deduplicada');
}

// 5. Arrays: união deduplicada de tarefas, providências e notas + sourceAliases acumulado
{
  const plan = computeMergePlan(canonicalRecord(), legacyRecord());
  assert.deepEqual(plan.merged.linkedTaskIds, ['task-canonical', 'task-legacy']);
  assert.equal(plan.merged.taskId, 'task-canonical');
  assert.deepEqual(plan.merged.linkedWorkActions.map(item => item.id), ['work-canonical', 'work-legacy']);
  assert.deepEqual(plan.merged.workNotes.map(item => item.id), ['note-canonical', 'note-legacy']);
  assert.ok(plan.merged.sourceAliases.includes(`intimation:eproc:${CNJ_DIGITS}`));
  assert.ok(plan.merged.sourceAliases.includes('eproc:fingerprint-legado'));

  const repeated = computeMergePlan(canonicalRecord(), legacyRecord({
    linkedTaskIds: ['task-legacy', 'task-canonical'],
    linkedWorkActions: [{ id: 'work-canonical', type: 'note' }, { id: 'work-legacy', type: 'deadline' }]
  }));
  assert.deepEqual(repeated.merged.linkedTaskIds, ['task-canonical', 'task-legacy'], 'deduplicação preserva a ordem estável');
  assert.deepEqual(repeated.merged.linkedWorkActions.map(item => item.id), ['work-canonical', 'work-legacy']);
  console.log('✓ Cenário 5: união deduplicada de arrays e sourceAliases acumulado');
}

// 6. Tratamento: evento mais recente vence e notas são concatenadas sem repetição
{
  const plan = computeMergePlan(canonicalRecord(), legacyRecord());
  assert.equal(plan.merged.treatmentStatus, 'in_review', 'tratamento mais recente (legado 09-14) vence');
  assert.equal(plan.merged.treatmentStartedAt, '2026-09-14T09:00:00.000Z');
  assert.equal(plan.merged.treatedAt, null, 'campos contraditórios do vencedor são zerados');
  assert.equal(plan.merged.treatedBy, null);
  assert.equal(plan.merged.treatmentNote, 'Nota oficial\nNota legada');

  const keeperMostRecent = computeMergePlan(canonicalRecord({ treatedAt: '2026-09-16T10:00:00.000Z' }), legacyRecord());
  assert.equal(keeperMostRecent.merged.treatmentStatus, 'treated', 'keeper com evento mais recente permanece');
  assert.equal(keeperMostRecent.merged.treatedAt, '2026-09-16T10:00:00.000Z');
  assert.equal(keeperMostRecent.merged.treatmentStartedAt, null);

  const sameNote = computeMergePlan(canonicalRecord({ treatmentNote: 'Mesma nota' }), legacyRecord({ treatmentNote: 'Mesma nota' }));
  assert.equal(sameNote.merged.treatmentNote, 'Mesma nota', 'nota idêntica não é duplicada');
  console.log('✓ Cenário 6: tratamento mais recente e concatenação idempotente de notas');
}

// 7. Conflito treated × discarded impede a fusão
{
  const plan = computeMergePlan(
    canonicalRecord(),
    legacyRecord({ treatmentStatus: 'discarded', treatmentStartedAt: null, discardedAt: '2026-09-15T10:00:00.000Z', discardedBy: 'Administrador Teste' })
  );
  assert.equal(plan.mergeable, false);
  assert.deepEqual(plan.conflict, { reason: 'treatment-conflict' });
  assert.equal(plan.merged, null);
  assert.equal(plan.alias, null);
  assert.deepEqual(plan.taskLinkRewrites, []);

  const reverse = computeMergePlan(
    canonicalRecord({ treatmentStatus: 'discarded', treatedAt: null, treatedBy: null, discardedAt: '2026-09-15T10:00:00.000Z' }),
    legacyRecord({ treatmentStatus: 'treated', treatmentStartedAt: null, treatedAt: '2026-09-16T10:00:00.000Z' })
  );
  assert.equal(reverse.mergeable, false, 'conflito é simétrico');
  console.log('✓ Cenário 7: treated × discarded nunca funde');
}

// 8. Alias reversível e reescrita de tarefas com shape estável
{
  const keeper = canonicalRecord();
  const loser = legacyRecord();
  const plan = computeMergePlan(keeper, loser);
  assert.deepEqual(Object.keys(plan.alias).sort(), ['id', 'mergedAt', 'mergedInto', 'reason', 'sourceAliases']);
  assert.equal(plan.alias.id, loser.id);
  assert.equal(plan.alias.mergedInto, keeper.id);
  assert.equal(plan.alias.reason, 'duplicate-identity');
  assert.match(plan.alias.mergedAt, ISO_PATTERN);
  assert.deepEqual(plan.alias.sourceAliases, plan.merged.sourceAliases, 'alias e keeper compartilham a lista de identidades absorvidas');
  assert.ok(plan.alias.sourceAliases.includes(loser.externalId));
  assert.deepEqual(plan.taskLinkRewrites, [{ taskId: 'task-legacy', from: loser.id, to: keeper.id }]);
  console.log('✓ Cenário 8: alias mergeable com id/mergedInto/motivo/mergedAt e rewrites de tarefa');
}

// 9. Imutabilidade: entradas preservadas e resultado sem referências compartilhadas
{
  const keeper = canonicalRecord();
  const loser = legacyRecord();
  const keeperSnapshot = structuredClone(keeper);
  const loserSnapshot = structuredClone(loser);
  const plan = computeMergePlan(keeper, loser);
  assert.deepEqual(keeper, keeperSnapshot, 'keeper não pode ser mutado');
  assert.deepEqual(loser, loserSnapshot, 'loser não pode ser mutado');

  plan.merged.linkedTaskIds.push('task-injetao');
  plan.merged.workNotes[0].text = 'mutado';
  plan.merged.sourceEvidence[0].sourceText = 'mutado';
  assert.deepEqual(keeper, keeperSnapshot, 'resultado não compartilha arrays com o keeper');
  assert.deepEqual(loser, loserSnapshot, 'resultado não compartilha objetos com o loser');
  console.log('✓ Cenário 9: pureza e imutabilidade das entradas');
}

// 10. Idempotência: fundir novamente o mesmo perdedor não altera o keeper
{
  const keeper = canonicalRecord();
  const loser = legacyRecord();
  const first = computeMergePlan(keeper, loser);
  const aliasRecord = {
    ...loser,
    mergedInto: first.alias.mergedInto,
    mergedAt: first.alias.mergedAt,
    mergeReason: first.alias.reason,
    sourceAliases: first.alias.sourceAliases
  };
  const second = computeMergePlan(first.merged, aliasRecord);
  assert.deepEqual(second.merged, first.merged, 'segunda fusão deve ser idêntica à primeira');
  assert.equal(second.alias.mergedAt, first.alias.mergedAt, 'mergedAt original preservado');
  assert.deepEqual(second.alias.sourceAliases, first.alias.sourceAliases);

  const stableAgain = computeMergePlan(second.merged, { ...aliasRecord, ...second.alias, mergedInto: second.alias.mergedInto });
  assert.deepEqual(stableAgain.merged, first.merged, 'terceira passagem continua estável');
  console.log('✓ Cenário 10: idempotência preservando mergedAt');
}

// 11b. Prazo confirmado e não lido do perdedor são preservados aditivamente
{
  const plan = computeMergePlan(
    canonicalRecord({ deadline: '', fatalDeadline: '', unread: false }),
    legacyRecord({ deadline: '2026-09-30', fatalDeadline: '2026-10-05', unread: true })
  );
  assert.equal(plan.merged.deadline, '2026-09-30', 'prazo confirmado do perdedor é herdado quando o keeper não tem');
  assert.equal(plan.merged.fatalDeadline, '2026-10-05');
  assert.equal(plan.merged.unread, true, 'unread é a união booleana');

  const keeperConfirmed = computeMergePlan(
    canonicalRecord({ deadline: '2026-09-25', unread: true }),
    legacyRecord({ deadline: '2026-09-30', unread: false })
  );
  assert.equal(keeperConfirmed.merged.deadline, '2026-09-25', 'confirmação do keeper nunca é sobrescrita');
  assert.equal(keeperConfirmed.merged.unread, true, 'lido nos dois lados continua lido');

  const noDeadline = computeMergePlan(canonicalRecord(), legacyRecord());
  assert.equal(noDeadline.merged.deadline, '', 'nenhum prazo é inventado');
  assert.equal(noDeadline.merged.fatalDeadline, '');
  assert.equal(noDeadline.merged.unread, false, 'sem lado não lido, permanece lido');
  console.log('✓ Cenário 11b: prazo confirmado herdado sem inferência e unread unificado');
}

// 11c. Eventos pós-fusão: alias e perdedor absorvido nunca viram novidade no digest
{
  const merges = [
    { keeperId: 'eproc:1', loserId: 'intimation:eproc:abc' },
    { keeperId: 'eproc:1', loserId: '' },
    { keeperId: 'eproc:1' }
  ];
  const absorbed = absorbedIntimationKeys(merges);
  assert.deepEqual([...absorbed], ['intimation:eproc:abc'], 'apenas ids de perdedores válidos entram no filtro');

  const selected = selectNewPublicationEvents([
    { id: 'eproc:1', externalId: 'eproc:1' },
    { id: 'intimation:eproc:abc', externalId: 'intimation:eproc:abc' },
    { id: 'djen:alias', mergedInto: 'eproc:1' },
    { id: 'djen:old', externalId: 'djen:old' },
    null,
    'texto'
  ], { previousKeys: new Set(['djen:old']), absorbedKeys: absorbed });
  assert.deepEqual(selected.map(record => record.id), ['eproc:1'], 'somente o keeper inédito é anunciado');
  assert.deepEqual(selectNewPublicationEvents(null), [], 'entrada inválida não lança');
  console.log('✓ Cenário 11c: digest pós-fusão exclui alias e perdedor absorvido');
}

// 11. Entradas inválidas não fundem nem lançam
{
  for (const invalid of [null, undefined, [], 'texto', 42]) {
    const plan = computeMergePlan(canonicalRecord(), invalid);
    assert.equal(plan.mergeable, false);
    assert.equal(plan.merged, null);
    assert.equal(plan.alias, null);
    assert.deepEqual(plan.taskLinkRewrites, []);
  }
  console.log('✓ Cenário 11: entradas inválidas degradam para não fusão');
}

// 4b. Texto integral (fullText): o Domicilio traz o teor completo - longer-wins,
// sem jamais sobrescrever o texto de publicacao do DJEN.
{
  const publicacaoDjen = 'Texto de publicacao do DJEN (curto, oficial).';
  const teorIntegral = ('Teor integral da comunicacao do Domicilio Eletronico. ').repeat(120);
  const registroDjen = djenRecord({ text: publicacaoDjen, fullText: 'Trecho parcial do olho.', fullTextSource: 'djen' });
  const registroDomicilio = legacyRecord({ externalId: 'domicilio:9002', text: 'Resumo curto do portal.', fullText: teorIntegral, fullTextSource: 'domicilio' });
  const plan = computeMergePlan(registroDjen, registroDomicilio);
  assert.equal(plan.merged.text, publicacaoDjen, 'Texto de publicacao do DJEN permanece.');
  assert.equal(plan.merged.fullText, teorIntegral, 'O maior texto integral vence (Domicilio).');
  assert.equal(plan.merged.fullTextSource, 'domicilio');

  const reverso = computeMergePlan(registroDomicilio, registroDjen);
  assert.equal(reverso.merged.fullText, teorIntegral, 'A ordem dos registros nao muda o longer-wins.');
  assert.equal(reverso.merged.text, publicacaoDjen, 'DJEN segue vencendo o texto de publicacao.');

  const semIntegral = computeMergePlan(djenRecord({ text: 'A' }), legacyRecord({ text: 'B' }));
  assert.equal('fullText' in semIntegral.merged, false, 'Sem texto integral, o campo nao nasce.');
  console.log('  OK: texto integral do Domicilio vence pelo maior teor sem sobrescrever o DJEN.');
}


console.log('\n[PASS] Todos os cenários do motor de fusão passaram.');
