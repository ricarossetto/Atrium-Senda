import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM - TAREFA EM PUBLICAÇÃO PRIVADA                      ');
console.log('===============================================================\n');

const server = await startTestServer();

try {
  const master = await setupMaster(server.baseUrl);
  const collaborator = await setupCollaborator(server.baseUrl, master);

  let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: master.cookie } });
  const masterEnvelope = await response.json();
  const masterState = masterEnvelope.state || {};
  masterState.processes = [{
    id: 'proc-office-ai',
    number: '5000000-00.2026.8.21.0006',
    client: 'Cliente Teste',
    opposingParty: 'Parte Teste',
    responsibleUserIds: [master.id, collaborator.id]
  }];
  masterState.audit = masterState.audit || [];
  masterState.intimations = [{
    id: 'pub-private',
    title: 'Publicação privada sintética',
    process: '5000000-00.2026.8.21.0003',
    text: 'RECURSO DESPROVIDO. Nada mais.',
    treatmentStatus: 'untreated',
    scope: 'private',
    privateOwnerUserId: master.id
  }, {
    id: 'pub-restricted',
    title: 'Publicação restrita sintética',
    process: '',
    text: 'RECURSO DESPROVIDO. Segredo de justiça sintético.',
    treatmentStatus: 'untreated',
    domicilioMeta: { segredoJustica: true }
  }, {
    id: 'pub-office-ai',
    title: 'Publicação comum com sugestão',
    process: '5000000-00.2026.8.21.0006',
    text: 'RECURSO DESPROVIDO. Nada mais.',
    treatmentStatus: 'untreated'
  }];
  masterState.tasks = [];
  response = await postJson(`${server.baseUrl}/api/state`, {
    state: masterState,
    revision: masterEnvelope.revision
  }, master.headers);
  assert.equal(response.status, 200, 'O dono deve conseguir salvar a própria publicação privada.');
  let masterRevision = (await response.json()).revision;

  const ordinaryTask = {
    title: 'Conferir publicação',
    process: '5000000-00.2026.8.21.0003',
    description: 'Tarefa sintética.',
    status: 'triagem',
    priority: 'normal'
  };
  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task`, {
    publicationId: 'pub-private',
    revision: masterRevision,
    task: ordinaryTask
  }, collaborator.headers);
  assert.equal(response.status, 404, 'Publicação privada de outro dono não pode originar tarefa para terceiro.');

  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task`, {
    publicationId: 'pub-private',
    revision: masterRevision,
    task: {
      ...ordinaryTask,
      aiSuggestion: { id: 'sug-privada', action: 'Conferir', reason: 'suggest', confidence: 0.9, at: new Date().toISOString(), piece: 'Recurso' }
    }
  }, collaborator.headers);
  assert.equal(response.status, 404, 'O campo aiSuggestion não pode contornar a autorização.');

  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task`, {
    publicationId: 'pub-private',
    revision: masterRevision,
    task: ordinaryTask
  }, master.headers);
  assert.equal(response.status, 201, 'O dono pode criar tarefa na própria publicação privada.');
  const privateTask = await response.json();
  assert.equal(privateTask.task.scope, 'private');
  assert.equal(privateTask.task.privateOwnerUserId, master.id);
  assert.equal(privateTask.publication.text, 'RECURSO DESPROVIDO. Nada mais.');
  masterRevision = privateTask.revision;

  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task`, {
    publicationId: 'pub-private',
    revision: masterRevision,
    task: {
      ...ordinaryTask,
      title: 'Recurso: 5000000-00.2026.8.21.0003',
      aiSuggestion: { id: 'sug-privada-2', action: 'Analisar para recorrer', reason: 'suggest', confidence: 0.9, at: new Date().toISOString(), piece: 'Recurso' }
    }
  }, master.headers);
  assert.equal(response.status, 201);
  const privateAiTask = await response.json();
  assert.equal(privateAiTask.task.scope, 'private');

  const restrictedTask = {
    ...ordinaryTask,
    process: '',
    title: 'Recurso: publicação restrita',
    aiSuggestion: { id: 'sug-restrita', action: 'Analisar para recorrer', reason: 'suggest', confidence: 0.9, at: new Date().toISOString(), piece: 'Recurso' }
  };
  response = await postJson(`${server.baseUrl}/api/publications/pub-restricted/task`, {
    publicationId: 'pub-restricted',
    revision: privateAiTask.revision,
    task: restrictedTask
  }, master.headers);
  assert.equal(response.status, 201, 'Publicação restrita acessível ao administrador pode originar tarefa.');
  const restrictedAiTask = await response.json();
  assert.equal(restrictedAiTask.task.scope, 'private');
  assert.equal(restrictedAiTask.task.restricted, true);
  assert.match(restrictedAiTask.task.title, /Publicação restrita/i);
  assert.equal(restrictedAiTask.task.title.includes('RECURSO'), false, 'O título da tarefa restrita não pode vazar o teor.');
  assert.equal(String(restrictedAiTask.task.description || '').includes('Segredo'), false, 'A descrição da tarefa restrita não pode vazar o teor.');

  response = await postJson(`${server.baseUrl}/api/publications/pub-restricted/task`, {
    publicationId: 'pub-restricted',
    revision: restrictedAiTask.revision,
    task: restrictedTask
  }, master.headers);
  const restrictedIdempotentStatus = response.status;
  const restrictedIdempotent = await response.json();
  assert.equal(restrictedIdempotentStatus, 200, `Repetir a sugestão deve devolver a tarefa existente de forma idempotente. ${JSON.stringify(restrictedIdempotent)}`);
  assert.equal(restrictedIdempotent.idempotent, true);
  assert.equal(restrictedIdempotent.task.id, restrictedAiTask.task.id);

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaborator.cookie } });
  const collaboratorState = await response.json();
  assert.equal((collaboratorState.state?.tasks || []).some(task => task.id === privateAiTask.task.id), false, 'Tarefa privada alheia não entra no estado do outro usuário.');
  assert.equal((collaboratorState.state?.tasks || []).some(task => task.id === restrictedAiTask.task.id), false, 'Tarefa restrita alheia não entra no estado do outro usuário.');

  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task/undo`, {
    taskId: privateAiTask.task.id,
    revision: restrictedIdempotent.revision
  }, collaborator.headers);
  assert.equal(response.status, 404, 'Desfazer tarefa privada alheia deve falhar fechado.');

  response = await postJson(`${server.baseUrl}/api/publications/pub-private/task/undo`, {
    taskId: privateAiTask.task.id,
    revision: restrictedIdempotent.revision
  }, master.headers);
  assert.equal(response.status, 200, 'O dono pode desfazer a própria tarefa privada.');
  const privateUndo = await response.json();

  const officeTaskBody = {
    publicationId: 'pub-office-ai',
    revision: privateUndo.revision,
    task: {
      title: 'Recurso: publicação comum',
      process: '5000000-00.2026.8.21.0006',
      description: 'Tarefa sintética de publicação comum.',
      status: 'triagem',
      priority: 'normal',
      aiSuggestion: { id: 'sug-office', action: 'Analisar para recorrer', reason: 'suggest', confidence: 0.9, at: new Date().toISOString(), piece: 'Recurso' }
    }
  };
  response = await postJson(`${server.baseUrl}/api/publications/pub-office-ai/task`, officeTaskBody, master.headers);
  assert.equal(response.status, 201, 'O administrador cria a sugestão em publicação comum.');
  const officeAiTask = await response.json();
  response = await postJson(`${server.baseUrl}/api/publications/pub-office-ai/task`, {
    ...officeTaskBody,
    revision: officeAiTask.revision
  }, collaborator.headers);
  assert.equal(response.status, 200, 'Outro usuário com acesso à publicação comum recebe a tarefa de forma idempotente.');
  const officeRepeated = await response.json();
  assert.equal(officeRepeated.idempotent, true);
  assert.equal(officeRepeated.task.id, officeAiTask.task.id);

  console.log('V Publicação privada: criação bloqueada para terceiro, tarefa herdada como privada e desfazer negado.');
  console.log('\n>>> TAREFA EM PUBLICAÇÃO PRIVADA: PASS <<<\n');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  const password = 'Master-Publication-Private-2026!';
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.publication.private',
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
  const me = (users.users || []).find(user => user.username === 'master.publication.private');
  assert.ok(me?.id, 'O identificador do administrador deve estar disponível.');
  return {
    id: me.id,
    cookie,
    headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken },
    password,
    manualSecret: setup.manualSecret
  };
}

async function setupCollaborator(baseUrl, master) {
  const username = 'colaborador.publication.private';
  const password = 'Colaborador-Publication-Private-2026!';
  let response = await postJson(`${baseUrl}/api/auth/register`, {
    username,
    displayName: 'Pessoa Colaboradora Teste',
    email: 'colaborador.publication.private@example.test',
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
