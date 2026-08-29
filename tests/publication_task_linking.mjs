import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();

try {
  const master = await setupMaster(server.baseUrl);
  const collaborator = await setupCollaborator(server.baseUrl, master);
  let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const initial = await response.json();
  const state = initial.state || {};
  const reviewStartedAt = '2026-08-20T12:00:00.000Z';
  const treatedAt = '2026-08-21T14:00:00.000Z';
  state.tasks = [];
  state.audit = [];
  state.agenda = [{ id: 'agenda-sentinel', title: 'Evento sintético preservado' }];
  state.intimations = [
    {
      id: 'pub-untreated', title: 'Publicação sem prazo confirmado', process: '5000000-00.2026.8.21.0001',
      text: 'Apresente recurso em 15 dias e envie e-mail ao tribunal.', treatmentStatus: 'untreated', unread: false
    },
    {
      id: 'pub-in-review', title: 'Publicação já em análise', process: '5000000-00.2026.8.21.0002',
      text: 'Texto sintético.', treatmentStatus: 'in_review', treatmentStartedAt: reviewStartedAt,
      treatmentStartedBy: 'Analista Original', unread: false
    },
    {
      id: 'pub-treated', title: 'Publicação tratada', process: '5000000-00.2026.8.21.0003',
      text: 'Texto sintético.', treatmentStatus: 'treated', treatedAt, treatedBy: 'Analista Original', unread: false
    },
    {
      id: 'pub-discarded', title: 'Publicação descartada', process: '5000000-00.2026.8.21.0004',
      text: 'Texto sintético.', treatmentStatus: 'discarded', discardedAt: '2026-08-22T10:00:00.000Z',
      discardedBy: 'Analista Original', unread: false
    }
  ];

  response = await postJson(`${server.baseUrl}/api/state`, { state }, master.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  const untreatedTask = explicitTask('task-from-untreated', {
    title: 'Conferir publicação sem inferência',
    description: 'Providência definida expressamente pela usuária.',
    process: '5000000-00.2026.8.21.0001',
    client: 'Cliente Teste',
    timeLogs: [{ id: 'time-explicit', date: '2026-08-29', minutes: 25, description: 'Leitura inicial', actor: 'Actor enviado pelo cliente' }],
    email: 'nao-deve-ser-copiado@example.test',
    treatmentStatus: 'treated',
    treatmentStartedBy: 'Actor fraudulento'
  });

  response = await postTask(server.baseUrl, 'pub-untreated', untreatedTask, revision);
  assert.equal(response.status, 401, 'Endpoint deve exigir autenticação.');
  response = await postTask(server.baseUrl, 'pub-untreated', untreatedTask, revision, { Cookie: collaborator.cookie });
  assert.equal(response.status, 403, 'Endpoint deve exigir CSRF.');

  response = await postTask(server.baseUrl, 'pub-untreated', untreatedTask, revision, collaborator.headers);
  assert.equal(response.status, 201, 'Colaborador ativo deve poder criar tarefa jurídica ordinária.');
  const untreatedResult = await response.json();
  assert.equal(untreatedResult.task.intimationId, 'pub-untreated');
  assert.equal(untreatedResult.task.sourceIntimationId, 'pub-untreated');
  assert.equal(untreatedResult.task.deadline, '', 'Texto da publicação não pode gerar deadline.');
  assert.equal(untreatedResult.task.fatalDeadline, '', 'Texto da publicação não pode gerar prazo fatal.');
  assert.equal(untreatedResult.task.actionType, '', 'Endpoint não pode inferir ato judicial.');
  assert.equal(untreatedResult.task.protocol, '', 'Endpoint não pode criar protocolo remoto.');
  assert.equal(Object.hasOwn(untreatedResult.task, 'email'), false, 'Campo de e-mail fora do contrato não pode ser copiado.');
  assert.equal(untreatedResult.task.timeLogs[0].actor, 'Pessoa Colaboradora Teste', 'Actor de apontamento deve vir da sessão.');
  assert.equal(untreatedResult.publication.treatmentStatus, 'in_review');
  assert.equal(untreatedResult.publication.treatmentStartedBy, 'Pessoa Colaboradora Teste', 'Actor da transição deve vir da sessão.');
  assert.ok(Date.parse(untreatedResult.publication.treatmentStartedAt));
  assert.deepEqual(untreatedResult.publication.linkedTaskIds, ['task-from-untreated']);
  assert.equal(untreatedResult.publication.taskId, 'task-from-untreated');
  revision = untreatedResult.revision;

  response = await postTask(server.baseUrl, 'pub-untreated', untreatedTask, revision, collaborator.headers);
  assert.equal(response.status, 200, 'Segundo submit do mesmo ID deve ser idempotente.');
  const idempotent = await response.json();
  assert.equal(idempotent.idempotent, true);
  assert.equal(idempotent.revision, revision, 'Submit idempotente não deve criar nova revision.');

  let canonical = await readState(server.baseUrl, master.cookie);
  assert.equal(canonical.state.tasks.filter(task => task.id === 'task-from-untreated').length, 1, 'Submit repetido não pode duplicar tarefa.');
  assert.equal(canonical.state.audit.filter(entry => entry.action === 'Tarefa criada a partir de publicação').length, 1, 'Submit repetido não pode duplicar auditoria.');
  assert.equal(canonical.state.audit[0].actor, 'Pessoa Colaboradora Teste');
  assert.equal(canonical.state.agenda[0].id, 'agenda-sentinel', 'Operação não pode criar ou alterar ato de agenda.');
  assert.equal(Object.hasOwn(canonical.state.intimations.find(item => item.id === 'pub-untreated'), 'scienceAt'), false, 'Operação não pode registrar ciência judicial.');

  const reviewTask = explicitTask('task-from-review', {
    title: 'Providência com datas manuais',
    deadline: '2026-09-10',
    fatalDeadline: '2026-09-12',
    actionType: 'Manifestação interna',
    protocol: 'Controle interno 123'
  });
  response = await postTask(server.baseUrl, 'pub-in-review', reviewTask, revision, collaborator.headers);
  assert.equal(response.status, 201);
  const reviewResult = await response.json();
  assert.equal(reviewResult.publication.treatmentStatus, 'in_review');
  assert.equal(reviewResult.publication.treatmentStartedAt, reviewStartedAt, 'Criação em in_review deve preservar início existente.');
  assert.equal(reviewResult.publication.treatmentStartedBy, 'Analista Original');
  assert.equal(reviewResult.task.deadline, '2026-09-10', 'Deadline manual deve ser preservado.');
  assert.equal(reviewResult.task.fatalDeadline, '2026-09-12', 'Prazo fatal manual deve ser preservado.');
  assert.equal(reviewResult.task.actionType, 'Manifestação interna');
  assert.equal(reviewResult.task.protocol, 'Controle interno 123');
  revision = reviewResult.revision;

  const treatedTask = explicitTask('task-from-treated', { title: 'Providência posterior ao tratamento' });
  response = await postTask(server.baseUrl, 'pub-treated', treatedTask, revision, collaborator.headers);
  assert.equal(response.status, 201);
  const treatedResult = await response.json();
  assert.equal(treatedResult.publication.treatmentStatus, 'treated', 'Publicação tratada não pode ser reaberta automaticamente.');
  assert.equal(treatedResult.publication.treatedAt, treatedAt);
  assert.equal(treatedResult.publication.treatedBy, 'Analista Original');
  assert.equal(Object.hasOwn(treatedResult.publication, 'treatmentStartedAt'), false, 'Criação em tratada não deve iniciar nova análise.');
  revision = treatedResult.revision;

  canonical = await readState(server.baseUrl, master.cookie);
  const tasksBeforeRejectedOperations = canonical.state.tasks.length;
  const discardedTask = explicitTask('task-from-discarded', { title: 'Não deve ser criada' });
  response = await postTask(server.baseUrl, 'pub-discarded', discardedTask, revision, collaborator.headers);
  assert.equal(response.status, 409, 'Publicação descartada deve rejeitar criação de tarefa.');
  canonical = await readState(server.baseUrl, master.cookie);
  assert.equal(canonical.state.tasks.length, tasksBeforeRejectedOperations, 'Rejeição de descartada deve deixar zero estado parcial.');
  assert.equal(canonical.state.tasks.some(task => task.id === 'task-from-discarded'), false);
  assert.equal(canonical.state.intimations.find(item => item.id === 'pub-discarded').taskId, undefined);

  const staleTask = explicitTask('task-from-stale-revision', { title: 'Não deve sobreviver ao conflito' });
  response = await postTask(server.baseUrl, 'pub-in-review', staleTask, 'revision-obsoleta', collaborator.headers);
  assert.equal(response.status, 409, 'Revision divergente deve retornar 409.');
  canonical = await readState(server.baseUrl, master.cookie);
  assert.equal(canonical.state.tasks.some(task => task.id === 'task-from-stale-revision'), false, '409 deve deixar zero tarefa parcial.');
  assert.equal(canonical.state.intimations.find(item => item.id === 'pub-in-review').linkedTaskIds.includes('task-from-stale-revision'), false, '409 deve deixar zero vínculo parcial.');

  console.log('Publication task linking aprovado: atomicidade, revision, estados, idempotência, actor e ausência de efeitos judiciais automáticos.');
} finally {
  await server.stop();
}

function explicitTask(id, overrides = {}) {
  return {
    id,
    source: 'DJEN',
    title: 'Tarefa sintética',
    taskDefinition: '',
    description: '',
    process: '',
    client: '',
    fatalDeadline: '',
    deadline: '',
    date: '',
    time: '',
    responsible: 'Advogada Responsável Teste',
    responsibles: ['Advogada Responsável Teste'],
    status: 'triagem',
    priority: 'normal',
    points: 10,
    timeLogs: [],
    actionType: '',
    protocol: '',
    ...overrides
  };
}

function postTask(baseUrl, publicationId, task, revision, headers = {}) {
  return postJson(`${baseUrl}/api/publications/${encodeURIComponent(publicationId)}/task`, {
    publicationId,
    revision,
    task
  }, headers);
}

async function readState(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return response.json();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.publication.task',
    displayName: 'Administradora Principal Teste',
    password: 'Master-Publication-Task-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken } };
}

async function setupCollaborator(baseUrl, master) {
  const username = 'colaborador.publication.task';
  const password = 'Colaborador-Publication-Task-2026!';
  let response = await postJson(`${baseUrl}/api/auth/register`, {
    username,
    displayName: 'Pessoa Colaboradora Teste',
    email: 'colaborador.publication.task@example.test',
    password
  });
  const registration = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/register/verify`, {
    setupToken: registration.setupToken,
    code: generateTotp(registration.manualSecret)
  });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/auth/users`, { headers: { Cookie: master.cookie } });
  const users = await response.json();
  const user = users.users.find(item => item.username === username);
  assert.ok(user);
  response = await postJson(`${baseUrl}/api/auth/users/manage`, { userId: user.id, status: 'active' }, master.headers);
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/login`, {
    username,
    password,
    code: generateTotp(registration.manualSecret)
  });
  const login = await response.json();
  assert.equal(response.status, 200);
  assert.equal(login.user.role, 'collaborator');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, headers: { Cookie: cookie, 'X-CSRF-Token': login.csrfToken } };
}
