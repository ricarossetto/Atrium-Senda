import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  planTaskDuplicateCandidatePairs,
  planTaskAutoAbsorptions,
  taskAutonomyBlocker,
  taskPairKeeper,
  TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE,
  TASK_DUPLICATE_AUTO_ABSORB_LIMIT,
  ABSORB_REASON_AUTONOMOUS
} from '../lib/tasks/task-duplicate-review.mjs';
import { applyTaskGroupConsolidation, undoTaskGroupConsolidation } from '../lib/publications/source-deadline-consolidation.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DUPLICATA DE TAREFA: PARES DO JEV E AUTONOMIA ASSISTIDA');
console.log('===============================================================\n');

const CNJ = '5012345-67.2026.8.21.0001';

{
  const olderA = { id: 'old-a', process: CNJ, title: 'Manifestação', deadline: '2026-11-20', intimationId: 'pub-a', updatedAt: '2026-01-01' };
  const olderB = { id: 'old-b', process: CNJ, title: 'Manifestação', deadline: '2026-11-20', intimationId: 'pub-b', updatedAt: '2026-01-02' };
  const newer = Array.from({ length: 8 }, (_, index) => ({ id: `new-${index}`, process: CNJ, title: `Outro ato ${index}`, updatedAt: `2026-10-${String(index + 1).padStart(2, '0')}` }));
  const sourceText = 'Texto sintético longo, contendo fundamentos da decisão e detalhamento da intimação para manifestação da parte. '.repeat(2);
  const publications = new Map([['old-a', { fullText: sourceText }], ['old-b', { fullText: sourceText }]]);
  const result = planTaskDuplicateCandidatePairs({ tasks: [...newer, olderA, olderB], intimationOf: item => publications.get(item.id) });
  const pair = result.pairs.find(item => item.key === 'old-a|old-b');
  assert.ok(pair, 'o par mais antigo e forte deve ser encontrado mesmo após seis tarefas novas');
  assert.match(pair.text, /texto integral da publicação é idêntico/i);
  assert.doesNotMatch(pair.text, /Texto sintético longo/, 'o teor da publicação não é enviado ao classificador');
  const other = { id: 'third', process: CNJ, title: 'Outro ato', intimationId: 'pub-c', updatedAt: '2026-02-01' };
  const grouped = planTaskDuplicateCandidatePairs({ tasks: [olderA, olderB, other], groupedPublicationKeys: ['pub-a'] });
  assert.ok(grouped.pairs.some(item => item.key === 'old-a|third'), 'outra comparação não é descartada só porque uma tarefa pertence a grupo diferente');
  const queue = [];
  for (let index = 0; index < 13; index++) {
    const process = `5012345-67.2026.8.21.${String(index).padStart(4, '0')}`;
    queue.push({ id: `fila-${index}-a`, process }, { id: `fila-${index}-b`, process });
  }
  const next = planTaskDuplicateCandidatePairs({ tasks: queue, limit: 12, isReviewed: pair => !pair.key.startsWith('fila-12-') });
  assert.equal(next.pairs[0].key, 'fila-12-a|fila-12-b', 'pares já conferidos não prendem a fila no primeiro lote');
  assert.equal(next.truncated, true);
}

function sourceTask({ id, title, deadline, sourceDeadline, changedAt, intimationId = '', extra = {} } = {}) {
  const descricao = `Descrição sintética da tarefa ${id}.`;
  return {
    id,
    title,
    description: descricao,
    process: CNJ,
    source: 'eproc',
    status: 'triagem',
    priority: 'normal',
    deadline,
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: sourceDeadline,
    sourceDeadlineChangedAt: changedAt,
    sourceIntimationId: intimationId,
    sourceManagedSnapshot: { title, description: descricao, deadline, status: 'triagem' },
    updatedAt: changedAt,
    createdAt: changedAt,
    ...extra
  };
}

console.log('[T1] Pares candidatos: mesma origem fica fora, mesmo processo e atos diferentes entram...');
{
  const suspensao = sourceTask({
    id: 'tarefa-teste-suspensao',
    title: 'Conferir prazo informado pelo eproc — suspensão',
    deadline: '2026-10-15',
    sourceDeadline: '2026-10-15',
    changedAt: '2026-09-25T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-a'
  });
  const contestacao = sourceTask({
    id: 'tarefa-teste-contestacao',
    title: 'Conferir prazo informado pelo eproc — contestação',
    deadline: '2026-10-08',
    sourceDeadline: '2026-10-08',
    changedAt: '2026-09-20T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-b'
  });
  const mesmaPublicacao = sourceTask({
    id: 'tarefa-teste-mesma-publicacao',
    title: 'Conferir prazo informado pelo eproc — contestação',
    deadline: '2026-10-08',
    sourceDeadline: '2026-10-08',
    changedAt: '2026-09-20T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-b'
  });
  const concluida = sourceTask({
    id: 'tarefa-teste-concluida',
    title: 'Conferir prazo informado pelo eproc — audiência',
    deadline: '2026-10-02',
    sourceDeadline: '2026-10-02',
    changedAt: '2026-09-18T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-c',
    extra: { status: 'concluida' }
  });
  const absorvida = { ...sourceTask({
    id: 'tarefa-teste-absorvida',
    title: 'Conferir prazo informado pelo eproc — manifestação',
    deadline: '2026-10-01',
    sourceDeadline: '2026-10-01',
    changedAt: '2026-09-17T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-d'
  }), absorbedInto: 'outra-tarefa' };
  const semCnj = sourceTask({ id: 'tarefa-teste-sem-cnj', title: 'Tarefa sem processo', deadline: '2026-10-01', sourceDeadline: '2026-10-01', changedAt: '2026-09-17T10:00:00.000Z' });
  delete semCnj.process;

  const { pairs } = planTaskDuplicateCandidatePairs({
    tasks: [suspensao, contestacao, mesmaPublicacao, concluida, absorvida, semCnj]
  });
  assert.equal(pairs.length, 2, 'só pares de origens diferentes entram (mesma publicação fica na chave determinística)');
  const chaves = pairs.map(pair => pair.key);
  assert.deepEqual(chaves, [...chaves].sort(), 'ordem estável de pares (mesmo estado, mesmo custo)');
  assert.ok(pairs.every(pair => !pair.key.includes('tarefa-teste-concluida')), 'concluída não entra na conferência');
  assert.ok(pairs.every(pair => !pair.key.includes('tarefa-teste-absorvida')), 'absorvida não entra na conferência');
  assert.ok(pairs.every(pair => !pair.key.includes('tarefa-teste-sem-cnj')), 'tarefa sem processo não entra (chave exige CNJ)');
  assert.ok(pairs.every(pair => !(pair.aId === 'tarefa-teste-contestacao' && pair.bId === 'tarefa-teste-mesma-publicacao')), 'mesma publicação é caso da chave determinística');
  const par = pairs.find(pair => pair.key.includes('tarefa-teste-suspensao') && pair.key.includes('tarefa-teste-contestacao'));
  assert.ok(par, 'suspensão × contestação é exatamente o par que a chave não agrupa');
  assert.match(par.text, /LEITURA A .*LEITURA B/s, 'texto comparado traz os dois lados');
  assert.match(par.text, /prazo declarado pela fonte: 2026-10-15/, 'a declaração da fonte vai para o modelo');
  assert.ok(par.text.length < 4_000, 'texto comparado é enxuto (custo e teto de entrada)');

  const limitado = planTaskDuplicateCandidatePairs({ tasks: [suspensao, contestacao, mesmaPublicacao], limit: 2 });
  assert.equal(limitado.pairs.length, 2, 'teto de pares por rodada é respeitado');
  console.log('  OK: pares do mesmo processo, sem mesma origem, com teto e ordem estável.');
}

console.log('[T2] Trilhos da autonomia: só projeção intocada da fonte pode ser absorvida sozinha...');
{
  const suspensao = sourceTask({
    id: 'tarefa-teste-suspensao',
    title: 'Conferir prazo informado pelo eproc — suspensão',
    deadline: '2026-10-15',
    sourceDeadline: '2026-10-15',
    changedAt: '2026-09-25T10:00:00.000Z'
  });
  const contestacao = sourceTask({
    id: 'tarefa-teste-contestacao',
    title: 'Conferir prazo informado pelo eproc — contestação',
    deadline: '2026-10-08',
    sourceDeadline: '2026-10-08',
    changedAt: '2026-09-20T10:00:00.000Z'
  });
  assert.equal(taskAutonomyBlocker(contestacao), '', 'projeção intocada da fonte é elegível');
  assert.equal(taskAutonomyBlocker({ ...contestacao, deadline: '2026-10-20' }), 'prazo-humano', 'prazo digitado por pessoa nunca é absorvido');
  assert.equal(taskAutonomyBlocker({ ...contestacao, fatalDeadline: '2026-10-09' }), 'prazo-fatal-humano', 'prazo fatal humano nunca é absorvido');
  assert.equal(taskAutonomyBlocker({ ...contestacao, responsible: 'Advogada Teste' }), 'curadoria-humana', 'tarefa com responsável é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, timeSpentMinutes: 15 }), 'curadoria-humana', 'tempo apontado é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, priority: 'urgente' }), 'curadoria-humana', 'prioridade mexida é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, status: 'andamento' }), 'curadoria-humana', 'status fora de triagem é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, date: '2026-10-01' }), 'curadoria-humana', 'agendamento digitado por pessoa é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, time: '14:30' }), 'curadoria-humana', 'horário digitado por pessoa é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, resolution: 'Conferido com o cliente' }), 'curadoria-humana', 'desfecho anotado por pessoa é curadoria humana');
  assert.equal(taskAutonomyBlocker({ ...contestacao, sourceReportedDeadlineAt: '' }), 'sem-prazo-da-fonte', 'tarefa sem prazo da fonte fica fora da autonomia');

  const veredito = (overrides = {}) => ({
    key: [contestacao.id, suspensao.id].sort().join('|'),
    aId: contestacao.id,
    bId: suspensao.id,
    verdict: 'mesma',
    confidence: 0.95,
    reason: 'Mesmo ato: o prazo declarado pela fonte descreve a contestação.',
    ...overrides
  });

  const plano = planTaskAutoAbsorptions({ tasks: [suspensao, contestacao], verdicts: [veredito()] });
  assert.equal(plano.absorptions.length, 1, 'veredito mesma com 0.95 absorve');
  assert.equal(plano.absorptions[0].keeperId, suspensao.id, 'dono é a declaração de fonte mais recente (determinístico)');
  assert.equal(plano.absorptions[0].absorbedId, contestacao.id, 'absorvida é a declaração mais antiga');
  assert.equal(plano.absorptions[0].reason, ABSORB_REASON_AUTONOMOUS, 'motivo próprio da autonomia fica registrado');
  assert.equal(plano.absorptions[0].confidence, 0.95, 'confiança fica registrada para a auditoria');

  const humano = planTaskAutoAbsorptions({
    tasks: [suspensao, { ...contestacao, deadline: '2026-10-20' }],
    verdicts: [veredito()]
  });
  assert.equal(humano.absorptions.length, 0, 'autonomia não toca em prazo digitado por pessoa');
  assert.equal(humano.kept[0].motivo, 'prazo-humano', 'o motivo da recusa é declarado');

  const abaixoDoLimiar = planTaskAutoAbsorptions({ tasks: [suspensao, contestacao], verdicts: [veredito({ confidence: 0.88 })] });
  assert.equal(abaixoDoLimiar.absorptions.length, 0, 'confiança abaixo de 0.90 não autoriza autonomia');
  assert.equal(abaixoDoLimiar.kept[0].motivo, 'abaixo-do-limiar');

  const incerto = planTaskAutoAbsorptions({ tasks: [suspensao, contestacao], verdicts: [veredito({ verdict: 'incerto' })] });
  assert.equal(incerto.absorptions.length, 0, 'incerto vai para a conferência humana');
  assert.equal(incerto.kept[0].motivo, 'incerto');

  const donoComCuradoria = planTaskAutoAbsorptions({
    tasks: [{ ...suspensao, responsible: 'Advogada Teste' }, contestacao],
    verdicts: [veredito()]
  });
  assert.equal(donoComCuradoria.absorptions.length, 0, 'dono com curadoria humana não recebe absorção automática');
  assert.equal(donoComCuradoria.kept[0].motivo, 'dono-com-curadoria');

  const excedente = planTaskAutoAbsorptions({
    tasks: [suspensao, contestacao],
    verdicts: [veredito()],
    limit: 0
  });
  assert.equal(excedente.absorptions.length, 0, 'teto zero desliga a autonomia');
  assert.equal(excedente.kept[0].motivo, 'teto-da-execucao', 'excedente do teto é declarado, não silencioso');
  assert.ok(TASK_DUPLICATE_AUTO_ABSORB_LIMIT >= 1, 'teto padrão positivo');
  assert.equal(TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE, 0.9, 'limiar da autonomia é 0.90 (decisão do operador)');
  console.log('  OK: autonomia só entre projeções intocadas, com limiar, teto e motivo declarado.');
}

console.log('[T3] Absorção autônoma é aplicada, auditada e reversível...');
{
  const suspensao = sourceTask({
    id: 'tarefa-teste-suspensao',
    title: 'Conferir prazo informado pelo eproc — suspensão',
    deadline: '2026-10-15',
    sourceDeadline: '2026-10-15',
    changedAt: '2026-09-25T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-a'
  });
  const contestacao = sourceTask({
    id: 'tarefa-teste-contestacao',
    title: 'Conferir prazo informado pelo eproc — contestação',
    deadline: '2026-10-08',
    sourceDeadline: '2026-10-08',
    changedAt: '2026-09-20T10:00:00.000Z',
    intimationId: 'eproc:tjrs-eproc-1g:sintetica-b'
  });
  const estado = {
    tasks: [JSON.parse(JSON.stringify(suspensao)), JSON.parse(JSON.stringify(contestacao))],
    intimations: [{ id: 'eproc:tjrs-eproc-1g:sintetica-a', externalId: 'eproc:tjrs-eproc-1g:sintetica-a', process: CNJ, source: 'eproc', sourceReportedDeadlineAt: '2026-10-15', linkedTaskIds: [suspensao.id, contestacao.id] }],
    audit: []
  };
  const { absorptions } = planTaskAutoAbsorptions({
    tasks: estado.tasks,
    verdicts: [{ key: [contestacao.id, suspensao.id].sort().join('|'), aId: contestacao.id, bId: suspensao.id, verdict: 'mesma', confidence: 0.96, reason: 'mesmo ato' }]
  });
  assert.equal(absorptions.length, 1);
  const aplicado = applyTaskGroupConsolidation(estado, {
    keeperId: absorptions[0].keeperId,
    loserIds: [absorptions[0].absorbedId],
    actor: 'Atrium IA',
    decision: 'automatica',
    nowIso: '2026-09-30T03:00:00.000Z'
  });
  assert.equal(aplicado.changed, true, 'absorção autônoma aplica no estado');
  // A rota é quem publica as entradas de auditoria no estado (mesmo contrato da conferência humana).
  estado.audit = [...aplicado.auditEntries, ...estado.audit];
  const absorvida = estado.tasks.find(task => task.id === contestacao.id);
  assert.equal(absorvida.absorbedInto, suspensao.id, 'absorvida aponta para a oficial');
  assert.equal(absorvida.active, false, 'absorvida sai do fluxo ativo');
  assert.equal(absorvida.absorbedBy, 'Atrium IA', 'a autoria da autonomia fica registrada');
  assert.match(absorvida.history.at(-1).action, /por decisão autônoma do Atrium IA/, 'o histórico declara que a absorção foi autônoma, não humana');
  assert.ok(estado.audit.some(entry => entry.actor === 'Atrium IA'), 'auditoria registra o ator da autonomia');
  assert.ok(
    estado.audit.some(entry => /automaticamente pelo Atrium IA/.test(String(entry.action))),
    'a auditoria distingue decisão autônoma de decisão humana'
  );
  assert.ok(estado.intimations[0].linkedTaskIds.includes(suspensao.id) && !estado.intimations[0].linkedTaskIds.includes(contestacao.id), 'vínculo da publicação converge para a oficial');
  const desfeito = undoTaskGroupConsolidation(estado, { absorbedId: contestacao.id, actor: 'Advogada Teste' });
  assert.equal(desfeito.changed, true, 'desfazer devolve a tarefa absorvida automaticamente');
  assert.equal(estado.tasks.find(task => task.id === contestacao.id).active, true);
  console.log('  OK: absorção autônoma auditada com ator próprio, vínculo remendado e desfazer funcional.');
}

console.log('[T4] Contrato do schema e da suíte...');
{
  const schema = getJevSchema('task_duplicate_check');
  assert.equal(schema.id, 'task_duplicate_check');
  assert.deepEqual(schema.questions[0].labels, ['mesma', 'diferente', 'incerto'], 'veredito tem exatamente três rótulos');
  assert.match(schema.description, /≥ 0\.90/, 'a descrição do schema declara o limiar da autonomia');
  assert.doesNotMatch(schema.description, /cria prazo|deadline autom/i, 'schema não promete prazo');
  const implementacao = readFileSync(new URL('../lib/tasks/task-duplicate-review.mjs', import.meta.url), 'utf8');
  assert.match(implementacao, /isUntouchedSourceTask/, 'autonomia reusa a trava de curadoria da consolidação conservadora');
  assert.match(implementacao, /hasSourceOwnedDeadline/, 'autonomia reusa a trava de prazo humano');
  assert.match(implementacao, /taskSourceFreshness/, 'dono é decidido pela regra determinística de frescor da fonte');
  console.log('  OK: schema e implementação declaram o mesmo contrato.');
}

console.log('[T5] Dono pela DECLARAÇÃO da fonte, não pelo updatedAt da tarefa (achado adversarial)...');
{
  // Cenário do crítico de 30/09: a tarefa com a declaração MAIS NOVA foi coletada antes (updatedAt
  // antigo) e a com declaração VELHA foi reescrita na última coleta (updatedAt recente). Pelo
  // `updatedAt`, a autonomia absorveria a declaração nova e manteria a velha.
  const nova = sourceTask({
    id: 'tarefa-teste-declaracao-nova',
    title: 'Conferir prazo informado pelo eproc — suspensão',
    deadline: '2026-10-15',
    sourceDeadline: '2026-10-15',
    changedAt: '2026-09-21T10:00:00.000Z',
    intimationId: 'fonte-ia',
    extra: { updatedAt: '2026-09-21T10:00:00.000Z' }
  });
  const velha = sourceTask({
    id: 'tarefa-teste-declaracao-velha',
    title: 'Apresentar defesa escrita',
    deadline: '2026-10-08',
    sourceDeadline: '2026-10-08',
    changedAt: '2026-09-20T10:00:00.000Z',
    intimationId: 'fonte-ib',
    extra: { updatedAt: '2026-09-25T10:00:00.000Z' }
  });
  const intimations = [
    { id: 'fonte-ia', externalId: 'fonte-ia', sourceDeadlineChangedAt: '2026-09-25T09:00:00.000Z' },
    { id: 'fonte-ib', externalId: 'fonte-ib', sourceDeadlineChangedAt: '2026-09-20T09:00:00.000Z' }
  ];
  const veredito = {
    key: [nova.id, velha.id].sort().join('|'),
    aId: nova.id,
    bId: velha.id,
    verdict: 'mesma',
    confidence: 0.97,
    reason: 'mesmo ato'
  };

  // Sem as intimações, o próprio campo `sourceDeadlineChangedAt` da tarefa já decide.
  const semIntimacao = planTaskAutoAbsorptions({ tasks: [nova, velha], verdicts: [veredito] });
  assert.equal(semIntimacao.absorptions.length, 1, 'o par segue elegível');
  assert.equal(semIntimacao.absorptions[0].keeperId, nova.id, 'a declaração mais recente da tarefa prevalece sobre o updatedAt');
  assert.equal(semIntimacao.absorptions[0].absorbedId, velha.id, 'a declaração antiga é absorvida, nunca o contrário');

  // Com as intimações, vale a declaração da fonte (o mesmo que o módulo conservador usa).
  const comIntimacao = planTaskAutoAbsorptions({
    tasks: [nova, velha],
    verdicts: [veredito],
    intimationOf: task => intimations.find(item => item.externalId === task.sourceIntimationId) || null
  });
  assert.equal(comIntimacao.absorptions[0].keeperId, nova.id, 'a intimação com a declaração mais recente mantém o dono correto');
  assert.equal(comIntimacao.absorptions[0].absorbedId, velha.id);

  // E o contrário também: se a fonte mais recente é a outra, o dono muda de lado.
  const invertido = planTaskAutoAbsorptions({
    tasks: [nova, velha],
    verdicts: [veredito],
    intimationOf: task => (task.id === velha.id ? { id: 'fonte-ib', sourceDeadlineChangedAt: '2026-09-28T09:00:00.000Z' } : { id: 'fonte-ia', sourceDeadlineChangedAt: '2026-09-25T09:00:00.000Z' })
  });
  assert.equal(invertido.absorptions[0].keeperId, velha.id, 'quem declarou por último é o dono, independentemente do updatedAt');

  // O painel usa a mesma regra: o dono sugerido não pode divergir do que a autonomia faria.
  assert.equal(taskPairKeeper(nova, velha, { intimationA: intimations[0], intimationB: intimations[1] }).id, nova.id);
  assert.equal(taskPairKeeper(nova, velha).id, nova.id, 'sem intimação, a declaração da própria tarefa decide');
  console.log('  OK: dono pela declaração da fonte (intimação > campo da tarefa > updatedAt).');
}

console.log('\n>>> DUPLICATA DE TAREFA (JEV): PASS <<<\n');
