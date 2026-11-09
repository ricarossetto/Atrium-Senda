import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { canAccessPublication } from '../lib/office/access-control.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM - TAREFA DA SUGESTÃO E DESFAZER                     ');
console.log('===============================================================\n');

const server = await startTestServer();

try {
  const master = await setupMaster(server.baseUrl);
  const adminUser = { id: 'u-admin', username: 'u-admin', role: 'admin', permissions: ['*'] };
  assert.equal(canAccessPublication(adminUser, { id: 'pub-private', scope: 'private', privateOwnerUserId: 'outro' }, new Map(), []), false, 'Publicação privada de outro dono não é acessível.');
  let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const initial = await response.json();
  const state = initial.state || {};
  state.tasks = [];
  state.audit = [];
  state.processes = [];
  state.intimations = [{
    id: 'pub-ai-task',
    title: 'Intimação sintética com decisão',
    process: '5000000-00.2026.8.21.0001',
    text: 'RECURSO DESPROVIDO. Nada mais a decidir.',
    treatmentStatus: 'untreated',
    unread: true,
    sourceReportedDeadlineAt: '2026-11-10',
    sourceReportedDeadlineSource: 'eproc'
  }];
  response = await postJson(`${server.baseUrl}/api/state`, { state, revision: initial.revision }, master.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  const aiTask = {
    title: 'Recurso: 5000000-00.2026.8.21.0001',
    description: 'Resumo: RECURSO DESPROVIDO.\nO que fazer: Analisar para recorrer.',
    process: '5000000-00.2026.8.21.0001',
    client: '',
    source: 'DJEN',
    intimationId: 'pub-ai-task',
    deadline: '2026-11-10',
    sourceReportedDeadlineAt: '2026-11-10',
    sourceReportedDeadlineSource: 'eproc',
    priority: 'urgente',
    status: 'triagem',
    aiSuggestion: {
      id: 'sug-1',
      action: 'Analisar para recorrer.',
      reason: 'suggest',
      confidence: 0.9,
      at: '2026-10-30T23:00:00.000Z',
      piece: 'Recurso'
    }
  };

  response = await postJson(`${server.baseUrl}/api/publications/pub-ai-task/task`, {
    publicationId: 'pub-ai-task',
    revision,
    task: aiTask
  }, master.headers);
  assert.equal(response.status, 201, 'Tarefa da sugestão deve ser criada.');
  const created = await response.json();
  const taskId = created.task.id;
  assert.ok(taskId);
  assert.equal(created.task.aiSuggestion.piece, 'Recurso');
  assert.equal(created.task.aiSuggestion.action, 'Analisar para recorrer.');
  assert.equal(created.task.deadline, '2026-11-10');
  assert.equal(created.task.priority, 'urgente');
  assert.equal(created.publication.treatmentStatus, 'in_review');
  assert.equal(created.publication.taskId, taskId);
  revision = created.revision;

  response = await postJson(`${server.baseUrl}/api/publications/pub-ai-task/task`, {
    publicationId: 'pub-ai-task',
    revision,
    task: aiTask
  }, master.headers);
  assert.equal(response.status, 200, 'Segundo clique deve ser idempotente.');
  const repeated = await response.json();
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.task.id, taskId);
  revision = repeated.revision;

  const undoUrl = `${server.baseUrl}/api/publications/pub-ai-task/task/undo`;
  const withoutAuth = await postJson(undoUrl, { taskId, revision });
  assert.equal(withoutAuth.status, 401, 'Desfazer exige sessão.');
  const withoutCsrf = await postJson(undoUrl, { taskId, revision }, { Cookie: master.cookie });
  assert.equal(withoutCsrf.status, 403, 'Desfazer exige CSRF.');
  const wrongRevision = await postJson(undoUrl, { taskId, revision: 'revisao-errada' }, master.headers);
  assert.equal(wrongRevision.status, 409, 'Revisão velha deve falhar fechado.');

  response = await postJson(undoUrl, { taskId, revision }, master.headers);
  assert.equal(response.status, 200, 'Desfazer deve funcionar.');
  const undone = await response.json();
  assert.equal(undone.removedTaskId, taskId);
  assert.equal(undone.publication.treatmentStatus, 'untreated');
  assert.equal(undone.publication.taskId, '');
  assert.deepEqual(undone.publication.linkedTaskIds, []);
  revision = undone.revision;

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const afterUndo = await response.json();
  assert.equal((afterUndo.state.tasks || []).some(task => task.id === taskId), false, 'A tarefa deve sair do acervo.');
  assert.equal((afterUndo.state.intimations || []).find(item => item.id === 'pub-ai-task').treatmentStatus, 'untreated');

  const ordinaryTask = { ...aiTask, title: 'Tarefa comum', priority: 'normal' };
  delete ordinaryTask.aiSuggestion;
  response = await postJson(`${server.baseUrl}/api/publications/pub-ai-task/task`, {
    publicationId: 'pub-ai-task',
    revision,
    task: ordinaryTask
  }, master.headers);
  assert.equal(response.status, 201);
  const ordinary = await response.json();
  response = await postJson(undoUrl, { taskId: ordinary.task.id, revision: ordinary.revision }, master.headers);
  assert.equal(response.status, 409, 'Desfazer só vale para tarefa criada pela sugestão.');
  revision = ordinary.revision;

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const beforeEdit = await response.json();
  const editedState = beforeEdit.state;
  const ordinaryRecord = editedState.tasks.find(task => task.id === ordinary.task.id);
  ordinaryRecord.notes = 'Editada por pessoa';
  response = await postJson(`${server.baseUrl}/api/state`, { state: editedState, revision }, master.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;

  response = await postJson(`${server.baseUrl}/api/publications/pub-ai-task/task`, {
    publicationId: 'pub-ai-task',
    revision,
    task: aiTask
  }, master.headers);
  assert.equal(response.status, 201);
  const secondAi = await response.json();
  revision = secondAi.revision;
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const editState = (await response.json()).state;
  const aiRecord = editState.tasks.find(task => task.id === secondAi.task.id);
  aiRecord.fatalDeadline = '2026-12-01';
  aiRecord.description = 'Descrição editada depois de criar';
  response = await postJson(`${server.baseUrl}/api/state`, { state: editState, revision }, master.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;
  response = await postJson(undoUrl, { taskId: secondAi.task.id, revision }, master.headers);
  assert.equal(response.status, 409, 'Tarefa com prazo fatal ou descrição editada não pode ser apagada pelo desfazer.');

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const domicilioState = (await response.json()).state;
  domicilioState.intimations.push({
    id: 'pub-domicilio',
    title: 'Intimação do Domicílio',
    process: '5000000-00.2026.8.21.0002',
    text: 'RECURSO DESPROVIDO. Nada mais.',
    treatmentStatus: 'untreated',
    sourceReportedDeadlineAt: '2026-11-10',
    sourceReportedDeadlineSource: 'domicilio'
  });
  domicilioState.intimations.push({
    id: 'pub-domicilio-diferente',
    title: 'Intimação do Domicílio com data divergente',
    process: '5000000-00.2026.8.21.0003',
    text: 'RECURSO DESPROVIDO. Nada mais.',
    treatmentStatus: 'untreated',
    sourceReportedDeadlineAt: '2026-11-10',
    sourceReportedDeadlineSource: 'domicilio'
  });
  response = await postJson(`${server.baseUrl}/api/state`, { state: domicilioState, revision }, master.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;
  response = await postJson(`${server.baseUrl}/api/publications/pub-domicilio/task`, {
    publicationId: 'pub-domicilio',
    revision,
    task: {
      ...aiTask,
      intimationId: 'pub-domicilio',
      process: '5000000-00.2026.8.21.0002',
      deadline: '2026-11-10',
      sourceReportedDeadlineAt: '2026-11-10',
      sourceReportedDeadlineSource: 'domicilio'
    }
  }, master.headers);
  assert.equal(response.status, 201);
  const domicilioTask = await response.json();
  assert.equal(domicilioTask.task.deadline, '', 'Data de referência do Domicílio não vira prazo da tarefa.');
  assert.equal(domicilioTask.task.deadlineSource, '');
  assert.equal(domicilioTask.task.sourceReportedDeadlineAt, '2026-11-10', 'A data de referência deve continuar registrada como referência.');
  response = await postJson(`${server.baseUrl}/api/publications/pub-domicilio-diferente/task`, {
    publicationId: 'pub-domicilio-diferente',
    revision: domicilioTask.revision,
    task: {
      ...aiTask,
      intimationId: 'pub-domicilio-diferente',
      process: '5000000-00.2026.8.21.0003',
      deadline: '2026-11-05',
      sourceReportedDeadlineAt: '2026-11-10',
      sourceReportedDeadlineSource: 'domicilio',
      aiSuggestion: { ...aiTask.aiSuggestion, id: 'sug-dom-2' }
    }
  }, master.headers);
  assert.equal(response.status, 201);
  const domicilioDivergente = await response.json();
  assert.equal(domicilioDivergente.task.deadline, '', 'Data de Domicílio divergente enviada pelo cliente não pode virar prazo.');

  console.log('V Criação com sugestão, tratamento, desfazer, revisão, autoria, Domicílio e recusa de tarefa editada.');
  console.log('\n>>> TAREFA DA SUGESTÃO E DESFAZER: PASS <<<\n');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  const password = 'Master-Publication-Brief-2026!';
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.publication.brief',
    displayName: 'Administradora Principal Teste',
    password
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
  return {
    cookie,
    headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken },
    password,
    manualSecret: setup.manualSecret
  };
}
