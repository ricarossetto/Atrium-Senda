import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste HTTP: equipes do escritório ---');

const session = await startUiV2Session({ viewport: { width: 1280, height: 800 } });
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const result = await page.evaluate(async () => {
    const auth = window.AtriumAuth;
    const list = await auth.secureFetch('/api/office/teams', { headers: { Accept: 'application/json' } });
    const createdResponse = await auth.secureFetch('/api/office/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: 'Equipe HTTP Sintética', description: 'Teste', memberIds: [] })
    });
    const created = await createdResponse.json();
    const patchedResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(created.team.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: 'Equipe HTTP Sintética Editada' })
    });
    const patched = await patchedResponse.json();
    const deleteResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(created.team.id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const after = await (await auth.secureFetch('/api/office/teams', { headers: { Accept: 'application/json' } })).json();
    const office = await (await auth.secureFetch('/api/office', { headers: { Accept: 'application/json' } })).json();
    const self = office.members.find(member => member.role === 'master_admin');
    const memberUpdateResponse = await auth.secureFetch(`/api/office/members/${encodeURIComponent(self.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ memberKind: 'staff', officeRoleId: 'office_principal' })
    });
    const memberUpdate = await memberUpdateResponse.json();
    await auth.secureFetch(`/api/office/members/${encodeURIComponent(self.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ memberKind: 'lawyer', officeRoleId: 'office_principal' })
    });
    const inviteResponse = await auth.secureFetch('/api/auth/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ displayName: 'Convite HTTP Teste', email: `convite-http-${Date.now()}@example.test`, sendEmail: false })
    });
    const invite = await inviteResponse.json();
    const emailInviteResponse = await auth.secureFetch('/api/auth/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ displayName: 'Convite E-mail HTTP Teste', email: `convite-email-http-${Date.now()}@example.test`, sendEmail: true })
    });
    const emailInvite = await emailInviteResponse.json();
    for (const item of [invite, emailInvite]) {
      if (item?.invitation?.id) await auth.secureFetch('/api/auth/invitations', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ invitationId: item.invitation.id }) });
    }
    return {
      memberUpdateStatus: memberUpdateResponse.status,
      memberUpdateKind: memberUpdate.member?.memberKind,
      inviteStatus: inviteResponse.status,
      inviteEmailStatus: invite.emailStatus,
      emailInviteStatus: emailInviteResponse.status,
      emailInviteEmailStatus: emailInvite.emailStatus,
      listStatus: list.status,
      createStatus: createdResponse.status,
      patchedStatus: patchedResponse.status,
      deleteStatus: deleteResponse.status,
      patchedName: patched.team?.name,
      stillThere: (after.teams || []).some(team => team.id === created.team.id)
    };
  });
  assert.equal(result.listStatus, 200);
  assert.equal(result.createStatus, 201);
  assert.equal(result.patchedStatus, 200);
  assert.equal(result.patchedName, 'Equipe HTTP Sintética Editada');
  assert.equal(result.deleteStatus, 200);
  assert.equal(result.stillThere, false);
  assert.equal(result.memberUpdateStatus, 200);
  assert.equal(result.memberUpdateKind, 'staff');
  assert.equal(result.inviteStatus, 201);
  assert.equal(result.inviteEmailStatus, 'not_requested');
  assert.equal(result.emailInviteStatus, 201);
  assert.equal(result.emailInviteEmailStatus, 'queued');

  // C-1: equipe atribuída a processo não pode ser excluída; a exclusão só passa depois
  // de remover a atribuição nos processos. Fixtures sintéticas.
  const guards = await page.evaluate(async () => {
    const auth = window.AtriumAuth;
    const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const createTeam = async name => (await (await auth.secureFetch('/api/office/teams', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ name, description: 'Sintética', memberIds: [] })
    })).json()).team;
    const listTeamIds = async () => ((await (await auth.secureFetch('/api/office/teams', { headers: { Accept: 'application/json' } })).json()).teams || []).map(team => team.id);
    const teamInUse = await createTeam('Equipe Em Uso Sintética');
    const teamFree = await createTeam('Equipe Livre Sintética');
    const teamReassigned = await createTeam('Equipe Reatribuída Sintética');
    const envelope = await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json();
    const state = {
      ...(envelope.state || {}),
      processes: [
        { id: 'proc-team-in-use', number: '5017000-00.2026.8.21.0001', client: 'Cliente Teste', responsibleUserIds: [], assignedTeamIds: [], assignmentStatus: 'unassigned' },
        { id: 'proc-team-reassigned', number: '5017000-01.2026.8.21.0001', client: 'Cliente Teste', responsibleUserIds: [], assignedTeamIds: [], assignmentStatus: 'unassigned' }
      ]
    };
    const saved = await (await auth.secureFetch('/api/state', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ state, revision: envelope.revision })
    })).json();
    const assign = async (processId, teamId, expectedRevision) => auth.secureFetch(`/api/processes/${processId}/assignment`, {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ teamIds: teamId ? [teamId] : [], responsibleUserIds: [], expectedRevision })
    });
    const firstAssign = await assign('proc-team-in-use', teamInUse.id, saved.revision);
    await firstAssign.json();
    const revisionAfterFirst = (await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json()).revision;
    const secondAssign = await assign('proc-team-reassigned', teamReassigned.id, revisionAfterFirst);
    await secondAssign.json();

    const blockedResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(teamInUse.id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const blockedBody = await blockedResponse.json();
    const teamsAfterBlocked = await listTeamIds();

    const freeResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(teamFree.id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const freeBody = await freeResponse.json();
    const teamsAfterFree = await listTeamIds();

    const unassignResponse = await assign('proc-team-reassigned', null, (await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json()).revision);
    const unassignPayload = await unassignResponse.json();
    const releasedResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(teamReassigned.id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const releasedBody = await releasedResponse.json();
    const teamsAfterReleased = await listTeamIds();

    return {
      firstAssignStatus: firstAssign.status,
      secondAssignStatus: secondAssign.status,
      unassignStatus: unassignResponse.status,
      unassignedTeams: unassignPayload.process?.assignedTeamIds || null,
      blockedStatus: blockedResponse.status,
      blockedCode: blockedBody.code,
      blockedMessage: blockedBody.message || '',
      blockedStillThere: teamsAfterBlocked.includes(teamInUse.id),
      freeStatus: freeResponse.status,
      freeOk: freeBody.ok,
      freeGone: !teamsAfterFree.includes(teamFree.id),
      releasedStatus: releasedResponse.status,
      releasedOk: releasedBody.ok,
      releasedGone: !teamsAfterReleased.includes(teamReassigned.id)
    };
  });
  assert.equal(guards.firstAssignStatus, 200);
  assert.equal(guards.secondAssignStatus, 200);
  assert.equal(guards.blockedStatus, 409, 'Equipe atribuída a processo deve recusar a exclusão.');
  assert.equal(guards.blockedCode, 'TEAM_IN_USE', 'Recusa deve trafegar o código público TEAM_IN_USE.');
  assert.match(guards.blockedMessage, /atribuída a processos/i, 'Mensagem deve explicar que a equipe está atribuída.');
  assert.equal(guards.blockedStillThere, true, 'Equipe recusada não pode ser apagada.');
  assert.equal(guards.freeStatus, 200);
  assert.equal(guards.freeOk, true);
  assert.equal(guards.freeGone, true, 'Equipe sem atribuição deve ser excluída.');
  assert.equal(guards.unassignStatus, 200);
  assert.deepEqual(guards.unassignedTeams, []);
  assert.equal(guards.releasedStatus, 200);
  assert.equal(guards.releasedOk, true);
  assert.equal(guards.releasedGone, true, 'Sem atribuição pendente, a exclusão deve passar.');
  console.log('  OK: 409 TEAM_IN_USE e exclusão liberada após desatribuir.');
  const anonymous = await fetch(`${session.server.baseUrl}/api/office/teams`, { headers: { Accept: 'application/json' } });
  assert.equal(anonymous.status, 401);
  assert.deepEqual(pageErrors, []);
  console.log('  OK: CRUD autenticado de equipes e 401 sem sessão.');
  console.log('\n[PASS] API de equipes do escritório validada.');
} finally {
  await session.stop();
}

// C-2: estado do escritório em recuperação não permite verificar o uso da equipe.
// A exclusão precisa falhar fechada (423) e preservar a equipe, enquanto o workspace
// ainda sem estado (início legítimo) continua podendo excluir. Fixtures sintéticas.
console.log('--- Teste HTTP: exclusão de equipe com estado em recuperação ---');
const recoveryDataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-c1b-recovery-'));
let recoveryServer = await startTestServer({ dataDirectory: recoveryDataDirectory, preserveDataDirectory: true });
const recoverySecrets = { AUTH_SESSION_SECRET: recoveryServer.sessionSecret, AUTH_ENCRYPTION_KEY: recoveryServer.encryptionKey };
try {
  const password = 'Senha-Equipe-Recuperacao-2026!';
  let response = await postJson(`${recoveryServer.baseUrl}/api/auth/setup`, {
    username: 'admin_equipe_recovery', displayName: 'Advogada Teste Recuperação', email: 'recovery-teams@example.test',
    workspaceName: 'Escritório Recuperação Equipes', password
  });
  const pending = await response.json();
  assert.equal(response.ok, true, pending.message);
  response = await postJson(`${recoveryServer.baseUrl}/api/auth/setup/verify`, { setupToken: pending.setupToken, code: generateTotp(pending.manualSecret) });
  const authBody = await response.json();
  assert.equal(response.ok, true, authBody.message);
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': authBody.csrfToken, Accept: 'application/json' };
  const createTeam = async name => (await (await fetch(`${recoveryServer.baseUrl}/api/office/teams`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: 'Sintética', memberIds: [] })
  })).json()).team;
  const deleteTeam = async teamId => fetch(`${recoveryServer.baseUrl}/api/office/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE', headers });
  const listTeamIds = async () => ((await (await fetch(`${recoveryServer.baseUrl}/api/office/teams`, { headers })).json()).teams || []).map(team => team.id);

  // Workspace sem estado ainda gravado é início legítimo: nada pode referenciar a equipe.
  const freshTeam = await createTeam('Equipe Início Legítimo Sintética');
  const freshDelete = await deleteTeam(freshTeam.id);
  assert.equal(freshDelete.status, 200, 'Workspace sem estado ainda deve permitir excluir equipe.');
  assert.equal((await listTeamIds()).includes(freshTeam.id), false, 'Equipe livre deve sair da lista.');

  const guardedTeam = await createTeam('Equipe Estado Em Recuperação Sintética');
  await recoveryServer.stop();
  await writeFile(path.join(recoveryDataDirectory, 'app-state.json'), '{arquivo-corrompido', 'utf8');
  recoveryServer = await startTestServer({ dataDirectory: recoveryDataDirectory, preserveDataDirectory: true, env: recoverySecrets });
  const loginResponse = await postJson(`${recoveryServer.baseUrl}/api/auth/login`, {
    username: 'admin_equipe_recovery', password, code: generateTotp(pending.manualSecret)
  });
  const loginBody = await loginResponse.json();
  assert.equal(loginResponse.ok, true, loginBody.message);
  const recoveryHeaders = { Cookie: loginResponse.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': loginBody.csrfToken, Accept: 'application/json' };
  const recoveryDelete = await fetch(`${recoveryServer.baseUrl}/api/office/teams/${encodeURIComponent(guardedTeam.id)}`, { method: 'DELETE', headers: recoveryHeaders });
  const recoveryDeleteBody = await recoveryDelete.json();
  const teamsAfterRecovery = ((await (await fetch(`${recoveryServer.baseUrl}/api/office/teams`, { headers: recoveryHeaders })).json()).teams || []).map(team => team.id);
  assert.equal(recoveryDelete.status, 423, 'Estado em recuperação deve recusar a exclusão.');
  assert.match(recoveryDeleteBody.message, /recuperação/i, 'Mensagem deve explicar que o estado está em recuperação.');
  assert.equal(teamsAfterRecovery.includes(guardedTeam.id), true, 'Equipe recusada não pode ser apagada.');
  console.log('  OK: 423 com estado em recuperação e 200 sem estado prévio.');
  console.log('\n[PASS] Fail-closed da exclusão de equipe validado.');
} finally {
  await recoveryServer.stop().catch(() => {});
  await rm(recoveryDataDirectory, { recursive: true, force: true });
}
