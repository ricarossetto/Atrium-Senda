import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM - DESFAZER COM ABSORVIDA PULADA E SALVAMENTO NEUTRO ');
console.log('===============================================================\n');

const server = await startTestServer();

try {
  const master = await setupMaster(server.baseUrl);
  const collaborator = await setupCollaborator(server.baseUrl, master);

  let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const initial = await response.json();
  const base = initial.state || {};
  base.tasks = [];
  base.audit = [];
  base.processes = [{
    id: 'proc-undo',
    number: '5000000-00.2026.8.21.0000',
    client: 'Cliente Teste',
    opposingParty: 'Parte Teste',
    responsibleUserIds: [collaborator.id]
  }];
  base.intimations = [{
    id: 'pub-undo',
    title: 'Publicação com tarefa de prazo da fonte',
    process: '5000000-00.2026.8.21.0000',
    text: 'RECURSO DESPROVIDO. Nada mais.',
    treatmentStatus: 'untreated',
    unread: false,
    externalId: 'eproc:pub-undo'
  }];
  response = await postJson(`${server.baseUrl}/api/state`, { state: base, revision: initial.revision }, master.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  // A tarefa genérica de prazo é privada do colaborador: ele mesmo a grava e a absorve
  // na criação da sugestão; o administrador, ao desfazer, não enxerga essa tarefa.
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaborator.cookie } });
  const withGeneric = await response.json();
  const stateWithGeneric = withGeneric.state || {};
  if (!Array.isArray(stateWithGeneric.tasks)) stateWithGeneric.tasks = [];
  stateWithGeneric.tasks.push({
    id: 'task-generica',
    title: 'Prazo eproc — Evento 10',
    description: 'Registro coletado no Painel do Advogado.',
    process: '5000000-00.2026.8.21.0000',
    intimationId: 'pub-undo',
    sourceIntimationId: 'pub-undo',
    source: 'eproc',
    deadlineSource: 'eproc',
    sourceReportedDeadlineAt: '2026-11-10',
    deadline: '2026-11-10',
    status: 'triagem',
    priority: 'normal',
    active: true,
    scope: 'private',
    privateOwnerUserId: collaborator.id,
    sourceManagedSnapshot: {
      title: 'Prazo eproc — Evento 10',
      description: 'Registro coletado no Painel do Advogado.',
      status: 'triagem',
      deadline: '2026-11-10'
    }
  });
  response = await postJson(`${server.baseUrl}/api/state`, { state: stateWithGeneric, revision: withGeneric.revision }, collaborator.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;

  const aiTask = {
    title: 'Recurso: 5000000-00.2026.8.21.0000',
    description: 'Resumo: RECURSO DESPROVIDO. O que fazer: Analisar para recorrer.',
    process: '5000000-00.2026.8.21.0000',
    source: 'DJEN',
    intimationId: 'pub-undo',
    priority: 'normal',
    status: 'triagem',
    aiSuggestion: {
      id: 'sug-undo',
      action: 'Analisar para recorrer.',
      reason: 'suggest',
      confidence: 0.9,
      at: new Date().toISOString(),
      piece: 'Recurso'
    }
  };
  response = await postJson(`${server.baseUrl}/api/publications/pub-undo/task`, {
    publicationId: 'pub-undo',
    revision,
    task: aiTask
  }, collaborator.headers);
  assert.equal(response.status, 201, 'O colaborador cria a sugestão e absorve a genérica privada dele.');
  const created = await response.json();
  const taskId = created.task.id;
  revision = created.revision;

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaborator.cookie } });
  const afterCreate = await response.json();
  const absorbed = afterCreate.state.tasks.find(task => task.id === 'task-generica');
  assert.equal(absorbed?.absorbedInto, taskId, 'A tarefa genérica deve ter sido absorvida.');

  // A12: salvamento do modal sem mudança adiciona a entrada automática "Tarefa atualizada".
  const mutated = afterCreate.state;
  const aiRef = mutated.tasks.find(task => task.id === taskId);
  aiRef.history = [...(Array.isArray(aiRef.history) ? aiRef.history : []), {
    at: new Date().toISOString(),
    action: 'Tarefa atualizada',
    actor: 'Pessoa Colaboradora Teste'
  }];
  response = await postJson(`${server.baseUrl}/api/state`, { state: mutated, revision }, collaborator.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;

  // O administrador desfaz: a absorvida é privada de outro usuário e deve ser pulada (A14).
  response = await postJson(`${server.baseUrl}/api/publications/pub-undo/task/undo`, {
    taskId,
    revision
  }, master.headers);
  assert.equal(response.status, 200, 'O salvamento neutro não pode impedir o desfazer (A12).');
  const undone = await response.json();
  assert.deepEqual(undone.skippedAbsorbedTaskIds, ['task-generica'], 'A absorvida inacessível deve ser declarada como pulada (A14).');
  assert.deepEqual(undone.restoredTaskIds, [], 'A absorvida inacessível não entra na lista de restauradas.');
  assert.equal(undone.removedTaskId, taskId);

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaborator.cookie } });
  const afterUndo = await response.json();
  const reactivated = afterUndo.state.tasks.find(task => task.id === 'task-generica');
  assert.equal(reactivated?.active, true, 'A absorvida pulada volta a ficar ativa.');
  assert.equal(reactivated?.absorbedInto, undefined, 'O vínculo órfão é removido.');
  const publication = afterUndo.state.intimations.find(item => item.id === 'pub-undo');
  assert.equal(publication.linkedTaskIds.includes('task-generica'), false, 'A pulada não é reacoplada à publicação.');
  assert.equal(afterUndo.state.tasks.some(task => task.id === taskId), false, 'A tarefa da sugestão sai do acervo.');

  console.log('V Salvamento neutro não bloqueia o desfazer; absorvida inacessível é pulada, reativada e declarada.');
  console.log('\n>>> DESFAZER COM ABSORVIDA PULADA: PASS <<<\n');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  const password = 'Master-Undo-Absorbed-2026!';
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.undo.absorbed',
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
  const usersResponse = await fetch(`${baseUrl}/api/auth/users`, { headers: { Cookie: cookie } });
  const users = await usersResponse.json();
  const me = (users.users || []).find(user => user.username === 'master.undo.absorbed');
  return {
    id: me?.id,
    cookie,
    password,
    manualSecret: setup.manualSecret,
    headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken }
  };
}

async function setupCollaborator(baseUrl, master) {
  const username = 'colaborador.undo.absorbed';
  const password = 'Colaborador-Undo-Absorbed-2026!';
  let response = await postJson(`${baseUrl}/api/auth/register`, {
    username,
    displayName: 'Pessoa Colaboradora Teste',
    email: 'colaborador.undo.absorbed@example.test',
    password
  }, master.headers);
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
  response = await postJson(`${baseUrl}/api/auth/users/manage`, {
    userId: user.id,
    status: 'active',
    password: master.password,
    code: generateTotp(master.manualSecret)
  }, master.headers);
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/login`, {
    username,
    password,
    code: generateTotp(registration.manualSecret)
  });
  const login = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    id: user.id,
    username,
    cookie,
    headers: { Cookie: cookie, 'X-CSRF-Token': login.csrfToken }
  };
}
