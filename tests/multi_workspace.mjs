import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const frontendOrigin = 'https://app.atrium.example.test';
const server = await startTestServer({ env: { ATRIUM_FRONTEND_ORIGINS: frontendOrigin } });
const password = 'Senha-Multi-2026!';

try {
  let preflight = await fetch(`${server.baseUrl}/api/auth/status`, {
    method: 'OPTIONS',
    headers: { Origin: frontendOrigin, 'Access-Control-Request-Method': 'GET' }
  });
  assert(preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === frontendOrigin, 'Preflight da origem autorizada foi recusado.');
  preflight = await fetch(`${server.baseUrl}/api/auth/status`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://malicioso.example.test', 'Access-Control-Request-Method': 'GET' }
  });
  assert(preflight.status === 403 && !preflight.headers.get('access-control-allow-origin'), 'Origem não autorizada recebeu CORS.');
  const health = await fetch(`${server.baseUrl}/api/health`, { headers: { Origin: frontendOrigin } });
  assert(health.ok && health.headers.get('access-control-allow-origin') === frontendOrigin && health.headers.get('access-control-allow-credentials') === 'true', 'Health check não respondeu ao frontend autorizado.');

  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-a',
    displayName: 'Administradora Teste A',
    email: 'admin-a@example.test',
    workspaceName: 'Escritório Teste A',
    password
  });
  let pending = await response.json();
  assert(response.ok && pending.setupToken, 'Primeiro escritório não iniciou o cadastro.');

  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const first = await response.json();
  const firstCookie = response.headers.get('set-cookie').split(';')[0];
  assert(response.ok && first.user.workspaceId, 'Sessão do primeiro escritório não recebeu workspaceId.');

  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'admin-b',
    displayName: 'Administrador Teste B',
    email: 'admin-b@example.test',
    workspaceName: 'Escritório Teste B',
    password
  });
  pending = await response.json();
  assert(response.ok && pending.setupToken, 'Segundo escritório não iniciou o cadastro independente.');

  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const second = await response.json();
  const secondCookie = response.headers.get('set-cookie').split(';')[0];
  assert(response.ok && second.workspace?.name === 'Escritório Teste B', 'Segundo escritório não foi criado com identidade própria.');
  assert(second.user.workspaceId && second.user.workspaceId !== first.user.workspaceId, 'Os escritórios receberam a mesma identidade.');

  const baseState = label => ({
    version: 1,
    terms: [],
    sources: [],
    intimations: [{ id: `publication-${label}`, title: `Publicação ${label}` }],
    tasks: [],
    processes: [],
    contacts: [],
    agenda: [],
    audit: [],
    settings: { officeName: `Escritório ${label}` }
  });

  response = await postJson(`${server.baseUrl}/api/state`, { state: baseState('A') }, {
    Cookie: firstCookie,
    'X-CSRF-Token': first.csrfToken
  });
  assert(response.ok, 'Primeiro escritório não conseguiu salvar seu estado.');

  response = await postJson(`${server.baseUrl}/api/state`, { state: baseState('B') }, {
    Cookie: secondCookie,
    'X-CSRF-Token': second.csrfToken
  });
  assert(response.ok, 'Segundo escritório não conseguiu salvar seu estado.');

  const firstState = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: firstCookie } })).json();
  const secondState = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: secondCookie } })).json();
  assert(firstState.state?.intimations?.[0]?.title === 'Publicação A', 'Primeiro escritório recebeu dados de outro workspace.');
  assert(secondState.state?.intimations?.[0]?.title === 'Publicação B', 'Segundo escritório recebeu dados de outro workspace.');

  response = await postJson(`${server.baseUrl}/api/integrations/collector/pair`, {}, {
    Cookie: firstCookie,
    'X-CSRF-Token': first.csrfToken
  });
  const firstPairing = await response.json();
  assert(response.status === 201 && firstPairing.token, 'Primeiro escritório não conseguiu parear seu coletor.');
  response = await postJson(`${server.baseUrl}/api/integrations/collector/pair`, {}, {
    Cookie: secondCookie,
    'X-CSRF-Token': second.csrfToken
  });
  const secondPairing = await response.json();
  assert(response.status === 201 && secondPairing.token, 'Segundo escritório não conseguiu parear seu coletor.');
  response = await fetch(`${server.baseUrl}/api/integrations/collector/pair`, { headers: { Cookie: secondCookie } });
  const secondPairingStatus = await response.json();
  assert(response.ok && secondPairingStatus.paired === true && secondPairingStatus.workspaceId === second.user.workspaceId, 'Status do pareamento não refletiu o escritório autenticado.');
  assert(!('token' in secondPairingStatus) && !('tokenHash' in secondPairingStatus), 'Status do pareamento expôs credencial do coletor.');

  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'event-a' }] }, {
    Authorization: `Bearer ${firstPairing.token}`,
    'X-ATRIUM-Workspace-ID': first.user.workspaceId
  });
  assert(response.ok, 'Coletor do primeiro escritório foi recusado.');
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'event-cross' }] }, {
    Authorization: `Bearer ${firstPairing.token}`,
    'X-ATRIUM-Workspace-ID': second.user.workspaceId
  });
  assert(response.status === 401, 'Token de um escritório foi aceito para outro escritório.');
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'event-b' }] }, {
    Authorization: `Bearer ${secondPairing.token}`,
    'X-ATRIUM-Workspace-ID': second.user.workspaceId
  });
  assert(response.ok, 'Coletor do segundo escritório foi recusado.');

  const firstRuntime = await (await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: firstCookie } })).json();
  const secondRuntime = await (await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: secondCookie } })).json();
  assert(firstRuntime.events.some(item => item.id === 'event-a') && !firstRuntime.events.some(item => item.id === 'event-b'), 'Runtime do primeiro escritório não ficou isolado.');
  assert(secondRuntime.events.some(item => item.id === 'event-b') && !secondRuntime.events.some(item => item.id === 'event-a'), 'Runtime do segundo escritório não ficou isolado.');

  const searchResults = await Promise.all([firstCookie, secondCookie].map(async Cookie => {
    const result = await fetch(`${server.baseUrl}/api/search?q=Publica`, { headers: { Cookie } });
    assert(result.ok, 'Busca do escritório falhou.');
    return result.json();
  }));
  assert(!JSON.stringify(searchResults[0].results).includes('Publicação B'), 'Busca A expôs dados de B.');
  assert(!JSON.stringify(searchResults[1].results).includes('Publicação A'), 'Busca B expôs dados de A.');
  response = await fetch(`${server.baseUrl}/api/integrations/collector/pair`, {
    method: 'DELETE', headers: { Cookie: firstCookie, 'X-CSRF-Token': first.csrfToken }
  });
  assert(response.ok, 'Revogação do coletor falhou.');
  response = await postJson(`${server.baseUrl}/api/ingest`, {}, {
    Authorization: `Bearer ${firstPairing.token}`, 'X-ATRIUM-Workspace-ID': first.user.workspaceId
  });
  assert(response.status === 401, 'Token revogado ainda pode ingerir dados.');

  response = await fetch(`${server.baseUrl}/api/integrations/tjrs-sidecar/status`, { headers: { Cookie: secondCookie } });
  assert(response.status === 503, 'Escritório adicional alcançou o sidecar privado compartilhado.');

  response = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    displayName: 'Colaboradora Convidada',
    email: 'convidada@example.test'
  }, { Cookie: firstCookie, 'X-CSRF-Token': first.csrfToken });
  const invite = await response.json();
  assert(response.status === 201 && invite.inviteToken && invite.invitation?.id, 'Administrador não conseguiu gerar convite de equipe.');
  assert(!JSON.stringify(invite.invitation).includes(invite.inviteToken), 'Token do convite foi persistido no objeto público.');
  const firstInvitations = await (await fetch(`${server.baseUrl}/api/auth/invitations`, { headers: { Cookie: firstCookie } })).json();
  const secondInvitations = await (await fetch(`${server.baseUrl}/api/auth/invitations`, { headers: { Cookie: secondCookie } })).json();
  assert(firstInvitations.invitations.length === 1 && secondInvitations.invitations.length === 0, 'Convite de equipe vazou entre escritórios.');
  response = await fetch(`${server.baseUrl}/api/auth/invitations/accept?token=${encodeURIComponent(invite.inviteToken)}`);
  const invitationDetails = await response.json();
  assert(response.ok && invitationDetails.invitation.workspace.id === first.user.workspaceId, 'Convite não permaneceu vinculado ao escritório emissor.');
  response = await postJson(`${server.baseUrl}/api/auth/invitations/accept`, {
    inviteToken: invite.inviteToken,
    username: 'convidada-a',
    password
  });
  const invitedSetup = await response.json();
  assert(response.ok && invitedSetup.setupToken && invitedSetup.manualSecret, 'Convidada não conseguiu definir suas próprias credenciais.');
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: invitedSetup.setupToken,
    code: generateTotp(invitedSetup.manualSecret)
  });
  const invitedVerification = await response.json();
  assert(response.ok && invitedVerification.status === 'active' && invitedVerification.recoveryCodes.length === 8, 'Convite administrativo não ativou a conta protegida por MFA.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: 'convidada-a',
    password,
    code: generateTotp(invitedSetup.manualSecret)
  });
  const invitedLogin = await response.json();
  assert(response.ok && invitedLogin.user.workspaceId === first.user.workspaceId, 'Convidada entrou no escritório incorreto.');
  response = await fetch(`${server.baseUrl}/api/auth/invitations/accept?token=${encodeURIComponent(invite.inviteToken)}`);
  assert(response.status === 401, 'Convite de uso único permaneceu válido após aceitação.');

  const firstUsers = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: firstCookie } })).json();
  const secondUsers = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: secondCookie } })).json();
  assert(firstUsers.users.length === 2 && firstUsers.users.some(user => user.username === 'admin-a') && firstUsers.users.some(user => user.username === 'convidada-a'), 'Lista do primeiro escritório não refletiu a equipe convidada.');
  assert(secondUsers.users.length === 1 && secondUsers.users[0].username === 'admin-b', 'Lista do segundo escritório expôs outro usuário.');

  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: secondUsers.users[0].id,
    status: 'inactive'
  }, { Cookie: firstCookie, 'X-CSRF-Token': first.csrfToken });
  assert(response.status === 404, 'Administrador de um escritório conseguiu alterar usuário de outro escritório.');

  console.log('Multi-workspace isolation tests passed.');
} finally {
  await server.stop();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
