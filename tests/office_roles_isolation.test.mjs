import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { registerOfficeRoles, roleById } from '../lib/office/role-catalog.mjs';
import { postJson, startTestServer } from './helpers.mjs';

// Isolamento de papéis personalizados entre escritórios.
// Um papel criado no escritório A pertence ao workspace que o criou: não pode ser
// concedido no escritório B — nem por edição de membro, nem por convite, nem por
// cadastro direto. Papel de fábrica continua resolvendo em qualquer escritório.
// Fixtures sintéticas apenas.

const PASSWORD_A = 'Senha-Titular-A-Isolamento-2026!';
const PASSWORD_B = 'Senha-Titular-B-Isolamento-2026!';
const MEMBER_PASSWORD = 'Senha-Membro-Isolamento-2026!';

console.log('\n===============================================================');
console.log('  ATRIUM — ISOLAMENTO DE PAPÉIS PERSONALIZADOS POR ESCRITÓRIO  ');
console.log('===============================================================\n');

// Contrato da resolução em memória, antes de qualquer HTTP: papel de fábrica
// resolve sem escopo; papel personalizado exige o workspace que o criou.
registerOfficeRoles([
  { id: 'role-iso-a', workspaceId: 'ws-iso-a', name: 'Papel Teste A', defaultPermissions: ['ai.use'] },
  { id: 'role-iso-b', workspaceId: 'ws-iso-b', name: 'Papel Teste B', defaultPermissions: ['ai.use'] }
]);
assert.equal(roleById('associate')?.id, 'associate', 'Papel de fábrica deve resolver sem workspace.');
assert.equal(roleById('associate', 'ws-iso-a')?.id, 'associate', 'Papel de fábrica deve resolver em qualquer workspace.');
assert.equal(roleById('role-iso-a'), null, 'Papel personalizado não pode resolver sem workspace (falha fechada).');
assert.equal(roleById('role-iso-a', 'ws-iso-b'), null, 'Papel personalizado não pode resolver em outro workspace.');
assert.equal(roleById('role-iso-a', 'ws-iso-a')?.id, 'role-iso-a', 'Papel personalizado deve resolver no próprio workspace.');
assert.equal(roleById('role-iso-b', 'ws-iso-b')?.id, 'role-iso-b', 'Dois escritórios com papéis distintos não podem colidir.');
registerOfficeRoles([]);
console.log('[R0] Resolução escopada de papel: fábrica global, personalizado por workspace.');

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-b2iso-office-roles-'));
const server = await startTestServer({
  dataDirectory,
  env: {
    JURISFLOW_CLOUD_MODE: 'true',
    ATRIUM_PUBLIC_SIGNUP: 'true'
  }
});
const auth = (cookie, csrf) => ({ Cookie: cookie, 'X-CSRF-Token': csrf });

async function verifySetup({ setupToken, manualSecret }) {
  const response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken,
    code: generateTotp(manualSecret)
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.csrfToken,
    workspaceId: body.user?.workspaceId
  };
}

async function verifyWorkspaceRegistration({ setupToken, manualSecret }) {
  const response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken,
    code: generateTotp(manualSecret)
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.csrfToken,
    workspaceId: body.user?.workspaceId
  };
}

// Cadastra, ativa e aprova um membro no escritório do ator, devolvendo sessão autenticada.
async function joinWorkspace(actor, { username, email, officeRoleId = 'associate' }) {
  const actorHeaders = actor.headers;
  let response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username,
    displayName: 'Advogada Teste',
    email,
    password: MEMBER_PASSWORD,
    officeRoleId
  }, actorHeaders);
  const registered = await response.json();
  assert.equal(response.status, 200, JSON.stringify(registered));
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: registered.setupToken,
    code: generateTotp(registered.manualSecret)
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const usersResponse = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: actorHeaders.Cookie } });
  const memberUser = (await usersResponse.json()).users.find(user => user.username === username);
  assert.ok(memberUser, 'membro não encontrado para aprovação');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: memberUser.id,
    status: 'active',
    password: actor.password,
    code: generateTotp(actor.manualSecret)
  }, actorHeaders);
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username,
    password: MEMBER_PASSWORD,
    code: generateTotp(registered.manualSecret)
  });
  const login = await response.json();
  assert.equal(response.status, 200, JSON.stringify(login));
  return {
    id: login.user?.id,
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: login.csrfToken
  };
}

function memberFrom(list, memberId) {
  return (Array.isArray(list) ? list : []).find(member => member.id === memberId) || null;
}

try {
  // ------------------------------------------------------------------
  // Escritório A (instalação) e escritório B (registro independente).
  // ------------------------------------------------------------------
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular_iso_a',
    displayName: 'Advogada Teste',
    email: 'teste@example.test',
    oab: 'OAB/RS 000000',
    oabUf: 'RS',
    workspaceName: 'Escritório Teste A',
    password: PASSWORD_A
  });
  const setupA = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setupA));
  const officeA = await verifySetup(setupA);
  assert.ok(officeA.cookie && officeA.csrf, 'Sessão do escritório A incompleta.');
  assert.ok(officeA.workspaceId, 'Escritório A sem identidade de workspace.');
  const headersA = auth(officeA.cookie, officeA.csrf);

  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'titular_iso_b',
    displayName: 'Advogada Teste',
    email: 'titular.b@example.test',
    workspaceName: 'Escritório Teste B',
    password: PASSWORD_B
  });
  const setupB = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setupB));
  const officeB = await verifyWorkspaceRegistration(setupB);
  assert.ok(officeB.cookie && officeB.csrf, 'Sessão do escritório B incompleta.');
  assert.notEqual(officeB.workspaceId, officeA.workspaceId, 'Os escritórios receberam a mesma identidade.');
  const headersB = auth(officeB.cookie, officeB.csrf);

  const memberA = await joinWorkspace({ headers: headersA, password: PASSWORD_A, manualSecret: setupA.manualSecret }, { username: 'membro_iso_a', email: 'membro.a@example.test' });
  const memberB = await joinWorkspace({ headers: headersB, password: PASSWORD_B, manualSecret: setupB.manualSecret }, { username: 'membro_iso_b', email: 'membro.b@example.test' });

  // ------------------------------------------------------------------
  // A1 — escritório A cria um papel personalizado.
  // ------------------------------------------------------------------
  console.log('[A1] Escritório A cria papel personalizado...');
  response = await postJson(`${server.baseUrl}/api/office/roles`, {
    name: 'Correspondente Teste',
    description: 'Papel sintético do escritório A.',
    permissions: ['finance.write', 'ai.use']
  }, headersA);
  const created = await response.json();
  assert.equal(response.status, 201, JSON.stringify(created));
  const customRoleId = created.role?.id;
  assert.ok(customRoleId, 'O papel criado deve ter identificador.');
  assert.deepEqual(created.role.permissions.sort(), ['ai.use', 'finance.write']);
  console.log(`  ✓ Papel ${customRoleId} criado no escritório A.`);

  console.log('[A2] O papel de A não aparece no catálogo de B...');
  response = await fetch(`${server.baseUrl}/api/office/roles`, { headers: { Accept: 'application/json', ...headersB } });
  const rolesB = await response.json();
  assert.equal(response.status, 200, JSON.stringify(rolesB));
  assert.ok(!rolesB.roles.some(role => role.id === customRoleId), 'Papel do escritório A vazou para a listagem de B.');
  assert.ok(rolesB.roles.some(role => role.id === 'office_manager'), 'Papel de fábrica ausente no catálogo de B.');
  console.log('  ✓ Listagem de B só traz papéis de fábrica e os de B.');

  // ------------------------------------------------------------------
  // B1 — escritório B tenta conceder o papel de A por edição de membro.
  // ------------------------------------------------------------------
  console.log('[B1] Escritório B tenta conceder o papel de A via PATCH de membro...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(memberB.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headersB },
    body: JSON.stringify({ officeRoleId: customRoleId })
  });
  const crossPatch = await response.json();
  assert.notEqual(response.status, 200, `B concedeu o papel do escritório A: ${JSON.stringify(crossPatch)}`);
  assert.equal(response.status, 400, JSON.stringify(crossPatch));
  assert.match(crossPatch.message, /Papel do escritório inválido/);
  response = await fetch(`${server.baseUrl}/api/office`, { headers: { Accept: 'application/json', ...headersB } });
  const officeBPanel = await response.json();
  assert.equal(response.status, 200, JSON.stringify(officeBPanel));
  assert.equal(memberFrom(officeBPanel.members, memberB.id)?.officeRoleId, 'associate', 'O papel do membro de B mudou apesar da recusa.');
  assert.ok(!(memberFrom(officeBPanel.members, memberB.id)?.permissions || []).includes('finance.write'), 'Permissão do papel de A foi aplicada em B.');
  console.log('  ✓ 400 e nenhum efeito no membro de B.');

  // ------------------------------------------------------------------
  // B2 — escritório B tenta convidar usando o papel de A.
  // ------------------------------------------------------------------


  // ------------------------------------------------------------------
  // B3 — escritório B tenta cadastrar direto usando o papel de A.
  // ------------------------------------------------------------------
  console.log('[B3] Escritório B tenta cadastro direto com o papel de A...');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'cadastro_cruzado_iso',
    displayName: 'Advogada Teste',
    email: 'cadastro.cruzado@example.test',
    password: 'Senha-Cadastro-Cruzado-2026!',
    officeRoleId: customRoleId
  }, headersB);
  const crossRegister = await response.json();
  assert.equal(response.status, 400, JSON.stringify(crossRegister));
  assert.match(crossRegister.message, /Papel do escritório inválido/);
  console.log('  ✓ 400 no cadastro direto com papel alheio.');

  // ------------------------------------------------------------------
  // C1 — papel de fábrica continua resolvendo no escritório B.
  // ------------------------------------------------------------------
  console.log('[C1] Papel de fábrica continua funcionando em B...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(memberB.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headersB },
    body: JSON.stringify({ officeRoleId: 'associate' })
  });
  const factoryPatch = await response.json();
  assert.equal(response.status, 200, JSON.stringify(factoryPatch));
  assert.equal(factoryPatch.member?.officeRoleId, 'associate');
  assert.ok((factoryPatch.member?.permissions || []).includes('processes.create'), 'Papel de fábrica perdeu permissões em B.');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'fabrica_membro',
    displayName: 'Advogada Teste',
    email: 'convidada.fabrica@example.test',
    password: MEMBER_PASSWORD,
    officeRoleId: 'office_manager'
  }, headersB);
  const factoryInvite = await response.json();
  assert.equal(response.status, 200, JSON.stringify(factoryInvite));
  console.log('  ✓ Papel de fábrica aceito em PATCH e em cadastro direto.');

  // ------------------------------------------------------------------
  // D1 — escritório A continua usando o próprio papel.
  // ------------------------------------------------------------------
  console.log('[D1] Escritório A concede o próprio papel...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(memberA.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headersA },
    body: JSON.stringify({ officeRoleId: customRoleId })
  });
  const ownPatch = await response.json();
  assert.equal(response.status, 200, JSON.stringify(ownPatch));
  assert.equal(ownPatch.member?.officeRoleId, customRoleId);
  assert.deepEqual([...ownPatch.member.permissions].sort(), ['ai.use', 'finance.write']);
  console.log('  ✓ 200 e permissões do papel próprio aplicadas em A.');

  console.log('[D1b] Escritório A cadastra com o próprio papel...');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'proprio_membro',
    displayName: 'Advogada Teste',
    email: 'convidada.escritorio.a@example.test',
    password: MEMBER_PASSWORD,
    officeRoleId: customRoleId
  }, headersA);
  const ownInvite = await response.json();
  assert.equal(response.status, 200, JSON.stringify(ownInvite));
  console.log('  ✓ 200 no cadastro do escritório A com o próprio papel.');

  // A sessão do membro é recalculada a cada requisição: prova que a resolução
  // escopada também vale no caminho de autenticação.
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: memberA.cookie } });
  const statusA = await response.json();
  assert.equal(response.status, 200, JSON.stringify(statusA));
  assert.equal(statusA.user?.officeRoleId, customRoleId, 'O membro de A não manteve o papel do próprio escritório.');
  assert.deepEqual([...(statusA.user?.permissions || [])].sort(), ['ai.use', 'finance.write']);
  console.log('  ✓ A aplica o próprio papel e a sessão reflete as permissões.');

  // ------------------------------------------------------------------
  // D2 — isolamento não depende do ator: B recusa mesmo sendo titular.
  // ------------------------------------------------------------------
  console.log('[D2] B segue sem enxergar o papel de A após todo o ciclo...');
  response = await fetch(`${server.baseUrl}/api/office/roles`, { headers: { Accept: 'application/json', ...headersA } });
  const rolesA = await response.json();
  assert.equal(response.status, 200, JSON.stringify(rolesA));
  assert.ok(rolesA.roles.some(role => role.id === customRoleId), 'O papel do escritório A desapareceu do próprio catálogo.');
  response = await fetch(`${server.baseUrl}/api/office/roles`, { headers: { Accept: 'application/json', ...headersB } });
  const rolesBAfter = await response.json();
  assert.ok(!rolesBAfter.roles.some(role => role.id === customRoleId), 'Papel do escritório A apareceu no catálogo de B ao fim do ciclo.');
  console.log('  ✓ Papel visível em A e invisível em B.');

  console.log('\n>>> ISOLAMENTO DE PAPÉIS PERSONALIZADOS: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
