import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const VIEWPORT = { width: 1280, height: 800 };
const USERNAME = 'colaborador_teste';
const EMAIL = 'colaborador.teste@example.test';
const PASSWORD = 'Colaborador-Teste-2026!';

console.log('--- Isolamento com segundo membro sintético ---');

const session = await startUiV2Session({ viewport: VIEWPORT });
let collaboratorContext = null;
try {
  const adminContext = await session.createContext();
  const { page: adminPage, pageErrors: adminErrors } = await prepareUiV2Page(adminContext, session.server.baseUrl, { theme: 'light' });

  const created = await adminPage.evaluate(async ({ email }) => {
    const auth = window.AtriumAuth;
    const office = await (await auth.secureFetch('/api/office', { headers: { Accept: 'application/json' } })).json();
    const self = office.members.find(member => member.role === 'master_admin');
    const response = await auth.secureFetch('/api/auth/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ displayName: 'Colaborador Teste', email, officeRoleId: 'associate', sendEmail: false })
    });
    return { status: response.status, body: await response.json(), self };
  }, { email: EMAIL });
  assert.equal(created.status, 201);
  assert.ok(created.body.inviteToken);

  const acceptResponse = await fetch(`${session.server.baseUrl}/api/auth/invitations/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ inviteToken: created.body.inviteToken, username: USERNAME, password: PASSWORD })
  });
  const accepted = await acceptResponse.json();
  assert.equal(acceptResponse.status, 200, JSON.stringify(accepted));

  const registerResponse = await fetch(`${session.server.baseUrl}/api/auth/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ setupToken: accepted.setupToken, code: generateTotp(accepted.manualSecret) })
  });
  const registered = await registerResponse.json();
  assert.equal(registerResponse.status, 200, JSON.stringify(registered));

  const loginResponse = await fetch(`${session.server.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD, code: generateTotp(accepted.manualSecret) })
  });
  const logged = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(logged));
  assert.ok(logged.user?.id, 'sessão do membro deve carregar o id oficial');
  const collaboratorCookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(collaboratorCookie);
  assert.ok(logged.csrfToken);

  const teamIds = await adminPage.evaluate(async ({ adminId }) => {
    const auth = window.AtriumAuth;
    const office = await (await auth.secureFetch('/api/office', { headers: { Accept: 'application/json' } })).json();
    const collaborator = office.members.find(member => member.username === 'colaborador_teste');
    if (!collaborator) throw new Error('Segundo membro não apareceu no diretório.');
    const makeTeam = async (name, memberIds) => {
      const response = await auth.secureFetch('/api/office/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, description: 'Sintética', memberIds })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Falha ao criar equipe.');
      return payload.team.id;
    };
    return {
      adminTeamId: await makeTeam('Equipe Restrita Teste', [adminId]),
      collaboratorTeamId: await makeTeam('Equipe Colaborador Teste', [collaborator.id]),
      collaboratorId: collaborator.id
    };
  }, { adminId: created.self.id });

  const saved = await adminPage.evaluate(async ({ adminId, collaboratorId }) => {
    const auth = window.AtriumAuth;
    const envelope = await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json();
    const state = {
      ...(envelope.state || {}),
      documents: [
        {
          id: 'doc-restrito-teste', name: 'Contrato Restrito Teste.pdf', mime: 'application/pdf', size: 1,
          createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
          ownerType: 'process', ownerId: 'proc-restrito-teste', checksum: '0'.repeat(64), scope: 'office'
        },
        {
          id: 'doc-privado-teste', name: 'Documento Privado Teste.pdf', mime: 'application/pdf', size: 1,
          createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
          ownerType: 'process', ownerId: 'proc-restrito-teste', checksum: '1'.repeat(64), scope: 'private', privateOwnerUserId: adminId
        }
      ],
      intimations: [
        { id: 'pub-privada-teste', process: '5000002-00.2026.8.21.0001', title: 'Publicação privada', scope: 'private', privateOwnerUserId: collaboratorId, treatmentStatus: 'untreated' },
        { id: 'pub-office-teste', process: '5000002-00.2026.8.21.0001', title: 'Publicação do escritório', scope: 'office', treatmentStatus: 'untreated' }
      ],
      tasks: [
        { id: 'task-privada-teste', title: 'Tarefa privada', process: '5000002-00.2026.8.21.0001', scope: 'private', privateOwnerUserId: collaboratorId, status: 'pendente' },
        { id: 'task-office-teste', title: 'Tarefa do escritório', process: '5000002-00.2026.8.21.0001', scope: 'office', status: 'pendente' }
      ],
      processes: [
        {
          id: 'proc-restrito-teste', number: '5000001-00.2026.8.21.0001', client: 'Cliente Restrito Teste',
          scope: 'office', assignmentStatus: 'unassigned', responsibleUserIds: [], assignedTeamIds: [], accessGrants: []
        },
        {
          id: 'proc-permitido-teste', number: '5000002-00.2026.8.21.0001', client: 'Cliente Permitido Teste',
          scope: 'office', assignmentStatus: 'unassigned', responsibleUserIds: [], assignedTeamIds: [], accessGrants: []
        }
      ]
    };
    const response = await auth.secureFetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ state, revision: envelope.revision })
    });
    return { status: response.status, body: await response.json() };
  }, { adminId: created.self.id, collaboratorId: teamIds.collaboratorId });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const assign = async (processId, teamId, userId) => adminPage.evaluate(async ({ processId, teamId, userId }) => {
    const auth = window.AtriumAuth;
    const envelope = await (await auth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json();
    const response = await auth.secureFetch(`/api/processes/${encodeURIComponent(processId)}/assignment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ teamIds: [teamId], responsibleUserIds: [userId], expectedRevision: envelope.revision })
    });
    return { status: response.status, body: await response.json() };
  }, { processId, teamId, userId });

  const restricted = await assign('proc-restrito-teste', teamIds.adminTeamId, created.self.id);
  assert.equal(restricted.status, 200, JSON.stringify(restricted.body));
  const allowed = await assign('proc-permitido-teste', teamIds.collaboratorTeamId, teamIds.collaboratorId);
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));

  const enforced = await adminPage.evaluate(async () => {
    const response = await window.AtriumAuth.secureFetch('/api/office', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accessMode: 'enforced' })
    });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(enforced.status, 200);
  assert.equal(enforced.body.accessMode, 'enforced');

  const stateResponse = await fetch(`${session.server.baseUrl}/api/state`, { headers: { Cookie: collaboratorCookie, Accept: 'application/json' } });
  const collaboratorState = await stateResponse.json();
  const processIds = (collaboratorState.state?.processes || []).map(process => process.id);
  assert.ok(processIds.includes('proc-permitido-teste'), 'processo atribuído ao membro deve aparecer');
  assert.ok(!processIds.includes('proc-restrito-teste'), 'processo de outra equipe não pode vazar');

  const emailDenied = await adminPage.evaluate(async () => {
    const response = await window.AtriumAuth.secureFetch('/api/publications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ publicationId: 'pub-privada-teste', recipient: 'teste@example.test' })
    });
    return response.status;
  });
  assert.equal(emailDenied, 404, 'e-mail de publicação privada de outro membro deve ser negado');

  const mergeDenied = await adminPage.evaluate(async () => {
    const response = await window.AtriumAuth.secureFetch('/api/publications/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ publicationId: 'pub-privada-teste', otherId: 'pub-office-teste' })
    });
    return response.status;
  });
  assert.equal(mergeDenied, 404, 'fusão com publicação privada de outro membro deve ser negada');

  const consolidateDenied = await adminPage.evaluate(async () => {
    const response = await window.AtriumAuth.secureFetch('/api/tasks/consolidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ keeperId: 'task-office-teste', loserIds: ['task-privada-teste'] })
    });
    return response.status;
  });
  assert.equal(consolidateDenied, 404, 'consolidação com tarefa privada de outro membro deve ser negada');
  const documentIds = (collaboratorState.state?.documents || []).map(document => document.id);
  assert.ok(!documentIds.includes('doc-restrito-teste'), 'documento de processo alheio não pode vazar');
  assert.ok(!documentIds.includes('doc-privado-teste'), 'documento privado de outro membro não pode vazar');
  for (const documentId of ['doc-restrito-teste', 'doc-privado-teste']) {
    const denied = await fetch(`${session.server.baseUrl}/api/documents/${documentId}/content`, { headers: { Cookie: collaboratorCookie, Accept: 'application/octet-stream' } });
    assert.equal(denied.status, 404, `download de ${documentId} deveria ser negado`);
  }

  const forbidden = await fetch(`${session.server.baseUrl}/api/processes/proc-restrito-teste/assignment`, {
    method: 'PATCH',
    headers: { Cookie: collaboratorCookie, 'X-CSRF-Token': logged.csrfToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ teamIds: [], responsibleUserIds: [], expectedRevision: 1 })
  });
  assert.ok([403, 404].includes(forbidden.status), `ação em processo alheio deveria ser negada (recebeu ${forbidden.status})`);

  collaboratorContext = await session.browser.newContext({ viewport: VIEWPORT, locale: 'pt-BR' });
  const [cookieName, cookieValue] = collaboratorCookie.split('=');
  await collaboratorContext.addCookies([{ name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/' }]);
  const { page: collaboratorPage, pageErrors: collaboratorErrors } = await prepareUiV2Page(collaboratorContext, session.server.baseUrl, { theme: 'light' });
  await switchUiV2View(collaboratorPage, 'processes');
  await collaboratorPage.waitForFunction(() => document.querySelector('#view-processes')?.innerText.includes('Cliente Permitido Teste'), null, { timeout: 15000 });
  const visibleText = await collaboratorPage.locator('#view-processes').innerText();
  assert.match(visibleText, /Cliente Permitido Teste/);
  assert.doesNotMatch(visibleText, /Cliente Restrito Teste/);
  assert.deepEqual(collaboratorErrors, []);
  assert.deepEqual(adminErrors, []);

  const adminIds = await adminPage.evaluate(async () => {
    const envelope = await (await window.AtriumAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } })).json();
    return (envelope.state?.processes || []).map(process => process.id);
  });
  assert.ok(adminIds.includes('proc-restrito-teste'));
  assert.ok(adminIds.includes('proc-permitido-teste'));

  console.log('  OK: segundo membro vê só o processo da sua equipe; ação em processo alheio é negada sem derrubar o servidor.');
  console.log('\n[PASS] Isolamento de segundo membro sintético validado.');
} finally {
  if (collaboratorContext) await collaboratorContext.close().catch(() => {});
  await session.stop();
}
