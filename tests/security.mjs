import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { mock } from 'node:test';
import os from 'node:os';
import path from 'node:path';

// O anti-replay de TOTP consome cada passo de 30s uma única vez por usuário.
// Re-logins sintéticos avançam o contador monotonicamente e, quando o passo
// seguinte cairia fora da janela ±1, aguardam o relógio alcançar a janela.
const consumedTotpSteps = new Map();
async function freshTotp(secret) {
  const counter = () => Math.floor(Date.now() / 30_000);
  let target = consumedTotpSteps.has(secret) ? consumedTotpSteps.get(secret) + 1 : counter();
  while (target > counter() + 1) await new Promise(resolve => setTimeout(resolve, 1_000));
  target = Math.max(target, counter());
  consumedTotpSteps.set(secret, target);
  return generateTotp(secret, target);
}

async function expectRejection(operation, predicate, message) {
  try {
    await operation();
  } catch (error) {
    if (predicate(error)) return error;
    throw new Error(`${message} (erro inesperado: statusCode=${error?.statusCode})`);
  }
  throw new Error(message);
}

const server = await startTestServer();
const password = 'Senha-2026';
try {
  let response = await fetch(`${server.baseUrl}/api/auth/status`); let payload = await response.json();
  assert(response.ok && !payload.configured && !payload.authenticated, 'Estado inicial de autenticação incorreto.');
  response = await fetch(`${server.baseUrl}/api/status`); assert(response.status === 401, 'API jurídica acessível sem autenticação.');
  response = await fetch(`${server.baseUrl}/api/state`); assert(response.status === 401, 'Estado jurídico acessível sem autenticação.');
  response = await fetch(`${server.baseUrl}/.env`); assert(response.status === 404, 'O arquivo .env ficou acessível pela web.');
  response = await fetch(`${server.baseUrl}/data/security.json`); assert(response.status === 404, 'O banco de autenticação ficou acessível pela web.');
  assert(response.headers.get('x-frame-options') === 'DENY', 'Proteção contra iframe ausente.');
  assert(Boolean(response.headers.get('content-security-policy')), 'CSP ausente.');
  assert(!response.headers.get('content-security-policy').includes('https:'), 'CSP ainda autoriza recursos externos.');
  response = await fetch(`${server.baseUrl}/assets/fonts/inter-400.ttf`);
  assert(response.ok && response.headers.get('content-type') === 'font/ttf', 'Fonte local protegida não foi servida corretamente.');

  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', email: 'admin@example.test', password: 'Senha-202' });
  assert(response.status === 400, 'Senha com menos de 10 caracteres foi aceita.');
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', email: 'email-invalido', password });
  assert(response.status === 400, 'E-mail inválido foi aceito no primeiro acesso.');
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', email: 'admin@example.test', oab: '000000', password });
  assert(response.status === 400, 'OAB sem UF foi aceita no primeiro acesso.');
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', email: 'admin@example.test', enableMonitoring: true, password });
  assert(response.status === 400, 'Monitoramento automático sem OAB e UF foi aceito.');
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', email: 'admin@example.test', oab: '000000', oabUf: 'RS', enableMonitoring: true, password }); payload = await response.json();
  assert(response.ok && payload.setupToken && payload.manualSecret && payload.qrCode.startsWith('data:image/png'), 'Configuração TOTP não foi iniciada.');

  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: payload.setupToken, code: generateTotp(payload.manualSecret) });
  const verified = await response.json();
  assert(response.ok && verified.recoveryCodes.length === 8, 'Segundo fator não foi ativado.');
  assert(verified.user.email === 'admin@example.test' && verified.user.oab === '000000' && verified.user.oabUf === 'RS' && verified.user.judicialMonitoringEnabled === true, 'E-mail, OAB e escolha de monitoramento do responsável não foram preservados no perfil mestre.');
  const cookie = response.headers.get('set-cookie').split(';')[0]; const csrf = verified.csrfToken; const recovery = verified.recoveryCodes[0];

  const collaboratorPassword = 'Colaborador-2026!';
  response = await postJson(`${server.baseUrl}/api/auth/register`, { username: 'colaborador', displayName: 'Pessoa Colaboradora', email: 'colaborador@example.test', password: collaboratorPassword }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  const registration = await response.json();
  assert(response.ok && registration.setupToken && registration.manualSecret && registration.qrCode.startsWith('data:image/png'), 'Cadastro de colaborador não exigiu configuração TOTP.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'colaborador', password: collaboratorPassword, code: generateTotp(registration.manualSecret) });
  assert(response.status === 401, 'Cadastro incompleto conseguiu autenticar antes de confirmar o TOTP.');
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, code: generateTotp(registration.manualSecret) });
  assert(response.ok && (await response.json()).status === 'pending_approval', 'Novo colaborador não ficou pendente de aprovação.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'colaborador', password: collaboratorPassword, code: generateTotp(registration.manualSecret) });
  assert(response.status === 403, 'Colaborador acessou o sistema antes da aprovação administrativa.');
  response = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: cookie } });
  const collaborator = (await response.json()).users.find(user => user.username === 'colaborador');
  assert(response.ok && collaborator?.status === 'pending_approval', 'Administrador não visualizou a solicitação pendente.');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'active', password, code: generateTotp(payload.manualSecret) }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'Administrador não conseguiu aprovar o colaborador.');
  const managedUser = (await response.json()).user;
  assert(managedUser?.id === collaborator.id && managedUser.status === 'active', 'Resposta da gestão deve preservar os campos públicos.');
  for (const field of ['passwordHash', 'salt', 'encryptedTotp', 'recoverySalt', 'recoveryHashes']) {
    assert(!Object.hasOwn(managedUser, field), `Resposta da gestão expôs ${field}.`);
  }
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'colaborador', password: collaboratorPassword });
  assert(response.status === 401, 'Colaborador aprovado conseguiu entrar sem o segundo fator.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'colaborador', password: collaboratorPassword, code: generateTotp(registration.manualSecret), trustBrowser: true });
  const collaboratorLogin = await response.json();
  const collaboratorCookies = response.headers.getSetCookie();
  const collaboratorSessionCookie = collaboratorCookies.map(value => value.split(';')[0]).find(value => value.startsWith('keller_session='));
  const collaboratorTrustedCookie = collaboratorCookies.map(value => value.split(';')[0]).find(value => value.startsWith('keller_trusted='));
  assert(response.ok && collaboratorLogin.user.role === 'collaborator' && collaboratorSessionCookie && collaboratorTrustedCookie, 'Login TOTP do colaborador não preservou sua função.');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'inactive' }, { Cookie: collaboratorSessionCookie, 'X-CSRF-Token': collaboratorLogin.csrfToken });
  assert(response.status === 403, 'Colaborador conseguiu gerenciar contas administrativas.');
  response = await postJson(`${server.baseUrl}/api/ai/configure`, { apiKey: 'chave-de-teste-que-nao-deve-ser-usada' }, { Cookie: collaboratorSessionCookie, 'X-CSRF-Token': collaboratorLogin.csrfToken });
  assert(response.status === 403, 'Colaborador conseguiu configurar a chave compartilhada de IA.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: collaboratorTrustedCookie } });
  const collaboratorTrustedStatus = await response.json();
  assert(response.ok && collaboratorTrustedStatus.user.username === 'colaborador' && collaboratorTrustedStatus.user.role === 'collaborator', 'Navegador confiável trocou a identidade ou a função do colaborador.');

  // Backup criptografado: criação é exclusiva do administrador principal.
  response = await postJson(`${server.baseUrl}/api/system/backup/create`, {}, { Cookie: collaboratorSessionCookie, 'X-CSRF-Token': collaboratorLogin.csrfToken });
  assert(response.status === 403, 'Colaborador conseguiu criar backup criptografado do escritório.');

  // Monitores INPI: mutações exigem CSRF como a rota de varredura.
  response = await postJson(`${server.baseUrl}/api/integrations/inpi/custom-monitors`, { term: 'MARCA TESTE', type: 'marca' }, { Cookie: cookie });
  assert(response.status === 403, 'Mutação de monitores INPI foi aceita sem CSRF.');
  response = await postJson(`${server.baseUrl}/api/integrations/inpi/custom-monitors`, { term: 'MARCA TESTE', type: 'marca' }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status !== 403, 'Mutação de monitores INPI com CSRF foi recusada pela checagem de CSRF.');

  // Re-inscrição de 2FA não substitui o fator ativo sem desativá-lo antes.
  response = await postJson(`${server.baseUrl}/api/auth/mfa/enable`, { password, totpSecret: 'JBSWY3DPEHPK3PXP', code: generateTotp('JBSWY3DPEHPK3PXP') }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 409, '2FA ativo foi substituído sem exigir a desativação do fator atual.');

  // Chat do assistente tem limite por minuto (30) mesmo sem provedor configurado.
  let chatLimited = false;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    response = await postJson(`${server.baseUrl}/api/ai/chat`, { message: `ping sintético ${attempt}` }, { Cookie: cookie, 'X-CSRF-Token': csrf });
    if (response.status === 429) { chatLimited = true; break; }
  }
  assert(chatLimited, 'Chat do assistente aceitou mais de 30 requisições no mesmo minuto.');
  response = await postJson(`${server.baseUrl}/api/auth/trusted-device/revoke`, {}, { Cookie: collaboratorTrustedCookie, 'X-CSRF-Token': collaboratorTrustedStatus.csrfToken });
  assert(response.ok, 'Colaborador não conseguiu revogar seu navegador confiável.');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, role: 'master_admin', password, code: generateTotp(payload.manualSecret) }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 400, 'Administrador conseguiu criar outro master_admin por payload arbitrário.');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'inactive', password, code: generateTotp(payload.manualSecret) }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'Administrador não conseguiu desativar o colaborador.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: collaboratorSessionCookie } });
  assert(!(await response.json()).authenticated, 'Sessão privilegiada obsoleta permaneceu válida após desativação do usuário.');

  response = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } }); assert(response.ok, 'Sessão autenticada não acessou a API.');
  response = await postJson(`${server.baseUrl}/api/calendar/configure`, { calendarUrl: 'http://127.0.0.1:8080/private.ics' }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 400, 'Agenda externa aceitou protocolo inseguro ou endereço local.');
  response = await postJson(`${server.baseUrl}/api/calendar/configure`, { calendarUrl: 'https://localhost/private.ics' }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 400, 'Agenda externa aceitou acesso ao localhost por HTTPS.');
  response = await postJson(`${server.baseUrl}/api/calendar/configure`, { calendarUrl: 'https://usuario:senha@example.com/calendar.ics' }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 400, 'Agenda externa aceitou credenciais embutidas na URL.');
  response = await postJson(`${server.baseUrl}/api/sync`, {}, { Cookie: cookie }); assert(response.status === 403, 'POST autenticado foi aceito sem CSRF.');
  response = await postJson(`${server.baseUrl}/api/sync`, {}, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'POST com sessão e CSRF foi recusado.');
  const protectedState = { version: 1, terms: [], sources: [], intimations: [{ id: 'secret', title: 'Segredo de teste' }], tasks: [], processes: [], agenda: [], audit: [], settings: { geminiApiKey: 'AIzaSy-chave-que-nao-pode-voltar-ao-browser' } };
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie }); assert(response.status === 403, 'Estado foi gravado sem CSRF.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'Estado autenticado não foi gravado.');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'inactive', password, code: generateTotp(payload.manualSecret) }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'Gestão após inicialização do estado falhou.');
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const manageAudit = (await response.json()).state.audit;
  assert(manageAudit.some(entry => entry.action === 'Usuário atualizado' && entry.actor === 'admin' && entry.detail.includes(collaborator.id)), 'Gestão de usuário deve registrar ator e alvo oficiais sem credenciais.');
  const encryptedFile = await readFile(path.join(server.dataDirectory, 'app-state.json'), 'utf8');
  assert(!encryptedFile.includes('Segredo de teste') && encryptedFile.includes('aes-256-gcm'), 'Dados jurídicos não ficaram criptografados em repouso.');
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const recoveredState = await response.json();
  assert(recoveredState.state.intimations[0].title === 'Segredo de teste' && recoveredState.revision, 'Estado criptografado não pôde ser recuperado após autenticação.');
  assert(!recoveredState.state.settings.geminiApiKey, 'A chave de IA foi devolvida ao navegador dentro do estado compartilhado.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 409, 'Uma aba desatualizada conseguiu sobrescrever o estado mais recente.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState, revision: recoveredState.revision }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'A versão atual do estado não pôde ser salva.');

  const raceBase = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  const raceStates = ['A', 'B'].map(label => ({
    ...structuredClone(raceBase.state),
    settings: { ...raceBase.state.settings, officeName: `Escritório corrida ${label}` },
    audit: [{ id: `audit-race-${label}`, at: '2000-01-01T00:00:00.000Z', action: `Corrida ${label}`, detail: 'Fixture concorrente', actor: 'Ator forjado' }, ...(raceBase.state.audit || [])]
  }));
  const raceResponses = await Promise.all(raceStates.map(state => postJson(`${server.baseUrl}/api/state`, {
    state,
    revision: raceBase.revision
  }, { Cookie: cookie, 'X-CSRF-Token': csrf })));
  assert(JSON.stringify(raceResponses.map(item => item.status).sort()) === JSON.stringify([200, 409]), 'Duas gravações com a mesma revision não foram serializadas em 200/409.');
  const raceWinner = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  const canonicalAudit = raceWinner.state.audit.find(item => /^audit-race-/.test(item.id));
  assert(canonicalAudit && canonicalAudit.actor === 'Advogado Administrador' && canonicalAudit.at !== '2000-01-01T00:00:00.000Z', 'Audit novo não foi canonizado no servidor.');
  const preservedAuditId = canonicalAudit.id;
  const auditDeletionAttempt = structuredClone(raceWinner.state);
  auditDeletionAttempt.audit = [];
  response = await postJson(`${server.baseUrl}/api/state`, { state: auditDeletionAttempt, revision: raceWinner.revision }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'Gravação válida após corrida foi recusada.');
  const auditPreserved = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  assert(auditPreserved.state.audit.some(item => item.id === preservedAuditId), 'Cliente conseguiu apagar audit persistido.');

  const ingestResponses = await Promise.all(['A', 'B'].map(label => postJson(`${server.baseUrl}/api/ingest`, {
    events: [{ id: `collector-event-${label}`, title: `Evento sintético ${label}` }], tasks: [], intimations: [], sources: [],
    processes: label === 'A' ? [{ id: 'collector-secret', number: '0000001-11.2026.8.21.0001', client: 'Cliente sigiloso do coletor' }] : []
  }, { Authorization: `Bearer ${server.collectorToken}` })));
  assert(ingestResponses.every(item => item.ok), 'O coletor autorizado não conseguiu gravar as ingestões concorrentes.');
  response = await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: cookie } });
  const concurrentRuntime = await response.json();
  assert(['collector-event-A', 'collector-event-B'].every(id => concurrentRuntime.events.some(item => item.id === id)), 'Ingestões concorrentes perderam eventos no runtime.');
  const encryptedRuntime = await readFile(path.join(server.dataDirectory, 'runtime.json'), 'utf8');
  assert(encryptedRuntime.includes('aes-256-gcm') && !encryptedRuntime.includes('Cliente sigiloso do coletor') && !encryptedRuntime.includes('5000000-00.2026.8.21.0001'), 'O estado intermediário do coletor não ficou criptografado em repouso.');

  response = await postJson(`${server.baseUrl}/api/auth/logout`, {}, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'Logout protegido falhou.');
  response = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } }); assert(response.status === 401, 'Sessão continuou válida após logout.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: recovery }); assert(response.ok, 'Código de recuperação válido foi recusado.');
  const recovered = await response.json(); const recoveryCookie = response.headers.get('set-cookie').split(';')[0];
  await postJson(`${server.baseUrl}/api/auth/logout`, {}, { Cookie: recoveryCookie, 'X-CSRF-Token': recovered.csrfToken });
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: recovery }); assert(response.status === 401, 'Código de recuperação foi reutilizado.');

  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: await freshTotp(payload.manualSecret), trustBrowser: true });
  const trustedLogin = await response.json();
  const trustedCookies = response.headers.getSetCookie();
  const trustedSessionCookie = trustedCookies.map(value => value.split(';')[0]).find(value => value.startsWith('keller_session='));
  const trustedCookie = trustedCookies.map(value => value.split(';')[0]).find(value => value.startsWith('keller_trusted='));
  assert(response.ok && trustedLogin.trustedDevice && trustedCookie, 'A opção de confiar no navegador não criou um dispositivo confiável.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: trustedCookie } });
  const trustedStatus = await response.json();
  assert(trustedStatus.authenticated && trustedStatus.trustedDevice && trustedStatus.csrfToken, 'O navegador confiável não restaurou a sessão sem novo TOTP.');
  response = await postJson(`${server.baseUrl}/api/auth/trusted-device/revoke`, {}, { Cookie: trustedCookie, 'X-CSRF-Token': trustedStatus.csrfToken });
  assert(response.ok, 'A confiança do navegador não pôde ser revogada.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: trustedCookie } });
  assert(!(await response.json()).authenticated, 'O navegador continuou confiável após a revogação.');

  // Teste de MFA Opcional: usuário registrado com skipMfa consegue logar apenas com senha
  const optionalUserPwd = 'Advogado-SemMfa-2026!';
  response = await postJson(`${server.baseUrl}/api/auth/register`, { username: 'adv_sem_mfa', displayName: 'Advogado Sem MFA', email: 'semmfa@example.test', password: optionalUserPwd }, { Cookie: trustedSessionCookie, 'X-CSRF-Token': trustedLogin.csrfToken });
  const optReg = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: optReg.setupToken, skipMfa: true });
  assert(response.ok && (await response.json()).status === 'pending_approval', 'Registro sem MFA falhou na verificação.');
  
  // Aprovar usuário sem MFA
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: await freshTotp(payload.manualSecret) });
  const adminLog = await response.json();
  const adminCookie = response.headers.get('set-cookie').split(';')[0];
  const allUsers = (await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: adminCookie } })).json()).users;
  const optUserObj = allUsers.find(u => u.username === 'adv_sem_mfa');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: optUserObj.id, status: 'active', password, code: generateTotp(payload.manualSecret) }, { Cookie: adminCookie, 'X-CSRF-Token': adminLog.csrfToken });

  // Login do usuário sem MFA (sem fornecer code)
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'adv_sem_mfa', password: optionalUserPwd });
  const optLogin = await response.json();
  assert(response.ok && optLogin.authenticated, 'Usuário sem MFA não conseguiu logar apenas com senha.');
  const optCookie = response.headers.get('set-cookie').split(';')[0];

  // Ativar MFA posteriormente
  const newSecret = 'JBSWY3DPEHPK3PXP';
  response = await postJson(`${server.baseUrl}/api/auth/mfa/enable`, { password: optionalUserPwd, code: generateTotp(newSecret), totpSecret: newSecret }, { Cookie: optCookie, 'X-CSRF-Token': optLogin.csrfToken });
  const optEnable = await response.json();
  assert(response.ok && optEnable.mfaEnabled, 'Falha ao ativar MFA posteriormente.');

  // Teste BUG-012: Isolamento de Recovery Codes entre Usuários
  const collabRecovery = registration.recoveryCodes ? registration.recoveryCodes[0] : null;
  if (optEnable.recoveryCodes && optEnable.recoveryCodes.length > 0) {
    const userBRecovery = optEnable.recoveryCodes[0];
    // Recovery code do Usuário B não pode autenticar Admin (Usuário A)
    response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: userBRecovery });
    assert(response.status === 401, 'BUG-012: Recovery code do Usuário B conseguiu autenticar Usuário A!');
    
    // Login do Usuário B com seu próprio recovery code
    response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'adv_sem_mfa', password: optionalUserPwd, code: userBRecovery });
    assert(response.ok, 'BUG-012: Usuário B não conseguiu logar com seu próprio recovery code.');
    const userBLoginAfterRecovery = await response.json();
    const userBCookie = response.headers.get('set-cookie').split(';')[0];

    // Teste BUG-013: Desativação de MFA exigindo senha + TOTP/Recovery
    // Tentativa sem código de 2FA
    response = await postJson(`${server.baseUrl}/api/auth/mfa/disable`, { password: optionalUserPwd }, { Cookie: userBCookie, 'X-CSRF-Token': userBLoginAfterRecovery.csrfToken });
    assert(response.status === 401, 'BUG-013: Desativação de MFA permitida sem segundo fator.');

    // Desativação com senha + código TOTP válido
    response = await postJson(`${server.baseUrl}/api/auth/mfa/disable`, { password: optionalUserPwd, code: generateTotp(newSecret) }, { Cookie: userBCookie, 'X-CSRF-Token': userBLoginAfterRecovery.csrfToken });
    assert(response.ok, 'BUG-013: Desativação de MFA com senha e TOTP falhou.');
    
    // Agora usuário B consegue logar sem código
    response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'adv_sem_mfa', password: optionalUserPwd });
    assert(response.ok, 'BUG-013: Usuário não conseguiu logar sem código após desativar MFA.');
  }

  response = await postJson(`${server.baseUrl}/api/auth/users/delete`, { userId: optUserObj.id, password, code: generateTotp(payload.manualSecret) }, { Cookie: adminCookie, 'X-CSRF-Token': adminLog.csrfToken });
  assert(response.ok, 'Administrador não conseguiu excluir o usuário sintético.');
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: adminCookie } });
  const deleteAudit = (await response.json()).state.audit;
  assert(deleteAudit.some(entry => entry.action === 'Usuário excluído' && entry.actor === 'admin' && entry.detail.includes(optUserObj.id)), 'Exclusão de usuário deve registrar ator e alvo oficiais sem credenciais.');

  for (let index = 0; index < 5; index++) await postJson(`${server.baseUrl}/api/auth/login`, { username: 'bloqueio', password: 'Incorreta-123456!', code: '000000' });
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'bloqueio', password: 'Incorreta-123456!', code: '000000' });
  assert(response.status === 429 && response.headers.has('retry-after'), 'Limitação de tentativas não bloqueou o atacante.');
  console.log('Security test aprovado: senha, TOTP por usuário, MFA opcional e ativação posterior, isolamento estrito de recovery codes (BUG-012), fluxo de desativação de MFA (BUG-013), aprovação administrativa, papéis, navegador confiável, revogação, sessão, CSRF, rate limit, CSP, arquivos privados, estado principal e coleta criptografados.');
} finally { await server.stop(); }

// =========================================================
// Hardening unitário: persistência do bloqueio, anti-replay TOTP e anti-spraying
// =========================================================
const hardeningDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-security-hardening-'));
try {
  const hardeningSecret = randomBytes(48).toString('base64url');
  const hardeningKey = randomBytes(32).toString('base64');
  const masterPassword = 'Senha-Hardening-2026!';
  const manager = new SecurityManager({ dataDirectory: hardeningDirectory, sessionSecret: hardeningSecret, encryptionKey: hardeningKey });
  await manager.init();
  const hardeningSetup = await manager.beginSetup({
    username: 'mestre.hardening',
    displayName: 'Mestre Hardening Teste',
    email: 'hardening@example.test',
    password: masterPassword
  }, '198.51.100.10');
  await manager.finishSetup({ setupToken: hardeningSetup.setupToken, code: generateTotp(hardeningSetup.manualSecret) });

  // (i) Cinco falhas bloqueiam e o bloqueio sobrevive ao reinício do SecurityManager.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expectRejection(
      () => manager.login({ username: 'mestre.hardening', password: 'Senha-Errada-2026!', code: '000000' }, '198.51.100.10'),
      error => error.statusCode === 401,
      'falha de credencial antes do bloqueio deve retornar 401'
    );
  }
  await expectRejection(
    () => manager.login({ username: 'mestre.hardening', password: 'Senha-Errada-2026!', code: '000000' }, '198.51.100.10'),
    error => error.statusCode === 429 && Number(error.retryAfter) > 0,
    'sexta tentativa deve ser bloqueada com 429 e Retry-After'
  );
  const persisted = JSON.parse(await readFile(path.join(hardeningDirectory, 'security.json'), 'utf8'));
  assert(persisted.loginAttempts && Object.keys(persisted.loginAttempts).length > 0, 'baldes de tentativas devem ser persistidos em security.json');

  const restarted = new SecurityManager({ dataDirectory: hardeningDirectory, sessionSecret: hardeningSecret, encryptionKey: hardeningKey });
  await restarted.init();
  await expectRejection(
    () => restarted.login({ username: 'mestre.hardening', password: masterPassword, code: generateTotp(hardeningSetup.manualSecret) }, '198.51.100.10'),
    error => error.statusCode === 429,
    'bloqueio deve persistir após nova instância ler o mesmo diretório'
  );

  // (ii) Anti-replay TOTP: o mesmo passo de tempo não pode ser reapresentado.
  const replayCode = await freshTotp(hardeningSetup.manualSecret);
  const replayLogin = await restarted.login({ username: 'mestre.hardening', password: masterPassword, code: replayCode }, '198.51.100.11');
  assert(Boolean(replayLogin.token), 'código TOTP novo deve autenticar');
  await expectRejection(
    () => restarted.login({ username: 'mestre.hardening', password: masterPassword, code: replayCode }, '198.51.100.11'),
    error => error.statusCode === 401,
    'o mesmo código TOTP não pode ser reutilizado'
  );
  const replayAfterRestart = new SecurityManager({ dataDirectory: hardeningDirectory, sessionSecret: hardeningSecret, encryptionKey: hardeningKey });
  await replayAfterRestart.init();
  await expectRejection(
    () => replayAfterRestart.login({ username: 'mestre.hardening', password: masterPassword, code: replayCode }, '198.51.100.11'),
    error => error.statusCode === 401,
    'o passo TOTP consumido deve permanecer consumido após reinício'
  );

  // (iii) Limite global por endereço: variar o usuário não contorna o bloqueio.
  let lastAttemptError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastAttemptError = await replayAfterRestart.login({ username: `spray.${attempt}`, password: 'Senha-Errada-2026!' }, '192.0.2.77').catch(error => error);
  }
  assert(lastAttemptError?.statusCode === 401, 'tentativas dentro do teto do endereço devem falhar por credencial, não por bloqueio');
  await expectRejection(
    () => replayAfterRestart.login({ username: 'spray.20', password: 'Senha-Errada-2026!' }, '192.0.2.77'),
    error => error.statusCode === 429,
    'o vigésimo primeiro usuário distinto do mesmo endereço deve ser bloqueado pelo limite global'
  );

  mock.timers.enable({ apis: ['Date'], now: Math.floor(Date.now() / 30_000) * 30_000 });
  try {
    const managerOptions = { dataDirectory: hardeningDirectory, sessionSecret: hardeningSecret, encryptionKey: hardeningKey };
    const optionalMfaManager = new SecurityManager(managerOptions);
    await optionalMfaManager.init();
    const workspaceAccount = {
      username: 'novo.escritorio',
      displayName: 'Responsável Novo Teste',
      email: 'novo.escritorio@example.test',
      workspaceName: 'Escritório Teste',
      password: 'Senha-Novo-2026!'
    };
    const workspaceRegistration = await optionalMfaManager.beginWorkspaceRegistration(workspaceAccount, '198.51.100.20');
    await expectRejection(
      () => optionalMfaManager.finishWorkspaceRegistration({ setupToken: 'token-invalido', skipMfa: true }),
      error => error.statusCode === 401,
      'skipMfa não pode dispensar um setupToken válido'
    );
    await expectRejection(
      () => optionalMfaManager.finishWorkspaceRegistration({ setupToken: workspaceRegistration.setupToken }),
      error => error.statusCode === 400,
      'cadastro sem skipMfa não pode dispensar o código TOTP'
    );
    const workspaceSetup = await optionalMfaManager.finishWorkspaceRegistration({ setupToken: workspaceRegistration.setupToken, skipMfa: true });
    assert(Boolean(workspaceSetup.token) && Boolean(workspaceSetup.csrfToken), 'cadastro com skipMfa deve emitir sessão e CSRF');
    assert(workspaceSetup.mfaEnabled === false && Array.isArray(workspaceSetup.recoveryCodes) && workspaceSetup.recoveryCodes.length === 0, 'cadastro com skipMfa deve concluir sem MFA nem recovery codes');
    assert(workspaceSetup.user.username === workspaceAccount.username && workspaceSetup.user.displayName === workspaceAccount.displayName && workspaceSetup.user.email === workspaceAccount.email && workspaceSetup.user.role === 'master_admin', 'cadastro deve preservar a identidade e o papel do responsável');
    assert(workspaceSetup.workspace.id === workspaceSetup.user.workspaceId && workspaceSetup.workspace.name === workspaceAccount.workspaceName && workspaceSetup.workspace.status === 'active', 'cadastro deve associar o responsável ao escritório ativo correto');
    assert(workspaceSetup.workspace.id !== optionalMfaManager.state.defaultWorkspaceId, 'novo escritório não pode usar o workspace da instalação');
    const setupRequest = { headers: { cookie: `atrium_session=${workspaceSetup.token}` } };
    const setupSession = optionalMfaManager.requireSession(setupRequest);
    assert(setupSession.username === workspaceAccount.username && setupSession.role === 'master_admin' && setupSession.workspaceId === workspaceSetup.workspace.id && setupSession.csrfToken === workspaceSetup.csrfToken && setupSession.mfaVerified === false, 'sessão emitida deve autenticar o responsável no escritório sem declarar MFA verificado');
    assert(optionalMfaManager.publicStatus(setupRequest).authenticated === true, 'cadastro com skipMfa deve produzir sessão autenticada');
    await expectRejection(
      () => optionalMfaManager.finishWorkspaceRegistration({ setupToken: workspaceRegistration.setupToken, skipMfa: true }),
      error => error.statusCode === 401,
      'setupToken consumido não pode cadastrar novamente o escritório'
    );

    const workspacePersisted = JSON.parse(await readFile(path.join(hardeningDirectory, 'security.json'), 'utf8'));
    const storedWorkspaceUser = workspacePersisted.users.find(user => user.username === workspaceAccount.username);
    assert(storedWorkspaceUser?.workspaceId === workspaceSetup.workspace.id && storedWorkspaceUser.role === 'master_admin' && storedWorkspaceUser.status === 'active' && storedWorkspaceUser.mfaEnabled === false, 'responsável ativo sem MFA deve estar persistido no escritório correto');
    assert(storedWorkspaceUser.encryptedTotp === null && storedWorkspaceUser.recoverySalt === null && Array.isArray(storedWorkspaceUser.recoveryHashes) && storedWorkspaceUser.recoveryHashes.length === 0, 'skipMfa não deve persistir fator ativo nem recovery codes');
    assert(workspacePersisted.workspaces.some(workspace => workspace.id === workspaceSetup.workspace.id && workspace.name === workspaceAccount.workspaceName && workspace.status === 'active'), 'novo escritório ativo deve estar persistido');
    assert(workspacePersisted.pendingWorkspaceRegistrations.length === 0, 'cadastro concluído não deve permanecer pendente');

    const workspaceReloaded = new SecurityManager(managerOptions);
    await workspaceReloaded.init();
    const reloadedWorkspaceUser = workspaceReloaded.state.users.find(user => user.username === workspaceAccount.username);
    assert(reloadedWorkspaceUser?.workspaceId === workspaceSetup.workspace.id && reloadedWorkspaceUser.role === 'master_admin' && reloadedWorkspaceUser.status === 'active' && reloadedWorkspaceUser.mfaEnabled === false, 'reload deve preservar identidade, vínculo e MFA desativado');
    const reloadedMfaStatus = workspaceReloaded.getUserMfaStatus(workspaceAccount.username);
    assert(reloadedMfaStatus.mfaEnabled === false && reloadedMfaStatus.recoveryCodesRemaining === 0, 'reload não deve ativar MFA nem criar recovery codes');
    await expectRejection(
      () => workspaceReloaded.login({ username: workspaceAccount.username, password: 'Senha-Errada-2026!' }, '198.51.100.20'),
      error => error.statusCode === 401,
      'MFA opcional não pode permitir login com senha incorreta'
    );
    const passwordLogin = await workspaceReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password }, '198.51.100.20');
    const passwordSession = workspaceReloaded.requireSession({ headers: { cookie: `atrium_session=${passwordLogin.token}` } });
    assert(Boolean(passwordLogin.csrfToken) && passwordSession.username === workspaceAccount.username && passwordSession.role === 'master_admin' && passwordSession.workspaceId === workspaceSetup.workspace.id && passwordSession.mfaVerified === false, 'login por senha após reload deve autenticar no escritório correto sem MFA');

    const enrollment = await workspaceReloaded.beginUserMfaEnrollment(workspaceAccount.username);
    assert(typeof enrollment.manualSecret === 'string' && enrollment.manualSecret.length >= 16 && enrollment.qrCode.startsWith('data:image/png'), 'ativação posterior deve emitir segredo e QR de inscrição');
    await expectRejection(
      () => workspaceReloaded.enableUserMfa(workspaceAccount.username, { password: workspaceAccount.password }, '198.51.100.20'),
      error => error.statusCode === 401,
      'ativação posterior de MFA não pode dispensar TOTP válido'
    );
    const enrollmentCode = generateTotp(enrollment.manualSecret);
    await expectRejection(
      () => workspaceReloaded.enableUserMfa(workspaceAccount.username, { password: 'Senha-Errada-2026!', code: enrollmentCode }, '198.51.100.20'),
      error => error.statusCode === 401,
      'ativação posterior de MFA não pode dispensar senha válida'
    );
    const enabledMfa = await workspaceReloaded.enableUserMfa(workspaceAccount.username, { password: workspaceAccount.password, code: enrollmentCode }, '198.51.100.20');
    assert(enabledMfa.ok === true && enabledMfa.mfaEnabled === true && Array.isArray(enabledMfa.recoveryCodes) && enabledMfa.recoveryCodes.length === 8, 'ativação posterior com senha e TOTP deve habilitar MFA e emitir recovery codes');
    const activeMfaReloaded = new SecurityManager(managerOptions);
    await activeMfaReloaded.init();
    const activeMfaStatus = activeMfaReloaded.getUserMfaStatus(workspaceAccount.username);
    assert(activeMfaStatus.mfaEnabled === true && activeMfaStatus.recoveryCodesRemaining === 8, 'MFA ativo e recovery codes devem sobreviver ao reload');
    await expectRejection(
      () => activeMfaReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password }, '198.51.100.20'),
      error => error.statusCode === 401,
      'login por senha sem código deve falhar após ativação de MFA'
    );
    const totpLogin = await activeMfaReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password, code: enrollmentCode }, '198.51.100.20');
    const totpSession = activeMfaReloaded.requireSession({ headers: { cookie: `atrium_session=${totpLogin.token}` } });
    assert(Boolean(totpLogin.csrfToken) && totpSession.username === workspaceAccount.username && totpSession.role === 'master_admin' && totpSession.workspaceId === workspaceSetup.workspace.id && totpSession.mfaVerified === true, 'login com TOTP deve autenticar o responsável no mesmo escritório com MFA verificado');
    await expectRejection(
      () => activeMfaReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password, code: enrollmentCode }, '198.51.100.20'),
      error => error.statusCode === 401,
      'login com MFA ativado posteriormente não pode reutilizar o passo TOTP'
    );
    const totpReloaded = new SecurityManager(managerOptions);
    await totpReloaded.init();
    assert(totpReloaded.state.users.find(user => user.username === workspaceAccount.username)?.totpLastUsedStep === Math.floor(Date.now() / 30_000), 'passo TOTP consumido deve estar persistido após reload');
    await expectRejection(
      () => totpReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password, code: enrollmentCode }, '198.51.100.20'),
      error => error.statusCode === 401,
      'replay após ativação posterior deve continuar bloqueado após reload'
    );
    mock.timers.tick(30_000);
    const nextTotpLogin = await totpReloaded.login({ username: workspaceAccount.username, password: workspaceAccount.password, code: generateTotp(enrollment.manualSecret) }, '198.51.100.20');
    assert(Boolean(nextTotpLogin.token) && nextTotpLogin.user.workspaceId === workspaceSetup.workspace.id, 'novo passo TOTP deve autenticar sem enfraquecer o anti-replay');
  } finally {
    mock.timers.reset();
  }

  console.log('Security hardening aprovado: bloqueio persistente, anti-replay TOTP por passo e anti-spraying por conta e endereço.');
} finally {
  await rm(hardeningDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function assert(condition, message) { if (!condition) throw new Error(message); }
