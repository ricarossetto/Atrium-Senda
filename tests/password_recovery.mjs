import assert from 'node:assert/strict';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const MASTER_PASSWORD = 'Senha-Mestre-2026!';
const MASTER_NEW_PASSWORD = 'Senha-Mestre-Nova-2026!';
const COLLABORATOR_PASSWORD = 'Senha-Colaboradora-2026!';
const COLLABORATOR_NEW_PASSWORD = 'Senha-Colaboradora-Nova-2026!';
const WORKSPACE_B_PASSWORD = 'Senha-Escritorio-B-2026!';
const WORKSPACE_B_NEW_PASSWORD = 'Senha-Escritorio-B-Nova-2026!';
const RESET_PUBLIC_MESSAGE = 'Se este identificador estiver vinculado a uma conta ATRIUM, enviaremos um link de redefinição válido por 30 minutos. Verifique também a caixa de spam.';

function sessionCookie(response, name = 'keller_session') {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') || ''];
  const found = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0] : '';
}

function workspaceDirectory(dataDirectory, workspaceId, defaultWorkspaceId) {
  if (!workspaceId || workspaceId === defaultWorkspaceId) return dataDirectory;
  return path.join(dataDirectory, 'workspaces', workspaceId);
}

function readOutboxRows(dbFile) {
  if (!fs.existsSync(dbFile)) return [];
  const db = new DatabaseSync(dbFile);
  try {
    return db.prepare('SELECT id, event_type, recipient, payload, status, attempts, created_at FROM notification_outbox ORDER BY created_at ASC').all();
  } finally {
    db.close();
  }
}

function decryptEnvelope(value, encryptionKey) {
  const raw = String(value ?? '');
  if (!raw.startsWith('enc:v1:')) return raw;
  const [iv, tag, ciphertext] = raw.slice(7).split(':');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function tokenHashOf(token) {
  return createHash('sha256').update(String(token)).digest('base64url');
}

function passwordResetEmails({ dbFile, encryptionKey }) {
  return readOutboxRows(dbFile)
    .filter(row => row.event_type === 'PASSWORD_RESET')
    .map(row => {
      // O conteúdo sensível do outbox deve estar cifrado em repouso (enc:v1:).
      assert.ok(String(row.payload).startsWith('enc:v1:'), 'payload do outbox deve estar cifrado em repouso');
      assert.ok(String(row.recipient).startsWith('enc:v1:'), 'destinatário do outbox deve estar cifrado em repouso');
      const payload = JSON.parse(decryptEnvelope(row.payload, encryptionKey));
      const recipient = decryptEnvelope(row.recipient, encryptionKey);
      const url = String(payload.text || '').match(/https?:\/\/\S+#reset=[A-Za-z0-9_-]+/)?.[0] || '';
      const token = url.split('#reset=')[1] || '';
      assert.ok(!String(row.payload).includes(token) || !token, 'token não pode aparecer em texto puro no outbox');
      return { id: row.id, status: row.status, attempts: row.attempts, recipient, url, token, html: payload.html || '', text: payload.text || '', subject: payload.subject || '' };
    });
}

async function waitForDeliveredEmail(options, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = [];
  while (Date.now() < deadline) {
    latest = passwordResetEmails(options);
    if (latest.some(mail => mail.status === 'SENT')) return latest;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`E-mail de redefinição não foi entregue a tempo: ${JSON.stringify(latest.map(mail => mail.status))}`);
}

function latestResetEmail(options) {
  const mail = passwordResetEmails(options).at(-1);
  assert.ok(mail, 'solicitação de recuperação deve enfileirar um e-mail de redefinição');
  return mail;
}

function readSecurityState(dataDirectory) {
  return JSON.parse(fs.readFileSync(path.join(dataDirectory, 'security.json'), 'utf8'));
}

function findUser(securityState, username) {
  return (securityState.users || []).find(user => user.username === username);
}

async function statusFor(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/status`, { headers: cookie ? { Cookie: cookie } : {} });
  return response.json();
}

async function saveState(baseUrl, session, marker) {
  const response = await postJson(`${baseUrl}/api/state`, {
    state: {
      version: 1, terms: [], sources: [], intimations: [], tasks: [], processes: [], contacts: [], agenda: [], audit: [],
      settings: { officeName: marker }
    }
  }, { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken });
  assert.ok(response.ok, `estado inicial do workspace ${marker} deve ser criado`);
}

async function forgot(baseUrl, identifier, headers = {}) {
  return postJson(`${baseUrl}/api/auth/password/forgot`, { identifier }, headers);
}

async function reset(baseUrl, token, password, headers = {}) {
  return postJson(`${baseUrl}/api/auth/password/reset`, { token, password }, headers);
}

async function login(baseUrl, { username, password, code, trustBrowser }, headers = {}) {
  return postJson(`${baseUrl}/api/auth/login`, { username, password, code, trustBrowser }, headers);
}

// O anti-replay de TOTP consome cada passo de 30s uma única vez por usuário.
// Re-logins sintéticos avançam o contador monotonicamente e aguardam o relógio
// quando o próximo passo ainda está fora da janela ±1 aceita pelo servidor.
const consumedTotpSteps = new Map();
async function freshTotp(secret) {
  const counter = () => Math.floor(Date.now() / 30_000);
  let target = consumedTotpSteps.has(secret) ? consumedTotpSteps.get(secret) + 1 : counter();
  while (target > counter() + 1) await new Promise(resolve => setTimeout(resolve, 1_000));
  target = Math.max(target, counter());
  consumedTotpSteps.set(secret, target);
  return generateTotp(secret, target);
}

const server = await startTestServer({
  env: {
    NODE_ENV: 'test',
    ATRIUM_MOCK_SMTP: 'true',
    RESEND_API_KEY: '',
    JEV_CMD_BIN: process.execPath,
    ATRIUM_BASE_URL: 'https://atrium.adv.br',
    ATRIUM_MOCK_RESEND: 'true',
    ATRIUM_PUBLIC_SIGNUP: 'true',
    JURISFLOW_CLOUD_MODE: 'true',
    ATRIUM_FRONTEND_ORIGINS: 'https://atrium.adv.br'
  }
});

let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };

try {
  // --- Fundação: escritório A (master com MFA) ---
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular.teste',
    displayName: 'Advogada Titular Teste',
    email: 'titular@example.test',
    password: MASTER_PASSWORD,
    workspaceName: 'Escritorio Teste A'
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const verified = await response.json();
  const masterSecret = setup.manualSecret;
  let masterCookie = sessionCookie(response);
  let masterCsrf = verified.csrfToken;
  const defaultWorkspaceId = readSecurityState(server.dataDirectory).defaultWorkspaceId;
  const outboxA = path.join(server.dataDirectory, 'notifications.sqlite');
  check(Boolean(masterCookie) && Boolean(masterCsrf), 'sessão inicial do master deve existir');
  await saveState(server.baseUrl, { cookie: masterCookie, csrfToken: masterCsrf }, 'MARCADOR-A');

  // --- Colaboradora com MFA no escritório A ---
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'colaboradora.teste',
    displayName: 'Colaboradora Teste',
    email: 'colaboradora@example.test',
    password: COLLABORATOR_PASSWORD
  }, { Cookie: masterCookie, 'X-CSRF-Token': masterCsrf });
  const registration = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, code: generateTotp(registration.manualSecret) });
  const collaboratorVerification = await response.json();
  const collaboratorRecoveryCodes = collaboratorVerification.recoveryCodes;
  const collaboratorSecret = registration.manualSecret;
  const usersList = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: masterCookie } })).json();
  const collaborator = usersList.users.find(user => user.username === 'colaboradora.teste');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'active', password: MASTER_PASSWORD, code: await freshTotp(masterSecret) }, { Cookie: masterCookie, 'X-CSRF-Token': masterCsrf });
  check(response.status === 200, 'colaboradora deve ser ativada pelo master');
  check(collaboratorRecoveryCodes.length === 8, 'colaboradora deve receber códigos de recuperação');

  // --- Escritório B (isolamento multi-workspace) ---
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'titular.b.teste',
    displayName: 'Titular Escritorio B',
    email: 'titular.b@example.test',
    password: WORKSPACE_B_PASSWORD,
    workspaceName: 'Escritorio Teste B'
  });
  const workspaceRegistration = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, { setupToken: workspaceRegistration.setupToken, code: generateTotp(workspaceRegistration.manualSecret) });
  const workspaceBVerified = await response.json();
  const workspaceBSecret = workspaceRegistration.manualSecret;
  let workspaceBId = workspaceBVerified.workspace.id;
  let workspaceBCookie = sessionCookie(response);
  let workspaceBCsrf = workspaceBVerified.csrfToken;
  check(Boolean(workspaceBId) && workspaceBId !== defaultWorkspaceId, 'workspace B deve ser distinto');
  const outboxB = path.join(workspaceDirectory(server.dataDirectory, workspaceBId, defaultWorkspaceId), 'notifications.sqlite');
  await saveState(server.baseUrl, { cookie: workspaceBCookie, csrfToken: workspaceBCsrf }, 'MARCADOR-B');

  // =========================================================
  // 1. Enumeração: resposta pública indistinguível + entrega real
  // =========================================================
  const existing = await forgot(server.baseUrl, 'titular@example.test');
  const existingBody = await existing.json();
  const missing = await forgot(server.baseUrl, 'nao.existe@example.test');
  const missingBody = await missing.json();
  const missingOther = await forgot(server.baseUrl, 'outro.inexistente@example.test');
  const missingOtherBody = await missingOther.json();

  check(existing.status === 200 && missing.status === 200 && missingOther.status === 200, 'solicitação de recuperação deve responder 200 em todos os casos');
  check(existingBody.message === RESET_PUBLIC_MESSAGE, 'resposta pública deve ser a mensagem genérica oficial');
  check(missingBody.message === RESET_PUBLIC_MESSAGE && missingOtherBody.message === RESET_PUBLIC_MESSAGE, 'contas inexistentes não podem ser distinguíveis');
  check(JSON.stringify(existingBody) === JSON.stringify(missingBody) && JSON.stringify(missingBody) === JSON.stringify(missingOtherBody), 'corpo da resposta deve ser byte a byte idêntico');
  check(!JSON.stringify(existingBody).includes('titular'), 'resposta pública não deve expor identificadores internos');
  check(!JSON.stringify(existingBody).toLowerCase().includes('workspace'), 'resposta pública não deve expor workspace');

  const deliveredMails = await waitForDeliveredEmail({ dbFile: outboxA, encryptionKey: server.encryptionKey });
  check(deliveredMails.length === 1, 'apenas a conta existente deve gerar e-mail');
  const delivered = deliveredMails[0];
  check(delivered.status === 'SENT', 'e-mail de redefinição deve ser entregue pelo worker com workspace desabilitado');
  check(delivered.recipient === 'titular@example.test', 'destinatário deve ser o e-mail oficial da conta');
  check(delivered.subject.includes('ATRIUM'), 'assunto deve identificar o ATRIUM');
  check(delivered.url.startsWith('https://atrium.adv.br/#reset='), 'link deve ser HTTPS na base configurada e usar fragmento');
  check(delivered.html.includes('30 minutos'), 'e-mail deve informar o prazo de validade');
  check(/N[ãa]o foi voc[êe]/i.test(delivered.html), 'e-mail deve informar que a solicitação pode ser ignorada');
  check(/novo link (?:substitui|invalida)|substitui e invalida/i.test(delivered.html), 'e-mail deve avisar que um novo link invalida os anteriores');
  check(!delivered.html.includes(MASTER_PASSWORD) && !delivered.text.includes(MASTER_PASSWORD), 'e-mail nunca deve conter senha');
  check(!delivered.html.includes(masterSecret), 'e-mail nunca deve conter segredo de segundo fator');
  check(!delivered.html.includes('tokenHash') && !delivered.html.includes('passwordHash') && !delivered.html.includes('workspaceId'), 'e-mail não deve expor dados internos');
  const firstToken = delivered.token;
  check(firstToken.length >= 40, 'token deve ser criptograficamente longo');
  check(readSecurityState(server.dataDirectory).passwordResetTokens[0].tokenHash === tokenHashOf(firstToken), 'apenas sha256(token) pode ser persistido como identidade do token');

  // =========================================================
  // 2. Token não aparece em storage plaintext nem em logs
  // =========================================================
  const securityRaw = fs.readFileSync(path.join(server.dataDirectory, 'security.json'), 'utf8');
  check(!securityRaw.includes(firstToken), 'token não pode ser persistido em texto puro');
  check(securityRaw.includes('tokenHash'), 'apenas o hash do token deve ser persistido');
  check(!server.output().includes(firstToken), 'token não pode aparecer nos logs do servidor');
  const stateForAudit = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: masterCookie } })).json();
  check(!JSON.stringify(stateForAudit).includes(firstToken), 'token não pode aparecer na auditoria/estado');
  const auditEntries = Array.isArray(stateForAudit.state?.audit) ? stateForAudit.state.audit : [];
  check(auditEntries.some(entry => entry.action === 'Solicitação de redefinição de senha'), 'solicitação deve ser auditada');
  const resetAuditDetail = auditEntries.find(entry => entry.action === 'Solicitação de redefinição de senha')?.detail || '';
  check(resetAuditDetail.includes('ti***@example.test') && !resetAuditDetail.includes('titular@example.test'), 'auditoria deve mascarar o e-mail do titular');

  // =========================================================
  // 3. Token incorreto não altera a senha
  // =========================================================
  const hashBeforeWrong = findUser(readSecurityState(server.dataDirectory), 'titular.teste').passwordHash;
  const wrongToken = await reset(server.baseUrl, 'x'.repeat(43), MASTER_NEW_PASSWORD);
  check(wrongToken.status === 401, 'token incorreto deve ser rejeitado');
  const unknownTokenMessage = await wrongToken.json();
  check(findUser(readSecurityState(server.dataDirectory), 'titular.teste').passwordHash === hashBeforeWrong, 'token incorreto não pode alterar a senha');

  // =========================================================
  // 4. Redefinição efetiva: hash, sessões, trusted devices, replay
  // =========================================================
  response = await login(server.baseUrl, { username: 'titular.teste', password: MASTER_PASSWORD, code: await freshTotp(masterSecret), trustBrowser: true });
  const trustedLogin = await response.json();
  const trustedCookie = sessionCookie(response, 'keller_trusted');
  check(response.status === 200 && Boolean(trustedCookie), 'login com dispositivo confiável deve emitir cookie de confiança');
  check((await statusFor(server.baseUrl, trustedCookie)).authenticated === true, 'dispositivo confiável deve autenticar antes da redefinição');

  const hashBeforeReset = findUser(readSecurityState(server.dataDirectory), 'titular.teste').passwordHash;
  const saltBeforeReset = findUser(readSecurityState(server.dataDirectory), 'titular.teste').salt;
  const successfulReset = await reset(server.baseUrl, firstToken, MASTER_NEW_PASSWORD);
  check(successfulReset.status === 200, 'token válido deve redefinir a senha');

  const stateAfterReset = readSecurityState(server.dataDirectory);
  const masterAfterReset = findUser(stateAfterReset, 'titular.teste');
  check(masterAfterReset.passwordHash !== hashBeforeReset, 'hash da senha deve mudar após a redefinição');
  check(masterAfterReset.salt !== saltBeforeReset, 'salt deve ser rotacionado após a redefinição');
  check(masterAfterReset.mfaEnabled === true && (masterAfterReset.recoveryHashes || []).length === 8, 'MFA e códigos de recuperação devem permanecer intactos');
  check((stateAfterReset.passwordResetTokens || []).length === 0, 'token utilizado deve ser consumido');
  check((stateAfterReset.trustedDevices || []).length === 0, 'trusted devices devem ser revogados');
  check((await statusFor(server.baseUrl, trustedCookie)).authenticated === false, 'cookie de trusted device deve perder acesso');
  check((await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: masterCookie } })).status === 401, 'sessão anterior deve ser invalidada');
  masterCookie = '';
  check(!server.output().includes(firstToken), 'token não pode aparecer nos logs após a redefinição');
  const replay = await reset(server.baseUrl, firstToken, 'Outra-Senha-2026!');
  check(replay.status === 401, 'token não pode ser reutilizado');

  const oldPasswordLogin = await login(server.baseUrl, { username: 'titular.teste', password: MASTER_PASSWORD, code: generateTotp(masterSecret) });
  check(oldPasswordLogin.status === 401, 'senha antiga não deve mais autenticar');
  response = await login(server.baseUrl, { username: 'titular.teste', password: MASTER_NEW_PASSWORD, code: await freshTotp(masterSecret) });
  const newPasswordLogin = await response.json();
  masterCookie = sessionCookie(response);
  masterCsrf = newPasswordLogin.csrfToken;
  check(response.status === 200 && Boolean(masterCookie), 'senha nova deve autenticar com MFA');

  // =========================================================
  // 5. Nova solicitação invalida a anterior + corrida de token
  // =========================================================
  let collaboratorForgot = await forgot(server.baseUrl, 'colaboradora@example.test');
  check(collaboratorForgot.status === 200, 'solicitação para colaboradora deve responder 200');
  const firstCollaboratorMail = latestResetEmail({ dbFile: outboxA, encryptionKey: server.encryptionKey });
  await forgot(server.baseUrl, 'colaboradora.teste');
  const secondCollaboratorMail = latestResetEmail({ dbFile: outboxA, encryptionKey: server.encryptionKey });
  check(firstCollaboratorMail.token !== secondCollaboratorMail.token, 'nova solicitação deve gerar novo token');
  const superseded = await reset(server.baseUrl, firstCollaboratorMail.token, COLLABORATOR_NEW_PASSWORD);
  check(superseded.status === 401, 'solicitação anterior deve ser invalidada pela nova');

  const raceResults = await Promise.all([
    reset(server.baseUrl, secondCollaboratorMail.token, COLLABORATOR_NEW_PASSWORD),
    reset(server.baseUrl, secondCollaboratorMail.token, COLLABORATOR_NEW_PASSWORD)
  ]);
  check(raceResults.filter(result => result.status === 200).length === 1, 'apenas uma requisição concorrente pode consumir o token');

  // =========================================================
  // 6. Alteração de senha autenticada (senha atual + segundo fator + CSRF)
  // =========================================================
  response = await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: await freshTotp(collaboratorSecret), trustBrowser: true });
  let collaboratorCookie = sessionCookie(response);
  const collaboratorTrustedCookie = sessionCookie(response, 'keller_trusted');
  let collaboratorCsrf = (await response.json()).csrfToken;
  check(Boolean(collaboratorCookie), 'colaboradora deve autenticar com a senha redefinida');
  check((await statusFor(server.baseUrl, collaboratorTrustedCookie)).authenticated === true, 'dispositivo confiável da colaboradora deve autenticar antes da alteração');
  check((await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaboratorCookie } })).status === 200, 'sessão da colaboradora deve estar ativa antes da alteração');

  const changeBase = { currentPassword: COLLABORATOR_NEW_PASSWORD, newPassword: 'Senha-Invalida-Sem-Grupos' };
  const withoutAuth = await postJson(`${server.baseUrl}/api/auth/password/change`, { currentPassword: COLLABORATOR_NEW_PASSWORD, newPassword: COLLABORATOR_PASSWORD });
  check(withoutAuth.status === 401, 'alteração de senha sem sessão deve ser rejeitada');
  const withoutCsrf = await postJson(`${server.baseUrl}/api/auth/password/change`, { currentPassword: COLLABORATOR_NEW_PASSWORD, newPassword: COLLABORATOR_PASSWORD }, { Cookie: collaboratorCookie });
  check(withoutCsrf.status === 403, 'alteração de senha exige CSRF');
  const weakPassword = await postJson(`${server.baseUrl}/api/auth/password/change`, { currentPassword: COLLABORATOR_NEW_PASSWORD, newPassword: 'fraca' }, { Cookie: collaboratorCookie, 'X-CSRF-Token': collaboratorCsrf });
  check(weakPassword.status === 400, 'nova senha deve passar por validatePassword');
  const wrongCurrent = await postJson(`${server.baseUrl}/api/auth/password/change`, { ...changeBase, currentPassword: 'Senha-Errada-2026!' , code: generateTotp(collaboratorSecret) }, { Cookie: collaboratorCookie, 'X-CSRF-Token': collaboratorCsrf });
  check(wrongCurrent.status === 400, 'senha atual incorreta deve ser rejeitada sem encerrar a sess�o');
  check((await fetch(server.baseUrl + '/api/state', { headers: { Cookie: collaboratorCookie } })).status === 200, 'falha de senha atual não pode revogar a sessão ativa');
  const missingSecondFactor = await postJson(`${server.baseUrl}/api/auth/password/change`, { currentPassword: COLLABORATOR_NEW_PASSWORD, newPassword: COLLABORATOR_PASSWORD }, { Cookie: collaboratorCookie, 'X-CSRF-Token': collaboratorCsrf });
  check(missingSecondFactor.status === 400, 'conta com MFA deve exigir segundo fator na alteração');
  const loginStillWorks = await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: collaboratorRecoveryCodes[1] });
  check(loginStillWorks.status === 200, 'senha deve permanecer intacta após tentativas negadas');
  collaboratorCookie = sessionCookie(loginStillWorks);
  collaboratorCsrf = (await loginStillWorks.json()).csrfToken;

  const successfulChange = await postJson(`${server.baseUrl}/api/auth/password/change`, {
    currentPassword: COLLABORATOR_NEW_PASSWORD,
    newPassword: COLLABORATOR_PASSWORD,
    code: generateTotp(collaboratorSecret)
  }, { Cookie: collaboratorCookie, 'X-CSRF-Token': collaboratorCsrf });
  const changePayload = await successfulChange.json();
  check(successfulChange.status === 200 && Boolean(changePayload.csrfToken), 'alteração válida deve retornar novo CSRF');
  const rotatedCookie = sessionCookie(successfulChange);
  check(Boolean(rotatedCookie) && rotatedCookie !== collaboratorCookie, 'a sessão deve ser rotacionada na alteração de senha');
  check((await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: collaboratorCookie } })).status === 401, 'sessão anterior à alteração deve ser invalidada');
  check((await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: rotatedCookie } })).status === 200, 'sessão rotacionada deve continuar autorizada');
  check((await statusFor(server.baseUrl, collaboratorTrustedCookie)).authenticated === false, 'trusted device da colaboradora deve ser revogado na alteração');
  check((readSecurityState(server.dataDirectory).trustedDevices || []).filter(device => device.username === 'colaboradora.teste').length === 0, 'nenhum trusted device da colaboradora deve permanecer');
  check(!server.output().includes(firstToken), 'token não pode aparecer nos logs após a alteração de senha');
  check((await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: generateTotp(collaboratorSecret) })).status === 401, 'senha anterior não deve autenticar após a alteração');
  check((await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_PASSWORD, code: collaboratorRecoveryCodes[2] })).status === 200, 'senha alterada deve autenticar');

  // MFA por código de recuperação também autoriza a alteração e é consumido
  response = await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_PASSWORD, code: await freshTotp(collaboratorSecret) });
  collaboratorCookie = sessionCookie(response);
  collaboratorCsrf = (await response.json()).csrfToken;
  const recoveryChange = await postJson(`${server.baseUrl}/api/auth/password/change`, {
    currentPassword: COLLABORATOR_PASSWORD,
    newPassword: COLLABORATOR_NEW_PASSWORD,
    recoveryCode: collaboratorRecoveryCodes[0]
  }, { Cookie: collaboratorCookie, 'X-CSRF-Token': collaboratorCsrf });
  check(recoveryChange.status === 200, 'código de recuperação deve autorizar a alteração de senha');
  check((await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: collaboratorRecoveryCodes[0] })).status === 401, 'código de recuperação usado deve ser consumido');
  response = await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: collaboratorRecoveryCodes[3] });
  check(response.status === 200, 'sessão para o cenário de rate limit deve autenticar com segundo fator');
  const throttledCookie = sessionCookie(response);
  const throttledCsrf = (await response.json()).csrfToken;
  // O limitador de alteração conta falhas de credencial: cinco senhas atuais
  // incorretas esgotam o balde por usuário e endereço antes da tentativa válida.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedChange = await postJson(`${server.baseUrl}/api/auth/password/change`, {
      currentPassword: 'Senha-Errada-2026!',
      newPassword: COLLABORATOR_PASSWORD
    }, { Cookie: throttledCookie, 'X-CSRF-Token': throttledCsrf });
    check(failedChange.status === 400, 'senha atual incorreta deve consumir o limitador de alteração');
  }
  const throttledChange = await postJson(`${server.baseUrl}/api/auth/password/change`, {
    currentPassword: COLLABORATOR_NEW_PASSWORD,
    newPassword: COLLABORATOR_PASSWORD,
    code: generateTotp(collaboratorSecret)
  }, { Cookie: throttledCookie, 'X-CSRF-Token': throttledCsrf });
  check(throttledChange.status === 429, 'excesso de tentativas de alteração deve ser limitado por usuário e endereço');
  check(Number(throttledChange.headers.get('retry-after')) > 0, 'limite da alteração deve informar Retry-After');

  // =========================================================
  // 7. Isolamento entre escritórios
  // =========================================================
  const masterHashBeforeWorkspaceB = findUser(readSecurityState(server.dataDirectory), 'titular.teste').passwordHash;
  const workspaceBMailsBefore = passwordResetEmails({ dbFile: outboxB, encryptionKey: server.encryptionKey }).length;
  const workspaceBMaster = await forgot(server.baseUrl, 'titular.b@example.test');
  check(workspaceBMaster.status === 200, 'solicitação no escritório B deve responder 200');
  const workspaceBMails = await waitForDeliveredEmail({ dbFile: outboxB, encryptionKey: server.encryptionKey });
  check(workspaceBMails.length === workspaceBMailsBefore + 1, 'e-mail do escritório B deve ir para a base isolada do escritório B');
  check(passwordResetEmails({ dbFile: outboxA, encryptionKey: server.encryptionKey }).length === 3, 'escritório A não deve receber e-mails do escritório B');
  const workspaceBToken = workspaceBMails.at(-1).token;
  const workspaceBReset = await reset(server.baseUrl, workspaceBToken, WORKSPACE_B_NEW_PASSWORD);
  check(workspaceBReset.status === 200, 'token do escritório B deve redefinir o usuário do escritório B');
  const stateAfterWorkspaceB = readSecurityState(server.dataDirectory);
  check(findUser(stateAfterWorkspaceB, 'titular.b.teste').passwordHash !== undefined, 'usuário do escritório B deve permanecer no estado');
  check(findUser(stateAfterWorkspaceB, 'titular.teste').passwordHash === masterHashBeforeWorkspaceB, 'redefinição no escritório B não pode alterar o escritório A');
  check((await statusFor(server.baseUrl, masterCookie)).authenticated === true, 'sessão do escritório A deve permanecer válida');
  const workspaceBReplay = await reset(server.baseUrl, workspaceBToken, 'Senha-Outra-B-2026!');
  check(workspaceBReplay.status === 401, 'token do escritório B deve ser de uso único');
  const workspaceAUsers = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: masterCookie } })).json();
  check(!workspaceAUsers.users.some(user => user.username === 'titular.b.teste'), 'escritório A não deve listar usuários do escritório B');
  response = await login(server.baseUrl, { username: 'titular.b.teste', password: WORKSPACE_B_PASSWORD, code: generateTotp(workspaceBSecret) });
  check(response.status === 401, 'senha antiga do escritório B não deve autenticar');
  response = await login(server.baseUrl, { username: 'titular.b.teste', password: WORKSPACE_B_NEW_PASSWORD, code: await freshTotp(workspaceBSecret) });
  workspaceBCookie = sessionCookie(response);
  check(response.status === 200 && Boolean(workspaceBCookie), 'senha nova do escritório B deve autenticar');
  const workspaceBUsers = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: workspaceBCookie } })).json();
  check(!workspaceBUsers.users.some(user => user.username === 'titular.teste'), 'escritório B não deve listar usuários do escritório A');
  const workspaceBState = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: workspaceBCookie } })).json();
  check((workspaceBState.state?.audit || []).some(entry => entry.action === 'Redefinição de senha concluída'), 'auditoria do escritório B deve registrar a redefinição');

  // =========================================================
  // 8. rate limit por identidade e por endereço
  // =========================================================
  let lastRateLimited = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    lastRateLimited = await forgot(server.baseUrl, 'limite.testes@example.test');
  }
  check(lastRateLimited.status === 429, 'excesso de solicitações para a mesma identidade deve retornar 429');
  check(Number(lastRateLimited.headers.get('retry-after')) > 0, 'rate limit deve informar Retry-After');
  const limitedBody = await lastRateLimited.json();
  check(!/titular|colaboradora/i.test(JSON.stringify(limitedBody)), 'resposta de rate limit não deve expor identidade');

  // =========================================================
  // 9. Sem backdoor administrativa e erros de token uniformes
  // =========================================================
  // A sessão do master foi renovada após a redefinição de senha (sem step-up);
  // concede uma janela fresca antes do cenário de backdoor.
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: collaborator.id,
    status: 'active',
    password: MASTER_NEW_PASSWORD,
    code: await freshTotp(masterSecret)
  }, { Cookie: masterCookie, 'X-CSRF-Token': masterCsrf });
  check(response.status === 200, 'renovação de step-up do master deve ser aceita');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: collaborator.id,
    status: 'active',
    password: 'Backdoor-Senha-2026!'
  }, { Cookie: masterCookie, 'X-CSRF-Token': masterCsrf });
  check(response.status === 200, 'gestão de usuário deve ignorar campos não autorizados');
  check((await login(server.baseUrl, { username: 'colaboradora.teste', password: 'Backdoor-Senha-2026!', code: generateTotp(collaboratorSecret) })).status === 401, 'administrador não pode definir senha de outro usuário');
  check((await login(server.baseUrl, { username: 'colaboradora.teste', password: COLLABORATOR_NEW_PASSWORD, code: collaboratorRecoveryCodes[4] })).status === 200, 'senha da colaboradora deve seguir somente pelo fluxo de recuperação');

  const consumedTokenResponse = await reset(server.baseUrl, firstToken, 'Senha-Uniforme-2026!');
  const consumedTokenMessage = await consumedTokenResponse.json();
  check(consumedTokenResponse.status === 401, 'token já consumido deve responder 401');
  check(unknownTokenMessage.message === consumedTokenMessage.message, 'erros de token desconhecido e consumido devem ser idênticos');

  // =========================================================
  // 10. limite por endereço de origem (compartilhado por forgot/reset)
  // =========================================================
  // Executado por último: esgota deliberadamente o bucket do endereço do testemunho.
  const addressAttempts = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const probe = await forgot(server.baseUrl, `endereco.limite.${attempt}@example.test`);
    addressAttempts.push(probe.status);
    if (probe.status === 429) break;
  }
  check(addressAttempts.includes(200), 'limite por endereço não pode bloquear antes de uso legítimo');
  check(addressAttempts.at(-1) === 429, 'esgotar o bucket do endereço deve retornar 429 mesmo com identidade nova');
  const resetAfterAddressLimit = await reset(server.baseUrl, 'y'.repeat(43), 'Senha-Uniforme-2026!');
  check(resetAfterAddressLimit.status === 429, 'o bucket do endereço também limita o endpoint de redefinição');
} finally {
  await server.stop();
}

// =========================================================
// 11. Expiração, persistência em restart e estado mestre (SecurityManager)
// =========================================================
const unitDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-password-reset-unit-'));
try {
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');
  const manager = new SecurityManager({ dataDirectory: unitDirectory, sessionSecret, encryptionKey });
  await manager.init();
  const setup = await manager.beginSetup({ username: 'mestre.teste', displayName: 'Mestre Teste', email: 'mestre@example.test', password: 'Senha-Mestre-Unit-2026!', workspaceName: 'Escritorio Unit' }, '127.0.0.1');
  await manager.finishSetup({ setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });

  const request = await manager.requestPasswordReset({ identifier: 'mestre@example.test' }, '203.0.113.10');
  check(request.delivered === true, 'unit: solicitação deve gerar token para conta ativa');
  const stored = JSON.parse(fs.readFileSync(path.join(unitDirectory, 'security.json'), 'utf8'));
  check(stored.passwordResetTokens.length === 1, 'unit: apenas o hash do token pendente deve existir');
  check(stored.passwordResetTokens[0].tokenHash === tokenHashOf(request.token), 'unit: tokenHash deve ser exatamente sha256(token)');
  check(!JSON.stringify(stored).includes(request.token), 'unit: token em texto puro não pode ser persistido');

  // O token pendente sobrevive ao restart do serviço (persistência real, não Map em memória).
  const restarted = new SecurityManager({ dataDirectory: unitDirectory, sessionSecret, encryptionKey });
  await restarted.init();
  check(restarted.state.passwordResetTokens.length === 1, 'unit: token pendente deve sobreviver ao reinício');
  const completedAfterRestart = await restarted.completePasswordReset({ token: request.token, password: 'Senha-Unit-Nova-2026!' }, '203.0.113.10');
  check(completedAfterRestart.ok === true, 'unit: token persistido deve funcionar após reinício');

  // Expiração validada pelo estado persistido: um novo processo descarta o token vencido.
  const expiredRequest = await restarted.requestPasswordReset({ identifier: 'mestre@example.test' }, '203.0.113.10');
  const expiredState = JSON.parse(fs.readFileSync(path.join(unitDirectory, 'security.json'), 'utf8'));
  expiredState.passwordResetTokens[0].expiresAt = Date.now() - 1;
  fs.writeFileSync(path.join(unitDirectory, 'security.json'), JSON.stringify(expiredState, null, 2));
  const afterExpiry = new SecurityManager({ dataDirectory: unitDirectory, sessionSecret, encryptionKey });
  await afterExpiry.init();
  check(afterExpiry.state.passwordResetTokens.length === 0, 'unit: token expirado deve ser podado ao carregar o estado persistido');
  await assert.rejects(
    () => afterExpiry.completePasswordReset({ token: expiredRequest.token, password: 'Senha-Unit-Nova-2026!' }, '203.0.113.10'),
    error => error.statusCode === 401,
    'unit: token expirado deve ser rejeitado'
  );

  const secondRequest = await afterExpiry.requestPasswordReset({ identifier: 'mestre@example.test' }, '203.0.113.10');
  const completed = await afterExpiry.completePasswordReset({ token: secondRequest.token, password: 'Senha-Unit-Nova-2026!' }, '203.0.113.10');
  check(completed.ok === true, 'unit: token válido deve concluir a redefinição');
  check(afterExpiry.state.passwordHash === afterExpiry.state.users[0].passwordHash, 'unit: estado mestre legado deve acompanhar o hash do usuário');
  await assert.rejects(
    () => afterExpiry.changePassword({ username: 'mestre.teste', workspaceId: afterExpiry.state.defaultWorkspaceId, currentPassword: 'Senha-Unit-Nova-2026!', newPassword: 'Senha-Unit-Nova-2026!' }, '203.0.113.10'),
    error => error.statusCode === 400,
    'unit: conta com MFA deve exigir segundo fator mesmo com a senha correta'
  );
  const unchanged = await afterExpiry.login({ username: 'mestre.teste', password: 'Senha-Unit-Nova-2026!', code: await freshTotp(setup.manualSecret) }, '203.0.113.10');
  check(Boolean(unchanged.token), 'unit: senha alterada continua válida após tentativa negada');

  const changed = await afterExpiry.changePassword({
    username: 'mestre.teste',
    workspaceId: afterExpiry.state.defaultWorkspaceId,
    currentPassword: 'Senha-Unit-Nova-2026!',
    newPassword: 'Senha-Unit-Terceira-2026!',
    code: generateTotp(setup.manualSecret)
  }, '203.0.113.10');
  check(changed.ok === true, 'unit: alteração com segundo fator deve concluir');
  const pendingBefore = await afterExpiry.requestPasswordReset({ identifier: 'mestre@example.test' }, '203.0.113.11');
  check(pendingBefore.delivered === true, 'unit: novo pedido de redefinição deve gerar token');
  await afterExpiry.changePassword({
    username: 'mestre.teste',
    workspaceId: afterExpiry.state.defaultWorkspaceId,
    currentPassword: 'Senha-Unit-Terceira-2026!',
    newPassword: 'Senha-Unit-Quarta-2026!',
    code: generateTotp(setup.manualSecret)
  }, '203.0.113.12');
  check((afterExpiry.state.passwordResetTokens || []).length === 0, 'unit: alteração de senha deve invalidar tokens de redefinição pendentes');
  await assert.rejects(
    () => afterExpiry.completePasswordReset({ token: pendingBefore.token, password: 'Senha-Unit-Quinta-2026!' }, '203.0.113.13'),
    error => error.statusCode === 401,
    'unit: token pendente invalidado não pode mais redefinir'
  );
} finally {
  await rm(unitDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// =========================================================
// 10. Teto diário de e-mails de redefinição por escritório
// =========================================================
const { NotificationDatabase } = await import('../lib/notifications/db.mjs');
const { NotificationService, PASSWORD_RESET_DAILY_LIMIT } = await import('../lib/notifications/notification-service.mjs');
const memoryDb = new NotificationDatabase({ inMemory: true });
try {
  const service = new NotificationService({
    db: memoryDb,
    provider: { getFromAddress: () => 'ATRIUM <nao-responda@example.test>' },
    baseUrl: 'https://atrium.adv.br'
  });
  let enqueued = 0;
  let throttled = 0;
  for (let index = 0; index < PASSWORD_RESET_DAILY_LIMIT + 2; index += 1) {
    const result = await service.sendPasswordResetEmail({
      workspaceId: 'ws-synthetic',
      recipient: 'destino@example.test',
      displayName: 'Advogada Teste',
      resetUrl: `https://atrium.adv.br/#reset=token-sintetico-${index}`
    });
    if (result?.enqueued) enqueued += 1; else throttled += 1;
  }
  check(enqueued === PASSWORD_RESET_DAILY_LIMIT, `teto diário deve permitir ${PASSWORD_RESET_DAILY_LIMIT} envios por escritório`);
  check(throttled === 2, 'excedente deve ser bloqueado silenciosamente pelo orçamento do escritório');
  check(memoryDb.countOutboxByEventTypeSince('ws-synthetic', 'PASSWORD_RESET', new Date(Date.now() - 86_400_000).toISOString()) === PASSWORD_RESET_DAILY_LIMIT, 'contagem diária deve refletir apenas os envios enfileirados');
  check(memoryDb.countOutboxByEventTypeSince('ws-outro', 'PASSWORD_RESET', new Date(Date.now() - 86_400_000).toISOString()) === 0, 'teto diário deve ser isolado por escritório');
} finally {
  memoryDb.close();
}

console.log('======================================================');
console.log('PASSWORD RECOVERY — integração e segurança');
console.log(`Asserções: ${assertions}/${assertions}`);
console.log(`Teto diário de redefinição por escritório: ${PASSWORD_RESET_DAILY_LIMIT}`);
console.log('======================================================');
console.log('PASSWORD RECOVERY OK');
