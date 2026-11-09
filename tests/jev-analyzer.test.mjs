import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePendingPublications, prioritizeTasks, analyzeTeamProductivity,
  identifyProcessRisks, generateActionPlan
} from '../lib/ai/jev-analyzer.mjs';

const evaluatedAt = '2026-10-07T12:00:00.000Z';
const base = overrides => ({ evaluatedAt, tasks: [], intimations: [], processes: [], configuration: { users: [] }, ...overrides });
const task = (id, overrides = {}) => ({ id, title: 'Tarefa Teste', status: 'triagem', createdAt: '2026-10-01', ...overrides });
const publication = (id, overrides = {}) => ({ id, treatmentStatus: 'untreated', publishedAt: '2026-10-01', ...overrides });

test('backlog integral, detalhe de 90 dias e aliases resolvidos sem mutação', () => {
  const state = base({ intimations: [publication('antiga', { publishedAt: '2026-01-01' }), publication('nova'), publication('alias', { mergedInto: 'nova' }), publication('tratada', { treatmentStatus: 'treated' })], tasks: [task('vinculada', { intimationId: 'alias' })] });
  const before = structuredClone(state);
  const result = analyzePendingPublications(state);
  assert.equal(result.pendingCount, 2);
  assert.deepEqual(result.details.map(row => row.publicationId), ['nova']);
  assert.deepEqual(result.details[0].taskIds, ['vinculada']);
  assert.equal(result.coverage.outsideWindow, 1);
  assert.deepEqual(state, before);
  assert.equal(result.confidence, null);
  assert.equal(result.provenance.externalModelUsed, false);
 });

test('priorização operacional preserva fatal antigo, sem aplicar referência da fonte', () => {
  const rows = prioritizeTasks(base({ settings: { deadlineMode: 'manual' }, tasks: [
    task('fatal-antiga', { createdAt: '2025-01-01', fatalDeadline: '2026-10-06', responsible: 'Advogada Teste' }),
    task('fonte', { sourceReportedDeadlineAt: '2026-10-01', sourceReportedDeadlineSource: 'domicilio', responsible: 'Advogada Teste' }),
    task('encerrada', { status: 'concluida' }), task('cancelada', { status: 'cancelada' }),
    task('absorvida', { absorbedInto: 'fatal-antiga' }), task('inativa', { active: false })
  ] }));
  assert.deepEqual(rows.map(row => row.taskId), ['fatal-antiga', 'fonte']);
  assert.equal(rows[0].score, 70);
  assert.equal(rows[0].urgencyComponents.overdue, 40);
  assert.equal(rows[1].deadline, null);
  assert.equal(rows[1].score, 0);
 });

test('produtividade reutiliza métricas, declara denominadores e exclui data futura', () => {
  const result = analyzeTeamProductivity(base({ tasks: [
    task('conclusao', { status: 'concluida', createdAt: '2026-10-01', completedAt: '2026-10-02', deadline: '2026-10-03', responsible: 'Advogada Teste', completedBy: 'Assistente Teste', points: 10 }),
    task('pendente', { deadline: '2026-10-06' }),
    task('futura', { status: 'concluida', completedAt: '2026-11-01' }),
    task('legada', { status: 'concluida' })
  ], configuration: { users: [{ name: 'Advogada Teste', pointsGoal: 20 }] } }));
  assert.equal(result.totals.completed, 1);
  assert.equal(result.totals.pending, 1);
  assert.equal(result.totals.avgDurationMinutes, 1440);
  assert.equal(result.totals.points, 10);
  assert.deepEqual(result.rates.onTime, { value: 1, numerator: 1, denominator: 1 });
  assert.equal(result.rows.find(row => row.responsible === 'Advogada Teste').reach, 0.5);
  assert.equal(result.completions[0].completedBy, 'Assistente Teste');
 });

test('prescrição sem campo oficial é não avaliável e propostas nunca abrem prazo', () => {
  const state = base({ processes: [{ id: 'processo-teste', number: 'inválido', secrecy: true, lastMovement: 'Prescrição em 5 dias' }], intimations: [publication('fatal', { processId: 'processo-teste', fatalDeadline: '2026-10-08' })] });
  const risks = identifyProcessRisks(state);
  assert.equal(risks.processes[0].prescription.status, 'not_evaluable');
  assert.deepEqual(risks.risks.map(row => row.type), ['fatal_without_open_task']);
  const plan = generateActionPlan(state, { evaluatedAt, processRisks: risks });
  assert.equal(plan.suggestions.length, 1);
  assert.equal(plan.suggestions[0].taskId, null);
  assert.equal(plan.suggestions[0].deadline, null);
  assert.equal(plan.suggestions[0].fatalDeadline, false);
  assert.equal(plan.suggestions[0].requiresHumanReview, true);
   assert.equal(plan.suggestions[0].dateReference.value, '2026-10-08');
 });

test('validação de relógio, janela e período não consulta relógio ambiente', () => {
  assert.throws(() => analyzePendingPublications(null), TypeError);
  assert.throws(() => prioritizeTasks(base(), null), TypeError);
  for (const evaluatedAt of [undefined, true, 'ontem', '2026-02-30', '2026-13-01', '2026-10-01T99:00:00Z']) {
    assert.throws(() => analyzePendingPublications({ evaluatedAt }), TypeError);
  }
  for (const windowDays of [0, 91, 1.5, '30']) {
    assert.throws(() => analyzePendingPublications(base(), { windowDays }), RangeError);
  }
  for (const period of [
    { dateFrom: 'inválida' }, { dateTo: 'inválida' },
    { dateFrom: '2026-10-06', dateTo: '2026-10-05' },
    { dateTo: '2026-11-01' }, { dateFrom: '2026-01-01' }
  ]) assert.throws(() => analyzeTeamProductivity(base(), period), RangeError);
  assert.throws(() => generateActionPlan(base(), null), TypeError);
  assert.equal(analyzePendingPublications(base(), { evaluatedAt: '2026-10-07T09:00:00-03:00', windowDays: 1 }).evaluatedAt, evaluatedAt);
});

test('coleções ausentes, IDs duplicados e registros inválidos têm cobertura explícita', () => {
  const missing = analyzePendingPublications({ evaluatedAt });
  assert.deepEqual(missing.coverage.issues.map(row => row.collection), ['tasks', 'intimations', 'processes']);
  const result = analyzePendingPublications(base({ intimations: [null, {}, 'inválido', publication('duplicada'), publication('duplicada')] }));
  assert.equal(result.pendingCount, 0);
  assert.deepEqual(result.coverage.excluded.map(row => row.reason), ['invalid_record', 'missing_id', 'invalid_record', 'duplicate_id', 'duplicate_id']);
});

test('datas desconhecidas permanecem no estoque; futuro e status desconhecido não viram detalhe', () => {
  const result = analyzePendingPublications(base({ intimations: [
    publication('sem-data', { publishedAt: '' }), publication('inválida', { publishedAt: '2026-02-30' }),
    publication('futura', { publishedAt: '2027-01-01' }), publication('desconhecida', { treatmentStatus: 'nova-regra' }),
    publication('descartada', { treatmentStatus: 'discarded' }),
    publication('legada', { treatmentStatus: '', publishedAt: '', disponibilizadoEm: '2026-10-05' }),
    publication('revisao', { treatmentStatus: 'in_review', publishedAt: '2026-10-03' }),
    publication('mesmo-dia-a', { publishedAt: '2026-10-05' }), publication('mesmo-dia-b', { publishedAt: '2026-10-05' }),
    publication('ciclo-a', { mergedInto: 'ciclo-b' }), publication('ciclo-b', { mergedInto: 'ciclo-a' }),
    publication('alias-orfao', { mergedInto: 'ausente' })
  ] }));
  assert.equal(result.pendingCount, 6);
  assert.deepEqual(result.details.map(row => row.publicationId), ['revisao', 'legada', 'mesmo-dia-a', 'mesmo-dia-b']);
  assert.equal(result.coverage.issues.filter(row => row.reason === 'missing_or_cyclic_alias').length, 3);
  assert.equal(result.coverage.issues.some(row => row.reason === 'future_date'), true);
});

test('componentes do score, fatal booleano e desempate são transparentes', () => {
  const rows = prioritizeTasks(base({ tasks: [
    task('b', { priority: 'normal' }), task('a', { priority: 'não mapeada' }),
    task('logo', { deadline: '2026-10-09', priority: 'importante' }),
    task('fatal-bool', { deadline: '2026-10-08', fatalDeadline: true, priority: 'urgente' }),
    task('fatal-invalido', { fatalDeadline: true, deadline: 'inválida' }),
    task('data-invalida', { fatalDeadline: '2026-02-30' }),
    task('futura', { createdAt: '2026-11-01' }),
    task('inconsistente', { completedAt: '2026-10-02' }),
    task('prototipo', { priority: 'constructor' })
  ] }));
  assert.deepEqual(rows.map(row => row.taskId), ['fatal-bool', 'logo', 'a', 'b', 'data-invalida', 'fatal-invalido', 'prototipo']);
  assert.equal(rows[0].score, 75);
  assert.deepEqual(rows[0].urgencyComponents, { overdue: 0, dueSoon: 20, fatal: 30, priority: 20, unassigned: 5 });
  assert.equal(rows[1].score, 35);
  assert.equal(rows.find(row => row.taskId === 'fatal-invalido').fatal, false);
  assert.equal(rows[0].coverage.issues.some(row => row.reason === 'fatal_without_valid_date'), true);
});

const syntheticCnj = '0000001-18.2026.8.21.0000';

test('vínculo somente por ID exato ou CNJ válido único, nunca texto livre', () => {
  const state = base({ processes: [{ id: 'processo-a', number: syntheticCnj }, { id: 'processo-invalido', number: 'texto' }], tasks: [
    task('direta', { processId: 'processo-a' }), task('cnj', { processNumber: syntheticCnj }),
    task('orfã', { processId: 'não existe', process: syntheticCnj }), task('texto', { process: 'texto' }),
    task('pub-orfã', { publicationId: 'desconhecida' })
  ] });
  const rows = prioritizeTasks(state);
  assert.equal(rows.find(row => row.taskId === 'direta').process.reason, 'exact_process_id');
  assert.equal(rows.find(row => row.taskId === 'cnj').process.reason, 'unique_valid_cnj');
  assert.equal(rows.find(row => row.taskId === 'orfã').process.reason, 'missing_process_id');
  assert.equal(rows.find(row => row.taskId === 'texto').process.reason, 'invalid_cnj');
  assert.deepEqual(rows.find(row => row.taskId === 'pub-orfã').publicationLinks, [{ field: 'publicationId', reference: 'desconhecida', publicationId: null, reason: 'missing_or_cyclic_alias' }]);
  assert.equal(prioritizeTasks(base({ tasks: [task('sem-processo', { process: syntheticCnj })] }))[0].process.reason, 'missing_cnj');
  const ambiguous = prioritizeTasks({ ...state, processes: [...state.processes, { id: 'processo-b', number: syntheticCnj }] });
  assert.equal(ambiguous.find(row => row.taskId === 'cnj').process.reason, 'ambiguous_cnj');
});

test('fatal sem tarefa conserva vínculos desconhecidos; tarefa terminal não suprime risco', () => {
  const state = base({ processes: [{ id: 'processo-a', number: syntheticCnj }, { id: 'processo-b', number: syntheticCnj }], intimations: [
    publication('ambigua', { process: syntheticCnj, fatalDeadline: '2026-10-08', linkedTaskIds: ['ausente'] }),
    publication('resolvida', { processId: 'processo-a', fatalDeadline: '2026-10-08' }),
    publication('vinculada', { fatalDeadline: '2026-10-08', taskId: 'direta' }),
    publication('futura', { fatalDeadline: '2026-10-08', publishedAt: '2027-01-01' })
  ], tasks: [task('processual', { processId: 'processo-a' }), task('direta'), task('fechada', { process: syntheticCnj, status: 'cancelada' })] });
  const result = identifyProcessRisks(state);
  assert.deepEqual(result.risks.map(row => row.publicationId), ['ambigua', 'resolvida']);
  assert.equal(result.risks[1].type, 'fatal_without_open_task');
  assert.equal(result.risks[1].taskCoverage.status, 'uncertain');
  assert.deepEqual(result.risks[1].taskCoverage.processOnlyTaskIds, ['processual']);
  assert.equal(result.risks[0].linkReason, 'ambiguous_cnj');
  assert.equal(result.risks[0].type, 'fatal_link_not_evaluable');
  assert.deepEqual(result.risks[0].missingTaskIds, ['ausente']);
  assert.equal(result.unresolvedReferences.some(row => row.reference === syntheticCnj), true);
  assert.equal(identifyProcessRisks({ ...state, tasks: [task('cnj', { process: syntheticCnj })], processes: [state.processes[0]] }).risks.some(row => row.publicationId === 'ambigua'), true);
});

test('fontes manuais e Domicílio ficam referência; prazos humanos existentes prevalecem', () => {
  const rows = prioritizeTasks(base({ tasks: [
    task('manual', { sourceReportedDeadlineAt: '2026-10-01', source: 'eproc' }),
    task('domicilio', { sourceReportedDeadlineAt: '2026-10-01', sourceReportedDeadlineSource: 'domicilio' }),
    task('humana', { deadline: '2026-10-10', deadlineSource: 'conferencia', sourceReportedDeadlineAt: '2026-10-01' }),
    task('fonte-invalida', { sourceReportedDeadlineAt: 'não é data' })
  ] }));
  assert.equal(rows.find(row => row.taskId === 'manual').deadline, null);
  assert.equal(rows.find(row => row.taskId === 'domicilio').deadline, null);
  assert.equal(rows.find(row => row.taskId === 'humana').dateReference.source, 'conferencia');
  assert.equal(rows.find(row => row.taskId === 'fonte-invalida').sourceReference.valid, false);
  assert.equal(rows.find(row => row.taskId === 'manual').sourceReference.operational, false);
});

test('métricas sem denominador são null, com zero observado são zero', () => {
  const empty = analyzeTeamProductivity(base());
  assert.deepEqual(empty.rates.onTime, { value: null, numerator: 0, denominator: 0 });
  assert.equal(empty.totals.avgDurationMinutes, null);
  const result = analyzeTeamProductivity(base({ configuration: null, tasks: [
    task('atrasada', { status: 'concluida', createdAt: '', completedAt: '2026-10-03', deadline: '2026-10-01', points: -1, timeLogs: [{ minutes: 20, date: '2026-10-02' }, { minutes: -10 }, null, { minutes: '10' }, { minutes: 10, date: '2027-01-01' }, { minutes: 10, date: 'inválida' }, { minutes: 10 }] }),
    task('sem-prazo', { status: 'concluida', completedAt: '2026-10-04', points: 0 }),
    task('criada-depois', { status: 'concluida', createdAt: '2026-10-04', completedAt: '2026-10-03' }),
    task('criacao-futura', { status: 'concluida', createdAt: '2027-01-01', completedAt: '2026-10-03' }),
    task('conclusao-invalida', { status: 'concluida', completedAt: 'inválida' }),
    task('antiga', { status: 'concluida', createdAt: '2025-01-01', completedAt: '2025-10-01' }),
    task('pendente', { responsible: 'Advogada Teste', sourceReportedDeadlineAt: '2026-01-01' })
  ] }));
  assert.equal(result.totals.completed, 2);
  assert.equal(result.totals.pending, 1);
  assert.equal(result.totals.late, 0);
  assert.equal(result.totals.timeLoggedMinutes, 20);
  assert.deepEqual(result.rates.onTime, { value: 0, numerator: 0, denominator: 1 });
  assert.equal(result.coverage.durationDenominator, 1);
  assert.equal(result.rows[0].reach, null);
  assert.equal(result.factors[0].causalClaim, false);
  assert.equal(result.coverage.outsideWindow, 1);
});

test('período personalizado limita conclusões sem recortar o backlog antigo', () => {
  const result = analyzeTeamProductivity(base({ tasks: [
    task('dentro', { status: 'concluida', createdAt: '2026-10-03', completedAt: '2026-10-04' }),
    task('antes', { status: 'concluida', completedAt: '2026-10-02' }),
    task('depois', { status: 'concluida', completedAt: '2026-10-06' }),
    task('backlog', { createdAt: '2025-01-01' })
  ] }), { dateFrom: '2026-10-03', dateTo: '2026-10-05' });
  assert.deepEqual(result.completions.map(row => row.id), ['dentro']);
  assert.equal(result.totals.pending, 1);
});

test('plano revalida evidências, deduplica propostas e não confia em data fornecida pela análise', () => {
  const state = base({ tasks: [task('aberta', { deadline: '2026-10-09', responsible: 'Advogada Teste' })], intimations: [
    publication('nova', { sourceReportedDeadlineAt: '2026-10-15', sourceReportedDeadlineSource: 'domicilio' }),
    publication('alias', { mergedInto: 'nova' })
  ] });
  const analysis = { tasks: [{ taskId: 'aberta', deadline: '2027-01-01' }, { taskId: 'aberta' }, { taskId: 'ausente' }, null], processRisks: { risks: [{ riskId: 'inexistente' }, null] }, publications: { details: [{ publicationId: 'alias' }, { publicationId: 'ausente' }, null] } };
  const result = generateActionPlan(state, analysis);
  assert.deepEqual(result.suggestions.map(row => row.proposalId), ['proposal:review_publication:nova', 'proposal:review_task:aberta']);
  assert.equal(result.suggestions[1].dateReference.value, '2026-10-09');
  assert.deepEqual(result.suggestions[1].assigneeSuggestion, { name: 'Advogada Teste', authority: 'operational_name_only', confidence: null });
  assert.equal(result.suggestions[0].dateReference.operational, false);
  assert.equal(result.missingReferences.length, 6);
  assert.deepEqual(result.automaticActions, []);
  assert.equal(generateActionPlan(base(), {}).suggestions.length, 0);
});

test('todas as funções são puras e repetíveis inclusive acervo sigiloso autorizado', () => {
  const state = base({ processes: [{ id: 'sigiloso-teste', secrecy: true }], tasks: [task('b', { processId: 'sigiloso-teste' }), task('a')], intimations: [publication('nova')] });
  const before = structuredClone(state);
  for (const fn of [analyzePendingPublications, prioritizeTasks, analyzeTeamProductivity, identifyProcessRisks]) {
    assert.deepEqual(fn(state), fn(state));
    assert.deepEqual(state, before);
  }
  const analysis = { evaluatedAt, tasks: prioritizeTasks(state), publications: analyzePendingPublications(state), processRisks: identifyProcessRisks(state) };
  const priorAnalysis = structuredClone(analysis);
  assert.deepEqual(generateActionPlan(state, analysis), generateActionPlan(state, analysis));
  assert.deepEqual(analysis, priorAnalysis);
  assert.deepEqual(state, before);
  assert.equal(analyzeTeamProductivity(state).totals.pending, 2);
});

test('referência do Domicílio copiada indevidamente não ganha efeito operativo; curadoria prevalece', () => {
  const rows = prioritizeTasks(base({ tasks: [
    task('referencia', { deadline: '2026-10-01', deadlineSource: 'domicilio', sourceReportedDeadlineAt: '2026-10-01' }),
    task('humana-divergente', { deadline: '2026-10-09', deadlineSource: 'domicilio', sourceReportedDeadlineAt: '2026-10-01' }),
    task('fatal-humana', { deadline: '2026-10-01', fatalDeadline: true, deadlineSource: 'domicilio', sourceReportedDeadlineAt: '2026-10-01' })
  ] }));
  assert.equal(rows.find(row => row.taskId === 'referencia').deadline, null);
  assert.equal(rows.find(row => row.taskId === 'referencia').score, 5);
  assert.equal(rows.find(row => row.taskId === 'humana-divergente').deadline, '2026-10-09');
  assert.equal(rows.find(row => row.taskId === 'fatal-humana').fatal, true);
  assert.equal(rows[0].coverage.issues.some(row => row.reason === 'source_reference_not_operational'), true);
});

test('propostas conservam referências órfãs e recusam publicações encerradas ou futuras', () => {
  const state = base({ tasks: [task('orfã', { publicationId: 'pub-ausente', processId: 'proc-ausente' })], intimations: [
    publication('pendente', { linkedTaskIds: ['task-ausente'], process: 'número inválido' }),
    publication('tratada', { treatmentStatus: 'treated' }), publication('futura', { publishedAt: '2027-01-01' })
  ] });
  const plan = generateActionPlan(state, { tasks: [{ taskId: 'orfã' }], publications: { details: [{ publicationId: 'pendente' }, { publicationId: 'tratada' }, { publicationId: 'futura' }] } });
  assert.equal(plan.suggestions.length, 2);
  assert.deepEqual(plan.missingReferences.map(row => row.reason), ['missing_or_cyclic_alias', 'missing_process_id', 'missing_linked_task', 'invalid_cnj', 'ineligible_publication', 'ineligible_publication']);
  assert.equal(plan.suggestions[0].dateReference, null);
});

test('janela inclui marco exato; backlog e risco fatal antigo não são recortados', () => {
  const state = base({ intimations: [
    publication('limite', { publishedAt: '2026-07-10T03:00:00Z' }),
    publication('fora', { publishedAt: '2026-07-10T02:59:59Z', fatalDeadline: '2026-10-08', processId: 'processo' })
  ], processes: [{ id: 'processo' }] });
  const result = analyzePendingPublications(state);
  assert.equal(result.pendingCount, 2);
  assert.deepEqual(result.details.map(row => row.publicationId), ['limite']);
  assert.deepEqual(result.evidenceIds, ['fora', 'limite']);
  assert.equal(identifyProcessRisks(state).risks[0].publicationId, 'fora');
});

test('prazo com instante explícito mantém precisão na taxa de pontualidade', () => {
  const result = analyzeTeamProductivity(base({ tasks: [
    task('mesmo-instante', { status: 'concluida', completedAt: '2026-10-04T00:00:00Z', deadline: '2026-10-04T00:00:00Z' }),
    task('segundo-depois', { status: 'concluida', completedAt: '2026-10-04T00:00:01Z', deadline: '2026-10-04T00:00:00Z' })
  ] }));
  assert.deepEqual(result.rates.onTime, { value: 0.5, numerator: 1, denominator: 2 });
});

test('datas com hora inválida não são normalizadas para outro dia', () => {
  for (const evaluatedAt of ['2026-10-07T24:00:00Z', '2026-10-07T12:60:00Z', '2026-10-07T12:00:60Z', '2026-10-07T12:00:00+99:00']) {
    assert.throws(() => prioritizeTasks({ evaluatedAt }), TypeError);
  }
});

test('relógio injetado funciona com estado consolidado sem evaluatedAt', () => {
  const state = { tasks: [task('teste')], intimations: [], processes: [] };
  assert.equal(prioritizeTasks(state, { evaluatedAt })[0].provenance.evaluatedAt, evaluatedAt);
  assert.equal(identifyProcessRisks(state, { evaluatedAt }).evaluatedAt, evaluatedAt);
  assert.equal(analyzeTeamProductivity(state, { evaluatedAt }).totals.pending, 1);
});

test('cadeia de aliases e externalId resolvem ao keeper sem perder referências humanas', () => {
  const state = base({ intimations: [
    publication('keeper', { deadline: '2026-10-10', deadlineSource: 'conferencia' }),
    publication('alias-b', { mergedInto: 'keeper' }), publication('alias-a', { externalId: 'pje:teste-sintetico', mergedInto: 'alias-b' })
  ], tasks: [task('vinculo', { sourceIntimationId: 'pje:teste-sintetico' })] });
  assert.deepEqual(analyzePendingPublications(state).details[0].taskIds, ['vinculo']);
  const result = generateActionPlan(state, { publications: { details: [{ publicationId: 'alias-a' }] } });
  assert.equal(result.suggestions[0].publicationId, 'keeper');
  assert.deepEqual(result.suggestions[0].dateReference, { value: '2026-10-10', field: 'deadline', source: 'conferencia', evidenceId: 'keeper' });
});

test('ordenação não depende da ordem de entrada e retornos não compartilham objetos oficiais', () => {
  const state = base({ tasks: [task('c'), task('b', { deadline: '2026-10-09' }), task('a', { deadline: '2026-10-08' })], intimations: [publication('b'), publication('a')], processes: [{ id: 'b' }, { id: 'a' }] });
  const reversed = { ...state, tasks: [...state.tasks].reverse(), intimations: [...state.intimations].reverse(), processes: [...state.processes].reverse() };
  assert.deepEqual(prioritizeTasks(state), prioritizeTasks(reversed));
  assert.deepEqual(analyzePendingPublications(state), analyzePendingPublications(reversed));
  assert.deepEqual(identifyProcessRisks(state), identifyProcessRisks(reversed));
  const rows = prioritizeTasks(state);
  rows[0].taskId = 'alterado';
  assert.equal(state.tasks[2].id, 'a');
});

test('R1 tarefa de outro ato no mesmo processo nunca encobre fatal da publicação', () => {
  const state = base({ processes: [{ id: 'proc' }], intimations: [publication('fatal', { processId: 'proc', fatalDeadline: '2026-10-08' }), publication('outro')], tasks: [task('outro-ato', { processId: 'proc', publicationId: 'outro' })] });
  const result = identifyProcessRisks(state);
  assert.equal(result.risks[0].publicationId, 'fatal');
  assert.equal(result.risks[0].taskCoverage.status, 'uncertain');
  const linked = { ...state, intimations: [...state.intimations, publication('alias', { mergedInto: 'fatal' })], tasks: [task('mesmo-ato', { publicationId: 'alias' })] };
  assert.equal(identifyProcessRisks(linked).risks.length, 0);
});

test('R2 fatal inválido conserva urgência do deadline válido e evidência inválida', () => {
  const row = prioritizeTasks(base({ tasks: [task('fatal-invalida', { fatalDeadline: '2026-02-30', deadline: '2026-10-06' })] }))[0];
  assert.equal(row.deadline, '2026-10-06');
  assert.equal(row.fatal, false);
  assert.equal(row.score, 45);
  assert.equal(row.dateReference.field, 'deadline');
  assert.equal(row.coverage.issues.some(issue => issue.field === 'fatalDeadline' && issue.reason === 'invalid_date'), true);
});

test('R3 urgência civil BRT não muda à meia-noite UTC; ciclos usam instantes reais', () => {
  const state = base({ evaluatedAt: '2026-10-08T01:00:00Z', tasks: [task('hoje', { deadline: '2026-10-07' })] });
  assert.equal(prioritizeTasks(state)[0].daysUntil, 0);
  const report = analyzeTeamProductivity(base({ tasks: [task('civil', { status: 'concluida', createdAt: '2026-10-03T03:00:00Z', completedAt: '2026-10-05T02:59:59Z', deadline: '2026-10-04' })] }));
  assert.deepEqual(report.rates.onTime, { value: 1, numerator: 1, denominator: 1 });
  assert.equal(report.totals.avgDurationMinutes, 2880);
  assert.equal(report.timeZone, 'America/Sao_Paulo');
});

test('R4 relógio da análise é só dado não confiável e não determina elegibilidade', () => {
  const state = base({ tasks: [task('futura', { createdAt: '2027-01-01' })] });
  const result = generateActionPlan(state, { evaluatedAt: '2030-01-01', tasks: [{ taskId: 'futura' }] });
  assert.equal(result.evaluatedAt, evaluatedAt);
  assert.equal(result.suggestions.length, 0);
  assert.equal(generateActionPlan(state, { evaluatedAt: 'inválida' }).evaluatedAt, evaluatedAt);
  assert.equal(generateActionPlan(state, { tasks: [{ taskId: 'futura' }] }, { evaluatedAt: '2027-01-02T12:00:00Z' }).suggestions.length, 1);
  assert.throws(() => generateActionPlan({ tasks: [], intimations: [], processes: [] }, { evaluatedAt }), TypeError);
});

test('R5 dateTo civil inclui último instante BRT e exclui próximo dia', () => {
  const report = analyzeTeamProductivity(base({ tasks: [
    task('ultimo', { status: 'concluida', completedAt: '2026-10-06T02:59:59.999Z' }),
    task('proximo', { status: 'concluida', completedAt: '2026-10-06T03:00:00Z' })
  ] }), { dateFrom: '2026-10-01', dateTo: '2026-10-05' });
  assert.deepEqual(report.completions.map(row => row.id), ['ultimo']);
  assert.equal(report.range.end, '2026-10-06T02:59:59.999Z');
});

test('R6 janela relativa ao relógio rejeita intervalo antigo curto; hoje civil pode ser inclusivo', () => {
  assert.throws(() => analyzeTeamProductivity(base(), { dateFrom: '2025-01-01', dateTo: '2025-01-02' }), RangeError);
  assert.throws(() => analyzeTeamProductivity(base(), { dateFrom: '2026-07-09', dateTo: '2026-07-10' }), RangeError);
  assert.equal(analyzeTeamProductivity(base(), { dateFrom: '2026-07-10', dateTo: '2026-10-07' }).range.end, evaluatedAt);
});

test('R7 tipos presentes inválidos e overflow são explícitos, nunca zero fabricado', () => {
  const rows = prioritizeTasks(base({ tasks: [task('tipo', { deadline: 123, fatalDeadline: Infinity })] }));
  assert.equal(rows[0].coverage.issues.filter(issue => issue.reason === 'invalid_type').length, 2);
  const report = analyzeTeamProductivity(base({ configuration: { users: [{ name: 'Advogada Teste', pointsGoal: Infinity }] }, tasks: [
    task('a', { status: 'concluida', completedAt: '2026-10-02', responsible: 'Advogada Teste', points: Number.MAX_VALUE, timeLogs: [{ date: '2026-10-01', minutes: Number.MAX_VALUE }] }),
    task('b', { status: 'concluida', completedAt: '2026-10-02', responsible: 'Advogada Teste', points: Number.MAX_VALUE, timeLogs: [{ date: '2026-10-01', minutes: Number.MAX_VALUE }] })
  ] }));
  assert.equal(report.totals.points, null);
  assert.equal(report.totals.timeLoggedMinutes, null);
  assert.equal(report.rows[0].points, null);
  assert.equal(report.rows[0].goal, null);
  assert.equal(report.coverage.issues.some(issue => issue.reason === 'numeric_overflow'), true);
  assert.equal(report.coverage.issues.some(issue => issue.field === 'pointsGoal' && issue.reason === 'invalid_number'), true);
  assert.equal(report.coverage.status, 'insufficient_data');
});

test('R8 externalId duplicado não escolhe primeiro; ID exato e destino único preservados', () => {
  const state = base({ intimations: [publication('a', { externalId: 'pje:dup' }), publication('b', { externalId: 'pje:dup' })], tasks: [task('t', { publicationId: 'pje:dup' })] });
  const link = prioritizeTasks(state)[0].publicationLinks[0];
  assert.equal(link.publicationId, null);
  assert.equal(link.reason, 'ambiguous_publication_reference');
  assert.equal(prioritizeTasks({ ...state, tasks: [task('t', { publicationId: 'a' })] })[0].publicationLinks[0].publicationId, 'a');
  const merged = { ...state, intimations: [publication('a', { externalId: 'pje:dup', mergedInto: 'keeper' }), publication('b', { externalId: 'pje:dup', mergedInto: 'keeper' }), publication('keeper')] };
  assert.equal(prioritizeTasks(merged)[0].publicationLinks[0].publicationId, 'keeper');
  const plan = generateActionPlan(state, { publications: { details: [{ publicationId: 'pje:dup' }] } });
  assert.equal(plan.suggestions.length, 0);
  assert.equal(plan.missingReferences[0].reason, 'ambiguous_publication_reference');
});

test('responsável sugerido declara histórico e carga sem identidade autenticada nem atribuição', () => {
  const state = base({ users: [{ displayName: 'Advogada Teste' }], tasks: [
    task('hist-a', { status: 'concluida', completedAt: '2026-10-02', completedBy: 'Advogada Teste', taskDefinition: 'Revisão Teste' }),
    task('hist-b', { status: 'concluida', completedAt: '2026-10-03', completedBy: 'Advogada Teste', taskDefinition: 'Revisão Teste' }),
    task('pendente', { taskDefinition: 'Revisão Teste' }),
    task('carga', { responsible: 'Advogada Teste', status: 'aguardando', deadline: '2026-10-06' })
  ] });
  const report = analyzeTeamProductivity(state);
  assert.equal(report.assignmentSuggestions.length, 1);
  assert.equal(report.assignmentSuggestions[0].name, 'Advogada Teste');
  assert.equal(report.assignmentSuggestions[0].historicalShare, 1);
  assert.equal(report.assignmentSuggestions[0].confidence, null);
  assert.deepEqual(report.assignmentSuggestions[0].evidenceIds, ['hist-a', 'hist-b']);
  assert.equal(report.assignmentSuggestions[0].workload.pending, 1);
  assert.equal(report.assignmentSuggestions[0].workload.awaiting, 1);
  assert.equal(report.assignmentSuggestions[0].workload.overdue, 1);
  assert.deepEqual(report.factors.find(row => row.name === 'Advogada Teste').evidenceIds, ['carga']);
  assert.equal(report.factors[0].causalClaim, false);
  const plan = generateActionPlan(state, { tasks: [{ taskId: 'pendente' }] });
  assert.equal(plan.suggestions[0].assigneeSuggestion.authority, 'operational_name_only');
  assert.equal(state.tasks[2].responsible, undefined);
});

test('andamento só é avaliável com origem e identidade, associado a prazo explícito próximo', () => {
  const state = base({ processes: [
    { id: 'proc', movements: [null, { id: 'sem-fonte', date: '2026-10-06' }, { id: 'futuro', source: 'eproc', date: '2027-01-01' }, { id: 'antigo', source: 'eproc', date: '2026-09-01' }, { id: 'mov-teste', source: 'eproc', date: '2026-10-06' }] },
    { id: 'nao-comprovado', lastMovementAt: '2026-10-06', lastMovement: 'texto' }
  ], tasks: [task('prazo', { processId: 'proc', deadline: '2026-10-09' }), task('sem-prazo', { processId: 'proc' })] });
  const result = identifyProcessRisks(state);
  assert.equal(result.processes.find(row => row.processId === 'nao-comprovado').movement.status, 'not_evaluable');
  assert.equal(result.risks.length, 1);
  assert.equal(result.risks[0].type, 'recent_movement_short_deadline');
  assert.deepEqual(result.risks[0].evidenceIds, ['proc', 'mov-teste', 'prazo']);
  const plan = generateActionPlan(state, { processRisks: result });
  assert.equal(plan.suggestions[0].kind, 'review_process');
  assert.equal(plan.suggestions[0].deadline, null);
  assert.equal(plan.suggestions[0].processId, 'proc');
  assert.equal(identifyProcessRisks({ ...state, tasks: [] }).risks.length, 0);
});

test('referência de tarefa compartilhada por atos diferentes é ambígua e não resolve fatal', () => {
  const state = base({ processes: [{ id: 'proc' }], intimations: [
    publication('fatal', { processId: 'proc', fatalDeadline: '2026-10-08', taskId: 'compartilhada' }),
    publication('outro', { taskId: 'compartilhada' })
  ], tasks: [task('compartilhada')] });
  const result = identifyProcessRisks(state);
  assert.equal(result.risks.length, 1);
  assert.equal(result.coverage.issues.some(row => row.reason === 'ambiguous_act_task_reference'), true);
  const conflict = identifyProcessRisks({ ...state, tasks: [task('compartilhada', { publicationId: 'outro' })] });
  assert.equal(conflict.risks.length, 1);
  assert.equal(conflict.coverage.issues.some(row => row.reason === 'conflicting_publication_link'), true);
});

test('fuso confiável alternativo e fim civil não dependem de TZ do processo', () => {
  const state = base({ evaluatedAt: '2026-10-08T01:00:00Z', tasks: [task('prazo', { deadline: '2026-10-07' })] });
  assert.equal(prioritizeTasks(state, { timeZone: 'UTC' })[0].daysUntil, -1);
  assert.equal(prioritizeTasks(state)[0].daysUntil, 0);
  assert.throws(() => prioritizeTasks(state, { timeZone: 'fuso-inexistente' }), RangeError);
  assert.throws(() => prioritizeTasks(state, { timeZone: 42 }), TypeError);
  assert.equal(analyzeTeamProductivity(base(), { timeZone: 'UTC', dateTo: '2026-10-05' }).range.end, '2026-10-05T23:59:59.999Z');
});

test('F1 movimentos DataJud usam shape code/name/at e proveniência do produtor, sem fallback isolado', () => {
  const process = { id: 'datajud:process:teste', source: 'DataJud/CNJ', datajudAlias: 'api_publica_tjrs', collectedAt: '2026-10-07T10:00:00Z', datajudUpdatedAt: '2026-10-06T10:00:00Z', lastMovement: 'Movimento Teste', lastMovementAt: '2026-10-06T09:00:00Z', movements: [{ code: '123', name: 'Movimento Teste', at: '2026-10-06T09:00:00Z', complements: [{ code: '1', name: 'Complemento Teste', value: 'Sintético' }] }] };
  const state = base({ processes: [process], tasks: [task('prazo', { processId: process.id, deadline: '2026-10-09' })] });
  const result = identifyProcessRisks(state);
  assert.equal(result.risks.length, 1);
  assert.equal(result.processes[0].movement.source, 'datajud');
  assert.equal(result.processes[0].movement.movementEvidence.fieldPath, 'movements[0]');
  assert.equal(result.processes[0].movement.movementEvidence.code, '123');
  assert.equal(result.processes[0].movement.movementEvidence.at, '2026-10-06T09:00:00.000Z');
  assert.equal(result.processes[0].movement.movementEvidence.provenanceScope, 'process');
  assert.match(result.processes[0].movement.movementId, /^movement:[a-f0-9]{64}$/);
  assert.deepEqual(identifyProcessRisks(structuredClone(state)), result);
  for (const patch of [{ movements: [] }, { source: 'Texto sem origem' }, { datajudAlias: '' }, { movements: [{ code: '123', name: 'Movimento Teste', at: 'inválida' }] }]) {
    assert.equal(identifyProcessRisks({ ...state, processes: [{ ...process, ...patch }] }).processes[0].movement.status, 'not_evaluable');
  }
  assert.equal(identifyProcessRisks({ ...state, tasks: [task('sem-prazo', { processId: process.id })] }).risks.length, 0);
  const atOnly = { ...state, processes: [{ ...process, movements: [{ source: 'eproc', at: '2026-10-06T09:00:00Z' }] }] };
  const opaque = identifyProcessRisks(atOnly).processes[0].movement;
  assert.equal(opaque.status, 'evaluated');
  assert.equal(opaque.movementEvidence.officialMovementId, null);
  assert.equal(opaque.movementEvidence.provenanceScope, 'movement');
  assert.equal(opaque.movementId, identifyProcessRisks(structuredClone(atOnly)).processes[0].movement.movementId);
  assert.equal(identifyProcessRisks({ ...state, processes: [{ ...process, movements: [{ code: '123', name: 'Futuro Teste', at: '2027-01-01' }] }] }).processes[0].movement.status, 'not_evaluable');
});

test('F2 carga observada prevalece sobre frequência histórica e redistribuição é limitada sem escrever', () => {
  const history = ['a1', 'a2', 'a3', 'b1', 'b2'].map(id => task(id, { status: 'concluida', completedAt: '2026-10-02', completedBy: id[0] === 'a' ? 'Advogada A Teste' : 'Advogada B Teste', taskDefinition: 'Revisão Teste' }));
  const live = Array.from({ length: 20 }, (_, index) => task(`carga-${String(index).padStart(2, '0')}`, { responsible: 'Advogada A Teste', taskDefinition: 'Revisão Teste' }));
  const state = base({ configuration: { users: [{ name: 'Advogada A Teste' }, { name: 'Advogada B Teste' }] }, tasks: [task('00-sem-responsavel', { taskDefinition: 'Revisão Teste' }), ...live, ...history] });
  const before = structuredClone(state);
  const report = analyzeTeamProductivity(state);
  const first = report.assignmentSuggestions[0];
  assert.equal(first.name, 'Advogada B Teste');
  assert.equal(first.historicalShare, 0.4);
  assert.equal(first.quantitativeBasis.targetPending, 0);
  assert.equal(first.quantitativeBasis.historicalCompleted, 2);
  assert.deepEqual(first.evidenceIds, ['b1', 'b2']);
  assert.equal(report.assignmentSuggestions.length <= 10, true);
  const transfer = report.assignmentSuggestions.find(row => row.kind === 'redistribution');
  assert.equal(transfer.currentResponsible, 'Advogada A Teste');
  assert.equal(transfer.name, 'Advogada B Teste');
  assert.equal(transfer.quantitativeBasis.currentPending, 20);
  assert.equal(transfer.workloadEvidenceIds.length, 20);
  const plan = generateActionPlan(state, { tasks: [{ taskId: transfer.taskId }] });
  assert.equal(plan.suggestions[0].assigneeSuggestion.name, 'Advogada B Teste');
  assert.equal(plan.suggestions[0].assigneeSuggestion.requiresHumanReview, true);
  assert.deepEqual(state, before);
  assert.deepEqual(analyzeTeamProductivity({ ...state, tasks: [...state.tasks].reverse() }).assignmentSuggestions, report.assignmentSuggestions);
  const collision = analyzeTeamProductivity({ ...state, configuration: { users: [{ name: 'Advogada A Teste' }, { name: 'Advogada B Teste' }, { name: 'advogada b teste' }] } });
  assert.equal(collision.assignmentSuggestions.some(row => row.name.toLowerCase() === 'advogada b teste'), false);
  assert.equal(collision.coverage.issues.some(row => row.reason === 'ambiguous_team_member_name'), true);
  const unknown = analyzeTeamProductivity({ ...state, tasks: [task('desconhecida', { responsible: 'Pessoa Fora Teste', taskDefinition: 'Revisão Teste' }), ...history] });
  assert.deepEqual(unknown.assignmentSuggestions, []);
  assert.equal(unknown.coverage.issues.some(row => row.reason === 'unknown_or_ambiguous_team_member'), true);
  const balanced = analyzeTeamProductivity({ ...state, tasks: [task('carga-a', { responsible: 'Advogada A Teste', taskDefinition: 'Revisão Teste' }), task('carga-b', { responsible: 'Advogada B Teste', taskDefinition: 'Revisão Teste' }), ...history] });
  assert.deepEqual(balanced.assignmentSuggestions, []);
});

test('F3 instante vencido no mesmo dia civil é atrasado em score, totais e carga; data civil não', () => {
  const state = base({ tasks: [task('instante', { responsible: 'Advogada Teste', deadline: '2026-10-07T08:00:00-03:00' }), task('civil', { responsible: 'Advogada Teste', deadline: '2026-10-07' }), task('futuro', { responsible: 'Advogada Teste', deadline: '2026-10-07T10:00:00-03:00' })] });
  const priorities = prioritizeTasks(state);
  assert.equal(priorities.find(row => row.taskId === 'instante').urgencyComponents.overdue, 40);
  assert.equal(priorities.find(row => row.taskId === 'instante').urgencyComponents.dueSoon, 0);
  assert.equal(priorities.find(row => row.taskId === 'civil').urgencyComponents.overdue, 0);
  const report = analyzeTeamProductivity(state);
  assert.equal(report.totals.late, 1);
  assert.equal(report.rows[0].late, 1);
  assert.equal(report.workload.find(row => row.name === 'Advogada Teste').overdue, 1);
  assert.deepEqual(report.workload.find(row => row.name === 'Advogada Teste').overdueEvidenceIds, ['instante']);
});

test('F4 tipos ausentes ou inválidos não compartilham histórico por fallback geral', () => {
  const state = base({ configuration: { users: [{ name: 'Advogada Teste' }] }, tasks: [
    task('sem-tipo'), task('tipo-invalido', { taskDefinition: 123 }),
    task('h1', { status: 'concluida', completedAt: '2026-10-02', completedBy: 'Advogada Teste' }),
    task('h2', { status: 'concluida', completedAt: '2026-10-03', completedBy: 'Advogada Teste', taskDefinition: {} })
  ] });
  const report = analyzeTeamProductivity(state);
  assert.deepEqual(report.assignmentSuggestions, []);
  assert.equal(report.assignmentCoverage.status, 'insufficient_data');
  assert.equal(report.coverage.issues.some(row => row.reason === 'missing_task_type'), true);
  assert.equal(report.coverage.issues.some(row => row.reason === 'invalid_task_type'), true);
  assert.equal(report.completions.every(row => row.type === 'histórico não tipificado'), true);
  assert.deepEqual(report.byType, [{ type: 'histórico não tipificado', count: 2 }]);
});

test('P2 plano conserva janela e período confiáveis sem recuperar histórico de 90 dias indevido', () => {
  const state = base({ evaluatedAt: '2027-01-01T00:00:00Z', configuration: { users: [{ name: 'Advogada Teste' }] }, tasks: [
    task('aberta', { taskDefinition: 'Revisão Teste' }),
    task('agosto-a', { createdAt: '2026-08-01', status: 'concluida', completedAt: '2026-08-10', completedBy: 'Advogada Teste', taskDefinition: 'Revisão Teste' }),
    task('agosto-b', { createdAt: '2026-08-01', status: 'concluida', completedAt: '2026-08-20', completedBy: 'Advogada Teste', taskDefinition: 'Revisão Teste' })
  ] });
  const options30 = { evaluatedAt, timeZone: 'America/Sao_Paulo', windowDays: 30 };
  const analysis = { evaluatedAt: '2027-01-01T00:00:00Z', windowDays: 90, dateFrom: '2026-08-01', dateTo: '2026-08-31', tasks: prioritizeTasks(state, options30), productivity: analyzeTeamProductivity(state, options30) };
  assert.equal(analysis.productivity.totals.completed, 0);
  assert.deepEqual(analysis.productivity.assignmentSuggestions, []);
  const plan30 = generateActionPlan(state, analysis, options30);
  assert.equal(plan30.evaluatedAt, evaluatedAt);
  assert.equal(plan30.suggestions[0].assigneeSuggestion, null);
  const options90 = { ...options30, windowDays: 90 };
  const plan90 = generateActionPlan(state, { ...analysis, windowDays: 1, dateFrom: 'inválida', dateTo: 'inválida' }, options90);
  assert.equal(plan90.suggestions[0].assigneeSuggestion.name, 'Advogada Teste');
  assert.deepEqual(plan90.suggestions[0].assigneeSuggestion.evidenceIds, ['agosto-a', 'agosto-b']);
  assert.equal(generateActionPlan(state, analysis, { ...options90, dateFrom: '2026-09-01', dateTo: '2026-09-30' }).suggestions[0].assigneeSuggestion, null);
  assert.equal(generateActionPlan(state, analysis, { ...options90, dateFrom: '2026-08-01', dateTo: '2026-08-20' }).suggestions[0].assigneeSuggestion.name, 'Advogada Teste');
  assert.equal(generateActionPlan(state, analysis, { ...options90, dateTo: '2026-08-19' }).suggestions[0].assigneeSuggestion, null);
  assert.throws(() => generateActionPlan(state, analysis, { ...options90, dateFrom: 'inválida' }), RangeError);
  assert.throws(() => generateActionPlan(state, analysis, { ...options90, dateTo: 'inválida' }), RangeError);
  assert.throws(() => generateActionPlan({ ...state, evaluatedAt: undefined }, analysis, { windowDays: 30 }), TypeError);
});

test('overflow do alcance e do apontamento individual não vaza Infinity no resultado', () => {
  const report = analyzeTeamProductivity(base({ configuration: { users: [{ name: 'Advogada Teste', pointsGoal: Number.MIN_VALUE }] }, tasks: [
    task('overflow', { status: 'concluida', completedAt: '2026-10-02', responsible: 'Advogada Teste', points: Number.MAX_VALUE, timeLogs: [{ date: '2026-10-01', minutes: Number.MAX_VALUE }, { date: '2026-10-01', minutes: Number.MAX_VALUE }] })
  ] }));
  assert.equal(report.rows[0].reach, null);
  assert.equal(report.completions[0].timeLoggedMinutes, null);
  assert.equal(report.totals.timeLoggedMinutes, null);
  assert.equal(report.coverage.issues.some(row => row.field === 'reach' && row.reason === 'numeric_overflow'), true);
});
