import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer({ env: { JURISFLOW_CLOUD_MODE: 'true' } });

try {
  const master = await setupMaster(server.baseUrl);
  const collaborator = await setupUser(server.baseUrl, master, {
    username: 'colaborador.judicial',
    displayName: 'Colaboradora Judicial Teste',
    email: 'colaborador.judicial@example.test',
    role: 'collaborator'
  });
  const admin = await setupUser(server.baseUrl, master, {
    username: 'admin.judicial',
    displayName: 'Administradora Judicial Teste',
    email: 'admin.judicial@example.test',
    role: 'admin'
  });

  const guardedRoutes = [
    { path: '/api/integrations/judicial/certificate', body: {} },
    { path: '/api/integrations/judicial/2fa', body: { portalId: 'eproc-trf4', remove: true } },
    { path: '/api/integrations/judicial/portals', body: { enabledIds: [] } },
    { path: '/api/integrations/judicial/reset', body: { confirm: 'ZERAR_ACESSOS_JUDICIAIS' } },
    { path: '/api/integrations/judicial/connect', body: { portalIds: [] } },
    { path: '/api/integrations/judicial/portals/eproc-trf4/clear-session', body: {} },
    { path: '/api/integrations/judicial/a1/sandbox', body: {} },
    { path: '/api/integrations/judicial/totp/sandbox', body: {} },
    { path: '/api/integrations/judicial/totp/parse', body: {} }
  ];

  for (const route of guardedRoutes) {
    let response = await postJson(`${server.baseUrl}${route.path}`, route.body);
    assert.equal(response.status, 401, `${route.path} deveria exigir autenticação antes de qualquer resposta operacional.`);

    response = await postJson(`${server.baseUrl}${route.path}`, route.body, collaborator.headers);
    assert.equal(response.status, 403, `${route.path} deveria rejeitar colaborador com 403.`);

    response = await postJson(`${server.baseUrl}${route.path}`, route.body, { Cookie: admin.cookie });
    assert.equal(response.status, 403, `${route.path} deveria preservar a proteção CSRF para admin.`);

    response = await postJson(`${server.baseUrl}${route.path}`, route.body, admin.headers);
    assert(![401, 403].includes(response.status), `${route.path} deveria permitir que admin alcançasse a operação.`);

    response = await postJson(`${server.baseUrl}${route.path}`, route.body, master.headers);
    assert(![401, 403].includes(response.status), `${route.path} deveria permitir que master_admin alcançasse a operação.`);
  }

  let response = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: { Cookie: collaborator.cookie } });
  assert.equal(response.status, 200, 'Status judicial de leitura deve continuar disponível ao colaborador autenticado.');

  response = await fetch(`${server.baseUrl}/api/integrations/judicial/diagnostics`, { headers: { Cookie: collaborator.cookie } });
  assert.equal(response.status, 200, 'Diagnósticos judiciais de leitura não devem ganhar restrição administrativa.');

  response = await postJson(`${server.baseUrl}/api/integrations/judicial/sync`, {}, collaborator.headers);
  assert.equal(response.status, 200, 'Sincronização judicial deve continuar disponível ao colaborador autenticado.');

  console.log('Judicial integration RBAC test aprovado: 401, 403, CSRF, admin, master_admin e rotas não administrativas preservadas.');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'master.judicial',
    displayName: 'Administradora Principal Teste',
    password: 'Master-Judicial-2026!'
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
    headers: { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken }
  };
}

async function setupUser(baseUrl, master, { username, displayName, email, role }) {
  const password = 'Usuario-Judicial-2026!';
  let response = await postJson(`${baseUrl}/api/auth/register`, { username, displayName, email, password });
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
    role
  }, master.headers);
  assert.equal(response.status, 200);

  response = await postJson(`${baseUrl}/api/auth/login`, {
    username,
    password,
    code: generateTotp(registration.manualSecret)
  });
  const login = await response.json();
  assert.equal(response.status, 200);
  assert.equal(login.user.role, role);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    cookie,
    headers: { Cookie: cookie, 'X-CSRF-Token': login.csrfToken }
  };
}
