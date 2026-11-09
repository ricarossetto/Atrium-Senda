import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { handleOfficeRoute } from '../lib/http/office-routes.mjs';
import { postJson, startTestServer } from './helpers.mjs';

// Offboarding de membro com transferência de carteira (Lote D-1).
// Contrato conferido em `lib/http/office-routes.mjs` (trecho que trata `/offboard`)
// e em `specs/office-teams-access.md`, seção "Ciclo de vida".
// Fixtures estritamente sintéticas: Advogada Teste, Cliente Teste, CNJs 5021000-*.
// O teste assere o comportamento real do código; divergências em relação à spec
// ficam registradas em comentário, não "corrigidas" aqui.

const PRINCIPAL_PASSWORD = 'Senha-Titular-Offboard-2026!';
const MANAGER_PASSWORD = 'Senha-Gestor-Offboard-2026!';
const ASSOCIATE_PASSWORD = 'Senha-Associada-Offboard-2026!';

const TARGET = { username: 'desligada_offboard', displayName: 'Advogada Teste Desligada', email: 'desligada.offboard@example.test', password: ASSOCIATE_PASSWORD, officeRoleId: 'associate' };
const REPLACEMENT = { username: 'substituta_offboard', displayName: 'Advogada Teste Substituta', email: 'substituta.offboard@example.test', password: ASSOCIATE_PASSWORD, officeRoleId: 'associate' };
const OUTSIDER = { username: 'sem_permissao_offboard', displayName: 'Advogada Teste Sem Permissao', email: 'sem.permissao.offboard@example.test', password: ASSOCIATE_PASSWORD, officeRoleId: 'associate' };
const MANAGER = { username: 'gestor_offboard', displayName: 'Advogado Teste Gestor', email: 'gestor.offboard@example.test', password: MANAGER_PASSWORD, officeRoleId: 'office_manager' };
const MANAGER_PATCH = { username: 'gestor_patch_offboard', displayName: 'Advogado Teste Gestor Patch', email: 'gestor.patch.offboard@example.test', password: MANAGER_PASSWORD, officeRoleId: 'office_manager' };

const PROC_TRANSFER = '5021000-00.2026.8.21.0001';
const PROC_UNTOUCHED = '5021000-01.2026.8.21.0001';

console.log('\n===============================================================');
console.log('  ATRIUM — OFFBOARDING DE MEMBRO COM TRANSFERÊNCIA DE CARTEIRA  ');
console.log('===============================================================\n');

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-d1-office-offboard-'));
const server = await startTestServer({ dataDirectory });
const auth = (cookie, csrf) => ({ Cookie: cookie, 'X-CSRF-Token': csrf, Accept: 'application/json' });
const jsonHeaders = (cookie, csrf) => ({ ...auth(cookie, csrf), 'Content-Type': 'application/json' });

async function loginWithTotp({ username, password, manualSecret, setupToken }) {
  void setupToken;
  let response = await postJson(`${server.baseUrl}/api/auth/login`, { username, password, code: generateTotp(manualSecret) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie && body.csrfToken, 'Sessão sintética incompleta.');
  return { cookie, csrf: body.csrfToken, id: body.user?.id, manualSecret, username, password };
}

async function joinAs(principal, { username, displayName, email, password, officeRoleId }) {
  const actorHeaders = auth(principal.cookie, principal.csrf);
  let response = await postJson(`${server.baseUrl}/api/auth/register`, { username, displayName, email, password, officeRoleId }, actorHeaders);
  const registered = await response.json();
  assert.equal(response.status, 200, JSON.stringify(registered));
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registered.setupToken, code: generateTotp(registered.manualSecret) });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  const usersResponse = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: principal.cookie } });
  const memberUser = (await usersResponse.json()).users.find(user => user.username === username);
  assert.ok(memberUser, 'membro não encontrado para aprovação');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: memberUser.id, status: 'active', password: principal.password, code: generateTotp(principal.manualSecret) }, actorHeaders);
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  return loginWithTotp({ username, password, manualSecret: registered.manualSecret, setupToken: registered.setupToken });
}

const readState = async headers => (await fetch(`${server.baseUrl}/api/state`, { headers: auth(headers.cookie, headers.csrf) })).json();
const readTeams = async headers => (await (await fetch(`${server.baseUrl}/api/office/teams`, { headers: auth(headers.cookie, headers.csrf) })).json()).teams || [];
const readMembers = async headers => (await (await fetch(`${server.baseUrl}/api/office`, { headers: auth(headers.cookie, headers.csrf) })).json()).members || [];
const offboard = async (actor, memberId, body) => {
  const response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(memberId)}/offboard`, {
    method: 'POST',
    headers: jsonHeaders(actor.cookie, actor.csrf),
    body: JSON.stringify(body || {})
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const patchMember = async (actor, memberId, body) => {
  const response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    headers: jsonHeaders(actor.cookie, actor.csrf),
    body: JSON.stringify(body || {})
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

try {
  // --- Sessão do titular -------------------------------------------------
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular_offboard',
    displayName: 'Advogada Teste Titular',
    email: 'teste@example.test',
    oab: 'OAB/RS 000000',
    oabUf: 'RS',
    password: PRINCIPAL_PASSWORD,
    workspaceName: 'Escritório Teste Offboarding'
  });
  const setup = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setup));
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const verified = await response.json();
  assert.equal(response.status, 200, JSON.stringify(verified));
  const principal = {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: verified.csrfToken,
    id: verified.user?.id,
    manualSecret: setup.manualSecret,
    username: 'titular_offboard',
    password: PRINCIPAL_PASSWORD,
    displayName: 'Advogada Teste Titular'
  };
  assert.ok(principal.cookie && principal.csrf, 'Sessão do titular incompleta.');

  const target = await joinAs(principal, TARGET);
  const replacement = await joinAs(principal, REPLACEMENT);
  const outsider = await joinAs(principal, OUTSIDER);
  const manager = await joinAs(principal, MANAGER);

  // --- Fixtures: equipe, processo e tarefas do membro --------------------
  response = await fetch(`${server.baseUrl}/api/office/teams`, {
    method: 'POST',
    headers: jsonHeaders(principal.cookie, principal.csrf),
    body: JSON.stringify({ name: 'Equipe Offboarding Sintética', description: 'Sintética', memberIds: [target.id] })
  });
  const team = (await response.json()).team;
  assert.equal(response.status, 201);
  assert.ok((team.memberIds || []).includes(target.id) || (team.memberIds || []).includes(target.username), 'Fixture: membro precisa estar na equipe.');

  const createdAt = '2026-10-01T12:00:00.000Z';
  const envelope = await readState(principal);
  const seeded = {
    ...(envelope.state || {}),
    processes: [
      {
        id: 'proc-offboard-transfer',
        number: PROC_TRANSFER,
        client: 'Cliente Teste',
        responsible: TARGET.displayName,
        responsibleUserIds: [target.id],
        assignedTeamIds: [],
        assignmentStatus: 'assigned',
        createdBy: TARGET.displayName,
        createdAt
      },
      {
        id: 'proc-offboard-intocado',
        number: PROC_UNTOUCHED,
        client: 'Cliente Teste',
        responsible: REPLACEMENT.displayName,
        responsibleUserIds: [replacement.id],
        assignedTeamIds: [],
        assignmentStatus: 'assigned',
        createdBy: REPLACEMENT.displayName,
        createdAt
      }
    ],
    tasks: [
      {
        id: 'task-offboard-assignee',
        title: 'Protocolar contestação sintética',
        process: PROC_TRANSFER,
        status: 'andamento',
        assigneeUserId: target.id,
        responsible: TARGET.displayName,
        followerUserIds: [replacement.id],
        createdBy: TARGET.displayName,
        history: [{ at: createdAt, action: 'Tarefa criada', actor: TARGET.displayName }]
      },
      {
        id: 'task-offboard-follower',
        title: 'Revisar minuta sintética',
        process: PROC_UNTOUCHED,
        status: 'triagem',
        assigneeUserId: replacement.id,
        responsible: REPLACEMENT.displayName,
        followerUserIds: [target.id],
        createdBy: TARGET.displayName,
        history: [{ at: createdAt, action: 'Tarefa criada', actor: TARGET.displayName }]
      },
      {
        id: 'task-offboard-intocada',
        title: 'Tarefa de outro membro',
        process: PROC_UNTOUCHED,
        status: 'triagem',
        assigneeUserId: replacement.id,
        responsible: REPLACEMENT.displayName,
        followerUserIds: [],
        createdBy: REPLACEMENT.displayName,
        history: [{ at: createdAt, action: 'Tarefa criada', actor: REPLACEMENT.displayName }]
      }
    ]
  };
  response = await fetch(`${server.baseUrl}/api/state`, {
    method: 'POST',
    headers: jsonHeaders(principal.cookie, principal.csrf),
    body: JSON.stringify({ state: seeded, revision: envelope.revision })
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const seededRevision = (await response.json()).revision;

  const beforeOffboard = await readState(principal);
  assert.equal(beforeOffboard.revision, seededRevision, 'A fixture precisa estar persistida antes do desligamento.');
  const seededProcess = beforeOffboard.state.processes.find(item => item.id === 'proc-offboard-transfer');
  assert.deepEqual(seededProcess.responsibleUserIds, [target.id], 'Fixture: processo deve apontar para o membro desligado.');
  const seededTask = beforeOffboard.state.tasks.find(item => item.id === 'task-offboard-assignee');
  assert.equal(seededTask.assigneeUserId, target.id, 'Fixture: tarefa deve ser do membro desligado.');

  // --- Caso 1 e 2: transferência de processo e tarefa --------------------
  console.log('[1/2] Desligamento com substituto...');
  const first = await offboard(principal, target.id, { transferToUserId: replacement.id, expectedRevision: beforeOffboard.revision });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.ok, true);
  assert.equal(first.body.member?.id, target.id);
  assert.equal(first.body.member?.status, 'inactive', 'Membro desligado precisa ficar inativo.');
  assert.deepEqual(first.body.member?.teamIds || [], [], 'Membro desligado precisa sair das equipes.');
  assert.ok(first.body.revision && first.body.revision !== beforeOffboard.revision, 'A resposta deve devolver a nova revisão.');

  const afterFirst = await readState(principal);
  const transferredProcess = afterFirst.state.processes.find(item => item.id === 'proc-offboard-transfer');
  assert.deepEqual(transferredProcess.responsibleUserIds, [replacement.id], 'Substituto assume o processo e o desligado sai (dado persistido).');
  assert.equal(transferredProcess.assignedBy, principal.id, 'A transferência registra o ator responsável.');
  assert.ok(transferredProcess.assignedAt, 'A transferência registra o momento.');
  assert.equal(transferredProcess.createdBy, TARGET.displayName, 'Autoria do processo permanece com quem criou.');
  const untouchedProcess = afterFirst.state.processes.find(item => item.id === 'proc-offboard-intocado');
  assert.deepEqual(untouchedProcess.responsibleUserIds, [replacement.id], 'Processo de outro membro não pode ser tocado.');
  assert.equal(untouchedProcess.assignedBy, undefined, 'Processo sem o membro desligado não recebe marca de transferência.');

  const assigneeTask = afterFirst.state.tasks.find(item => item.id === 'task-offboard-assignee');
  assert.equal(assigneeTask.assigneeUserId, replacement.id, 'Substituto assume a tarefa (dado persistido).');
  assert.equal(assigneeTask.responsible, REPLACEMENT.displayName, 'O responsável textual acompanha o novo titular.');
  assert.ok(!(assigneeTask.followerUserIds || []).includes(target.id), 'O desligado sai dos seguidores da tarefa.');
  assert.deepEqual((assigneeTask.followerUserIds || []).sort(), [replacement.id].sort(), 'Seguidores legítimos permanecem.');
  const followerTask = afterFirst.state.tasks.find(item => item.id === 'task-offboard-follower');
  assert.deepEqual(followerTask.followerUserIds, [], 'Tarefa em que era apenas seguidor perde o vínculo com o desligado.');
  assert.equal(followerTask.assigneeUserId, replacement.id, 'Tarefa de seguidor mantém o titular original.');
  const untouchedTask = afterFirst.state.tasks.find(item => item.id === 'task-offboard-intocada');
  assert.equal(untouchedTask.assigneeUserId, replacement.id, 'Tarefa alheia não é reatribuída.');
  assert.deepEqual(untouchedTask.followerUserIds, [], 'Tarefa alheia permanece sem seguidores.');

  // O contador `transferred` cobre apenas atribuições diretas (`assigneeUserId`);
  // remoção de seguidor não entra na contagem. Comportamento real do código.
  assert.deepEqual(first.body.transferred, { processes: 1, tasks: 1 }, 'Contagens devolvidas precisam refletir a transferência real.');

  const teamsAfter = await readTeams(principal);
  const teamAfter = teamsAfter.find(item => item.id === team.id);
  assert.ok(teamAfter, 'Equipe deve permanecer existindo.');
  assert.equal(
    (teamAfter.memberIds || []).some(id => String(id) === String(target.id) || String(id) === target.username),
    false,
    'Membro desligado precisa sair da equipe também no registro da equipe.'
  );

  // --- Caso 5: autoria histórica preservada e acesso revogado -----------
  console.log('[5] Autoria histórica preservada e acesso revogado...');
  assert.equal(assigneeTask.createdBy, TARGET.displayName, 'Autoria da tarefa não pode ser apagada.');
  assert.equal(assigneeTask.history?.[0]?.actor, TARGET.displayName, 'Histórico da tarefa mantém o autor original.');
  assert.equal(followerTask.createdBy, TARGET.displayName, 'Autoria em tarefa de seguidor permanece.');
  const membersAfter = await readMembers(principal);
  const targetRecord = membersAfter.find(member => member.id === target.id);
  assert.ok(targetRecord, 'O membro desligado continua existindo no diretório (desativação, não exclusão).');
  assert.equal(targetRecord.status, 'inactive');
  assert.equal(targetRecord.displayName, TARGET.displayName, 'O nome histórico permanece legível.');

  const staleSession = await fetch(`${server.baseUrl}/api/office`, { headers: auth(target.cookie, target.csrf) });
  assert.equal(staleSession.status, 401, 'A sessão aberta do desligado precisa cair.');
  const relogin = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: TARGET.username,
    password: TARGET.password,
    code: generateTotp(target.manualSecret, Math.floor(Date.now() / 30_000) + 1)
  });
  assert.notEqual(relogin.status, 200, 'Membro inativo não pode autenticar de novo.');
  assert.ok([401, 403].includes(relogin.status), `Login do inativo deve ser recusado (recebido ${relogin.status}).`);

  // --- Caso 8: auditoria com ator, alvo e contagens ---------------------
  console.log('[8] Auditoria do desligamento...');
  const auditEntry = (afterFirst.state.audit || []).find(entry => entry.action === 'Membro desligado do escritório');
  assert.ok(auditEntry, 'O desligamento precisa gerar evento de auditoria.');
  assert.equal(auditEntry.actor, principal.displayName, 'A auditoria registra o ator autenticado.');
  assert.match(auditEntry.detail, new RegExp(TARGET.displayName), 'A auditoria nomeia o alvo.');
  assert.match(auditEntry.detail, new RegExp(REPLACEMENT.displayName), 'A auditoria nomeia o substituto.');
  assert.match(auditEntry.detail, /processos: 1/, 'A auditoria registra a contagem de processos.');
  assert.match(auditEntry.detail, /tarefas: 1/, 'A auditoria registra a contagem de tarefas.');

  // --- Caso 3: proteção do titular --------------------------------------
  console.log('[3] Titular não pode ser desligado...');
  const principalAttempt = await offboard(principal, principal.id, { transferToUserId: replacement.id });
  assert.equal(principalAttempt.status, 409, JSON.stringify(principalAttempt.body));
  assert.match(principalAttempt.body.message || '', /administrador principal/i);
  assert.match(principalAttempt.body.message || '', /titularidade/i);
  const principalStillActive = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalStillActive?.status, 'active', 'O titular precisa permanecer ativo.');
  assert.equal(principalStillActive?.isPrincipal, true);

  // --- Caso 3b: PATCH não pode desativar nem rebaixar o titular ----------
  // Achado da revisão do D-1: `office_principal` é único e privativo. Nenhum caminho
  // pode desativá-lo ou rebaixá-lo; campos que não ferem a titularidade seguem aceitos.
  console.log('[3b] Titular não pode ser desativado nem rebaixado por PATCH...');
  const patchManager = await joinAs(principal, MANAGER_PATCH);
  const principalInactive = await patchMember(principal, principal.id, { status: 'inactive' });
  assert.equal(principalInactive.status, 409, JSON.stringify(principalInactive.body));
  assert.match(principalInactive.body.message || '', /administrador principal/i);
  assert.match(principalInactive.body.message || '', /transfer[êe]ncia de titularidade/i);
  const principalAfterInactive = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterInactive?.status, 'active', 'Recusa de desativação não pode alterar o titular.');
  assert.equal(principalAfterInactive?.isPrincipal, true);

  const principalDemotion = await patchMember(principal, principal.id, { officeRoleId: 'office_manager' });
  assert.equal(principalDemotion.status, 409, JSON.stringify(principalDemotion.body));
  assert.match(principalDemotion.body.message || '', /transfer[êe]ncia de titularidade/i);
  const principalAfterDemotion = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterDemotion?.officeRoleId, 'office_principal', 'Recusa de rebaixamento não pode alterar o papel do titular.');
  assert.equal(principalAfterDemotion?.isPrincipal, true);

  // `pending_approval` também invalida sessões, recusa login e conta como conta
  // bloqueada: antes escapava da checagem manual e desativava o titular de fato.
  const principalPending = await patchMember(principal, principal.id, { status: 'pending_approval' });
  assert.equal(principalPending.status, 409, JSON.stringify(principalPending.body));
  assert.match(principalPending.body.message || '', /administrador principal/i);
  const principalAfterPending = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterPending?.status, 'active', 'Recusa de pending_approval não pode alterar o titular.');
  assert.equal(principalAfterPending?.isPrincipal, true);

  // Gestor (não titular) também não consegue desativar o titular.
  const managerAgainstPrincipal = await patchMember(patchManager, principal.id, { status: 'inactive' });
  assert.equal(managerAgainstPrincipal.status, 409, JSON.stringify(managerAgainstPrincipal.body));
  assert.match(managerAgainstPrincipal.body.message || '', /administrador principal/i);
  const principalAfterManagerAttempt = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterManagerAttempt?.status, 'active', 'Tentativa de gestor não pode desativar o titular.');

  // Auto-exclusão do titular deixa o escritório sem `office_principal`: 409 e o
  // diretório histórico continua com o titular.
  const principalSelfDelete = await fetch(`${server.baseUrl}/api/auth/profile/delete`, {
    method: 'POST',
    headers: jsonHeaders(principal.cookie, principal.csrf),
    body: JSON.stringify({})
  });
  const principalSelfDeleteBody = await principalSelfDelete.json().catch(() => ({}));
  assert.equal(principalSelfDelete.status, 409, JSON.stringify(principalSelfDeleteBody));
  assert.match(principalSelfDeleteBody.message || '', /administrador principal/i);
  const principalAfterSelfDelete = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterSelfDelete?.status, 'active', 'Auto-exclusão recusada não pode alterar o titular.');

  // Controle negativo: mutação que não fere a titularidade continua aceita.
  const principalPermission = await patchMember(principal, principal.id, { permissionOverrides: ['finance.read'] });
  assert.equal(principalPermission.status, 200, JSON.stringify(principalPermission.body));
  assert.ok(principalPermission.body.member?.permissions?.includes('finance.read'), 'Concessão de permissão ao titular precisa ser aceita.');
  assert.equal(principalPermission.body.member?.status, 'active');

  // Gestor comum com outro gestor ativo (o titular) continua desativável por PATCH.
  const activeManagersBefore = (await readMembers(principal)).filter(member => member.status === 'active' && ['office_manager', 'office_principal'].includes(member.officeRoleId));
  assert.equal(activeManagersBefore.length, 3, 'Fixture: titular e dois gestores ativos antes da desativação.');
  const managerDeactivated = await patchMember(principal, patchManager.id, { status: 'inactive' });
  assert.equal(managerDeactivated.status, 200, JSON.stringify(managerDeactivated.body));
  assert.equal(managerDeactivated.body.member?.status, 'inactive');
  const principalAfterManager = (await readMembers(principal)).find(member => member.id === principal.id);
  assert.equal(principalAfterManager?.status, 'active', 'Desativar gestor comum não pode afetar o titular.');

  // --- Caso 6: autorização ----------------------------------------------
  console.log('[6] Autorização: 403, 401 e CSRF...');
  const forbidden = await offboard(outsider, replacement.id, { transferToUserId: principal.id });
  assert.equal(forbidden.status, 403, JSON.stringify(forbidden.body));
  assert.match(forbidden.body.message || '', /permissão/i);
  const anonymous = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(replacement.id)}/offboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(anonymous.status, 401, 'Sem sessão o desligamento precisa ser recusado.');
  const revisionBeforeCsrf = (await readState(principal)).revision;
  const noCsrf = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(replacement.id)}/offboard`, {
    method: 'POST',
    headers: { Cookie: principal.cookie, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ transferToUserId: outsider.id, expectedRevision: revisionBeforeCsrf })
  });
  const noCsrfBody = await noCsrf.json().catch(() => ({}));
  assert.equal(noCsrf.status, 403, JSON.stringify(noCsrfBody));
  assert.match(noCsrfBody.message || '', /segurança da sessão|CSRF|Validação/i);
  const replacementAfterDenials = (await readMembers(principal)).find(member => member.id === replacement.id);
  assert.equal(replacementAfterDenials?.status, 'active', 'Tentativas recusadas não podem desativar o substituto.');

  // --- Caso 7: revisão otimista ----------------------------------------
  console.log('[7] Revisão otimista...');
  const stale = await offboard(principal, replacement.id, { transferToUserId: outsider.id, expectedRevision: 'revisao-obsoleta-sintetica' });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.match(stale.body.message || '', /atualizad|Recarregue/i);
  // Comportamento real: sem `expectedRevision` a rota também recusa (409), porque
  // `assertRevision` compara `undefined` com a revisão corrente. Fail-closed, mas a
  // mensagem fala em "documentos atualizados" e a spec não menciona essa exigência.
  const withoutRevision = await offboard(principal, replacement.id, { transferToUserId: outsider.id });
  assert.equal(withoutRevision.status, 409, JSON.stringify(withoutRevision.body));
  const replacementAfterConflict = (await readMembers(principal)).find(member => member.id === replacement.id);
  assert.equal(replacementAfterConflict?.status, 'active', 'Conflito de revisão não pode desativar o membro.');
  const auditAfterConflicts = (await readState(principal)).state.audit || [];
  assert.equal(
    auditAfterConflicts.filter(entry => entry.action === 'Membro desligado do escritório').length,
    1,
    'Tentativas recusadas não podem gravar evento de desligamento.'
  );

  // --- Caso 4a (HTTP): o gestor só sai porque o titular conta como gestor -
  console.log('[4a] Gestor com outro gestor ativo (o titular) pode sair...');
  const revisionForManager = (await readState(principal)).revision;
  const managerOffboard = await offboard(principal, manager.id, { transferToUserId: replacement.id, expectedRevision: revisionForManager });
  assert.equal(managerOffboard.status, 200, JSON.stringify(managerOffboard.body));
  assert.equal(managerOffboard.body.member?.status, 'inactive');
  const managersAfter = (await readMembers(principal)).filter(member => member.status === 'active' && ['office_manager', 'office_principal'].includes(member.officeRoleId));
  assert.equal(managersAfter.length, 1, 'O escritório precisa seguir com um gestor ativo.');
  assert.equal(managersAfter[0].isPrincipal, true, 'O gestor remanescente é o titular — por isso o desligamento foi aceito.');

  // --- Caso 4b (rota): guarda do último gestor --------------------------
  // Sobre HTTP essa guarda é inalcançável num workspace com titular ativo: o titular
  // é `office_principal` e sempre conta como gestor, então nenhum outro membro é o
  // "último gestor". O caso é exercitado na função de rota com contexto mínimo, que é
  // a autoridade real da regra (`lib/http/office-routes.mjs`, guarda de gestor único).
  console.log('[4b] Guarda do último gestor ativo (nível de rota)...');
  const onlyManager = {
    id: 'u-gestor-unico-sintetico',
    username: 'gestor_unico_sintetico',
    displayName: 'Advogado Teste Gestor Único',
    officeRoleId: 'office_manager',
    role: 'collaborator',
    status: 'active',
    isPrincipal: false
  };
  const routeCalls = { json: 0, enqueued: 0, audit: 0 };
  const routeContext = {
    json: () => { routeCalls.json += 1; },
    readJson: async () => ({}),
    security: { hasOfficePermission: () => true, listUsers: () => [onlyManager] },
    assertAuthenticated: () => ({ id: 'u-ator-sintetico', displayName: 'Advogada Teste Titular', workspaceId: 'ws-sintetico' }),
    appendServerAudit: async () => { routeCalls.audit += 1; },
    readAppStateEnvelope: async () => ({ state: {}, revision: 'r1' }),
    enqueueAppStateMutation: async () => { routeCalls.enqueued += 1; return {}; },
    saveAppStateDirectUnlocked: async () => ({}),
    assertRevision: () => {}
  };
  await assert.rejects(
    handleOfficeRoute(routeContext, { method: 'POST', headers: {} }, {}, new URL(`http://127.0.0.1/api/office/members/${onlyManager.id}/offboard`)),
    error => {
      assert.equal(error.statusCode, 409, 'Último gestor precisa ser recusado com 409.');
      assert.match(error.message, /ao menos um gestor ativo/i);
      return true;
    }
  );
  // A spec nomeia o código público `LAST_MANAGER`; o código real não envia `code`
  // (o conjunto `PUBLIC_ERROR_CODES` do servidor não inclui esse valor).
  assert.equal(routeCalls.enqueued, 0, 'Recusa do último gestor não pode iniciar mutação de estado.');
  assert.equal(routeCalls.json, 0, 'Recusa do último gestor não pode responder sucesso.');
  assert.equal(routeCalls.audit, 0, 'Recusa do último gestor não pode gravar auditoria de desligamento.');

  console.log('\n>>> OFFBOARDING: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
