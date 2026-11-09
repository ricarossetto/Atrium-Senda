import assert from 'node:assert/strict';
import {
  createAiClassifierHttpHandler,
  AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID,
  AI_CLASSIFIER_SUGGEST_LIMIT_PER_MINUTE
} from '../lib/http/ai-classifier-routes.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import { undoTaskGroupConsolidation } from '../lib/publications/source-deadline-consolidation.mjs';
import {
  TASK_DUPLICATE_AUTO_ABSORB_LIMIT,
  TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE,
  TASK_DUPLICATE_REVIEW_PAIR_LIMIT
} from '../lib/tasks/task-duplicate-review.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — TAREFAS REPETIDAS: ROTAS DO JEV E AUTONOMIA (HTTP)');
console.log('===============================================================\n');

const CNJ = '5012345-67.2026.8.21.0001';

function cnj(index) {
  return `5012345-67.2026.8.21.${String(index).padStart(4, '0')}`;
}

function sourceTask({ id, title, deadline, sourceDeadline = deadline, changedAt, intimationId = '', process = CNJ, extra = {} } = {}) {
  const descricao = `Descrição sintética da tarefa ${id}.`;
  return {
    id,
    title,
    description: descricao,
    process,
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

function makeHarness({
  tasks = [],
  intimations = [],
  processes = [],
  enabled = true,
  answer = { choice: 'mesma', confidence: 0.95 },
  onSuggest = null,
  snapshotReads = false
} = {}) {
  const store = {
    settings: { aiClassifier: { enabled } },
    tasks,
    intimations,
    processes,
    audit: [],
    __revision: 'rev-1'
  };
  const duplicateState = { value: null };
  const seen = { csrf: [], schemaIds: [], lastJson: null, writes: 0, storeWritten: null };
  const deps = {
    assertAuthenticated: (req, csrf) => {
      seen.csrf.push(Boolean(csrf));
      return { userId: 'u-ana', username: 'ana', displayName: 'Advogada Teste', role: 'member', mfaVerified: true, workspaceId: 'ws-beta' };
    },
    assertAdmin: () => {
      throw Object.assign(new Error('Apenas administradores podem ligar ou desligar o Atrium IA.'), { statusCode: 403 });
    },
    readJson: async () => deps.__body,
    json: (res, status, payload) => {
      seen.lastJson = { status, payload };
    },
    readAppStateEnvelope: async () => ({ state: snapshotReads ? structuredClone(store) : store, revision: store.__revision }),
    saveAppStateDirectUnlocked: async (nextState, expectedRevision) => {
      // Mesma CAS do servidor: revisão divergente recusa a gravação (409) e nada é absorvido.
      if (store.__revision && expectedRevision !== store.__revision) {
        throw Object.assign(new Error('Os dados foram atualizados em outra aba.'), { statusCode: 409 });
      }
      seen.writes += 1;
      if (snapshotReads) Object.assign(store, nextState);
      store.__revision = `rev-${seen.writes + 1}`;
      return { revision: store.__revision };
    },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias,
    triageStore: { read: async () => null, write: async () => true },
    taskDuplicateStore: {
      read: async () => duplicateState.value,
      write: async value => {
        duplicateState.value = value;
        seen.storeWritten = value;
        return true;
      }
    },
    runSuggest: async input => {
      seen.schemaIds.push(String(input?.schemaId || ''));
      if (onSuggest) await onSuggest(store);
      return {
        answers: {
          verdict: {
            type: 'choice',
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: { mesma: answer.confidence, diferente: 0.01, incerto: 0.01 }
          }
        },
        usage: { input_tokens: 120, output_tokens: 12 }
      };
    },
    checkHeadlessAvailable: async () => ({ ok: true, reason: 'operacional' })
  };
  const handler = createAiClassifierHttpHandler(deps);
  const call = async (method, pathname, body = null) => {
    deps.__body = body;
    const raw = await handler({ method, url: pathname, socket: { remoteAddress: '127.0.0.1' } }, {}, { pathname });
    if (raw === false) throw new Error(`Rota não tratada: ${method} ${pathname}`);
    return { raw, res: seen.lastJson };
  };
  return {
    store,
    seen,
    call,
    duplicateState,
    setAnswer: next => Object.assign(answer, next),
    taskById: id => (Array.isArray(store.tasks) ? store.tasks : []).find(task => String(task?.id) === String(id))
  };
}

function parDeTarefas({ idA = 'tarefa-teste-a', idB = 'tarefa-teste-b', process = CNJ, frescorA = '2026-09-25T10:00:00.000Z', frescorB = '2026-09-20T10:00:00.000Z' } = {}) {
  return [
    sourceTask({
      id: idA,
      title: `Conferir prazo informado pelo eproc — suspensão (${idA})`,
      deadline: '2026-10-15',
      changedAt: frescorA,
      intimationId: `eproc:tjrs-eproc-1g:sintetica-${idA}`,
      process
    }),
    sourceTask({
      id: idB,
      title: `Apresentar defesa (${idB})`,
      deadline: '2026-10-08',
      changedAt: frescorB,
      intimationId: `eproc:tjrs-eproc-1g:sintetica-${idB}`,
      process
    })
  ];
}

console.log('[T1] Leitura para o painel: desligado não vaza par nem gasta chamada do modelo...');
{
  const harness = makeHarness({ enabled: false, tasks: parDeTarefas() });
  const { res } = await harness.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(res.status, 200);
  assert.equal(res.payload.enabled, false);
  assert.deepEqual(res.payload.pairs, []);
  assert.deepEqual(res.payload.absorbed, []);
  assert.equal(harness.seen.schemaIds.length, 0, 'recurso desligado nunca chama o classificador');
  console.log('  OK: leitura desligada devolve estado real e não chama o modelo.');
}

console.log('[T2] Candidatos: mesmo processo, origens diferentes, dono pela regra de frescor...');
{
  const harness = makeHarness({
    tasks: [
      ...parDeTarefas(),
      sourceTask({
        id: 'tarefa-teste-c',
        title: 'Juntar documento complementar',
        deadline: '2026-10-02',
        changedAt: '2026-09-18T10:00:00.000Z',
        intimationId: 'eproc:tjrs-eproc-1g:sintetica-c'
      }),
      { ...sourceTask({
        id: 'tarefa-teste-concluida',
        title: 'Concluída não entra',
        deadline: '2026-10-01',
        changedAt: '2026-09-17T10:00:00.000Z',
        intimationId: 'eproc:tjrs-eproc-1g:sintetica-d'
      }), status: 'concluida' }
    ]
  });
  const { res } = await harness.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(res.status, 200);
  assert.equal(res.payload.enabled, true);
  const chaves = res.payload.pairs.map(par => par.key);
  assert.equal(chaves.length, 3, 'três tarefas vivas do mesmo processo formam três pares');
  assert.deepEqual(chaves, [...chaves].sort(), 'ordem estável dos pares');
  const par = res.payload.pairs.find(item => item.key.startsWith('tarefa-teste-a|'))
    || res.payload.pairs.find(item => item.key.endsWith('|tarefa-teste-a'));
  assert.ok(par, 'o par da tarefa mais antiga aparece');
  assert.equal(par.verdict, '', 'par ainda não classificado não declara veredito');
  assert.equal(par.blockedBy, '', 'par não avaliado não recebe motivo de recusa');
  assert.ok(par.aTitle && par.bTitle, 'o painel recebe os títulos dos dois lados');
  const parAB = res.payload.pairs.find(item => item.key === ['tarefa-teste-a', 'tarefa-teste-b'].sort().join('|'));
  assert.equal(parAB.suggestedKeeperId, 'tarefa-teste-a', 'dono é a declaração de fonte mais recente');
  assert.equal(parAB.absorbedId, 'tarefa-teste-b');
  assert.ok(!chaves.some(chave => chave.includes('tarefa-teste-concluida')), 'concluída fica fora da conferência');
  assert.ok(!/jev/i.test(JSON.stringify(res.payload)), 'resposta sem marca interna do motor');
  console.log('  OK: pares do mesmo processo com dono determinístico e sem evento concluído.');
}

console.log('[T3] Mesmo ato com confiança alta: absorve sozinho, audita e é reversível...');
{
  const harness = makeHarness({ tasks: parDeTarefas() });
  const { res } = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(res.status, 200);
  assert.equal(res.payload.classified, 1);
  assert.equal(res.payload.failed, 0);
  assert.equal(harness.seen.schemaIds[0], AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID, 'usa o esquema de duplicata de tarefa');
  assert.equal(res.payload.absorbed.length, 1, 'par `mesma` com 0.95 é absorvido na mesma execução');
  assert.equal(res.payload.absorbed[0].keeperId, 'tarefa-teste-a', 'o dono é o da fonte mais recente, nunca o modelo');
  assert.equal(res.payload.absorbed[0].absorbedId, 'tarefa-teste-b');
  assert.equal(res.payload.refused.length, 0, 'nada ficou para trás sem motivo');

  const absorvida = harness.taskById('tarefa-teste-b');
  assert.equal(absorvida.absorbedInto, 'tarefa-teste-a', 'absorvida aponta para a oficial');
  assert.equal(absorvida.absorbedBy, 'Atrium IA', 'a autoria da autonomia fica registrada na tarefa');
  assert.equal(absorvida.active, false, 'absorvida sai do fluxo ativo');
  assert.equal(absorvida.deadline, '2026-10-08', 'a absorção não inventa nem apaga prazo');
  assert.ok(harness.taskById('tarefa-teste-a').deadline === '2026-10-15', 'o dono mantém o próprio prazo');
  const auditoria = harness.store.audit.find(entry => entry.actor === 'Atrium IA');
  assert.ok(auditoria, 'auditoria registra o ator da autonomia');
  assert.match(auditoria.action, /automaticamente pelo Atrium IA/, 'a auditoria distingue decisão autônoma de humana');
  assert.ok(!/cpf|cnpj|@|127\.0\.0\.1/i.test(JSON.stringify(harness.store.audit)), 'auditoria sem PII');
  assert.equal(harness.seen.storeWritten.entries[['tarefa-teste-a', 'tarefa-teste-b'].sort().join('|')].action, 'absorbed', 'a store registra o que foi absorvido');
  assert.equal(res.payload.revision, 'rev-2', 'a resposta traz a revisão do servidor para o painel adotar');

  // Nenhuma tarefa do workspace ganhou prazo novo por causa da autonomia (§16).
  for (const tarefa of harness.store.tasks) {
    assert.ok(!tarefa.fatalDeadline, 'autonomia nunca cria prazo fatal');
    assert.ok(['2026-10-15', '2026-10-08'].includes(tarefa.deadline), 'prazos existentes permanecem como estavam');
  }

  const depois = await harness.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(depois.res.payload.absorbed.length, 1, 'o painel recebe o que foi absorvido automaticamente');
  assert.equal(depois.res.payload.absorbed[0].confidence, 0.95, 'a confiança da decisão vai para o painel');
  assert.equal(depois.res.payload.pairs.length, 0, 'par absorvido sai da conferência');

  const desfeito = undoTaskGroupConsolidation(harness.store, { absorbedId: 'tarefa-teste-b', actor: 'Advogada Teste' });
  assert.equal(desfeito.changed, true, 'a absorção autônoma é reversível');
  const devolvida = harness.taskById('tarefa-teste-b');
  assert.equal(devolvida.active, true);
  assert.equal(devolvida.absorbedInto, undefined);
  const depoisDoDesfazer = await harness.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(depoisDoDesfazer.res.payload.absorbed.length, 0, 'tarefa devolvida sai do bloco de absorvidas');
  assert.equal(depoisDoDesfazer.res.payload.pairs.length, 1, 'o par volta para a conferência');
  assert.equal(harness.seen.csrf[0], true, 'a triagem exige CSRF (mutação autenticada)');
  console.log('  OK: absorção autônoma aplicada, auditada com ator próprio, registrada na store e reversível.');
}

console.log('[T4] Prazo digitado por pessoa nunca é absorvido sozinho...');
{
  const humano = parDeTarefas();
  humano[1] = { ...humano[1], deadline: '2026-10-30' };
  const harness = makeHarness({ tasks: humano });
  const { res } = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(res.payload.absorbed.length, 0, 'autonomia não toca em prazo humano');
  assert.equal(res.payload.refused[0].motivo, 'prazo-humano', 'a recusa traz o motivo declarado');
  assert.notEqual(harness.taskById('tarefa-teste-b').active, false, 'a tarefa com prazo humano segue no fluxo');
  assert.equal(harness.taskById('tarefa-teste-b').deadline, '2026-10-30', 'o prazo humano permanece exatamente como estava');
  assert.ok(!harness.store.audit.some(entry => entry.actor === 'Atrium IA'), 'nada é auditado como absorvido sem absorção');
  assert.equal(harness.seen.writes, 0, 'nenhuma gravação do estado quando nada é absorvido');

  const outroLado = parDeTarefas();
  outroLado[1] = { ...outroLado[1], fatalDeadline: '2026-10-09' };
  const comFatal = makeHarness({ tasks: outroLado });
  const fatal = await comFatal.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(fatal.res.payload.absorbed.length, 0, 'prazo fatal humano também impede a autonomia');
  assert.equal(fatal.res.payload.refused[0].motivo, 'prazo-fatal-humano');

  const donoHumano = parDeTarefas();
  donoHumano[0] = { ...donoHumano[0], responsible: 'Advogada Teste' };
  const curadoria = makeHarness({ tasks: donoHumano });
  const dono = await curadoria.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(dono.res.payload.absorbed.length, 0, 'dono com curadoria humana não recebe absorção automática');
  assert.equal(dono.res.payload.refused[0].motivo, 'dono-com-curadoria');
  console.log('  OK: prazo humano, prazo fatal e curadoria barram a autonomia, com motivo declarado.');
}

{
  const harness = makeHarness({ tasks: parDeTarefas(), snapshotReads: true, onSuggest: state => { state.tasks[1].responsible = 'Advogada Teste'; } });
  const { res } = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(res.payload.absorbed.length, 0, 'alteração humana durante a análise deve impedir absorção');
  assert.equal(harness.taskById('tarefa-teste-b').responsible, 'Advogada Teste');
  assert.notEqual(harness.taskById('tarefa-teste-b').active, false);
}
{
  const harness = makeHarness({ tasks: parDeTarefas(), snapshotReads: true, onSuggest: state => { state.tasks[1].notes = 'Nota humana sintética'; } });
  const { res } = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(res.payload.absorbed.length, 0, 'nota humana adicionada durante a análise deve impedir absorção');
  assert.equal(harness.taskById('tarefa-teste-b').notes, 'Nota humana sintética');
}

console.log('[T5] Veredito e confiança mandam: o que não absorve sai com motivo...');
{
  const abaixo = makeHarness({ tasks: parDeTarefas(), answer: { choice: 'mesma', confidence: 0.88 } });
  const r1 = await abaixo.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(r1.res.payload.absorbed.length, 0);
  assert.equal(r1.res.payload.refused[0].motivo, 'abaixo-do-limiar', 'confiança abaixo de 0,90 não autoriza autonomia');

  const diferente = makeHarness({ tasks: parDeTarefas(), answer: { choice: 'diferente', confidence: 0.97 } });
  const r2 = await diferente.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(r2.res.payload.absorbed.length, 0, 'providências diferentes nunca são absorvidas');
  assert.equal(r2.res.payload.refused[0].motivo, 'evento-distinto');

  const incerto = makeHarness({ tasks: parDeTarefas(), answer: { choice: 'incerto', confidence: 0.99 } });
  const r3 = await incerto.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(r3.res.payload.absorbed.length, 0, 'incerto vai para conferência humana');
  assert.equal(r3.res.payload.refused[0].motivo, 'incerto');

  const semFonte = parDeTarefas();
  semFonte[1] = { ...semFonte[1], deadlineSource: '', sourceReportedDeadlineAt: '' };
  const semPrazoFonte = makeHarness({ tasks: semFonte });
  const r4 = await semPrazoFonte.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(r4.res.payload.absorbed.length, 0, 'tarefa sem prazo da fonte não entra na autonomia');
  assert.equal(r4.res.payload.refused[0].motivo, 'sem-prazo-da-fonte');

  // O painel mostra o mesmo motivo que o servidor aplicou: a leitura não promete o que a escrita não faz.
  const painel = await abaixo.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(painel.res.payload.pairs[0].blockedBy, 'abaixo-do-limiar');
  assert.equal(painel.res.payload.pairs[0].verdict, 'mesma');
  assert.equal(painel.res.payload.pairs[0].confidence, 0.88);
  assert.equal(Number(abaixo.seen.lastJson.payload.threshold), TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE, 'o limiar exposto é o do trilho');
  console.log('  OK: limiar, veredito e falta de prazo da fonte recusam a autonomia com motivo.');
}

console.log('[T6] Teto por execução: soluço do modelo não varre o acervo, mas não prende o par...');
{
  const tarefas = [];
  for (let index = 1; index <= 12; index += 1) {
    tarefas.push(...parDeTarefas({
      idA: `tarefa-teste-${index}-a`,
      idB: `tarefa-teste-${index}-b`,
      process: cnj(index)
    }));
  }
  const harness = makeHarness({ tasks: tarefas });
  const primeira = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(primeira.res.payload.absorbed.length, TASK_DUPLICATE_AUTO_ABSORB_LIMIT, 'a execução respeita o teto');
  assert.equal(
    primeira.res.payload.refused.filter(item => item.motivo === 'teto-da-execucao').length,
    12 - TASK_DUPLICATE_AUTO_ABSORB_LIMIT,
    'o excedente do teto é declarado, nunca silencioso'
  );
  const absorvidasNaPrimeira = harness.store.tasks.filter(task => task.absorbedInto).length;
  assert.equal(absorvidasNaPrimeira, TASK_DUPLICATE_AUTO_ABSORB_LIMIT);
  assert.equal(harness.seen.writes, 1, 'todas as absorções da rodada entram numa única gravação');

  const segunda = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.ok(segunda.res.payload.absorbed.length > 0, 'o par que sobrou do teto é absorvido na execução seguinte');
  assert.equal(harness.store.tasks.filter(task => task.absorbedInto).length, 12, 'nenhum par elegível fica preso pelo teto');
  assert.ok(TASK_DUPLICATE_REVIEW_PAIR_LIMIT <= 12, 'o teto de pares por rodada é o do módulo de tarefas');
  console.log('  OK: teto por execução respeitado, declarado e sem prender par elegível.');
}

console.log('[T7] Segurança da rota: sessão, CSRF e rate limit...');
{
  const tasks = [];
  for (let index = 1; index <= 13; index += 1) tasks.push(...parDeTarefas({ idA: `fila-${index}-a`, idB: `fila-${index}-b`, process: cnj(index) }));
  const harness = makeHarness({ tasks, answer: { choice: 'diferente', confidence: 0.95 } });
  const first = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(first.res.payload.classified, 12);
  assert.equal(first.res.payload.pending, 1, 'o par fora do primeiro lote continua pendente');
  const second = await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.equal(second.res.payload.classified, 1, 'a rodada seguinte alcança o par restante');
  assert.equal(second.res.payload.pending, 0);
}
{
  const harness = makeHarness({ tasks: parDeTarefas() });
  await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  assert.ok(harness.seen.csrf.every(Boolean), 'mutação exige CSRF');

  const semIa = makeHarness({ tasks: parDeTarefas(), enabled: false });
  await assert.rejects(
    () => semIa.call('POST', '/api/ai-classifier/triage-task-duplicates', {}),
    /desligado/,
    'com o recurso desligado a rota recusa em vez de classificar'
  );

  const estouro = makeHarness({ tasks: parDeTarefas() });
  for (let index = 0; index < AI_CLASSIFIER_SUGGEST_LIMIT_PER_MINUTE; index += 1) {
    await estouro.call('POST', '/api/ai-classifier/triage-task-duplicates', {});
  }
  await assert.rejects(
    () => estouro.call('POST', '/api/ai-classifier/triage-task-duplicates', {}),
    /Limite temporário/,
    'rate limit próprio da rota'
  );
  console.log('  OK: sessão, CSRF, recurso ligado e rate limit protegendo a rota.');
}

console.log('[T8] Contrato do schema e da fiação da autonomia...');
{
  const harness = makeHarness({ tasks: parDeTarefas() });
  await harness.call('POST', '/api/ai-classifier/triage-task-duplicates', { limit: 1 });
  const enviado = harness.seen.schemaIds[0];
  assert.equal(enviado, 'task_duplicate_check');
  assert.ok(!/deadline|prazo/i.test(enviado), 'o identificador do esquema não promete prazo');
  const soLeitura = makeHarness({ tasks: parDeTarefas() });
  await soLeitura.call('GET', '/api/ai-classifier/task-duplicate-candidates');
  assert.equal(soLeitura.seen.writes, 0, 'a leitura do painel nunca grava o estado consolidado');
  assert.equal(soLeitura.seen.csrf[0], false, 'leitura não exige CSRF (só sessão)');
  console.log('  OK: esquema correto, leitura sem escrita e mutação com CSRF.');
}

console.log('\n>>> TAREFAS REPETIDAS (JEV/HTTP): PASS <<<\n');
