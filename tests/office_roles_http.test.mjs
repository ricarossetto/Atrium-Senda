import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

// Escalonamento de privilégio: o convidante não concede papel ou permissão
// que ele próprio não possui. Só o titular do escritório concede gestor/titular.
// Contrato de erro: 409 ROLE_ESCALATION. Fixtures sintéticas apenas.

const PRINCIPAL_PASSWORD = 'Senha-Titular-Roles-2026!';
const MANAGER_PASSWORD = 'Senha-Gestor-Roles-2026!';
const ASSOCIATE_PASSWORD = 'Senha-Associado-Roles-2026!';

const MANAGER = { username: 'gestor_roles', displayName: 'Advogada Teste', email: 'gestor.roles@example.test', password: MANAGER_PASSWORD };
const ASSOCIATE = { username: 'associado_roles', displayName: 'Advogada Teste', email: 'associado.roles@example.test', password: ASSOCIATE_PASSWORD };

console.log('\n===============================================================');
console.log('  ATRIUM — ESCALONAMENTO DE PRIVILÉGIO EM CONVITE E NOMEAÇÃO   ');
console.log('===============================================================\n');

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-b2-office-roles-'));
const server = await startTestServer({ dataDirectory });
const auth = (cookie, csrf) => ({ Cookie: cookie, 'X-CSRF-Token': csrf });

async function loginWithTotp({ username, password, manualSecret, setupToken }) {
  let response = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken,
    code: generateTotp(manualSecret)
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username,
    password,
    code: generateTotp(manualSecret)
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie && body.csrfToken, 'Sessão sintética incompleta.');
  return { cookie, csrf: body.csrfToken, id: body.user?.id };
}

async function joinAs(principalHeaders, { username, displayName, email, password, officeRoleId }) {
  let response = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    displayName,
    email,
    officeRoleId,
    sendEmail: false
  }, principalHeaders);
  const invited = await response.json();
  assert.equal(response.status, 201, JSON.stringify(invited));
  response = await postJson(`${server.baseUrl}/api/auth/invitations/accept`, {
    inviteToken: invited.inviteToken,
    username,
    password
  });
  const accepted = await response.json();
  assert.equal(response.status, 200, JSON.stringify(accepted));
  const session = await loginWithTotp({ username, password, manualSecret: accepted.manualSecret, setupToken: accepted.setupToken });
  // O segredo fica disponível para religar a sessão depois de uma promoção,
  // que invalida as sessões abertas do usuário.
  return { ...session, username, password, manualSecret: accepted.manualSecret };
}

// Login novo depois de uma promoção: updateUserStatus encerra as sessões do
// usuário, então é preciso autenticar de novo. O passo TOTP é adiantado para
// não colidir com o passo já consumido no login anterior.
async function loginAfterPromotion({ username, password, manualSecret }) {
  const response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username,
    password,
    code: generateTotp(manualSecret, Math.floor(Date.now() / 30_000) + 1)
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie && body.csrfToken, 'Sessão sintética incompleta.');
  return { cookie, csrf: body.csrfToken, id: body.user?.id, role: body.user?.role, officeRoleId: body.user?.officeRoleId };
}

try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular_roles',
    displayName: 'Advogada Teste',
    email: 'teste@example.test',
    oab: 'OAB/RS 000000',
    oabUf: 'RS',
    password: PRINCIPAL_PASSWORD
  });
  const setup = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setup));
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200, JSON.stringify(verified));
  const principal = {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: verified.csrfToken,
    manualSecret: setup.manualSecret
  };
  assert.ok(principal.cookie && principal.csrf, 'Sessão do titular incompleta.');
  const principalHeaders = auth(principal.cookie, principal.csrf);

  const manager = await joinAs(principalHeaders, { ...MANAGER, officeRoleId: 'office_manager' });
  const associate = await joinAs(principalHeaders, { ...ASSOCIATE, officeRoleId: 'associate' });

  // O titular delega members.manage ao associado sem lhe dar financeiro.
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(associate.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...principalHeaders },
    body: JSON.stringify({ permissionOverrides: ['members.manage'] })
  });
  const delegated = await response.json();
  assert.equal(response.status, 200, JSON.stringify(delegated));
  assert.ok(delegated.member?.permissions?.includes('members.manage'));
  assert.ok(!delegated.member?.permissions?.includes('finance.read'));

  console.log('[C1] Não-titular convida gestor...');
  response = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    displayName: 'Advogada Teste',
    email: 'gestor.convidado@example.test',
    officeRoleId: 'office_manager',
    sendEmail: false
  }, auth(manager.cookie, manager.csrf));
  const escalatedInvite = await response.json();
  assert.equal(response.status, 409, JSON.stringify(escalatedInvite));
  assert.equal(escalatedInvite.code, 'ROLE_ESCALATION');
  assert.match(escalatedInvite.message, /excede o que você pode conceder/);
  console.log('  ✓ 409 ROLE_ESCALATION para convite de gestor por gestor.');

  console.log('[C2] Associado concede financeiro sem ter financeiro...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(manager.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...auth(associate.cookie, associate.csrf) },
    body: JSON.stringify({ permissionOverrides: ['finance.read'] })
  });
  const escalatedPermission = await response.json();
  assert.equal(response.status, 409, JSON.stringify(escalatedPermission));
  assert.equal(escalatedPermission.code, 'ROLE_ESCALATION');
  console.log('  ✓ 409 ROLE_ESCALATION ao conceder permissão ausente no ator.');

  console.log('[C4] Papel fora do catálogo...');
  response = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    displayName: 'Advogada Teste',
    email: 'papel.invalido@example.test',
    officeRoleId: 'super_admin',
    sendEmail: false
  }, principalHeaders);
  const unknownRole = await response.json();
  assert.equal(response.status, 400, JSON.stringify(unknownRole));
  console.log('  ✓ Papel fora do catálogo recusado.');

  console.log('[C5] Permissão fora do catálogo...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(associate.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...principalHeaders },
    body: JSON.stringify({ permissionOverrides: ['finance.approve'] })
  });
  const unknownPermission = await response.json();
  assert.equal(response.status, 409, JSON.stringify(unknownPermission));
  assert.equal(unknownPermission.code, 'ROLE_ESCALATION');
  console.log('  ✓ Permissão fora do catálogo recusada.');

  console.log('[C3] Titular convida gestor...');
  response = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    displayName: 'Advogada Teste',
    email: 'gestor.titular@example.test',
    officeRoleId: 'office_manager',
    sendEmail: false
  }, principalHeaders);
  const allowedInvite = await response.json();
  assert.equal(response.status, 201, JSON.stringify(allowedInvite));
  assert.equal(allowedInvite.invitation?.officeRoleId, 'office_manager');
  console.log('  ✓ Titular concede gestor (201).');

  console.log('[C6] Reenvio não entrega papel que o ator não concede...');
  response = await postJson(`${server.baseUrl}/api/auth/invitations/resend`, {
    invitationId: allowedInvite.invitation.id
  }, auth(manager.cookie, manager.csrf));
  const escalatedResend = await response.json();
  assert.equal(response.status, 409, JSON.stringify(escalatedResend));
  assert.equal(escalatedResend.code, 'ROLE_ESCALATION');
  response = await postJson(`${server.baseUrl}/api/auth/invitations/resend`, {
    invitationId: allowedInvite.invitation.id
  }, principalHeaders);
  assert.equal(response.status, 200, 'Titular deve conseguir reenviar o convite de gestor.');
  console.log('  ✓ Reenvio de convite de gestor restrito ao titular.');

  // ---------------------------------------------------------------
  // A1..A4 — escalonamento na nomeação de membro e no cadastro direto.
  // ---------------------------------------------------------------
  const totpStep = () => Math.floor(Date.now() / 30_000);

  console.log('[A1] Gestor nomeia outro gestor sem office.principal...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(associate.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...auth(manager.cookie, manager.csrf) },
    body: JSON.stringify({ officeRoleId: 'office_manager' })
  });
  const nominationEscalation = await response.json();
  assert.equal(response.status, 409, JSON.stringify(nominationEscalation));
  assert.equal(nominationEscalation.code, 'ROLE_ESCALATION');
  console.log('  ✓ 409 ROLE_ESCALATION ao nomear gestor sem office.principal.');

  console.log('[A2] Cadastro direto com papel fora do catálogo...');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'papel_fora_catalogo',
    displayName: 'Advogada Teste',
    email: 'papel.fora.catalogo@example.test',
    password: 'Senha-Registro-Roles-2026!',
    officeRoleId: 'super_admin'
  }, principalHeaders);
  const registerUnknownRole = await response.json();
  assert.equal(response.status, 400, JSON.stringify(registerUnknownRole));
  assert.match(registerUnknownRole.message, /Papel do escritório inválido/);
  console.log('  ✓ 400 ao cadastrar papel fora do catálogo.');

  console.log('[A3] Cadastro direto com papel incompatível com o tipo de membro...');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'tipo_incompativel',
    displayName: 'Advogada Teste',
    email: 'tipo.incompativel@example.test',
    password: 'Senha-Registro-Roles-2026!',
    memberKind: 'lawyer',
    officeRoleId: 'finance'
  }, principalHeaders);
  const registerKindMismatch = await response.json();
  assert.equal(response.status, 400, JSON.stringify(registerKindMismatch));
  assert.equal(registerKindMismatch.message, 'Este papel não é compatível com o tipo de membro.');
  console.log('  ✓ 400 ao cadastrar advogado no papel financeiro.');

  console.log('[A4] Ator com papel legado admin cadastra titular...');
  // A rota /api/auth/register passa antes por assertAdmin, que aceita apenas o
  // papel legado master_admin/admin. Um membro comum receberia 403 antes da
  // checagem de escalonamento; por isso o ator é promovido ao papel legado
  // admin mantendo officeRoleId 'office_manager' (sem office.principal).
  const legacyAdmin = await joinAs(principalHeaders, {
    username: 'admin_legado_roles',
    displayName: 'Advogada Teste',
    email: 'admin.legado.roles@example.test',
    password: 'Senha-Admin-Legado-Roles-2026!',
    officeRoleId: 'office_manager'
  });
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: legacyAdmin.id,
    status: 'active',
    role: 'admin',
    password: PRINCIPAL_PASSWORD,
    code: generateTotp(principal.manualSecret, totpStep() + 1)
  }, principalHeaders);
  const promotedLegacyAdmin = await response.json();
  assert.equal(response.status, 200, JSON.stringify(promotedLegacyAdmin));
  assert.equal(promotedLegacyAdmin.user?.role, 'admin');
  const legacyAdminSession = await loginAfterPromotion(legacyAdmin);
  // Fixture decisiva: papel legado privilegiado, papel de escritório sem titularidade.
  assert.equal(legacyAdminSession.role, 'admin', 'O ator precisa do papel legado admin para alcançar a checagem de escalonamento.');
  assert.equal(legacyAdminSession.officeRoleId, 'office_manager', 'O ator não pode ser o titular do escritório.');
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'titular_promovido',
    displayName: 'Advogada Teste',
    email: 'titular.promovido@example.test',
    password: 'Senha-Registro-Roles-2026!',
    memberKind: 'lawyer',
    officeRoleId: 'office_principal'
  }, auth(legacyAdminSession.cookie, legacyAdminSession.csrf));
  const registerEscalation = await response.json();
  assert.equal(response.status, 409, JSON.stringify(registerEscalation));
  assert.equal(registerEscalation.code, 'ROLE_ESCALATION');
  console.log('  ✓ 409 ROLE_ESCALATION: papel legado admin não concede titularidade.');

  // ---------------------------------------------------------------
  // B1..B6 — gestão de papéis do escritório.
  // ---------------------------------------------------------------
  console.log('[B1] Listagem de papéis e catálogo de permissões...');
  response = await fetch(`${server.baseUrl}/api/office/roles`, { headers: { Accept: 'application/json', ...principalHeaders } });
  const rolesList = await response.json();
  assert.equal(response.status, 200, JSON.stringify(rolesList));
  assert.ok(Array.isArray(rolesList.roles) && rolesList.roles.length >= 9, 'A lista deve trazer os papéis de fábrica.');
  assert.ok(rolesList.roles.some(role => role.id === 'office_principal'));
  assert.ok(Array.isArray(rolesList.permissions) && rolesList.permissions.length > 0, 'O catálogo de permissões deve vir na resposta.');
  assert.ok(rolesList.permissions.every(item => typeof item.id === 'string' && typeof item.risk === 'string' && typeof item.riskNote === 'string'), 'Cada permissão deve trazer risco e explicação.');
  assert.ok(Array.isArray(rolesList.factoryRoleIds) && rolesList.factoryRoleIds.includes('office_manager'));
  console.log('  ✓ Papéis e catálogo com risco devolvidos.');

  console.log('[B2] Papel com permissão fora do catálogo...');
  response = await postJson(`${server.baseUrl}/api/office/roles`, {
    name: 'Papel Inválido Teste',
    permissions: ['finance.approve']
  }, principalHeaders);
  const roleUnknownPermission = await response.json();
  assert.equal(response.status, 400, JSON.stringify(roleUnknownPermission));
  assert.match(roleUnknownPermission.message, /Permissão do escritório inválida/);
  console.log('  ✓ 400 para permissão fora do catálogo.');

  console.log('[B3] Ator sem roles.manage...');
  response = await postJson(`${server.baseUrl}/api/office/roles`, {
    name: 'Papel Sem Permissão Teste',
    permissions: ['ai.use']
  }, auth(associate.cookie, associate.csrf));
  const roleForbidden = await response.json();
  assert.equal(response.status, 403, JSON.stringify(roleForbidden));
  console.log('  ✓ 403 sem roles.manage.');

  console.log('[B4] Gestor cria papel com office.principal...');
  response = await postJson(`${server.baseUrl}/api/office/roles`, {
    name: 'Papel Titular Teste',
    permissions: ['office.principal']
  }, auth(manager.cookie, manager.csrf));
  const roleEscalated = await response.json();
  assert.equal(response.status, 409, JSON.stringify(roleEscalated));
  assert.equal(roleEscalated.code, 'ROLE_ESCALATION');
  console.log('  ✓ 409 ROLE_ESCALATION ao conceder office.principal sem titularidade.');

  console.log('[B5] Titular cria papel próprio...');
  response = await postJson(`${server.baseUrl}/api/office/roles`, {
    name: 'Correspondente Teste',
    description: 'Papel sintético para teste HTTP.',
    permissions: ['processes.create', 'ai.use']
  }, principalHeaders);
  const createdRole = await response.json();
  assert.equal(response.status, 201, JSON.stringify(createdRole));
  assert.ok(createdRole.role?.id, 'O papel criado deve ter identificador.');
  assert.deepEqual(createdRole.role.permissions.sort(), ['ai.use', 'processes.create']);
  const customRoleId = createdRole.role.id;
  console.log('  ✓ 201 ao criar papel próprio.');

  console.log('[B6] Excluir papel em uso...');
  response = await fetch(`${server.baseUrl}/api/office/members/${encodeURIComponent(associate.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...principalHeaders },
    body: JSON.stringify({ officeRoleId: customRoleId })
  });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  response = await fetch(`${server.baseUrl}/api/office/roles/${encodeURIComponent(customRoleId)}`, { method: 'DELETE', headers: { Accept: 'application/json', ...principalHeaders } });
  const roleInUse = await response.json();
  assert.equal(response.status, 409, JSON.stringify(roleInUse));
  assert.match(roleInUse.message, /está atribuído/);
  assert.match(roleInUse.message, /Pessoas e equipes/);
  console.log('  ✓ 409 ao excluir papel em uso, com orientação.');

  console.log('[B7] Papel de fábrica não pode ser excluído...');
  response = await fetch(`${server.baseUrl}/api/office/roles/office_manager`, { method: 'DELETE', headers: { Accept: 'application/json', ...principalHeaders } });
  assert.equal(response.status, 403, JSON.stringify(await response.json()));
  console.log('  ✓ 403 ao tentar excluir papel de fábrica.');

  console.log('\n>>> ESCALONAMENTO DE PRIVILÉGIO: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
