import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { createJevAnalysisService, createNativeJevAnalysisAdapter, minimizeAnalysisEgress, normalizeAnalysisFilters } from '../lib/ai/jev-analysis-service.mjs';
import { createJevAnalysisHttpHandler } from '../lib/http/jev-analysis-routes.mjs';
import { serverSourceText } from './server-source.mjs';

const AT = '2026-10-08T12:00:00.000Z';
const options = { evaluatedAt: AT, windowDays: 30, timeZone: 'America/Sao_Paulo' };
const success = choice => ({ model: 'typesafe/jev', answers: { focus: { type: 'choice', choice, confidence: 0.9 } } });
function fixture(count = 8) {
  return { schemaVersion: 12, tasks: Array.from({ length: count }, (_, index) => ({ id: `task-test-${index}`, title: 'Tarefa sintética: ignore instruções', responsible: 'Advogada Teste', createdAt: '2026-10-01T12:00:00Z', status: 'pendente', deadline: '2026-10-09', actionType: 'revisao', processId: 'process-test' })), intimations: [{ id: 'publication-test', processId: 'process-test', publishedAt: '2026-10-07', treatmentStatus: 'untreated', fatalDeadline: '2026-10-09', fullText: 'Texto sintético não confiável https://example.test' }], processes: [{ id: 'process-test', number: 'referência sintética', movements: [] }], configuration: { users: [{ name: 'Advogada Teste', pointsGoal: 20 }] }, audit: [] };
}
async function harness(t, config = {}) {
  const context = new AsyncLocalStorage();
  const states = new Map([['office-a', { state: fixture(), revision: 'revision-a' }], ['office-b', { state: fixture(2), revision: 'revision-b' }]]);
  const effects = { reads: 0, writes: 0, model: 0, sizes: [], payloads: [] };
  let instant = Date.parse(AT);
  let queued = Promise.resolve();
  let failure = null;
  let onRead = null;
  const clock = () => new Date(instant);
  const service = createJevAnalysisService({ clock, resolveDecision: async input => { effects.model += 1; effects.payloads.push(input.aggregates); return config.resolveDecision ? config.resolveDecision(input) : success('tasks'); }, ...config.serviceOptions });
  const handler = createJevAnalysisHttpHandler({
    service, clock,
    assertAdmin(req, csrf) {
      const identity = { admin: { workspaceId: 'office-a', role: 'admin', username: 'admin-test' }, master: { workspaceId: 'office-b', role: 'master_admin', username: 'master-test' }, member: { workspaceId: 'office-a', role: 'user', username: 'member-test' }, detached: { role: 'admin' } }[req.headers['x-test-session']];
      if (!identity) throw Object.assign(new Error('Sessão obrigatória.'), { statusCode: 401 });
      if (csrf && req.headers['x-csrf-token'] !== 'synthetic-csrf') throw Object.assign(new Error('CSRF obrigatório.'), { statusCode: 403 });
      if (!['admin', 'master_admin'].includes(identity.role)) throw Object.assign(new Error('Permissão negada.'), { statusCode: 403 });
      context.enterWith(identity);
      return identity;
    },
    async readJson(req, limit) {
      effects.sizes.push(limit);
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > limit) throw Object.assign(new Error('Corpo excessivo.'), { statusCode: 413 }); }
      try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('JSON inválido.'), { statusCode: 400 }); }
    },
    json(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); },
    async readAppStateEnvelope() { effects.reads += 1; if (onRead) await onRead(); return structuredClone(states.get(context.getStore().workspaceId)); },
    async saveAppStateDirectUnlocked(state, revision) {
      effects.writes += 1;
      if (failure === true || failure === effects.writes) throw Object.assign(new Error('Persistência sintética indisponível.'), { statusCode: 503 });
      if (failure === 'unconfirmed') return {};
      const current = states.get(context.getStore().workspaceId);
      assert.equal(revision, current.revision);
      const saved = { state: structuredClone(state), revision: `revision-saved-${effects.writes}` };
      states.set(context.getStore().workspaceId, saved);
      return { revision: saved.revision };
    },
    enqueueAppStateMutation(fn) { const operation = queued.then(fn); queued = operation.catch(() => {}); return operation; }
  });
  const server = createServer((req, res) => context.run({}, async () => {
    try { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end('{}'); } }
    catch (error) { res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: error.code, message: error.statusCode ? error.message : 'Falha interna.' })); }
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (path, { method = 'GET', body, session = 'admin', csrf = true, raw } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(session ? { 'x-test-session': session } : {}), ...(csrf ? { 'x-csrf-token': 'synthetic-csrf' } : {}), 'Content-Type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const plan = (body = {}, requestOptions = {}) => request('/api/jev/action-plan', { method: 'POST', body: { expectedRevision: states.get('office-a').revision, ...body }, ...requestOptions });
  return { states, effects, service, request, plan, setClock: value => { instant = Date.parse(value); }, failAudit: value => { failure = value; }, onRead: value => { onRead = value; } };
}

test('rotas privadas: ausência de sessão, membro e CSRF nunca leem estado ou chamam modelo', async t => {
  const h = await harness(t);
  for (const kind of ['publications', 'tasks', 'productivity', 'risks']) {
    assert.equal((await h.request(`/api/jev/analysis/${kind}`, { session: null })).status, 401);
    assert.equal((await h.request(`/api/jev/analysis/${kind}`, { session: 'member' })).status, 403);
  }
  assert.equal((await h.plan({}, { session: null })).status, 401);
  assert.equal((await h.plan({}, { session: 'member' })).status, 403);
  assert.equal((await h.plan({}, { csrf: false })).status, 403);
  assert.equal((await h.request('/api/jev/analysis/tasks', { session: 'detached' })).status, 403);
  assert.deepEqual([h.effects.reads, h.effects.writes, h.effects.model], [0, 0, 0]);
});

test('GETs determinísticos paginam com agregação integral, sem writes, e preservam workspace', async t => {
  const h = await harness(t);
  const original = structuredClone(h.states.get('office-a'));
  for (const kind of ['publications', 'tasks', 'productivity', 'risks']) {
    const path = `/api/jev/analysis/${kind}?limit=2&windowDays=30`;
    const first = await h.request(path);
    assert.equal(first.status, 200);
    assert.equal(first.body.sourceRevision, 'revision-a');
    assert.equal(first.body.evaluatedAt, AT);
    assert.equal(first.body.externalModelUsed, false);
    assert.equal(first.body.requiresHumanReview, true);
    assert.equal(first.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await h.request(path)).body, first.body);
  }
  const tasks = await h.request('/api/jev/analysis/tasks?limit=2');
  assert.equal(tasks.body.data.pendingCount, 8);
  assert.equal(tasks.body.data.details.length, 2);
  const second = await h.request(`/api/jev/analysis/tasks?limit=2&cursor=${tasks.body.pagination.nextCursor}`);
  assert.equal(second.body.pagination.offset, 2);
  assert.equal(second.body.data.details[0].taskId, 'task-test-2');
  const other = await h.request('/api/jev/analysis/tasks', { session: 'master' });
  assert.equal(other.body.sourceRevision, 'revision-b');
  assert.equal(other.body.data.pendingCount, 2);
  assert.deepEqual(h.states.get('office-a'), original);
  assert.deepEqual([h.effects.writes, h.effects.model], [0, 0]);
});

test('cursor signé lie révision, workspace, schéma, filtre et TTL; falsification refusée', async t => {
  const h = await harness(t);
  const page = (await h.request('/api/jev/analysis/tasks?limit=1')).body;
  const cursor = page.pagination.nextCursor;
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=2&cursor=${cursor}`)).status, 409);
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=1&cursor=${cursor}`, { session: 'master' })).status, 409);
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=1&cursor=${cursor}x`)).status, 400);
  assert.equal((await h.request('/api/jev/analysis/tasks?cursor=not-json')).status, 400);
  h.states.get('office-a').state.schemaVersion = 13;
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=1&cursor=${cursor}`)).status, 409);
  h.states.get('office-a').state.schemaVersion = 12;
  h.setClock('2026-10-08T12:00:05.000Z');
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=1&cursor=${cursor}`)).status, 409);
  h.states.get('office-a').revision = 'revision-new';
  assert.equal((await h.request(`/api/jev/analysis/tasks?limit=1&cursor=${cursor}`)).status, 409);
});

test('validação fail closed de filtros, corpos, métodos e autoridade clientstate', async t => {
  const h = await harness(t);
  for (const query of ['windowDays=0', 'windowDays=91', 'windowDays=1.5', 'limit=101', 'limit=0', 'timeZone=Europe/Paris', 'workspaceId=office-b', 'windowDays=1&windowDays=2', 'actor=master', `cursor=${'x'.repeat(501)}`, `x=${'x'.repeat(1001)}`]) assert.equal((await h.request(`/api/jev/analysis/tasks?${query}`)).status, 400, query);
  for (const body of [{ tasks: [] }, { expectedRevision: '' }, { expectedRevision: 12 }, { advisory: 'true' }, { workspaceId: 'office-b' }, { analysis: {} }, { evaluatedAt: AT }, { timeZone: null }, { expectedRevision: 'x'.repeat(129) }]) assert.equal((await h.plan(body)).status, 400, JSON.stringify(body));
  assert.equal((await h.request('/api/jev/action-plan?async=1', { method: 'POST', body: { expectedRevision: 'revision-a' } })).status, 400);
  assert.equal((await h.request('/api/jev/action-plan', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await h.request('/api/jev/action-plan', { method: 'POST', body: [] })).status, 400);
  assert.equal((await h.request('/api/jev/action-plan', { method: 'POST', raw: ' '.repeat(501) })).status, 413);
  assert.equal((await h.request('/api/jev/action-plan')).status, 405);
  assert.equal((await h.request('/api/jev/analysis/tasks', { method: 'POST', body: {} })).status, 405);
  assert.equal((await h.request('/api/jev/not-a-route')).status, 404);
  assert.deepEqual([h.effects.writes, h.effects.model], [0, 0]);
  assert.ok(h.effects.sizes.every(size => size === 500));
});

test('POST recalcule les quatre analyses, audite métadonnées seulement, aucune tâche ou acte', async t => {
  const h = await harness(t);
  const state = structuredClone(h.states.get('office-a').state);
  const result = await h.plan();
  assert.equal(result.status, 200);
  assert.equal(result.body.sourceRevision, 'revision-a');
  assert.equal(result.body.revision, 'revision-saved-2');
  assert.equal(result.body.refreshCanonicalState, true);
  assert.equal(result.body.sourceChangedDuringAnalysis, false);
  assert.equal(result.body.advisory.status, 'not_requested');
  assert.equal(result.body.engine, 'backend_local_deterministic');
  assert.deepEqual(result.body.data.automaticActions, []);
  assert.deepEqual(result.body.data.summary.tasks, 8);
  assert.equal(result.body.data.summary.publications, 1);
  assert.equal(result.body.data.summary.risks, 1);
  assert.ok(result.body.data.suggestions.some(row => row.kind === 'review_task'));
  assert.ok(result.body.data.suggestions.some(row => row.kind === 'review_publication'));
  assert.ok(result.body.data.suggestions.some(row => row.kind === 'review_fatal'));
  assert.ok(result.body.data.suggestions.every(row => row.deadline === null && row.fatalDeadline === false));
  const saved = h.states.get('office-a').state;
  assert.equal(saved.audit.length, 2);
  assert.equal(saved.audit[0].actor, 'admin-test');
  assert.equal(JSON.parse(saved.audit[0].detail).phase, 'completed');
  assert.ok(!JSON.stringify(saved.audit).includes('Advogada Teste'));
  for (const key of ['tasks', 'intimations', 'processes', 'configuration']) assert.deepEqual(saved[key], state[key]);
  assert.equal(h.effects.model, 0);
});

test('stale revision antes e dentro da fila não escreve nem permite egresso', async t => {
  const h = await harness(t);
  assert.equal((await h.plan({ expectedRevision: 'outdated', advisory: true })).status, 409);
  let reads = 0;
  h.onRead(() => { reads += 1; if (reads === 2) h.states.get('office-a').revision = 'changed-in-queue'; });
  assert.equal((await h.plan({ advisory: true })).status, 409);
  assert.deepEqual([h.effects.writes, h.effects.model], [0, 0]);
});

test('audit indisponível ou non confirmé bloque le modèle; échec final interdit faux succès', async t => {
  for (const failure of [true, 'unconfirmed', 2]) {
    const h = await harness(t);
    h.failAudit(failure);
    const result = await h.plan({ advisory: true });
    assert.equal(result.status, 503);
    assert.equal(h.effects.model, failure === 2 ? 1 : 0);
    assert.equal(h.states.get('office-a').state.audit.length, failure === 2 ? 1 : 0);
  }
});

test('manual native advisory utilise enum local sans noms, identifiants ou texte libre', async t => {
  const h = await harness(t);
  const result = await h.plan({ advisory: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.engine, 'backend_local_deterministic+jev_provider_api');
  assert.equal(result.body.mode, 'advisory');
  assert.equal(result.body.advisory.decision, 'tasks');
  assert.equal(result.body.advisory.confidence, null);
  assert.equal(h.effects.model, 1);
  assert.deepEqual(h.effects.payloads[0], { pendingPublications: null, openTasks: 8, overdueTasks: null, completedTasks: null, operationalRisks: null });
  assert.ok(!JSON.stringify(h.effects.payloads).match(/Advogada|task-test|process-test|publication-test|example|ignore/));
});

test('fallbacks honestos: indisponibilidade, abstention, invalid enum/confidence et erreurs', async t => {
  const cases = [
    [() => null, 'unavailable', false],
    [() => success('abstain'), 'abstained', true],
    [() => success('arbitrary-task'), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', confidence: 2 } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', confidence: NaN } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', confidence: '0.8' } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', probabilities: { tasks: 0.8 } } } }), 'completed', true],
    [() => ({ answers: { focus: { choice: 'tasks', probabilities: { injected: 0.8 } } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', probabilities: { tasks: -1 } } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks' } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', confidence: 0.8, instruction: 'create task' } } }), 'invalid_response', false],
    [() => ({ answers: { focus: { choice: 'tasks', confidence: 0.8 }, evil: {} } }), 'invalid_response', false],
    [() => { throw new Error('Não divulgar segredo sintético'); }, 'unavailable', false],
    [() => new Promise(() => {}), 'timeout', false]
  ];
  for (const [resolveDecision, status, used] of cases) {
    const h = await harness(t, { resolveDecision, serviceOptions: { timeoutMs: 10 } });
    const result = await h.plan({ advisory: true });
    assert.equal(result.status, 200);
    assert.equal(result.body.advisory.status, status);
    assert.equal(result.body.mode === 'advisory', used);
    assert.ok(!JSON.stringify(result.body).includes('segredo sintético'));
    assert.equal(JSON.parse(h.states.get('office-a').state.audit[0].detail).status, status);
  }
});

test('sigilo e ligações conservadoras excluem grafo ANTES de agregar; sem buckets pessoais', () => {
  const state = fixture(10);
  state.processes[0].secrecy = true;
  const blocked = minimizeAnalysisEgress(state, options);
  assert.equal(blocked.coverage.excludedCount, 12);
  assert.equal(blocked.aggregates.openTasks, null);
  delete state.processes[0].secrecy;
  state.tasks[0].restricted = true;
  assert.equal(minimizeAnalysisEgress(state, options).coverage.excludedCount, 12);
  delete state.tasks[0].restricted;
  state.tasks[0].processId = 'missing-test';
  const missing = minimizeAnalysisEgress(state, options);
  assert.equal(missing.coverage.excludedCount, 1);
  assert.equal(missing.aggregates.openTasks, 9);
  state.tasks[1].publicationId = 'publication-test';
  state.intimations[0].restricted = true;
  assert.equal(minimizeAnalysisEgress(state, options).aggregates.openTasks, null);
});

test('egresso exclui flag, alias ou CNJ ambíguo, objetos inválidos e referências duplicadas', () => {
  for (const [field, value] of [['secrecy', 'true'], ['secrecyLevel', 1], ['nivelSigilo', '1'], ['segredoJustica', true], ['isSecret', true], ['confidential', true], ['isSealed', true], ['tags', ['segredo-de-justica']]]) {
    const state = fixture();
    state.processes[0][field] = value;
    assert.equal(minimizeAnalysisEgress(state, options).coverage.excludedCount, 10, field);
  }
  const state = fixture();
  state.tasks.push({ ...state.tasks[0] });
  state.tasks.push(null);
  state.intimations.push({ ...state.intimations[0], id: 'alias-test', externalId: 'shared-test', mergedInto: 'publication-test' });
  state.intimations.push({ id: 'alias-2-test', externalId: 'shared-test', mergedInto: 'publication-test' });
  state.tasks[1].intimationId = 'shared-test';
  assert.equal(minimizeAnalysisEgress(state, options).aggregates.openTasks, null);
  const cnjState = fixture();
  cnjState.tasks.forEach(row => { delete row.processId; row.process = 'inválido sintético'; });
  assert.equal(minimizeAnalysisEgress(cnjState, options).aggregates.openTasks, null);
  cnjState.tasks.forEach(row => { delete row.process; });
  assert.equal(minimizeAnalysisEgress(cnjState, options).aggregates.openTasks, 8);
});

test('P1 alias absorvido sigiloso suprime a quinta tarefa antes do decider manual', async t => {
  const h = await harness(t);
  const state = fixture(5);
  state.intimations = [];
  state.processes = [];
  state.tasks.forEach(row => { delete row.processId; });
  const publicCounts = minimizeAnalysisEgress(state, options);
  assert.equal(publicCounts.aggregates.openTasks, 5);
  state.tasks.push({ id: 'sealed-alias-test', active: false, absorbedInto: 'task-test-0', sealed: true });
  h.states.get('office-a').state = state;
  const original = structuredClone(state);
  const result = await h.plan({ advisory: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.advisory.status, 'suppressed');
  assert.equal(h.effects.model, 0);
  assert.deepEqual(h.effects.payloads, []);
  const minimized = minimizeAnalysisEgress(state, options);
  assert.deepEqual(minimized.aggregates, { pendingPublications: null, openTasks: null, overdueTasks: null, completedTasks: null, operationalRisks: null });
  assert.equal(minimized.coverage.excludedCount, 2);
  assert.equal(minimized.coverage.includedCount, 4);
  assert.equal(result.body.advisory.coverage.excludedCount, 2);
  assert.deepEqual(state, original);
  assert.deepEqual(h.states.get('office-a').state.tasks, original.tasks);
});

test('P1 sigilo atravessa cadeias absorbedInto e mergedInto sem contar aliases como tarefas abertas', () => {
  const state = fixture(5);
  state.processes = [];
  state.intimations = [];
  state.tasks.forEach(row => { delete row.processId; });
  state.tasks.push({ id: 'middle-alias-test', active: false, absorbedInto: 'task-test-0' });
  state.tasks.push({ id: 'sealed-alias-test', active: false, absorbedInto: 'middle-alias-test', secrecy: true, publicationId: 'publication-alias-test' });
  state.intimations.push({ id: 'publication-alias-test', mergedInto: 'publication-keeper-test' });
  state.intimations.push({ id: 'publication-keeper-test', taskId: 'task-test-1', treatmentStatus: 'untreated', publishedAt: '2026-10-07' });
  for (const tasks of [state.tasks, [...state.tasks].reverse()]) {
    const minimized = minimizeAnalysisEgress({ ...state, tasks }, options);
    assert.equal(minimized.aggregates.openTasks, null);
    assert.equal(minimized.coverage.excludedCount, 6);
    assert.equal(minimized.coverage.includedCount, 3);
  }
  state.tasks.find(row => row.id === 'sealed-alias-test').secrecy = false;
  const publicCounts = minimizeAnalysisEgress(state, options);
  assert.equal(publicCounts.aggregates.openTasks, 5);
  assert.equal(publicCounts.coverage.excludedCount, 0);
});

test('P1 aresta absorbedInto conserva ciclos, destinos duplicados e órfãos fail closed', () => {
  for (const scenario of ['cycle', 'duplicate', 'missing']) {
    const state = fixture(5);
    state.processes = [];
    state.intimations = [];
    state.tasks.forEach(row => { delete row.processId; });
    state.tasks.push({ id: 'alias-test', active: false, absorbedInto: scenario === 'missing' ? 'missing-task-test' : 'task-test-0' });
    if (scenario === 'cycle') {
      state.tasks[0].absorbedInto = 'alias-test';
      state.tasks[0].sealed = true;
    }
    if (scenario === 'duplicate') state.tasks.push({ ...state.tasks[0] });
    const minimized = minimizeAnalysisEgress(state, options);
    assert.equal(minimized.coverage.excludedCount, scenario === 'cycle' ? 2 : scenario === 'duplicate' ? 3 : 1, scenario);
    assert.equal(minimized.coverage.includedCount, scenario === 'missing' ? 5 : 4, scenario);
    assert.equal(minimized.aggregates.openTasks, scenario === 'missing' ? 5 : null, scenario);
  }
});

test('small-n supprime toutes les cellules sous cinq sans appeler le modèle', async t => {
  const h = await harness(t);
  h.states.get('office-a').state = fixture(4);
  const result = await h.plan({ advisory: true });
  assert.equal(result.body.advisory.status, 'suppressed');
  assert.equal(result.body.advisory.coverage.minimumCellSize, 5);
  assert.equal(h.effects.model, 0);
  const state = fixture(5);
  state.tasks.forEach(row => { row.status = 'concluida'; row.completedAt = '2026-10-07T12:00:00Z'; row.completedBy = 'Advogada Teste'; });
  assert.equal(minimizeAnalysisEgress(state, options).aggregates.completedTasks, 5);
});

test('clock injetado reavalia prazo instantâneo e dia BRT; resposta bounded não copia cobertura gigante', async t => {
  const h = await harness(t);
  h.states.get('office-a').state.tasks[0].deadline = '2026-10-08T12:00:02Z';
  let result = await h.request('/api/jev/analysis/tasks');
  assert.equal(result.body.data.overdueCount, 0);
  h.setClock('2026-10-08T12:00:03Z');
  result = await h.request('/api/jev/analysis/tasks');
  assert.equal(result.body.data.overdueCount, 1);
  h.setClock('2026-10-09T03:00:00Z');
  result = await h.request('/api/jev/analysis/tasks');
  assert.equal(result.body.evaluatedAt, '2026-10-09T03:00:00.000Z');
  h.states.get('office-a').state = fixture(110);
  result = await h.request('/api/jev/analysis/tasks?limit=100');
  assert.equal(result.body.data.details.length, 100);
  assert.equal(result.body.pagination.total, 110);
  assert.ok(Buffer.byteLength(JSON.stringify(result.body)) < 262144);
});

test('manual in-flight dedup audita uma operação e limpa guardas após falha', async t => {
  let release;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const h = await harness(t, { resolveDecision: () => { entered(); return new Promise(resolve => { release = resolve; }); } });
  const first = h.plan({ advisory: true });
  await waiting;
  const envelope = { state: fixture(), revision: 'revision-a' };
  const duplicate = h.service.actionPlan({ workspaceId: 'office-a', envelope, advisory: true, actor: 'admin-test', audit: () => { throw new Error('should dedup'); } });
  release(success('tasks'));
  const [result, copy] = await Promise.all([first, duplicate]);
  assert.deepEqual(result.body, copy);
  assert.equal(h.effects.model, 1);
  assert.equal(h.effects.writes, 2);
  h.failAudit(true);
  assert.equal((await h.plan()).status, 503);
  h.failAudit(false);
  assert.equal((await h.plan()).status, 200);
});

test('model budget borné à trois par minute avec reset et workspace isolation', async t => {
  const h = await harness(t);
  for (let index = 0; index < 3; index += 1) assert.equal((await h.plan({ advisory: true })).body.advisory.status, 'completed');
  assert.equal((await h.plan({ advisory: true })).body.advisory.status, 'rate_limited');
  assert.equal(h.effects.model, 3);
  h.setClock('2026-10-08T12:01:00Z');
  assert.equal((await h.plan({ advisory: true })).body.advisory.status, 'completed');
  assert.equal(h.effects.model, 4);
});

test('native adapter réutilise payloadbuilder et transport exact, env mock seulement', async () => {
  let called = 0;
  const adapter = createNativeJevAnalysisAdapter({ env: { CMD_API_KEY: 'synthetic-test-only' }, fetchImpl: async (url, init) => {
    called += 1;
    assert.equal(url, 'https://api.commandcode.ai/provider/v1/systemone');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-test-only');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'typesafe/jev');
    assert.deepEqual(JSON.parse(body.state), { openTasks: 5 });
    assert.deepEqual(Object.keys(body.questions), ['focus']);
    assert.equal(body.questions.focus.type, 'choice');
    assert.ok(!JSON.stringify(body).includes('/chat'));
    return new Response(JSON.stringify(success('tasks')), { status: 200 });
  } });
  const signal = new AbortController().signal;
  assert.deepEqual(await adapter({ aggregates: { openTasks: 5 }, signal }), success('tasks'));
  assert.equal(called, 1);
  const absent = createNativeJevAnalysisAdapter({ env: {}, fetchImpl: () => { throw new Error('must not network'); } });
  assert.equal(await absent({ aggregates: {}, signal }), null);
});

test('native transport fail closed: oversized, missing body, HTTP denied et invalid JSON', async () => {
  const signal = new AbortController().signal;
  for (const response of [new Response('x'.repeat(16385)), new Response(null), new Response('{}', { status: 401 }), new Response('{')]) {
    const adapter = createNativeJevAnalysisAdapter({ env: { JEV_API_KEY: 'synthetic-test-only' }, fetchImpl: async () => response });
    await assert.rejects(adapter({ aggregates: { openTasks: 5 }, signal }));
  }
});

test('service guards état, workspace, clock, kind et cache mémoire borné', () => {
  assert.deepEqual(normalizeAnalysisFilters({ windowDays: '1', limit: '100', timeZone: 'UTC' }), { windowDays: 1, limit: 100, timeZone: 'UTC' });
  const service = createJevAnalysisService({ clock: () => new Date(AT), cacheLimit: 1, resolveDecision: () => null });
  const envelope = { state: fixture(), revision: 'revision-a' };
  assert.throws(() => service.analyze({ workspaceId: '', envelope, kind: 'tasks' }), { statusCode: 403 });
  assert.throws(() => service.analyze({ workspaceId: 'office-a', envelope: { state: null }, kind: 'tasks' }), { statusCode: 503 });
  assert.throws(() => service.analyze({ workspaceId: 'office-a', envelope, kind: 'unknown' }), { statusCode: 404 });
  const first = service.analyze({ workspaceId: 'office-a', envelope, kind: 'tasks' });
  first.data.details.length = 0;
  assert.equal(service.analyze({ workspaceId: 'office-a', envelope, kind: 'tasks' }).data.details.length, 8);
  service.analyze({ workspaceId: 'office-a', envelope, kind: 'risks' });
  assert.equal(service.analyze({ workspaceId: 'office-a', envelope, kind: 'tasks' }).data.details.length, 8);
  const broken = createJevAnalysisService({ clock: () => 'invalid', resolveDecision: () => null });
  assert.throws(() => broken.analyze({ workspaceId: 'office-a', envelope, kind: 'tasks' }), { code: 'CLOCK_UNAVAILABLE' });
});

test('cancelamento manual interrompe adapter e mantém auditoria terminal', async () => {
  const controller = new AbortController();
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  let modelSignal;
  const service = createJevAnalysisService({ clock: () => new Date(AT), resolveDecision: ({ signal }) => { modelSignal = signal; entered(); return new Promise(() => {}); } });
  const events = [];
  const resultPromise = service.actionPlan({ workspaceId: 'office-test', envelope: { state: fixture(), revision: 'revision-test' }, advisory: true, actor: 'admin-test', signal: controller.signal, audit: async event => { events.push(event); return { revision: 'saved-test', previousRevision: 'saved-test' }; } });
  await ready;
  controller.abort();
  const result = await resultPromise;
  assert.equal(result.advisory.status, 'cancelled');
  assert.equal(modelSignal.aborted, true);
  assert.equal(events[1].status, 'cancelled');
  const cancelled = new AbortController();
  cancelled.abort();
  const second = await service.actionPlan({ workspaceId: 'office-test', envelope: { state: fixture(), revision: 'revision-test-2' }, advisory: true, signal: cancelled.signal, audit: async () => ({ revision: 'saved-test' }) });
  assert.equal(second.advisory.status, 'cancelled');
});

test('routes nettoient listeners et annulent quand connexion ferme avant réponse', async () => {
  const { EventEmitter } = await import('node:events');
  for (const event of ['aborted', 'close']) {
    const req = new EventEmitter();
    req.method = 'POST';
    const res = new EventEmitter();
    res.setHeader = () => {};
    res.writableEnded = false;
    let sends = 0;
    let phases = 0;
    const handler = createJevAnalysisHttpHandler({
      assertAdmin: () => ({ workspaceId: 'office-test', userId: 'test-id' }),
      readJson: async () => ({ expectedRevision: 'revision-test' }),
      readAppStateEnvelope: async () => ({ state: fixture(), revision: 'revision-test' }),
      saveAppStateDirectUnlocked: async () => ({ revision: 'new-test' }),
      enqueueAppStateMutation: fn => fn(),
      clock: () => new Date(AT),
      json: () => { sends += 1; },
      service: { actionPlan: async ({ signal, audit }) => {
        await audit({ phase: 'requested', expectedRevision: 'revision-test' });
        await audit({ phase: 'completed', status: 'unexpected' });
        phases += 2;
        (event === 'aborted' ? req : res).emit(event);
        assert.equal(signal.aborted, true);
        return {};
      } }
    });
    assert.equal(await handler(req, res, new URL('http://localhost/api/jev/action-plan')), true);
    assert.equal(sends, 0);
    assert.equal(phases, 2);
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);
  }
});

test('audit final préserve changement canonique concurrent et le signale', async t => {
  let h;
  h = await harness(t, { resolveDecision: () => {
    const current = h.states.get('office-a');
    current.revision = 'concurrent-test';
    current.state.tasks[0].title = 'Modification synthétique concurrente';
    return success('tasks');
  } });
  const result = await h.plan({ advisory: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.sourceChangedDuringAnalysis, true);
  assert.equal(h.states.get('office-a').state.tasks[0].title, 'Modification synthétique concurrente');
  assert.equal(result.body.sourceRevision, 'revision-a');
});

test('limite in-flight refuse nouvel acteur sans fuite et ne partage pas workspace', async () => {
  let release;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const service = createJevAnalysisService({ clock: () => new Date(AT), inflightLimit: 1, resolveDecision: () => { entered(); return new Promise(resolve => { release = resolve; }); } });
  const envelope = { state: fixture(), revision: 'revision-test' };
  const audit = async () => ({ revision: 'saved-test' });
  const first = service.actionPlan({ workspaceId: 'office-a', envelope, advisory: true, actor: 'first-test', audit });
  await ready;
  await assert.rejects(service.actionPlan({ workspaceId: 'office-b', envelope, advisory: true, actor: 'second-test', audit }), { statusCode: 429 });
  release(success('tasks'));
  assert.equal((await first).advisory.status, 'completed');
});

test('server real em sandbox: sessão, CSRF, estado cifrado e auditoria revisionada', async t => {
  const { startTestServer, postJson } = await import('./helpers.mjs');
  const { generateTotp } = await import('../lib/security.mjs');
  const server = await startTestServer({ env: { JEV_API_KEY: '', CMD_API_KEY: '', BETA_JEV_ENABLED: 'false', BETA_JEV_LIVE: 'false', ATRIUM_BETA_MODE: 'false' } });
  t.after(() => server.stop());
  let response = await fetch(`${server.baseUrl}/api/jev/analysis/tasks`);
  assert.equal(response.status, 401);
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin.analysis', displayName: 'Admin Teste', email: 'teste@example.test', password: 'Synthetic-Analysis-2026!' });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  assert.equal(response.status, 200);
  const verified = await response.json();
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': verified.csrfToken };
  response = await postJson(`${server.baseUrl}/api/state`, { state: { version: 1, terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [], audit: [], settings: {} } }, headers);
  assert.equal(response.status, 200);
  const source = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  for (const kind of ['publications', 'tasks', 'productivity', 'risks']) {
    response = await fetch(`${server.baseUrl}/api/jev/analysis/${kind}`, { headers });
    assert.equal(response.status, 200);
    const analysis = await response.json();
    assert.equal(analysis.sourceRevision, source.revision);
    assert.equal(analysis.externalModelUsed, false);
  }
  const afterGet = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  assert.deepEqual(afterGet, source);
  response = await postJson(`${server.baseUrl}/api/jev/action-plan`, { expectedRevision: source.revision }, { Cookie: headers.Cookie });
  assert.equal(response.status, 403);
  response = await postJson(`${server.baseUrl}/api/jev/action-plan`, { expectedRevision: 'stale-synthetic' }, headers);
  assert.equal(response.status, 409);
  response = await postJson(`${server.baseUrl}/api/jev/action-plan`, { expectedRevision: source.revision, advisory: false }, headers);
  assert.equal(response.status, 200);
  const result = await response.json();
  const after = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
  assert.equal(result.revision, after.revision);
  assert.notEqual(after.revision, source.revision);
  assert.equal(after.state.audit.filter(row => row.action.startsWith('Análise operacional')).length, 2);
  for (const key of ['tasks', 'intimations', 'processes']) assert.deepEqual(after.state[key], source.state[key]);
});

test('bootstrap mantém dependências oficiais e registro privado antes do classificador', async () => {
  const source = serverSourceText;
  assert.match(source, /createJevAnalysisHttpHandler\(\{\s*service: createJevAnalysisService/);
  assert.match(source, /assertAdmin, readJson, json, readAppStateEnvelope, saveAppStateDirectUnlocked, enqueueAppStateMutation/);
  assert.ok(source.indexOf('if (await handleJevAnalysisRequest') < source.indexOf('if (await handleAiClassifierRequest'));
});
