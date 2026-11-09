import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

console.log('=== admin_reauthentication (F-19 step-up) ===');

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') || ''];
  const found = cookies.find(cookie => cookie.startsWith('keller_session='));
  return found ? found.split(';')[0] : '';
}

function csrfHeaders(cookie, csrfToken) {
  return {
    Cookie: cookie,
    'x-atrium-csrf': csrfToken,
    'x-csrf-token': csrfToken,
    'x-csrf': csrfToken
  };
}

async function postJson(url, body, headers = {}) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

const PASSWORD = 'senha-Mestre-2026!';
const USERNAME = 'mestra';
const step = () => Math.floor(Date.now() / 30_000);

const server = await startTestServer({ env: { ATRIUM_MOCK_RESEND: 'true' } });
const base = server.baseUrl;
try {
  // 1. Master COM MFA (setup completo em um passo).
  let response = await postJson(`${base}/api/auth/setup`, { username: USERNAME, password: PASSWORD, displayName: 'Advogada Teste', email: 'teste@example.test' });
  check(response.ok, 'beginSetup deve aceitar o cadastro inicial');
  const setupBody = await response.json();
  const setupToken = setupBody.setupToken || setupBody.token;
  const manualSecret = setupBody.manualSecret;
  check(Boolean(manualSecret), 'beginSetup deve expor o segredo manual para o 2FA');
  response = await postJson(`${base}/api/auth/setup/verify`, { setupToken, code: generateTotp(manualSecret) });
  check(response.status === 200, 'setup/verify com TOTP deve concluir');
  const setupResult = await response.json();
  const session = sessionCookie(response);
  const csrf = setupResult.csrfToken;
  const recoveryCodes = setupResult.recoveryCodes || [];
  check(recoveryCodes.length === 8, 'setup com MFA deve emitir 8 recovery codes');
  const auth = csrfHeaders(session, csrf);

  // 2. users/manage SEM reautenticacao -> 403 REAUTH_REQUIRED.
  response = await postJson(`${base}/api/auth/users/manage`, { userId: 'qualquer', role: 'admin' }, auth);
  check(response.status === 403, 'users/manage sem reautenticacao deve ser bloqueada');
  let payload = await response.json();
  check(/reautentica/.test(payload.message || ''), 'bloqueio deve exigir reautenticacao');

  // 3. users/manage com senha errada -> bloqueada.
  response = await postJson(`${base}/api/auth/users/manage`, { userId: 'qualquer', role: 'admin', password: 'senha-errada-2026!' }, auth);
  check(response.status === 403, 'senha incorreta deve barrar o step-up');

  // 4. users/manage com code errado -> bloqueada.
  response = await postJson(`${base}/api/auth/users/manage`, { userId: 'qualquer', role: 'admin', password: PASSWORD, code: '000000' }, auth);
  check(response.status === 403, 'codigo invalido deve barrar o step-up');

  // 5. body so com code (sem senha) -> bloqueada (senha e obrigatoria).
  response = await postJson(`${base}/api/auth/users/manage`, { userId: 'qualquer', role: 'admin', code: generateTotp(manualSecret, step() + 1) }, auth);
  check(response.status === 403, 'step-up sem senha deve ser bloqueado');

  // 6. backup/create SEM reautenticacao -> 403.
  response = await postJson(`${base}/api/system/backup/create`, {}, auth);
  check(response.status === 403, 'backup/create sem reautenticacao deve ser bloqueada');

  // 7. backup/restore SEM reautenticacao -> 403 antes de validar o backup.
  response = await postJson(`${base}/api/system/backup/restore`, { backupData: { qualquer: true } }, auth);
  check(response.status === 403, 'backup/restore sem reautenticacao deve ser bloqueada');

  // 8. admin/users/role SEM reautenticacao -> 403.
  response = await postJson(`${base}/api/admin/users/role`, { userId: 'qualquer', role: 'admin' }, auth);
  check(response.status === 403, 'users/role sem reautenticacao deve ser bloqueada');

  // 9. users/delete SEM reautenticacao -> 403.
  response = await postJson(`${base}/api/auth/users/delete`, { userId: 'qualquer' }, auth);
  check(response.status === 403, 'users/delete sem reautenticacao deve ser bloqueada');

  response = await fetch(`${base}/api/admin/mail/status`, { headers: { Cookie: session } });
  check(response.status === 200, 'master com MFA pode consultar Mail sem step-up');
  check((await response.json()).stats.enabled === true, 'Mail nasce ativado');
  for (const [route, body] of [
    ['/api/admin/mail/toggle', { enabled: false }],
    ['/api/admin/mail/test', { recipient: 'teste@example.test' }]
  ]) {
    response = await postJson(`${base}${route}`, body, auth);
    check(response.status === 403, `${route} sem step-up deve ser recusada`);
    check((await response.json()).code === 'REAUTH_REQUIRED', `${route} sinaliza step-up ao cliente`);
  }
  response = await fetch(`${base}/api/admin/mail/status`, { headers: { Cookie: session } });
  const mailAfterDenials = await response.json();
  check(mailAfterDenials.stats.enabled === true, 'recusa do toggle preserva Mail ativado');
  check((mailAfterDenials.stats.queue?.QUEUED || 0) === 0, 'recusa do teste não enfileira mensagem');
  response = await postJson(`${base}/api/admin/mail/toggle`, {
    enabled: false, password: PASSWORD, code: generateTotp(manualSecret, step() + 1)
  }, auth);
  check(response.status === 200, 'step-up valido autoriza desativar Mail');
  check((await response.json()).enabled === false, 'Mail fica desativado depois do toggle');

  // 10. Step-up valido (senha + TOTP) libera a acao sensivel (sessao A).
  response = await postJson(`${base}/api/system/backup/create`, { password: PASSWORD, code: generateTotp(manualSecret, step() + 1) }, auth);
  check(response.status === 200, `step-up com senha e TOTP deve liberar a acao sensivel (status=${response.status})`);

  // 11. Janela de step-up (10 min): acoes seguintes na MESMA sessao nao revalidam.
  response = await postJson(`${base}/api/system/backup/create`, {}, auth);
  check(response.status === 200, `step-up recente deve desbloquear a sequencia de acoes (status=${response.status})`);

  // 12. Recuperacao por recovery code no LOGIN (perda do 2o fator) -> sessao B.
  response = await postJson(`${base}/api/auth/logout`, {}, auth);
  check(response.status === 200, 'logout deve concluir');
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD, code: recoveryCodes[1] });
  check(response.status === 200, `login com recovery code deve autenticar (status=${response.status})`);
  const authB = csrfHeaders(sessionCookie(response), (await response.json()).csrfToken);

  // 13. Recovery code no STEP-UP (sessao B, fora de janela) libera a acao e e consumido.
  response = await postJson(`${base}/api/system/backup/create`, { password: PASSWORD, code: recoveryCodes[0] }, authB);
  check(response.status === 200, `step-up com recovery code deve liberar a acao (status=${response.status})`);

  // 14. Recovery code e de uso unico: reuso em sessao C (fora de qualquer janela) e barrado.
  response = await postJson(`${base}/api/auth/logout`, {}, authB);
  check(response.status === 200, 'logout da sessao B deve concluir');
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD, code: recoveryCodes[2] });
  check(response.status === 200, `segundo recovery code deve autenticar (status=${response.status})`);
  const authC = csrfHeaders(sessionCookie(response), (await response.json()).csrfToken);
  response = await postJson(`${base}/api/system/backup/create`, { password: PASSWORD, code: recoveryCodes[0] }, authC);
  check(response.status === 403, `recovery code deve ser de uso unico (status=${response.status})`);

  console.log(`admin_reauthentication: PASS (${assertions} assercoes)`);
} finally {
  await server.stop();
  await new Promise(resolve => setTimeout(resolve, 700));
}
process.exit(0);
