import assert from 'node:assert/strict';
import { applyPublicationWorkAction } from '../lib/publications/publication-workflow.mjs';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const timestamp = '2026-09-03T12:00:00.000Z';
const state = fixtureState();

let result = applyPublicationWorkAction(state, 'publication-synthetic', {
  id: 'appointment-synthetic',
  type: 'appointment',
  title: 'Reunião de conferência',
  date: '2026-09-08',
  time: '14:30',
  processId: 'process-confirmed'
}, { actorName: 'Pessoa Revisora', nowIso: timestamp });
assert.equal(result.entity.publicationId, 'publication-synthetic');
assert.equal(result.entity.processId, 'process-confirmed');
assert.equal(result.entity.client, 'Cliente Confirmado', 'Cliente só pode vir de vínculo canônico confirmado.');
assert.equal(state.intimations[0].treatmentStatus, 'in_review');

result = applyPublicationWorkAction(state, 'publication-synthetic', {
  id: 'deadline-synthetic',
  type: 'deadline',
  title: 'Prazo conferido pessoalmente',
  deadline: '2026-09-10',
  fatalDeadline: '2026-09-11',
  processId: 'process-unconfirmed'
}, { actorName: 'Pessoa Revisora', nowIso: timestamp });
assert.equal(result.entity.deadline, '2026-09-10');
assert.equal(result.entity.fatalDeadline, '2026-09-11');
assert.equal(result.entity.humanConfirmedBy, 'Pessoa Revisora');
assert.equal(result.entity.client, '', 'Parte sem vínculo canônico não pode virar cliente da tarefa.');
assert.equal(result.entity.actionType, '', 'Fluxo não pode inferir ato judicial.');
assert.equal(result.entity.protocol, '', 'Fluxo não pode produzir protocolo judicial.');
assert.equal(Object.hasOwn(result.entity, 'scienceAt'), false, 'Fluxo não pode registrar ciência judicial.');

result = applyPublicationWorkAction(state, 'publication-synthetic', {
  id: 'note-synthetic', type: 'note', notes: 'Nota estritamente interna.'
}, { actorName: 'Pessoa Revisora', nowIso: timestamp });
assert.equal(result.entity.text, 'Nota estritamente interna.');

result = applyPublicationWorkAction(state, 'publication-synthetic', {
  id: 'link-synthetic', type: 'link', processId: 'process-confirmed'
}, { actorName: 'Pessoa Revisora', nowIso: timestamp });
assert.equal(result.publication.processId, 'process-confirmed');
assert.equal(result.publication.client, 'Cliente Confirmado');
assert.equal(result.publication.linkedWorkActions.length, 4);

const idempotent = applyPublicationWorkAction(state, 'publication-synthetic', {
  id: 'link-synthetic', type: 'link', processId: 'process-unconfirmed'
}, { actorName: 'Outra Pessoa', nowIso: '2026-09-04T12:00:00.000Z' });
assert.equal(idempotent.idempotent, true);
assert.equal(state.intimations[0].processId, 'process-confirmed', 'Reenvio idempotente não pode alterar o vínculo original.');
assert.equal(state.audit.length, 4, 'Reenvio idempotente não pode duplicar auditoria.');

assert.throws(() => applyPublicationWorkAction(fixtureState(), 'publication-synthetic', {
  id: 'invalid-date', type: 'deadline', title: 'Data impossível', deadline: '2026-02-31'
}), /Data do prazo inválida/);
assert.throws(() => applyPublicationWorkAction({ ...fixtureState(), intimations: [{ id: 'discarded', treatmentStatus: 'discarded' }] }, 'discarded', {
  id: 'blocked', type: 'note', notes: 'Não deve salvar'
}), error => error.statusCode === 409);

const server = await startTestServer();
try {
  const auth = await setupMaster(server.baseUrl);
  let response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const envelope = await response.json();
  const serverState = envelope.state || {};
  Object.assign(serverState, fixtureState());
  response = await postJson(`${server.baseUrl}/api/state`, { state: serverState }, auth.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  const action = { id: 'server-note', type: 'note', notes: 'Nota criada pelo endpoint.' };
  response = await postWorkAction(server.baseUrl, 'publication-synthetic', action, revision);
  assert.equal(response.status, 401, 'Endpoint deve exigir autenticação.');
  response = await postWorkAction(server.baseUrl, 'publication-synthetic', action, revision, { Cookie: auth.cookie });
  assert.equal(response.status, 403, 'Endpoint deve exigir CSRF.');
  response = await postWorkAction(server.baseUrl, 'publication-synthetic', action, revision, auth.headers);
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.readOnlyJudicial, true);
  assert.equal(created.entity.text, 'Nota criada pelo endpoint.');
  assert.equal(created.publication.linkedWorkActions.at(-1).entityId, 'note-server-note');
  revision = created.revision;

  response = await postWorkAction(server.baseUrl, 'publication-synthetic', action, revision, auth.headers);
  assert.equal(response.status, 200);
  const repeated = await response.json();
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.revision, revision, 'Reenvio idempotente não pode gravar nova revisão.');

  response = await postWorkAction(server.baseUrl, 'publication-synthetic', {
    id: 'stale-action', type: 'note', notes: 'Não pode persistir.'
  }, 'revision-obsoleta', auth.headers);
  assert.equal(response.status, 409);

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const canonical = await response.json();
  const publication = canonical.state.intimations.find(item => item.id === 'publication-synthetic');
  assert.equal(publication.workNotes.filter(item => item.id === 'note-server-note').length, 1);
  assert.equal(publication.workNotes.some(item => item.id === 'note-stale-action'), false);
  assert.equal(canonical.state.audit.filter(item => item.action === 'Nota adicionada à publicação').length, 1);
} finally {
  await server.stop();
}

console.log('Publication workflow aprovado: providências rastreáveis, datas humanas, idempotência e operação judicial somente leitura.');

function fixtureState() {
  return {
    intimations: [{
      id: 'publication-synthetic',
      title: 'Publicação sintética',
      process: '5000000-00.2026.8.21.0001',
      client: 'Parte importada sem confirmação',
      treatmentStatus: 'untreated'
    }],
    processes: [
      { id: 'process-confirmed', number: '5000000-00.2026.8.21.0001', client: 'Cliente Confirmado', contactId: 'contact-confirmed' },
      { id: 'process-unconfirmed', number: '5000000-00.2026.8.21.0002', client: 'Parte Contrária Sintética', opposingParty: 'Cliente Confirmado' }
    ],
    contacts: [{ id: 'contact-confirmed', name: 'Cliente Confirmado' }],
    tasks: [],
    agenda: [],
    audit: []
  };
}

function postWorkAction(baseUrl, publicationId, action, revision, headers = {}) {
  return postJson(`${baseUrl}/api/publications/${encodeURIComponent(publicationId)}/work-actions`, {
    publicationId, revision, action
  }, headers);
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.publication.workflow',
    displayName: 'Pessoa Administradora Teste',
    password: 'Master-Publication-Workflow-2026!'
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
