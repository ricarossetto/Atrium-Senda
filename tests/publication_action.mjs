import assert from 'node:assert/strict';
import { createTaskHttpHandler, findConferenceTask, isUntouchedCreatedTask } from '../lib/http/task-routes.mjs';
import { createAiClassifierHttpHandler, AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID } from '../lib/http/ai-classifier-routes.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import {
  PUBLICATION_ACTION_IDS,
  PUBLICATION_ACTION_LABELS,
  mapPublicationActionToTaskDefinition,
  buildProvidenciaTask
} from '../lib/tasks/publication-action-map.mjs';
import {
  mapActToPlaybookActions,
  buildPublicationPlaybook,
  PLAYBOOK_MAX_ITEMS
} from '../lib/tasks/task-playbook.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DO PRAZO À PROVIDÊNCIA (SCHEMA, MAPEADOR E PAR DE AÇÕES)');
console.log('===============================================================\n');

const CNJ = '5313106-50.2026.8.21.7000';
const PUB_ID = 'eproc:tjrs-eproc-1g:publicacao-sintetica-1';

const CATALOGO = Object.freeze([
  { name: 'Minutar contestação', points: 30, area: 'Cível' },
  { name: 'Interpor recurso de apelação', points: 25, area: 'Recursal' },
  { name: 'Prestar informações ao juízo', points: 15, area: 'Cível' },
  { name: 'Emitir e pagar guia de custas', points: 8, area: 'Financeiro' },
  { name: 'Juntar procuração aos autos', points: 6, area: 'Cível' },
  { name: 'Protocolar petição intermediária', points: 12, area: 'Cível' },
  { name: 'Preparar audiência de instrução', points: 20, area: 'Audiência' },
  { name: 'Requerer cumprimento de sentença', points: 22, area: 'Cível' },
  { name: 'Arquivar publicação sem providência', points: 2, area: 'Triagem' }
]);

function conferenceTask({ id = 'task:eproc-panel:sintetica-1', status = 'triagem', deadline = '2026-10-08' } = {}) {
  return {
    id,
    externalId: id,
    title: 'Conferir prazo informado pelo eproc — contestação',
    description: 'Conferência da publicação sintética.',
    process: CNJ,
    source: 'eproc',
    status,
    priority: 'normal',
    deadline,
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: deadline,
    sourceIntimationId: PUB_ID,
    intimationId: PUB_ID,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
    history: [],
    timeLogs: []
  };
}

function makeHarness({ tasks = [], intimations = [], processes = [], configuration = { taskDefinitions: CATALOGO }, enabled = true, role = 'member' } = {}) {
  const store = {
    settings: { aiClassifier: { enabled } },
    tasks,
    intimations,
    processes,
    configuration,
    audit: [],
    __revision: 'rev-1'
  };
  const seen = { csrf: [], buildInputs: [], schemaIds: [], lastJson: null, writes: 0 };
  const sessao = { userId: 'u-ana', username: 'ana', displayName: 'Advogada Teste', role, mfaVerified: true, workspaceId: 'ws-beta' };
  const deps = {
    assertAuthenticated: (req, csrf) => {
      seen.csrf.push(Boolean(csrf));
      return sessao;
    },
    assertAdmin: () => {
      throw Object.assign(new Error('Apenas administradores.'), { statusCode: 403 });
    },
    readJson: async () => deps.__body,
    json: (res, status, payload) => {
      seen.lastJson = { status, payload };
    },
    readAppStateEnvelope: async () => ({ state: store, revision: store.__revision }),
    saveAppStateDirectUnlocked: async (nextState, expectedRevision) => {
      if (store.__revision && expectedRevision !== store.__revision) {
        throw Object.assign(new Error('Revisão divergente.'), { statusCode: 409 });
      }
      seen.writes += 1;
      store.__revision = `rev-${seen.writes + 1}`;
      return { revision: store.__revision };
    },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias,
    buildPublicationTask: (input, publicationId, actorName, nowIso) => {
      seen.buildInputs.push({ input: JSON.parse(JSON.stringify(input)), publicationId });
      return {
        id: `task-${seen.buildInputs.length}-providencia`,
        createdAt: nowIso,
        updatedAt: nowIso,
        title: String(input.title || ''),
        taskDefinition: String(input.taskDefinition || ''),
        description: String(input.description || ''),
        deadline: String(input.deadline || ''),
        fatalDeadline: String(input.fatalDeadline || ''),
        status: String(input.status || 'triagem'),
        priority: String(input.priority || 'normal'),
        points: Number(input.points) || 0,
        process: String(input.process || ''),
        intimationId: publicationId,
        sourceIntimationId: publicationId,
        history: [{ at: nowIso, action: 'Tarefa atribuída', actor: actorName }],
        timeLogs: []
      };
    },
    runSuggest: async input => {
      seen.schemaIds.push(String(input?.schemaId || ''));
      return {
        answers: {
          action: { type: 'choice', choice: 'contestar', confidence: 0.87, probabilities: { contestar: 0.87, outro: 0.13 } }
        },
        usage: { input_tokens: 90, output_tokens: 8 }
      };
    },
    checkHeadlessAvailable: async () => ({ ok: true, reason: 'operacional' })
  };
  const taskHandler = createTaskHttpHandler(deps);
  const aiHandler = createAiClassifierHttpHandler({
    ...deps,
    triageStore: { read: async () => null, write: async () => true }
  });
  const call = async (method, pathWithQuery, body = null, which = 'task') => {
    deps.__body = body;
    const handler = which === 'ai' ? aiHandler : taskHandler;
    const [pathname, query = ''] = String(pathWithQuery).split('?');
    const raw = await handler(
      { method, url: pathWithQuery, socket: { remoteAddress: '127.0.0.1' } },
      {},
      { pathname, searchParams: new URLSearchParams(query) }
    );
    if (raw === false) throw new Error(`Rota não tratada: ${method} ${pathname}`);
    // Responder e devolver outro valor faz o despachante seguir para o tratamento de erro e tentar
    // responder de novo (ERR_HTTP_HEADERS_SENT derrubava o processo) — o contrato é `true`.
    if (raw !== true) throw new Error(`Rota respondeu sem devolver true: ${method} ${pathname} (${String(raw)})`);
    return { raw, res: seen.lastJson };
  };
  return {
    store,
    seen,
    call,
    sessao,
    taskById: id => store.tasks.find(task => String(task?.id) === String(id))
  };
}

function publicacao() {
  return [
    {
      id: PUB_ID,
      externalId: PUB_ID,
      title: 'Intimação eproc — apresentar contestação',
      process: CNJ,
      client: 'Cliente Teste',
      source: 'eproc',
      treatmentStatus: 'in_review',
      sourceReportedDeadlineAt: '2026-10-08',
      text: 'TEXTO OFICIAL SINTÉTICO\nIntime-se a parte para apresentar contestação no prazo legal.',
      linkedTaskIds: ['task:eproc-panel:sintetica-1']
    }
  ];
}

console.log('[E1] Schema: vocabulário fixo, sem prazo, com instruções — contrato estável para a calibração...');
{
  const schema = getJevSchema('publication_action');
  assert.equal(schema.id, 'publication_action');
  assert.deepEqual(schema.questions[0].labels, [...PUBLICATION_ACTION_IDS], 'o vocabulário do schema é o do módulo (rótulo fixo preserva a calibração)');
  assert.equal(schema.questions[0].labels.length, 10);
  assert.match(schema.description, /Nunca cria prazo, tarefa, tratamento ou ciência/);
  assert.doesNotMatch(schema.description, /fatalDeadline|inferir prazo/i);
  assert.equal(AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID, 'publication_action');
  assert.ok(Object.keys(PUBLICATION_ACTION_LABELS).length === PUBLICATION_ACTION_IDS.length, 'todo rótulo tem texto humano');
  console.log('  OK: dez naturezas fixas, com descrição que declara o limite humano.');
}

console.log('[E2] Mapeador determinístico: natureza → item do catálogo (o modelo nunca inventa nome)...');
{
  const casos = [
    ['contestar', 'Minutar contestação'],
    ['recorrer', 'Interpor recurso de apelação'],
    ['manifestar', 'Prestar informações ao juízo'],
    ['pagar_guia', 'Emitir e pagar guia de custas'],
    ['juntar_documento', 'Juntar procuração aos autos'],
    ['peticao_intermediaria', 'Protocolar petição intermediária'],
    ['preparar_audiencia', 'Preparar audiência de instrução'],
    ['cumprimento_sentenca', 'Requerer cumprimento de sentença']
  ];
  for (const [acao, esperado] of casos) {
    const escolhido = mapPublicationActionToTaskDefinition({ action: acao, taskDefinitions: CATALOGO });
    assert.ok(escolhido, `${acao} precisa casar com o catálogo`);
    assert.equal(escolhido.name, esperado, `${acao} → ${esperado}`);
    assert.ok(CATALOGO.some(item => item.name === escolhido.name), 'o nome devolvido existe no catálogo');
  }
  assert.equal(mapPublicationActionToTaskDefinition({ action: 'outro', taskDefinitions: CATALOGO }), null, '`outro` não inventa modelo');
  assert.equal(mapPublicationActionToTaskDefinition({ action: 'contestar', taskDefinitions: [] }), null, 'catálogo vazio não vira sugestão');
  assert.equal(
    mapPublicationActionToTaskDefinition({ action: 'contestar', taskDefinitions: [{ name: 'Rotina administrativa', points: 3 }] }),
    null,
    'sem casamento de palavra-chave o servidor não sugere nada'
  );
  const empate = mapPublicationActionToTaskDefinition({
    action: 'contestar',
    taskDefinitions: [{ name: 'Contestar prazo', points: 5 }, { name: 'Contestar mérito', points: 9 }]
  });
  assert.equal(empate.name, 'Contestar prazo', 'empate resolve pela ordem do catálogo (determinístico)');

  const tarefa = buildProvidenciaTask({ definitionName: 'Minutar contestação', action: 'contestar', publication: { title: 'Intimação eproc' } });
  assert.equal(tarefa.title, 'Minutar contestação', 'o título é exatamente o nome do catálogo');
  assert.equal(tarefa.deadline, '', 'a tarefa nasce sem prazo (§16)');
  assert.equal(tarefa.fatalDeadline, '', 'nunca nasce com prazo fatal');
  assert.equal(tarefa.status, 'triagem');
  assert.match(tarefa.description, /prazo em branco, para conferência humana/);
  console.log('  OK: oito naturezas mapeadas, `outro` e catálogo sem casamento devolvem null, título = catálogo.');
}

console.log('[E3] Par de ações: conclui a conferência e cria a tarefa específica, com auditoria...');
{
  const harness = makeHarness({
    tasks: [conferenceTask()],
    intimations: publicacao(),
    processes: [{
      id: 'processo-sintetico-1',
      number: CNJ,
      client: 'Cliente Teste',
      courtUnit: '1ª Vara Cível Sintética',
      lastMovement: 'Despacho sintético determinando a manifestação da parte.',
      lastMovementAt: '2026-09-24'
    }]
  });
  const { res } = await harness.call('POST', '/api/tasks/from-publication', {
    publicationId: PUB_ID,
    action: 'contestar',
    definitionName: 'Minutar contestação'
  });
  assert.equal(res.status, 201);
  assert.equal(res.payload.completedTaskId, 'task:eproc-panel:sintetica-1', 'a tarefa de conferência é concluída');
  assert.equal(res.payload.task.title, 'Minutar contestação');
  assert.equal(res.payload.task.deadline, '', 'a tarefa criada tem prazo em branco');
  assert.equal(res.payload.task.taskDefinition, 'Minutar contestação');
  assert.equal(res.payload.task.points, 30, 'os pontos vêm do catálogo');
  assert.equal(res.payload.task.intimationId, PUB_ID, 'a tarefa criada fica vinculada à publicação');
  assert.equal(res.payload.revision, 'rev-2');
  const conferencia = harness.taskById('task:eproc-panel:sintetica-1');
  assert.equal(conferencia.status, 'concluida');
  assert.equal(conferencia.completedBy, 'Advogada Teste');
  assert.match(conferencia.history.at(-1).action, /Conferência concluída ao criar a providência "Contestar"/);
  const acoes = harness.store.audit.map(entry => entry.action);
  assert.ok(acoes.includes('Tarefa de conferência concluída'), 'auditoria registra a conclusão');
  assert.ok(acoes.includes('Tarefa criada a partir da providência'), 'auditoria registra a criação');
  assert.ok(harness.store.audit.every(entry => entry.actor === 'Advogada Teste'), 'toda entrada tem autoria');
  assert.equal(harness.store.intimations[0].linkedTaskIds.includes(res.payload.task.id), true, 'a publicação aponta para a tarefa criada');
  assert.equal(harness.seen.writes, 1, 'as duas ações entram numa única gravação');
  assert.equal(harness.seen.buildInputs[0].input.deadline, '', 'a rota nunca passa prazo ao construtor oficial');
  assert.equal(harness.seen.buildInputs[0].input.fatalDeadline, '', 'a rota nunca passa prazo fatal');
  // Decisão do operador (2026-09-30): a data da fonte entra como REFERÊNCIA, não como prazo.
  assert.equal(res.payload.task.deadline, '', 'a referência da fonte não vira prazo na tarefa criada');
  assert.equal(res.payload.task.sourceDeadlineReference, '2026-10-08', 'a data da fonte fica registrada como referência');
  assert.match(res.payload.task.description, /Referência da fonte: 08\/10\/2026/, 'a descrição mostra a referência em data legível');
  assert.match(res.payload.task.description, /não é o prazo/, 'a descrição declara que a referência não é o prazo');
  // Contexto de 3 a 5 linhas no corpo da tarefa, com a origem declarada em cada linha.
  assert.match(res.payload.task.description, /Contexto da conferência:/, 'o corpo da tarefa traz o bloco de contexto');
  const linhasContexto = res.payload.task.description.split('Contexto da conferência:')[1]
    .split('\n').map(linha => linha.trim()).filter(linha => linha.startsWith('- '));
  assert.ok(linhasContexto.length >= 3 && linhasContexto.length <= 5, `o contexto tem de 3 a 5 linhas (tem ${linhasContexto.length})`);
  assert.ok(linhasContexto.some(linha => linha.startsWith('- Publicação:')), 'a linha da publicação declara a origem');
  assert.ok(linhasContexto.some(linha => linha.startsWith('- Processo:')), 'a linha do processo declara a origem e o cliente');
  assert.ok(linhasContexto.some(linha => linha.startsWith('- Fonte oficial:')), 'a linha da fonte declara a origem');
  assert.ok(linhasContexto.some(linha => linha.startsWith('- Andamento:')), 'a linha do andamento declara a origem');
  assert.doesNotMatch(res.payload.task.description, /prazo interno: 2026-10-08/, 'o contexto não transforma a data da fonte em prazo interno');
  assert.equal(harness.store.intimations[0].treatmentStatus, 'in_review', 'o tratamento da publicação não é alterado por este fluxo');
  console.log('  OK: par de ações numa gravação, com auditoria dos dois lados e prazo em branco.');
}

console.log('[E4] Sem tarefa de conferência, execução é declarada — nunca falso sucesso...');
{
  const harness = makeHarness({ tasks: [], intimations: publicacao() });
  const { res } = await harness.call('POST', '/api/tasks/from-publication', {
    publicationId: PUB_ID,
    action: 'manifestar',
    definitionName: 'Prestar informações ao juízo'
  });
  assert.equal(res.status, 201);
  assert.equal(res.payload.completedTaskId, '');
  assert.equal(res.payload.declared.conference, 'sem-tarefa-de-conferencia', 'a ausência de conferência é declarada');
  assert.match(res.payload.message, /não havia tarefa de conferência/);
  assert.equal(harness.taskById(harness.seen.buildInputs.length ? 'task-1-providencia' : '').deadline, '', 'a tarefa criada continua sem prazo');
  console.log('  OK: criação sem conferência declarada no payload e na mensagem.');
}

console.log('[E5] Trilhos do servidor: nome fora do catálogo, publicação descartada e CSRF...');
{
  const fora = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  await assert.rejects(
    () => fora.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Contestar inventada pelo modelo' }),
    /não existe no catálogo/,
    'o servidor recusa nome de tarefa fora do catálogo (o modelo nunca inventa)'
  );
  assert.equal(fora.seen.writes, 0, 'recusa não grava nada');
  assert.equal(fora.taskById('task:eproc-panel:sintetica-1').status, 'triagem', 'a conferência permanece intacta na recusa');

  const invalida = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  await assert.rejects(
    () => invalida.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'inventada', definitionName: 'Minutar contestação' }),
    /Providência inválida/
  );

  const descartada = makeHarness({
    tasks: [conferenceTask()],
    intimations: publicacao().map(item => ({ ...item, treatmentStatus: 'discarded' }))
  });
  await assert.rejects(
    () => descartada.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' }),
    /descartada/
  );

  const ausente = makeHarness({ tasks: [], intimations: [] });
  await assert.rejects(
    () => ausente.call('POST', '/api/tasks/from-publication', { publicationId: 'inexistente', action: 'contestar', definitionName: 'Minutar contestação' }),
    /não encontrada/
  );

  const ok = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  await ok.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  assert.ok(ok.seen.csrf.every(Boolean), 'a rota exige CSRF (mutação autenticada)');
  console.log('  OK: nome fora do catálogo, providência inválida, publicação descartada e ausente recusados sem escrita.');
}

console.log('[E6] Desfazer: devolve a conferência e só remove a tarefa criada intocada...');
{
  const harness = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const criada = await harness.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  const createdId = criada.res.payload.task.id;
  const desfeito = await harness.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: createdId });
  assert.equal(desfeito.res.status, 200);
  assert.equal(desfeito.res.payload.removed, true, 'tarefa intocada é removida');
  assert.equal(harness.taskById(createdId), undefined, 'a tarefa criada sai do acervo');
  const conferencia = harness.taskById('task:eproc-panel:sintetica-1');
  assert.equal(conferencia.status, 'triagem', 'a conferência volta ao fluxo');
  assert.equal(conferencia.completedAt, undefined, 'o marco de conclusão é limpo');
  assert.equal(harness.store.intimations[0].linkedTaskIds.includes(createdId), false, 'o vínculo da publicação é desfeito');
  assert.ok(harness.store.audit.some(entry => entry.action === 'Providência desfeita'));

  const tocada = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const criada2 = await tocada.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  const criadaId = criada2.res.payload.task.id;
  tocada.taskById(criadaId).timeLogs = [{ id: 'time-1', minutes: 15, date: '2026-09-30' }];
  const desfeitoTocada = await tocada.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: criadaId });
  assert.equal(desfeitoTocada.res.payload.removed, false, 'tarefa já trabalhada não é removida');
  assert.equal(desfeitoTocada.res.payload.declared.createdTaskKept, 'a-tarefa-criada-ja-foi-trabalhada', 'a recusa é declarada, não silenciosa');
  assert.ok(tocada.taskById(criadaId), 'a tarefa com apontamento permanece no acervo');
  assert.equal(tocada.taskById('task:eproc-panel:sintetica-1').status, 'triagem', 'a conferência volta ao fluxo mesmo assim');

  const alheia = makeHarness({ tasks: [{ id: 'task-comum', title: 'Tarefa comum', status: 'triagem' }], intimations: publicacao() });
  await assert.rejects(() => alheia.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: 'task-comum' }), /não foi criada pelo fluxo/);

  assert.equal(isUntouchedCreatedTask({ status: 'triagem', priority: 'normal', timeLogs: [] }), true);
  assert.equal(isUntouchedCreatedTask({ status: 'triagem', priority: 'normal', deadline: '2026-10-10', timeLogs: [] }), false, 'prazo digitado tira a tarefa do desfazer automático');
  assert.equal(findConferenceTask([{ ...conferenceTask(), status: 'concluida' }], { publicationId: PUB_ID }), null, 'conferência concluída não é reconcluída');
  console.log('  OK: desfazer devolve a conferência, remove só o intocado e declara o que ficou.');
}

console.log('[E6b] Idempotência e dono do desfazer (achados do crítico adversarial)...');
{
  // Duplo clique/retry: a segunda chamada não pode criar outra tarefa nem diagnosticar
  // "sem conferência" quando foi a primeira que a concluiu.
  const harness = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const primeira = await harness.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  assert.equal(primeira.res.status, 201);
  const tarefasDepoisDaPrimeira = harness.store.tasks.length;
  const segunda = await harness.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  assert.equal(segunda.res.status, 200, 'a repetição responde 200');
  assert.equal(segunda.res.payload.idempotent, true, 'a repetição é declarada idempotente');
  assert.equal(segunda.res.payload.task.id, primeira.res.payload.task.id, 'devolve a mesma tarefa');
  assert.equal(harness.store.tasks.length, tarefasDepoisDaPrimeira, 'nada duplicado no acervo');
  assert.equal(segunda.res.payload.declared.conference, undefined, 'a repetição não inventa recusa de conferência');
  assert.match(segunda.res.payload.message, /já havia sido criada/);
  assert.equal(harness.seen.writes, 1, 'a repetição não grava o estado');

  // Outro membro (não administrador) não desfaz providência que não criou; administrador pode.
  const outro = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const criada = await outro.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  const criadaId = criada.res.payload.task.id;
  outro.sessao.displayName = 'Advogado Terceiro';
  await assert.rejects(
    () => outro.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: criadaId }),
    /quem criou esta providência/,
    'desfazer alheio é recusado para quem não é administrador'
  );
  assert.ok(outro.taskById(criadaId), 'a tarefa continua no acervo após a recusa');
  outro.sessao.role = 'admin';
  const desfeito = await outro.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: criadaId });
  assert.equal(desfeito.res.status, 200, 'administrador pode desfazer em nome do escritório');
  assert.equal(outro.taskById(criadaId), undefined);
  console.log('  OK: par idempotente (duplo clique/retry) e desfazer restrito ao autor ou administrador.');
}

console.log('[E6c] Conferência ambígua não é fechada às cegas e desfazer não deixa o par pela metade...');
{
  // Duas conferências vinculadas à mesma publicação: fechar a "mais nova" tiraria do fluxo o prazo
  // de outro ato — o servidor não conclui nenhuma e declara a ambiguidade.
  const duas = makeHarness({
    tasks: [
      conferenceTask({ id: 'task:eproc-panel:sintetica-1' }),
      { ...conferenceTask({ id: 'task:eproc-panel:sintetica-2' }), deadline: '2026-10-15', sourceReportedDeadlineAt: '2026-10-15', title: 'Conferir prazo informado pelo eproc — suspensão' }
    ],
    intimations: publicacao().map(item => ({ ...item, linkedTaskIds: ['task:eproc-panel:sintetica-1', 'task:eproc-panel:sintetica-2'] }))
  });
  const criada = await duas.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  assert.equal(criada.res.status, 201);
  assert.equal(criada.res.payload.completedTaskId, '', 'nenhuma conferência é concluída quando há mais de uma');
  assert.equal(criada.res.payload.declared.conference, 'conferencia-ambigua', 'a ambiguidade é declarada');
  assert.match(criada.res.payload.message, /mais de uma conferência/);
  assert.equal(duas.taskById('task:eproc-panel:sintetica-1').status, 'triagem');
  assert.equal(duas.taskById('task:eproc-panel:sintetica-2').status, 'triagem');

  // A tarefa criada some do acervo (absorvida/removida em outra aba): o desfazer devolve a
  // conferência informada no corpo em vez de deixar o par meio-aplicado.
  const sumiu = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const primeira = await sumiu.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação' });
  const criadaId = primeira.res.payload.task.id;
  sumiu.store.tasks = sumiu.store.tasks.filter(task => String(task.id) !== criadaId);
  const desfeito = await sumiu.call('POST', '/api/tasks/from-publication/undo', {
    createdTaskId: criadaId,
    conferenceTaskId: 'task:eproc-panel:sintetica-1'
  });
  assert.equal(desfeito.res.status, 200, 'o desfazer não falha quando a tarefa criada já saiu');
  assert.equal(desfeito.res.payload.removed, false);
  assert.equal(desfeito.res.payload.declared.createdTaskGone, 'a-tarefa-criada-nao-esta-mais-no-acervo');
  assert.equal(sumiu.taskById('task:eproc-panel:sintetica-1').status, 'triagem', 'a conferência volta ao fluxo mesmo assim');
  assert.match(desfeito.res.payload.message, /não está mais no acervo/);
  assert.match(desfeito.res.payload.message, /conferência voltou ao fluxo/, 'a mensagem declara só o que aconteceu (a conferência voltou)');

  // Sem conferência no par, o desfazer não afirma que a conferência voltou.
  const semConferencia = makeHarness({ tasks: [], intimations: publicacao() });
  const criadaSem = await semConferencia.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'juntar_documento', definitionName: 'Juntar procuração aos autos' });
  const desfeitoSem = await semConferencia.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: criadaSem.res.payload.task.id });
  assert.equal(desfeitoSem.res.status, 200);
  assert.match(desfeitoSem.res.payload.message, /tarefa criada saiu do fluxo/);
  assert.doesNotMatch(desfeitoSem.res.payload.message, /conferência voltou/);
  console.log('  OK: conferência ambígua declarada e desfazer sem par pela metade.');
}

console.log('[E7] Sugestão do JEV: natureza em vocabulário fixo e item do catálogo pelo servidor...');
{
  const harness = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const { res } = await harness.call('POST', '/api/ai-classifier/suggest-publication-action', { intimationId: PUB_ID }, 'ai');
  assert.equal(res.status, 200);
  assert.equal(harness.seen.schemaIds[0], 'publication_action', 'usa o esquema de providência');
  assert.equal(res.payload.action, 'contestar');
  assert.equal(res.payload.actionLabel, 'Contestar');
  assert.equal(res.payload.taskDefinition.name, 'Minutar contestação', 'o item vem do catálogo do escritório');
  assert.ok(res.payload.catalog.length >= 8, 'o painel recebe o catálogo para trocar o item antes de confirmar');
  assert.equal(res.payload.confidence > 0.6, true, 'a confiança da leitura é declarada');
  assert.equal(harness.seen.writes, 0, 'a sugestão não grava nada no estado');
  assert.ok(!/cpf|cnpj|@|127\.0\.0\.1/i.test(JSON.stringify(res.payload)), 'resposta sem PII');
  assert.ok(!/jev/i.test(JSON.stringify(res.payload)), 'resposta sem marca interna do motor');

  const desligado = makeHarness({ tasks: [], intimations: publicacao(), enabled: false });
  await assert.rejects(
    () => desligado.call('POST', '/api/ai-classifier/suggest-publication-action', { intimationId: PUB_ID }, 'ai'),
    /desligado/
  );
  console.log('  OK: sugestão assistiva sem escrita, com catálogo e limites declarados.');
}

console.log('[E8] Playbook do ato: determinístico, do catálogo e com prazo em branco...');
{
  const acoes = mapActToPlaybookActions('Intimação eproc — apresentar contestação');
  assert.ok(acoes.includes('contestar'), 'contestação entra no playbook');
  assert.ok(acoes.length <= PLAYBOOK_MAX_ITEMS, 'o playbook é enxuto');
  assert.deepEqual(mapActToPlaybookActions('Intimação eproc — apresentar contestação'), acoes, 'mesma entrada, mesma saída');
  assert.deepEqual(mapActToPlaybookActions(''), [], 'sem ato não há playbook');
  assert.ok(mapActToPlaybookActions('Intimação para audiência de instrução').includes('preparar_audiencia'));
  assert.ok(mapActToPlaybookActions('Cumpra-se, providencie a juntada de documento').includes('juntar_documento'), 'texto de cumprimento com juntada propõe o documento');

  const playbook = buildPublicationPlaybook({ publication: { title: 'Intimação — apresentar contestação' }, taskDefinitions: CATALOGO });
  assert.ok(playbook.items.length >= 1, 'há item para a contestação');
  const item = playbook.items.find(candidato => candidato.action === 'contestar');
  assert.ok(item, 'contestar está entre os itens');
  assert.equal(item.definition.name, 'Minutar contestação', 'o modelo vem do catálogo do escritório');
  assert.equal(item.draft.deadline, '', 'o rascunho nasce com prazo em branco');
  const semCatalogo = buildPublicationPlaybook({ publication: { title: 'Intimação — apresentar contestação' }, taskDefinitions: [] });
  assert.equal(semCatalogo.items.find(candidato => candidato.action === 'contestar').definition, null, 'sem catálogo não há nome inventado');

  const harness = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const { res } = await harness.call('GET', `/api/ai-classifier/publication-playbook?publicationId=${encodeURIComponent(PUB_ID)}`, null, 'ai');
  assert.equal(res.status, 200);
  assert.equal(res.payload.intimationId, PUB_ID);
  assert.ok(Array.isArray(res.payload.items) && res.payload.items.length >= 1, 'a rota devolve os itens');
  assert.equal(res.payload.items[0].draft?.deadline, '', 'nenhum item traz prazo');
  assert.ok(!/cpf|cnpj|@|127\.0\.0\.1/i.test(JSON.stringify(res.payload)), 'resposta sem PII');
  assert.equal(harness.seen.writes, 0, 'o playbook não grava nada');
  await assert.rejects(
    () => harness.call('GET', '/api/ai-classifier/publication-playbook', null, 'ai'),
    /Informe a publicação/,
    'sem publicação a rota recusa'
  );
  console.log('  OK: playbook determinístico, do catálogo, sem escrita e com prazo em branco.');
}

console.log('[E9] Prazo da conferência: a contagem humana entra na tarefa criada e o desfazer respeita edição...');
{
  // A data confirmada na contagem viaja no corpo (decisão do operador, 2026-09-30): a tarefa
  // nasce com o prazo calculado, marcado com a origem da conferência — nunca inferido pela IA.
  const harness = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const { res } = await harness.call('POST', '/api/tasks/from-publication', {
    publicationId: PUB_ID,
    action: 'contestar',
    definitionName: 'Minutar contestação',
    deadline: '2026-10-15'
  });
  assert.equal(res.status, 201);
  assert.equal(res.payload.task.deadline, '2026-10-15', 'o prazo calculado entra na tarefa criada');
  assert.equal(res.payload.task.deadlineSource, 'conferencia', 'a origem do prazo é declarada');
  assert.equal(res.payload.task.conferenceDeadlineAt, '2026-10-15', 'o valor aplicado fica registrado (rastro do desfazer)');
  assert.equal(res.payload.task.fatalDeadline || '', '', 'prazo fatal continua intocado');
  assert.match(res.payload.message, /prazo 15\/10\/2026 aplicado a partir da conferência/, 'a mensagem declara o prazo em data legível');
  assert.ok(
    harness.store.audit.some(entry => entry.action === 'Tarefa criada a partir da providência' && /prazo 2026-10-15 \(conferência\)/.test(entry.detail || '')),
    'a auditoria registra o prazo aplicado'
  );
  assert.equal(harness.seen.buildInputs[0].input.deadline, '', 'o construtor oficial continua recebendo prazo em branco (a rota aplica o valor depois)');
  assert.equal(isUntouchedCreatedTask(harness.taskById(res.payload.task.id)), true, 'a tarefa com o prazo da conferência continua removível pelo desfazer');
  const desfeito = await harness.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: res.payload.task.id });
  assert.equal(desfeito.res.payload.removed, true, 'o desfazer remove a tarefa criada com o prazo da conferência');
  assert.equal(harness.taskById('task:eproc-panel:sintetica-1').status, 'triagem', 'a conferência volta ao fluxo');

  // Edição humana depois da criação: o desfazer não pode apagar a decisão da pessoa.
  const editada = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  const criada = await editada.call('POST', '/api/tasks/from-publication', {
    publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação', deadline: '2026-10-15'
  });
  editada.taskById(criada.res.payload.task.id).deadline = '2026-10-22';
  const recusa = await editada.call('POST', '/api/tasks/from-publication/undo', { createdTaskId: criada.res.payload.task.id });
  assert.equal(recusa.res.payload.removed, false, 'prazo editado à mão tira a tarefa do desfazer automático');
  assert.equal(recusa.res.payload.declared.createdTaskKept, 'a-tarefa-criada-ja-foi-trabalhada');
  assert.equal(editada.taskById(criada.res.payload.task.id).deadline, '2026-10-22', 'a edição humana permanece');

  // Formato inválido: recusa sem escrita.
  const invalido = makeHarness({ tasks: [conferenceTask()], intimations: publicacao() });
  await assert.rejects(
    () => invalido.call('POST', '/api/tasks/from-publication', { publicationId: PUB_ID, action: 'contestar', definitionName: 'Minutar contestação', deadline: '15/10/2026' }),
    /Prazo da conferência inválido/
  );
  assert.equal(invalido.seen.writes, 0, 'prazo fora do formato oficial não grava nada');
  console.log('  OK: prazo da contagem aplicado com origem declarada, desfazer respeita edição humana e formato inválido é recusado.');
}

console.log('\n>>> DO PRAZO À PROVIDÊNCIA: PASS <<<\n');
