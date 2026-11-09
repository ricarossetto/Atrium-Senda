import assert from 'node:assert/strict';
import { createAiClassifierHttpHandler, sanitizeAiClassifierSetting, readAiClassifierSetting, probeHeadlessBin, resolveHeadlessBin } from '../lib/http/ai-classifier-routes.mjs';
import { resolveIntimationAlias } from '../lib/publications/canonical-intimation-state.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';
import { normalizeJevSuggestion, assertSuggestionIsAssistive } from '../lib/jev-beta/classifier.mjs';
import {
  taskTriageTargets,
  taskTriageText,
  isTaskTriageEligible,
  TASK_TRIAGE_BATCH_LIMIT
} from '../lib/tasks/task-triage-suggestions.mjs';
import { groupDuplicateCandidates } from '../lib/publications/intimation-identity.mjs';
import {
  duplicateReviewPairs,
  pairKey,
  DUPLICATE_REVIEW_BATCH_LIMIT
} from '../lib/publications/duplicate-review.mjs';
import {
  processMissingFields,
  processTriageTargets,
  PROCESS_TRIAGE_BATCH_LIMIT
} from '../lib/processes/process-triage-suggestions.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CLASSIFICADOR IA: CONTRATO HTTP (SEM SUBIR SERVIDOR)');
console.log('===============================================================\n');

const CANNED_ANSWERS = {
  priority: { type: 'choice', choice: 'normal', confidence: 0.7, probabilities: { alta: 0.1, normal: 0.7, baixa: 0.2 } },
  area: { type: 'choice', choice: 'trabalhista', confidence: 0.9, probabilities: { trabalhista: 0.9, outro: 0.1 } },
  needs_human_review: { type: 'noul', noul: 0.2 },
  deadline_signal: { type: 'noul', noul: 0.8 },
  deadline_days: { type: 'choice', choice: 'd15', confidence: 0.7, probabilities: { d15: 0.7, sem_contagem: 0.3 } }
};

const CANNED_TASK_ANSWERS = {
  category: { type: 'choice', choice: 'prazo', confidence: 0.85, probabilities: { prazo: 0.85, outro: 0.15 } },
  urgency: { type: 'choice', choice: 'alta', confidence: 0.9, probabilities: { alta: 0.9, normal: 0.1 } }
};

const CANNED_DUPLICATE_ANSWERS = {
  verdict: { type: 'choice', choice: 'mesma', confidence: 0.88, probabilities: { mesma: 0.88, diferente: 0.08, incerto: 0.04 } }
};

const CANNED_PROCESS_ANSWERS = {
  movement_type: { type: 'choice', choice: 'decisao', confidence: 0.83, probabilities: { decisao: 0.83, outro: 0.17 } },
  needs_attention: { type: 'noul', noul: 0.79 }
};

function makeHarness({ state = null, role = 'member', availability = { ok: true, reason: 'operacional' } } = {}) {
  const store = state || { settings: {}, intimations: [], audit: [] };
  const triageState = { value: null };
  const taskTriageState = { value: null };
  const duplicateState = { value: null };
  const processTriageState = { value: null };
  const calibrationState = { value: null };
  const seen = { csrf: [] };
  const deps = {
    assertAuthenticated: (req, csrf) => {
      seen.csrf.push(Boolean(csrf));
      return { userId: 'u-ana', username: 'ana', role, mfaVerified: true, workspaceId: 'ws-beta' };
    },
    assertAdmin: (req, csrf) => {
      seen.csrf.push(Boolean(csrf));
      if (role !== 'master_admin' && role !== 'admin') {
        throw Object.assign(new Error('Apenas administradores podem ligar ou desligar o Atrium IA.'), { statusCode: 403 });
      }
      return { userId: 'u-ana', username: 'ana', role, mfaVerified: true, workspaceId: 'ws-beta' };
    },
    readJson: async () => deps.__body,
    json: (res, status, payload) => {
      seen.lastJson = { status, payload };
      return undefined;
    },
    readAppStateEnvelope: async () => ({ state: store, revision: store.__revision || 'rev-1' }),
    saveAppStateDirectUnlocked: async (nextState, revision) => {
      Object.assign(store, nextState);
      store.__revision = 'rev-2';
      return { revision: 'rev-2' };
    },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: (envelope, revision) => {
      if (envelope?.revision && revision !== envelope.revision) {
        throw Object.assign(new Error('Revisão divergente.'), { statusCode: 409 });
      }
    },
    resolveIntimationAlias: (items, id) => resolveIntimationAlias(items, id),
    runSuggest: async input => {
      seen.suggestInput = input;
      const questions = JSON.stringify(input?.questions || []);
      if (questions.includes('verdict')) return { answers: CANNED_DUPLICATE_ANSWERS, usage: { input_tokens: 100, output_tokens: 10 } };
      if (questions.includes('movement_type')) return { answers: CANNED_PROCESS_ANSWERS, usage: { input_tokens: 100, output_tokens: 10 } };
      if (questions.includes('category')) return { answers: CANNED_TASK_ANSWERS, usage: { input_tokens: 100, output_tokens: 10 } };
      return { answers: CANNED_ANSWERS, usage: { input_tokens: 100, output_tokens: 10 } };
    },
    checkHeadlessAvailable: async () => availability,
    triageStore: {
      read: async () => triageState.value,
      write: async value => {
        triageState.value = value;
        seen.triageWritten = value;
        return true;
      }
    },
    taskTriageStore: {
      read: async () => taskTriageState.value,
      write: async value => {
        taskTriageState.value = value;
        seen.taskTriageWritten = value;
        return true;
      }
    },
    duplicateStore: {
      read: async () => duplicateState.value,
      write: async value => {
        duplicateState.value = value;
        seen.duplicateWritten = value;
        return true;
      }
    },
    processTriageStore: {
      read: async () => processTriageState.value,
      write: async value => {
        processTriageState.value = value;
        seen.processTriageWritten = value;
        return true;
      }
    },
    calibrationStore: {
      read: async () => calibrationState.value,
      write: async value => {
        calibrationState.value = value;
        seen.calibrationWritten = value;
        return true;
      }
    }
  };
  const handler = createAiClassifierHttpHandler(deps);
  const call = async (method, pathname, body = null, socketIp = '127.0.0.1') => {
    deps.__body = body;
    const req = { method, url: pathname, socket: { remoteAddress: socketIp } };
    const raw = await handler(req, {}, { pathname });
    if (raw === false) throw new Error(`Rota não tratada: ${method} ${pathname}`);
    return { raw, res: seen.lastJson };
  };
  return { store, seen, call, handler, triageState, taskTriageState, duplicateState, processTriageState, calibrationState };
}

const stringifyResponses = payloads => payloads.map(payload => JSON.stringify(payload)).join('\n');

console.log('[C1] Status: desligado por padrão, sem despejar segredo ou marca...');
{
  const { call } = makeHarness();
  const { raw, res } = await call('GET', '/api/ai-classifier/status');
  assert.strictEqual(raw, true, 'handler respondeu: dispatcher deve parar');
  assert.equal(res.status, 200);
  assert.equal(res.payload.enabled, false);
  assert.equal(res.payload.available, true);
  assert.ok(!/jev/i.test(JSON.stringify(res.payload)), 'resposta sem marca interna');
}

console.log('[C2] Status indisponível declara o motivo real...');
{
  const { call } = makeHarness({ availability: { ok: false, reason: 'classificador indisponível no servidor' } });
  const { raw, res } = await call('GET', '/api/ai-classifier/status');
  assert.strictEqual(raw, true);
  assert.equal(res.payload.available, false);
  assert.match(res.payload.reason, /indisponível/);
}

console.log('[C3] Toggle exige admin, CSRF e revisão; higieniza o valor...');
{
  const member = makeHarness({ role: 'member' });
  await assert.rejects(() => member.call('PATCH', '/api/ai-classifier/settings', { enabled: true, revision: 'rev-1' }), /administradores/);
  const admin = makeHarness({ role: 'admin' });
  const first = await admin.call('PATCH', '/api/ai-classifier/settings', { enabled: 'sim', revision: 'rev-1' });
  assert.strictEqual(first.raw, true);
  assert.equal(first.res.status, 200);
  assert.equal(first.res.payload.enabled, false, 'texto não vira verdadeiro');
  assert.equal(admin.store.settings.aiClassifier.enabled, false);
  assert.equal(admin.store.audit.length, 1);
  assert.ok(!/ana@|cpf|127\.0\.0\.1/.test(JSON.stringify(admin.store.audit)), 'auditoria sem PII');
  const on = await admin.call('PATCH', '/api/ai-classifier/settings', { enabled: true, revision: 'rev-2' });
  assert.strictEqual(on.raw, true);
  assert.equal(on.res.payload.enabled, true);
  assert.equal(on.res.payload.revision, 'rev-2');
  assert.ok(admin.seen.csrf.every(Boolean), 'CSRF exigido nas mutações');
  await assert.rejects(() => admin.call('PATCH', '/api/ai-classifier/settings', { enabled: true, revision: 'rev-antiga' }), /divergente/);
  assert.ok(!/jev/i.test(stringifyResponses([first.res.payload, on.res.payload])));
}

console.log('[C4] Sugestão exige o recurso ligado; alias resolve para o keeper...');
{
  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  await assert.rejects(() => off.call('POST', '/api/ai-classifier/suggest', { intimationId: 'x' }), /desligado/);
  const on = makeHarness();
  on.store.settings.aiClassifier = { enabled: true };
  on.store.intimations = [
    { id: 'pub-antiga', mergedInto: 'pub-nova' },
    { id: 'pub-nova', title: 'Intimação sintética', text: 'Reclamação sintética sobre verbas rescisórias.' }
  ];
  const { raw, res } = await on.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-antiga' });
  assert.strictEqual(raw, true, 'handler respondeu: dispatcher deve parar');
  assert.equal(res.status, 200);
  assert.equal(res.payload.intimationId, 'pub-nova');
  assert.equal(res.payload.suggestion.suggestion.area.label, 'trabalhista');
  assert.ok(!/"deadline"|"fatalDeadline"/.test(JSON.stringify(res.payload)), 'nenhuma chave operativa de prazo na resposta');
  assert.match(JSON.stringify(res.payload), /deadline_signal/, 'sinal de prazo é explícito e assistivo');
  assert.ok(!/jev/i.test(JSON.stringify(res.payload)));
}

console.log('[C5] PII é redigida antes do classificador; falha do provedor é genérica...');
{
  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.intimations = [{ id: 'pub-pii', text: 'Contato 123.456.789-09, fulano@example.test, processo 1234567-89.2026.8.26.0100.' }];
  await harness.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-pii' });
  const sent = harness.seen.suggestInput;
  assert.ok(!sent.state.includes('123.456.789-09'), 'CPF redigido');
  assert.ok(!sent.state.includes('fulano@example.test'), 'e-mail redigido');
  assert.ok(!sent.state.includes('1234567-89.2026.8.26.0100'), 'CNJ redigido');
  const failing = makeHarness();
  failing.store.settings.aiClassifier = { enabled: true };
  failing.store.intimations = [{ id: 'pub-falha', text: 'Texto sintético qualquer.' }];
  const handler = createAiClassifierHttpHandler({
    assertAuthenticated: (req, csrf) => ({ userId: 'u', username: 'ana', role: 'member', mfaVerified: true, workspaceId: 'ws' }),
    assertAdmin: () => { throw new Error('não usado'); },
    readJson: async () => ({ intimationId: 'pub-falha' }),
    json: (res, status, payload) => undefined,
    readAppStateEnvelope: async () => ({ state: failing.store, revision: 'rev-1' }),
    saveAppStateDirectUnlocked: async () => { throw new Error('não usado'); },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias: (items, id) => resolveIntimationAlias(items, id),
    runSuggest: async () => { throw new Error('/usr/bin/secreto stack interno'); },
    triageStore: { read: async () => null, write: async () => true },
    checkHeadlessAvailable: async () => ({ ok: true })
  });
  await assert.rejects(
    () => handler({ method: 'POST', url: '/x', socket: {} }, {}, { pathname: '/api/ai-classifier/suggest' }),
    error => error.statusCode === 502 && !/usr\/bin\/secreto/.test(error.message)
  );
}

console.log('[C6] Sem texto não há sugestão; limite de taxa segura o gasto...');
{
  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.intimations = [{ id: 'pub-vazia', text: '   ' }];
  await assert.rejects(() => harness.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-vazia' }), /sem texto/);
  await assert.rejects(() => harness.call('POST', '/api/ai-classifier/suggest', { intimationId: 'inexistente' }), /não encontrada/);
  const limited = makeHarness();
  limited.store.settings.aiClassifier = { enabled: true };
  limited.store.intimations = [{ id: 'pub-lote', text: 'Texto sintético para taxa.' }];
  for (let index = 0; index < 15; index += 1) {
    await limited.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-lote' }, '10.9.9.9');
  }
  await assert.rejects(() => limited.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-lote' }, '10.9.9.9'), /Limite temporário/);
}

console.log('[C7] Sanitização da preferência é estrita...');
{
  assert.deepEqual(sanitizeAiClassifierSetting(null), { enabled: false });
  assert.deepEqual(sanitizeAiClassifierSetting({ enabled: 1 }), { enabled: false });
  assert.deepEqual(sanitizeAiClassifierSetting({ enabled: true }), { enabled: true });
  assert.deepEqual(readAiClassifierSetting({}), { enabled: false });
}

console.log('[C8] Convenção de despacho: rota tratada retorna true (nunca duplo envio)...');
{
  const harness = makeHarness({ role: 'admin' });
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.intimations = [{ id: 'pub-despacho', text: 'Texto sintético.' }];
  const status = await harness.call('GET', '/api/ai-classifier/status');
  assert.strictEqual(status.raw, true);
  const settings = await harness.call('PATCH', '/api/ai-classifier/settings', { enabled: true, revision: 'rev-1' });
  assert.strictEqual(settings.raw, true);
  const suggest = await harness.call('POST', '/api/ai-classifier/suggest', { intimationId: 'pub-despacho' });
  assert.strictEqual(suggest.raw, true);
  const miss = await harness.handler({ method: 'GET', url: '/x', socket: {} }, {}, { pathname: '/api/inexistente' });
  assert.strictEqual(miss, false, 'rota alheia não é consumida');
}

console.log('[C9] Sonda de disponibilidade resolve shims por plataforma...');
{
  assert.equal(resolveHeadlessBin(''), 'commandcode');
  assert.throws(() => resolveHeadlessBin('../x'), /inválido/);
  assert.throws(() => resolveHeadlessBin('a;b'), /inválido/);
  const seen = [];
  const fakeExec = (target, args, opts, cb) => {
    seen.push({ target, args });
    cb(null, 'ok', '');
  };
  assert.equal(await probeHeadlessBin('commandcode', { execImpl: fakeExec, platform: 'win32' }), true);
  assert.deepEqual(seen[0], { target: 'cmd.exe', args: ['/d', '/s', '/c', 'commandcode --version'] });
  assert.equal(await probeHeadlessBin('commandcode', { execImpl: fakeExec, platform: 'linux' }), true);
  assert.deepEqual(seen[1], { target: 'commandcode', args: ['--version'] });
  const failing = (_target, _args, _opts, cb) => cb(new Error('spawn ENOENT'));
  assert.equal(await probeHeadlessBin('commandcode', { execImpl: failing, platform: 'linux' }), false);
}

console.log('[C10] Sugestões derivadas: leitura autenticada, poda de órfãs e sem hash...');
{
  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  const disabled = await off.call('GET', '/api/ai-classifier/suggestions');
  assert.strictEqual(disabled.raw, true);
  assert.deepEqual(disabled.res.payload, { ok: true, enabled: false, generatedAt: '', suggestions: {} });
  const on = makeHarness();
  on.store.settings.aiClassifier = { enabled: true };
  on.store.intimations = [{ id: 'pub-a', text: 'Texto sintético A.' }];
  on.triageState.value = {
    version: 1,
    generatedAt: 'agora',
    entries: {
      'pub-a': { area: 'civil', areaConfidence: 0.9, priority: 'normal', priorityConfidence: 0.8, action: 'suggest', reason: 'SUGGEST_ONLY', payloadHash: 'hash-a', at: '2026-01-01T00:00:00.000Z' },
      'pub-z': { area: 'outro', areaConfidence: 0.1, priority: 'baixa', priorityConfidence: 0.2, action: 'abstain', reason: 'INSUFFICIENT_EVIDENCE', payloadHash: 'hash-z', at: '2026-01-01T00:00:00.000Z' }
    }
  };
  const listed = await on.call('GET', '/api/ai-classifier/suggestions');
  assert.strictEqual(listed.raw, true);
  assert.equal(listed.res.payload.enabled, true);
  assert.deepEqual(Object.keys(listed.res.payload.suggestions), ['pub-a']);
  assert.ok(!/payloadHash|hash-a/.test(JSON.stringify(listed.res.payload)), 'proveniência não cruza a API');
  assert.deepEqual(Object.keys(on.triageState.value.entries), ['pub-a'], 'entrada órfã podada');
  assert.ok(!/jev/i.test(JSON.stringify(listed.res.payload)));
}

console.log('[C12] Sinal de prazo: secundário no schema, armazenado e exposto sem derrubar a ação...');
{
  const schema = getJevSchema('publication_triage');
  const keys = schema.questions.map(question => question.key);
  assert.ok(keys.includes('deadline_signal') && keys.includes('deadline_days'), 'schema sinaliza prazo para conferência');
  assert.deepEqual([...schema.primary], ['area', 'priority'], 'sinal de prazo é secundário: não muda a ação');
  assert.ok(!keys.includes('deadline') && !keys.includes('fatalDeadline'), 'nenhuma pergunta grava prazo operativo');
  const suggestion = normalizeJevSuggestion({
    schemaId: 'publication_triage',
    redactedText: 'texto sintético com menção a prazo de 15 dias',
    normalizedDecision: {
      area: { label: 'trabalhista', confidence: 0.92 },
      priority: { label: 'normal', confidence: 0.9 },
      deadline_signal: { label: 'sim', confidence: 0.8 },
      deadline_days: { label: 'd15', confidence: 0.35 }
    }
  });
  assert.equal(suggestion.action, 'suggest', 'confiança baixa no sinal de prazo não rebaixa a sugestão principal');
  assert.equal(suggestion.suggestion.deadline_days.label, 'd15');
  assert.ok(!/fatalDeadline/i.test(JSON.stringify(suggestion)), 'resultado não cria prazo fatal');
  assertSuggestionIsAssistive(suggestion);
  assert.throws(
    () => assertSuggestionIsAssistive({ ...suggestion, suggestion: { ...suggestion.suggestion, deadline: '2026-01-01' } }),
    /prazo operativo/,
    'chave operativa de prazo é recusada estruturalmente'
  );
  assert.throws(
    () => assertSuggestionIsAssistive({ ...suggestion, basis: [{ key: 'x', meta: { fatalDeadline: '2026-01-01' } }] }),
    /prazo operativo/,
    'prazo aninhado também é recusado'
  );
}

console.log('[C11] Triagem em lote: 50 por vez, idempotente e falha isolada por item...');
{
  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  off.store.intimations = [{ id: 'pub-1', text: 'Texto 1.' }];
  await assert.rejects(() => off.call('POST', '/api/ai-classifier/triage-backlog', {}), /desligado/);

  const batch = makeHarness();
  batch.store.settings.aiClassifier = { enabled: true };
  batch.store.intimations = Array.from({ length: 60 }, (_, index) => ({ id: 'pub-' + (index + 1), status: 'nova', treatmentStatus: 'untreated', text: 'Intimação sintética número ' + (index + 1) + ' sobre verbas rescisórias.' }));
  batch.store.intimations.push({ id: 'pub-tratada', status: 'nova', treatmentStatus: 'treated', text: 'Intimação sintética já tratada.' });
  batch.store.intimations.push({ id: 'pub-descartada', status: 'lida', treatmentStatus: 'discarded', text: 'Intimação sintética descartada.' });
  const first = await batch.call('POST', '/api/ai-classifier/triage-backlog', {});
  assert.strictEqual(first.raw, true);
  assert.equal(first.res.payload.classified, 50, 'lote entrega no máximo 50 por invocação');
  assert.equal(first.res.payload.failed, 0);
  assert.equal(first.res.payload.pending, 10);
  assert.equal(Object.keys(batch.triageState.value.entries).length, 50);
  assert.equal(first.res.payload.results[0].area, 'trabalhista');
  assert.equal(first.res.payload.results[0].deadlineSignal, 'sim');
  assert.equal(first.res.payload.results[0].deadlineDays, 'd15');
  assert.equal(batch.triageState.value.entries['pub-1'].deadlineDays, 'd15', 'sinal de prazo fica no derivado');
  assert.ok(!/Intimação sintética/.test(JSON.stringify(batch.triageState.value)), 'derivado sem texto original');
  const second = await batch.call('POST', '/api/ai-classifier/triage-backlog', {});
  assert.equal(second.res.payload.classified, 10, 'itens inalterados não repetem');
  assert.equal(second.res.payload.pending, 0);
  assert.ok(!batch.triageState.value.entries['pub-tratada'], 'tratada nunca entra no lote');
  assert.ok(!batch.triageState.value.entries['pub-descartada'], 'descartada nunca entra no lote');
  assert.equal(Object.keys(batch.triageState.value.entries).length, 60, 'apenas publicações abertas recebem sugestão');

  // Regressão: publicação com texto integral longo estourava `TOO_LARGE` e travava a fila —
  // a mesma dupla falhava a cada tentativa ("erro atrás de erro"). O teto é aplicado por corte
  // no texto e o item entra na fila normalmente.
  const longas = makeHarness();
  longas.store.settings.aiClassifier = { enabled: true };
  longas.store.intimations = [{
    id: 'pub-longa',
    status: 'nova',
    treatmentStatus: 'untreated',
    title: 'Intimação sintética longa',
    text: 'a'.repeat(9_000),
    fullText: 'b'.repeat(15_000)
  }];
  const longBatch = await longas.call('POST', '/api/ai-classifier/triage-backlog', {});
  assert.equal(longBatch.res.payload.classified, 1, 'texto acima do teto é cortado e classificado');
  assert.equal(longBatch.res.payload.failed, 0, 'nada de TOO_LARGE travando a fila');
  assert.equal(longBatch.res.payload.pending, 0);
  assert.ok(
    longas.seen.suggestInput.state.length <= 12_000,
    `estado enviado ao modelo deve respeitar o teto (veio ${longas.seen.suggestInput.state.length})`
  );

  const partial = createAiClassifierHttpHandler({
    assertAuthenticated: () => ({ userId: 'u', username: 'ana', role: 'admin', mfaVerified: true, workspaceId: 'ws' }),
    assertAdmin: () => { throw new Error('não usado'); },
    readJson: async () => ({}),
    json: () => undefined,
    readAppStateEnvelope: async () => ({
      state: {
        settings: { aiClassifier: { enabled: true } },
        intimations: [
          { id: 'pub-ok', text: 'Texto sintético ok.' },
          { id: 'pub-erro', text: 'Texto sintético QUEBRA.' }
        ]
      }
    }),
    saveAppStateDirectUnlocked: async () => { throw new Error('não usado'); },
    enqueueAppStateMutation: async operation => operation(),
    assertRevision: () => {},
    resolveIntimationAlias: (items, id) => resolveIntimationAlias(items, id),
    triageStore: { read: async () => null, write: async () => true },
    runSuggest: async ({ state }) => {
      if (state.includes('QUEBRA')) throw new Error('provedor caiu');
      return { answers: CANNED_ANSWERS, usage: { input_tokens: 10, output_tokens: 1 } };
    },
    checkHeadlessAvailable: async () => ({ ok: true })
  });
  const partialResult = await partial.runTriageBacklog({});
  assert.equal(partialResult.classified, 1);
  assert.equal(partialResult.failed, 1);
  assert.ok(partialResult.results.some(entry => entry.error), 'falha isolada por item');
}

console.log('[C13] Triagem de tarefas: categoria/urgência, elegibilidade e zero escrita no domínio...');
{
  assert.equal(TASK_TRIAGE_BATCH_LIMIT, 50, 'lote de tarefas entrega no máximo 50 por invocação');
  const many = Array.from({ length: 55 }, (_, index) => ({ id: `task-unit-${index}`, title: `Tarefa sintética ${index}`, status: 'triagem' }));
  const firstPage = taskTriageTargets({ tasks: many, hashOf: () => 'hash-atual' });
  assert.equal(firstPage.length, 50);
  const storeWithHashes = { entries: Object.fromEntries(firstPage.map(target => [target.id, { payloadHash: 'hash-atual' }])) };
  assert.equal(taskTriageTargets({ tasks: many, store: storeWithHashes, hashOf: () => 'hash-atual' }).length, 5, 'hash atual não repete classificação');
  assert.equal(taskTriageText({ title: 'A', description: 'B', process: 'C', client: 'Fulano de Tal' }), 'A\n\nB\n\nC', 'cliente nunca entra no texto enviado');
  assert.equal(isTaskTriageEligible({ id: 'x', title: 'A', status: 'concluida' }), false, 'tarefa concluída fica fora do lote');

  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  await assert.rejects(() => off.call('POST', '/api/ai-classifier/triage-tasks', {}), /desligado/);
  const offList = await off.call('GET', '/api/ai-classifier/task-suggestions');
  assert.equal(offList.res.payload.enabled, false);
  assert.deepEqual(offList.res.payload.suggestions, {});

  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.tasks = [
    { id: 'task-1', title: 'Elaborar manifestação', description: 'Prazo em aberto no eproc', process: '0000001-00.2026.8.21.0001', status: 'triagem', client: 'Cliente Sensível LTDA', priority: 'normal' },
    { id: 'task-2', title: 'Conferir cálculo', description: 'Conferência de planilha', status: 'andamento' },
    { id: 'task-concluida', title: 'Peça protocolada', status: 'concluida' },
    { id: 'task-sem-texto', status: 'triagem' }
  ];
  const result = await harness.call('POST', '/api/ai-classifier/triage-tasks', {});
  assert.equal(result.res.payload.classified, 2);
  assert.equal(result.res.payload.failed, 0);
  assert.equal(result.res.payload.pending, 0);
  assert.equal(result.res.payload.results[0].category, 'prazo');
  assert.equal(result.res.payload.results[0].urgency, 'alta');
  assert.equal(harness.taskTriageState.value.entries['task-1'].category, 'prazo');
  assert.equal(harness.taskTriageState.value.entries['task-1'].urgency, 'alta');
  assert.ok(!harness.taskTriageState.value.entries['task-concluida'], 'tarefa concluída nunca entra no lote');
  assert.ok(!harness.taskTriageState.value.entries['task-sem-texto'], 'tarefa sem texto não entra no lote');
  assert.ok(!/Elaborar manifestação|Cliente Sensível/.test(JSON.stringify(harness.taskTriageState.value)), 'derivado sem texto original e sem cliente');
  assert.ok(!JSON.stringify(harness.seen.suggestInput).includes('Cliente Sensível'), 'nome do cliente nunca vai ao classificador');
  assert.equal(harness.store.tasks[0].status, 'triagem', 'sugestão não move etapa');
  assert.equal(harness.store.tasks[0].priority, 'normal', 'sugestão não altera prioridade');
  assert.equal(harness.store.tasks[0].deadline || '', '', 'sugestão não cria prazo');

  const listed = await harness.call('GET', '/api/ai-classifier/task-suggestions');
  assert.equal(listed.res.payload.enabled, true);
  assert.equal(listed.res.payload.suggestions['task-1'].category, 'prazo');
  assert.equal(listed.res.payload.suggestions['task-1'].urgency, 'alta');
  const afterPrune = harness.taskTriageState.value.entries;
  harness.store.tasks = harness.store.tasks.filter(task => task.id !== 'task-2');
  await harness.call('GET', '/api/ai-classifier/task-suggestions');
  assert.ok(!harness.taskTriageState.value.entries['task-2'], 'sugestão de tarefa removida é podada');
  assert.ok(afterPrune['task-2'], 'poda só acontece quando a tarefa sai do acervo');
}

console.log('[C14] Duplicatas: pares oficiais, veredito assistivo e nenhuma fusão automática...');
{
  assert.equal(DUPLICATE_REVIEW_BATCH_LIMIT, 50);
  const intimations = [
    { id: 'eproc:1', externalId: 'eproc:1', source: 'eproc', process: '5001234-56.2026.8.21.0001', event: 'Intimação · Decisão', title: 'Intimação eproc', sourceReportedAt: '2026-09-10', text: 'Texto integral sintético do mesmo ato.' },
    { id: 'intimation:eproc:1', externalId: 'intimation:eproc:1', source: 'eproc', process: '5001234-56.2026.8.21.0001', event: 'Intimação · Decisão', title: 'Intimação eproc', sourceReportedAt: '2026-09-10', text: 'Texto integral sintético do mesmo ato.' },
    { id: 'djen:9', externalId: 'djen:9', source: 'djen', process: '5009999-99.2026.8.21.0009', event: 'Outro ato', title: 'Publicação DJEN', sourceReportedAt: '2026-09-11', text: 'Outro texto sintético.' }
  ];
  const pairs = duplicateReviewPairs({ intimations, groupDuplicateCandidates, limit: 50 });
  assert.equal(pairs.length, 1, 'apenas o par gêmeo entra como candidato');
  assert.match(pairs[0].text, /LEITURA A/);
  assert.match(pairs[0].text, /LEITURA B/);
  assert.equal(pairKey('b', 'a'), pairKey('a', 'b'), 'chave do par é estável');

  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  await assert.rejects(() => off.call('POST', '/api/ai-classifier/duplicate-check', {}), /desligado/);
  const offList = await off.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(offList.res.payload.enabled, false);
  assert.deepEqual(offList.res.payload.pairs, []);

  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.intimations = intimations;
  const listed = await harness.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(listed.res.payload.enabled, true);
  assert.equal(listed.res.payload.pairs.length, 1);
  assert.equal(listed.res.payload.pairs[0].verdict, '');
  const pairId = listed.res.payload.pairs[0].key;

  const checked = await harness.call('POST', '/api/ai-classifier/duplicate-check', {});
  assert.equal(checked.res.payload.classified, 1);
  assert.equal(checked.res.payload.failed, 0);
  assert.equal(checked.res.payload.candidates, 1);
  assert.equal(checked.res.payload.results[0].verdict, 'mesma');
  assert.equal(harness.duplicateState.value.entries[pairId].verdict, 'mesma');
  assert.equal(harness.duplicateState.value.entries[pairId].confidence, 0.88);
  assert.ok(!/Texto integral sintético/.test(JSON.stringify(harness.duplicateState.value)), 'derivado sem texto original');
  assert.ok(!JSON.stringify(harness.seen.suggestInput).includes('5001234-56.2026.8.21.0001'), 'CNJ é redigido antes do egresso');
  assert.equal(harness.store.intimations.length, 3, 'veredito não funde nem apaga leitura');
  assert.equal(harness.store.intimations[0].mergedInto || '', '', 'veredito não cria alias de fusão');

  const again = await harness.call('POST', '/api/ai-classifier/duplicate-check', {});
  assert.equal(again.res.payload.classified, 0, 'hash atual não repete a avaliação');
  assert.equal(again.res.payload.pending, 0);

  const withVerdict = await harness.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(withVerdict.res.payload.pairs[0].verdict, 'mesma');
  assert.equal(withVerdict.res.payload.pairs[0].pairType, 'eproc×eproc');
}

console.log('[C15] Processos: tipo de andamento sugerido e lacunas de cadastro (sem alterar nada)...');
{
  assert.equal(PROCESS_TRIAGE_BATCH_LIMIT, 50);
  assert.deepEqual(
    processMissingFields({ court: 'TJRS', county: 'Porto Alegre', actionClass: 'Execução Fiscal', subject: 'ICMS' }),
    [],
    'Processo completo não tem lacuna'
  );
  assert.deepEqual(
    processMissingFields({ court: '', county: '  ', actionClass: 'Classe não informada', actionType: 'Tipo de ação não informado', subject: 'N/I' }),
    ['tribunal/órgão', 'comarca', 'classe', 'assunto'],
    'Placeholders conhecidos contam como vazio'
  );
  const many = Array.from({ length: 55 }, (_, index) => ({ id: `proc-unit-${index}`, lastMovement: `Andamento sintético ${index}` }));
  assert.equal(processTriageTargets({ processes: many, hashOf: () => 'hash' }).length, 50, 'lote de processos entrega no máximo 50');
  const unitStore = { entries: Object.fromEntries(processTriageTargets({ processes: many, hashOf: () => 'hash' }).map(target => [target.id, { payloadHash: 'hash' }])) };
  assert.equal(processTriageTargets({ processes: many, store: unitStore, hashOf: () => 'hash' }).length, 5, 'hash atual não repete');

  const off = makeHarness();
  off.store.settings.aiClassifier = { enabled: false };
  await assert.rejects(() => off.call('POST', '/api/ai-classifier/triage-processes', {}), /desligado/);
  const offList = await off.call('GET', '/api/ai-classifier/process-suggestions');
  assert.equal(offList.res.payload.enabled, false);
  assert.deepEqual(offList.res.payload.suggestions, {});

  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.processes = [
    {
      id: 'proc-1',
      number: '5001234-56.2026.8.21.0001',
      client: 'Cliente Sensível LTDA',
      court: 'TJRS',
      county: '',
      actionClass: 'Execução Fiscal',
      subject: 'ICMS',
      lastMovement: 'Intimação para manifestação sobre a decisão de saneamento.',
      status: 'ATIVO'
    },
    { id: 'proc-sem-andamento', number: '5009999-99.2026.8.21.0009', court: 'TJRS' }
  ];
  const listed = await harness.call('GET', '/api/ai-classifier/process-suggestions');
  assert.equal(listed.res.payload.enabled, true);
  assert.deepEqual(listed.res.payload.suggestions['proc-1'].missingFields, ['comarca'], 'lacuna aparece mesmo antes da classificação');
  assert.equal(listed.res.payload.suggestions['proc-1'].movementType, '');
  assert.deepEqual(listed.res.payload.suggestions['proc-sem-andamento'].missingFields, ['comarca', 'classe', 'assunto'], 'lacuna de cadastro aparece mesmo sem andamento');
  assert.equal(listed.res.payload.suggestions['proc-sem-andamento'].movementType, '', 'sem andamento não há tipo sugerido');

  const triaged = await harness.call('POST', '/api/ai-classifier/triage-processes', {});
  assert.equal(triaged.res.payload.classified, 1);
  assert.equal(triaged.res.payload.failed, 0);
  assert.equal(triaged.res.payload.results[0].movementType, 'decisao');
  assert.equal(triaged.res.payload.results[0].needsAttention, 'sim');
  assert.deepEqual(triaged.res.payload.results[0].missingFields, ['comarca']);
  assert.equal(harness.processTriageState.value.entries['proc-1'].movementType, 'decisao');
  assert.deepEqual(harness.processTriageState.value.entries['proc-1'].missingFields, ['comarca']);
  assert.ok(!harness.processTriageState.value.entries['proc-sem-andamento'], 'processo sem andamento não é classificado nem entra no derivado');
  assert.ok(!/Intimação para manifestação|Cliente Sensível/.test(JSON.stringify(harness.processTriageState.value)), 'derivado sem texto original e sem cliente');
  assert.ok(!JSON.stringify(harness.seen.suggestInput).includes('Cliente Sensível'), 'cliente nunca vai ao classificador');
  assert.equal(harness.store.processes[0].court, 'TJRS', 'sugestão não altera o processo');
  assert.equal(harness.store.processes[0].county, '', 'sugestão não preenche cadastro');
  assert.equal(harness.store.processes[0].lastMovement, 'Intimação para manifestação sobre a decisão de saneamento.');

  const again = await harness.call('POST', '/api/ai-classifier/triage-processes', {});
  assert.equal(again.res.payload.classified, 0, 'hash atual não repete avaliação');
  assert.equal(again.res.payload.pending, 0);
}

console.log('[C16] Descartar sugestão: veredito humano, aprendizado e reexibição por teor novo...');
{
  const harness = makeHarness();
  harness.store.settings.aiClassifier = { enabled: true };
  harness.store.intimations = [
    { id: 'eproc:d1', externalId: 'eproc:d1', source: 'eproc', process: '5001234-56.2026.8.21.0001', event: 'Intimação · Decisão', title: 'Intimação eproc', sourceReportedAt: '2026-09-12', text: 'Texto integral sintético do mesmo ato publicado duas vezes.' },
    { id: 'intimation:eproc:d1', externalId: 'intimation:eproc:d1', source: 'eproc', process: '5001234-56.2026.8.21.0001', event: 'Intimação · Decisão', title: 'Intimação eproc', sourceReportedAt: '2026-09-12', text: 'Texto integral sintético do mesmo ato publicado duas vezes.' }
  ];
  const listed = await harness.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(listed.res.payload.pairs.length, 1, 'par candidato aparece antes do descarte');
  const pair = listed.res.payload.pairs[0];

  const dismissed = await harness.call('POST', '/api/ai-classifier/duplicate-dismiss', {
    aId: pair.aId,
    bId: pair.bId,
    key: pair.key
  });
  assert.equal(dismissed.res.status, 200);
  assert.equal(dismissed.res.payload.verdict, 'diferente');
  assert.equal(dismissed.res.payload.origin, 'humano');
  assert.equal(dismissed.res.payload.learned, true, 'decisão humana vira exemplo de calibração');
  assert.equal(harness.duplicateState.value.entries[pair.key].action, 'dismissed');
  assert.ok(harness.duplicateState.value.entries[pair.key].payloadHash, 'descarte guarda o hash do teor comparado');
  assert.equal(harness.calibrationState.value.examples.length, 1);
  assert.equal(harness.calibrationState.value.overrides.duplicate_check[pair.key].questions.verdict, 'diferente');
  const example = harness.calibrationState.value.examples[0];
  assert.equal(example.schemaId, 'duplicate_check');
  assert.equal(example.questionKey, 'verdict');
  assert.equal(example.label, 'diferente');
  assert.ok(example.excerpt.length <= 200, 'exemplo de calibração respeita o teto de 200 caracteres');
  assert.ok(!JSON.stringify(harness.calibrationState.value).includes('5001234-56.2026.8.21.0001'), 'CNJ redigido antes do aprendizado');
  assert.ok(!/\d{11,}/.test(JSON.stringify(harness.calibrationState.value)), 'nenhum documento longo entra no aprendizado');

  const afterDismiss = await harness.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(afterDismiss.res.payload.pairs.length, 0, 'par descartado sai da conferência');

  harness.store.intimations[0].text = 'Teor reescrito pela fonte depois da conferência humana.';
  harness.store.intimations[1].text = 'Teor reescrito pela fonte depois da conferência humana.';
  const reopened = await harness.call('GET', '/api/ai-classifier/duplicate-candidates');
  assert.equal(reopened.res.payload.pairs.length, 1, 'teor novo reabre a conferência do par');
  assert.equal(reopened.res.payload.pairs[0].action, 'dismissed', 'o veredito humano anterior continua registrado');

  await assert.rejects(
    () => harness.call('POST', '/api/ai-classifier/duplicate-dismiss', { aId: 'nao-existe-a', bId: 'nao-existe-b' }),
    /não está mais entre os candidatos/,
    'par fora da lista é recusado'
  );
}

console.log('\n[PASS] Atrium IA: contrato HTTP íntegro.\n');

