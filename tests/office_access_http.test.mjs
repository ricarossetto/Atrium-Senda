import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste HTTP: atribuição processual ---');

const session = await startUiV2Session({ viewport: { width: 1280, height: 800 } });
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const result = await page.evaluate(async () => {
    const auth = window.AtriumAuth;
    const office = await (await auth.secureFetch('/api/office', { headers: { Accept: 'application/json' } })).json();
    const self = office.members.find(member => member.role === 'master_admin');
    const teamResponse = await auth.secureFetch('/api/office/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: 'Equipe Acesso HTTP', description: 'Sintética', memberIds: [self.id] })
    });
    const team = (await teamResponse.json()).team;
    const stateResponse = await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
    const envelope = await stateResponse.json();
    const state = {
      ...(envelope.state || {}),
      processes: [{ id: 'proc-access-http', number: '5009000-00.2026.8.21.0001', client: 'Cliente Sintético', responsible: self.displayName, responsibleUserIds: [self.id], assignedTeamIds: [], assignmentStatus: 'assigned' }]
    };
    const save = await auth.secureFetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ state, revision: envelope.revision })
    });
    const saved = await save.json();
    const assignment = await auth.secureFetch('/api/processes/proc-access-http/assignment', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ teamIds: [team.id], responsibleUserIds: [self.id], expectedRevision: saved.revision })
    });
    const assignmentPayload = await assignment.json();
    const after = await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json();
    const mode = await auth.secureFetch('/api/office', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accessMode: 'enforced' })
    });
    const modePayload = await mode.json();
    const privateOff = await auth.secureFetch('/api/office', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ privateMonitoring: 'disabled' })
    });
    const privateOffPayload = await privateOff.json();
    const privateOn = await auth.secureFetch('/api/office', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ privateMonitoring: 'allowed' })
    });
    const privateOnPayload = await privateOn.json();
    await auth.secureFetch('/api/office', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accessMode: 'shadow' })
    });
    const deleteInUseResponse = await auth.secureFetch(`/api/office/teams/${encodeURIComponent(team.id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const deleteInUsePayload = await deleteInUseResponse.json();
    const teamsAfterDeleteAttempt = (await (await auth.secureFetch('/api/office/teams', { headers: { Accept: 'application/json' } })).json()).teams || [];
    return {
      deleteInUseStatus: deleteInUseResponse.status,
      deleteInUseCode: deleteInUsePayload.code,
      deleteInUseTeamStillThere: teamsAfterDeleteAttempt.some(item => item.id === team.id),
      saveStatus: save.status,
      assignmentStatus: assignment.status,
      assignmentTeamIds: assignmentPayload.process?.assignedTeamIds || [],
      persistedTeamIds: after.state?.processes?.find(process => process.id === 'proc-access-http')?.assignedTeamIds || [],
      modeStatus: mode.status,
      mode: modePayload.accessMode,
      roles: office.profile?.roles?.length || 0,
      memberKind: self.memberKind,
      permissions: self.permissions
    };
  });
  assert.equal(result.saveStatus, 200);
  assert.equal(result.assignmentStatus, 200);
  assert.deepEqual(result.assignmentTeamIds, result.persistedTeamIds);
  assert.equal(result.persistedTeamIds.length, 1);
  assert.equal(result.modeStatus, 200);
  assert.equal(result.mode, 'enforced');
  assert.ok(result.roles >= 8, 'catálogo de papéis disponível');
  assert.ok(['lawyer', 'staff'].includes(result.memberKind));
  assert.ok(result.permissions.includes('processes.assign'));
  // Exclusão de equipe atribuída é decisão do backend, não ruído: precisa responder 409 e preservar a equipe.
  assert.equal(result.deleteInUseStatus, 409, 'Equipe atribuída a processo deve recusar a exclusão.');
  assert.equal(result.deleteInUseCode, 'TEAM_IN_USE', 'Recusa deve trafegar o código público TEAM_IN_USE.');
  assert.equal(result.deleteInUseTeamStillThere, true, 'Equipe recusada não pode ser apagada.');
  assert.deepEqual(pageErrors, []);
  console.log('  OK: atribuição persistida, modo enforced alternável, catálogo exposto e exclusão de equipe em uso recusada com 409 TEAM_IN_USE.');
  console.log('\n[PASS] API de atribuição processual validada.');
} finally {
  await session.stop();
}
