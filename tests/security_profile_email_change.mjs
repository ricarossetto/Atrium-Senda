import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('=== security_profile_email_change (troca de e-mail com step-up) ===');

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function sessionCookie(response, name = 'keller_session') {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const found = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0] : '';
}

function csrfHeaders(cookie, csrfToken) {
  return {
    Cookie: cookie,
    'x-csrf-token': csrfToken,
    'x-atrium-csrf': csrfToken,
    'x-csrf': csrfToken
  };
}

async function statusWith(cookie) {
  const response = await fetch(`${base}/api/auth/status`, { headers: { Cookie: cookie } });
  return response.json();
}

const USERNAME = 'advogada-teste';
const PASSWORD = 'senha-Teste-2026!';
const EMAIL_ORIGINAL = 'teste@example.test';
const EMAIL_NOVO = 'novo@example.test';
const step = () => Math.floor(Date.now() / 30_000);
const sha256 = value => createHash('sha256').update(value).digest('base64url');

const server = await startTestServer({
  env: {
    ATRIUM_MOCK_RESEND: 'true',
    RESEND_WEBHOOK_SECRET: 'segredo-sintetico-webhook-2026'
  }
});
const base = server.baseUrl;
let unitDirectory = null;

try {
  let response = await postJson(`${base}/api/auth/setup`, {
    username: USERNAME,
    password: PASSWORD,
    displayName: 'Advogada Teste',
    email: EMAIL_ORIGINAL
  });
  check(response.ok, 'setup deve aceitar cadastro sintético');
  const setup = await response.json();
  const totpSecret = setup.manualSecret;
  check(Boolean(totpSecret), 'setup deve expor o segredo TOTP sintético');

  response = await postJson(`${base}/api/auth/setup/verify`, {
    setupToken: setup.setupToken || setup.token,
    code: generateTotp(totpSecret)
  });
  check(response.status === 200, 'setup/verify com TOTP deve concluir');
  const setupResult = await response.json();
  const sessionA = sessionCookie(response);
  const authA = csrfHeaders(sessionA, setupResult.csrfToken);
  const recoveryCodes = setupResult.recoveryCodes || [];
  check(recoveryCodes.length >= 2, 'setup com MFA deve emitir códigos de recuperação sintéticos');

  const before = await statusWith(sessionA);
  check(before.user.email === EMAIL_ORIGINAL, 'e-mail inicial deve ser o endereço sintético cadastrado');

  // (a) sessão + CSRF não bastam para trocar o e-mail.
  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste', email: EMAIL_NOVO, phone: '', avatar: ''
  }, authA);
  check(response.status === 403, 'troca de e-mail sem reautenticação deve ser rejeitada');
  const denied = await response.json();
  check(/senha/i.test(denied.message || ''), 'recusa deve pedir a senha atual');
  check(denied.code === 'REAUTH_REQUIRED', 'recusa deve sinalizar REAUTH_REQUIRED ao cliente');
  check(response.headers.get('x-atrium-reauth') === 'required', 'resposta deve pedir reautenticação no cabeçalho');
  check((await statusWith(sessionA)).user.email === EMAIL_ORIGINAL, 'recusa não pode alterar o e-mail persistido');

  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste', email: EMAIL_NOVO, currentPassword: 'senha-errada-2026!'
  }, authA);
  check(response.status === 403, 'senha incorreta não autoriza a troca');

  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste', email: EMAIL_NOVO, currentPassword: PASSWORD
  }, authA);
  check(response.status === 403, 'conta com MFA exige o segundo fator na troca de e-mail');

  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste', email: EMAIL_NOVO, currentPassword: PASSWORD, mfaCode: '000000'
  }, authA);
  check(response.status === 403, 'código TOTP inválido não autoriza a troca');

  // Remover o e-mail existente também é alteração sensível: sem step-up a
  // remoção apagaria o endereço e abriria caminho para vincular outro depois.
  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste', email: '', phone: '', avatar: ''
  }, authA);
  check(response.status === 403, 'remoção do e-mail sem reautenticação deve ser rejeitada');
  check((await statusWith(sessionA)).user.email === EMAIL_ORIGINAL, 'recusa da remoção não pode apagar o e-mail persistido');

  // Sessão B e sessão C criadas antes da troca, usando recovery codes sintéticos
  // para não consumir o passo do TOTP usado na reautenticação.
  response = await postJson(`${base}/api/auth/login`, {
    username: USERNAME, password: PASSWORD, code: recoveryCodes[0]
  });
  check(response.status === 200, 'login da sessão B deve concluir');
  const sessionB = sessionCookie(response);
  check((await statusWith(sessionB)).authenticated === true, 'sessão B deve estar ativa antes da troca');

  // (b) reautenticação correta (senha + TOTP) autoriza a troca.
  response = await postJson(`${base}/api/auth/profile`, {
    displayName: 'Advogada Teste',
    email: EMAIL_NOVO,
    phone: '',
    avatar: '',
    currentPassword: PASSWORD,
    mfaCode: generateTotp(totpSecret, step() + 1)
  }, authA);
  check(response.status === 200, `troca com senha e TOTP válidos deve funcionar (status=${response.status})`);
  const changed = await response.json();
  check(changed.user.email === EMAIL_NOVO, 'resposta deve trazer o novo e-mail');
  check(changed.emailNotice === 'queued', 'aviso ao endereço anterior deve ser enfileirado no pipeline oficial');

  check((await statusWith(sessionA)).authenticated === true, 'sessão atual deve sobreviver à troca');
  check((await statusWith(sessionB)).authenticated === false, 'demais sessões devem ser revogadas após a troca');

  // Cookie legado inválido não pode sombrear um cookie de sessão válido.
  response = await fetch(`${base}/api/auth/status`, {
    headers: { Cookie: `atrium_session=token-legado-invalido; ${sessionA}` }
  });
  check((await response.json()).authenticated === true, 'leitura deve aceitar o cookie válido mesmo com legado inválido');

  // (c) logout pelo nome legado também revoga a sessão no servidor.
  response = await postJson(`${base}/api/auth/login`, {
    username: USERNAME, password: PASSWORD, code: recoveryCodes[1]
  });
  check(response.status === 200, 'login da sessão C deve concluir');
  const loginC = await response.json();
  const sessionC = sessionCookie(response);
  const authCLegacy = csrfHeaders(sessionC.replace(/^keller_session=/, 'atrium_session='), loginC.csrfToken);
  check((await statusWith(sessionC.replace(/^keller_session=/, 'atrium_session='))).authenticated === true, 'cookie legado deve autenticar');
  response = await postJson(`${base}/api/auth/logout`, {}, authCLegacy);
  check(response.status === 200, 'logout com cookie legado deve concluir');
  check((await statusWith(sessionC)).authenticated === false, 'logout deve revogar também a sessão do cookie legado');

  // Limpeza dos dois nomes no navegador é responsabilidade de clearSessionCookies().
  unitDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-email-change-'));
  const manager = new SecurityManager({
    dataDirectory: unitDirectory,
    sessionSecret: server.sessionSecret,
    encryptionKey: server.encryptionKey
  });
  const tokenA = randomBytes(32).toString('base64url');
  const tokenB = randomBytes(32).toString('base64url');
  manager.sessions.set(sha256(tokenA), { username: USERNAME });
  manager.sessions.set(sha256(tokenB), { username: USERNAME });
  await manager.logout({ headers: { cookie: `atrium_session=${tokenA}; keller_session=${tokenB}` } });
  check(manager.sessions.size === 0, 'logout unitário deve revogar tokens dos dois nomes');
  const clears = manager.clearSessionCookies();
  check(clears.length === 2, 'clearSessionCookies deve devolver dois cabeçalhos');
  check(clears.some(cookie => cookie.startsWith('atrium_session=')), 'limpeza deve incluir o cookie legado');
  check(clears.some(cookie => cookie.startsWith('keller_session=')), 'limpeza deve incluir o cookie atual');
  check(clears.every(cookie => /Max-Age=0/.test(cookie)), 'ambos os cookies devem expirar imediatamente');

  console.log(`security_profile_email_change: PASS (${assertions} asserções)`);
} finally {
  if (unitDirectory) {
    await rm(unitDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  await server.stop();
}
process.exit(0);
