import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

console.log('=== admin_mfa_enforcement: 2FA opcional, ativavel depois e nunca bloqueante ===');

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

function allCookies(response) {
  return typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
}

function sessionCookie(response) {
  const found = allCookies(response).find(cookie => cookie.startsWith('keller_session='));
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

const PASSWORD = 'Senha-Mestre-2026!';
const OTHER_SECRET = 'MFRGGZDFMZTWQ2LK';
const USERNAME = 'mestra';
const step = () => Math.floor(Date.now() / 30_000);

const server = await startTestServer({ env: { ATRIUM_MOCK_RESEND: 'true' } });
const base = server.baseUrl;
try {
  // 1. Instalacao sem segundo fator (skipMfa) — o operador decide.
  let response = await postJson(`${base}/api/auth/setup`, { username: USERNAME, password: PASSWORD, displayName: 'Advogada Teste', email: 'teste@example.test' });
  check(response.ok, 'beginSetup deve aceitar o cadastro inicial');
  const setupBody = await response.json();
  response = await postJson(`${base}/api/auth/setup/verify`, { setupToken: setupBody.setupToken || setupBody.token, skipMfa: true });
  check(response.status === 200, `setup/verify com skipMfa deve concluir (status=${response.status})`);
  let payload = await response.json();
  let session = sessionCookie(response);
  let csrf = payload.csrfToken;
  check(Boolean(session) && Boolean(csrf), 'sessao e csrfToken devem ser emitidos');
  check(payload.user && payload.user.role === 'master_admin', 'conta inicial deve ser master_admin');

  // 2. CONTRATO: sem 2FA o plano administrativo abre normalmente.
  response = await fetch(`${base}/api/admin/overview`, { headers: { Cookie: session } });
  check(response.status === 200, `admin sem 2FA deve acessar o plano administrativo (status=${response.status})`);
  response = await fetch(`${base}/api/state`, { headers: { Cookie: session } });
  check(response.status === 200, 'estado do escritorio deve continuar acessivel');

  // 3. Acao administrativa com step-up de senha executa sem codigo.
  response = await postJson(`${base}/api/system/rebuild-runtime`, { password: PASSWORD }, csrfHeaders(session, csrf));
  check(response.status === 200, `rebuild-runtime sem 2FA deve executar com senha (status=${response.status})`);

  // 4. CSRF continua obrigatorio.
  response = await postJson(`${base}/api/system/rebuild-runtime`, { password: PASSWORD }, { Cookie: session });
  check(response.status === 403, `sem CSRF deve bloquear (status=${response.status})`);

  // 5. Papel continua sendo exigido: colaborador nao administra.
  response = await postJson(`${base}/api/auth/register`, { username: 'colab.mfa', displayName: 'Colaborador MFA', email: 'colab.mfa@example.test', password: 'Senha-Colab-2026!' }, csrfHeaders(session, csrf));
  check(response.status === 200, `master deve cadastrar colaborador (status=${response.status})`);
  const reg = await response.json();
  response = await postJson(`${base}/api/auth/register/verify`, { setupToken: reg.setupToken, skipMfa: true });
  check(response.status === 200, `registro do colaborador sem 2FA deve concluir (status=${response.status})`);
  const users = await (await fetch(`${base}/api/auth/users`, { headers: { Cookie: session } })).json();
  const colab = users.users.find(user => user.username === 'colab.mfa');
  check(Boolean(colab), 'colaborador deve constar na listagem');
  response = await postJson(`${base}/api/admin/users/role`, { userId: colab.id, status: 'active', password: PASSWORD }, csrfHeaders(session, csrf));
  check(response.status === 200, `aprovacao do colaborador sem codigo deve funcionar (status=${response.status})`);
  response = await postJson(`${base}/api/auth/login`, { username: 'colab.mfa', password: 'Senha-Colab-2026!' });
  check(response.status === 200, `colaborador deve logar (status=${response.status})`);
  const colabAuth = csrfHeaders(sessionCookie(response), (await response.json()).csrfToken);
  response = await postJson(`${base}/api/system/rebuild-runtime`, {}, colabAuth);
  check(response.status === 403, `colaborador nao administra (status=${response.status})`);
  payload = await response.json();
  check(/Apenas administradores/.test(payload.message || ''), 'bloqueio de papel deve citar a exigencia administrativa');

  // 6. Ativacao posterior: status -> enroll (QR/segredo) -> enable -> login exige codigo.
  response = await fetch(`${base}/api/auth/mfa/status`, { headers: { Cookie: session } });
  check(response.status === 200, `status do 2FA deve responder (status=${response.status})`);
  payload = await response.json();
  check(payload.mfaEnabled === false, 'conta nova deve comecar sem 2FA');
  response = await postJson(`${base}/api/auth/mfa/enroll`, {}, csrfHeaders(session, csrf));
  check(response.status === 200, `enroll deve gerar QR e segredo (status=${response.status})`);
  const enrollment = await response.json();
  check(typeof enrollment.manualSecret === 'string' && enrollment.manualSecret.length >= 16, 'enroll deve devolver o segredo manual');
  check(String(enrollment.qrCode || '').startsWith('data:image/'), 'enroll deve devolver o QR como data URL');
  response = await postJson(`${base}/api/auth/mfa/enable`, { password: PASSWORD, code: generateTotp(enrollment.manualSecret, step() + 1) }, csrfHeaders(session, csrf));
  check(response.status === 200, `enable com o segredo do enroll deve ativar (status=${response.status})`);
  payload = await response.json();
  check(payload.mfaEnabled === true, 'resposta deve confirmar mfaEnabled');
  check(Array.isArray(payload.recoveryCodes) && payload.recoveryCodes.length === 8, 'ativacao deve emitir 8 recovery codes');
  response = await fetch(`${base}/api/auth/mfa/status`, { headers: { Cookie: session } });
  payload = await response.json();
  check(payload.mfaEnabled === true, 'status deve refletir o 2FA ativo');
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD });
  check(response.status === 401, `login sem codigo com 2FA ativo deve falhar (status=${response.status})`);
  const codeValid = generateTotp(enrollment.manualSecret, step() + 1);
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD, code: codeValid });
  check(response.status === 200, `login com codigo valido deve autenticar (status=${response.status})`);
  session = sessionCookie(response);
  csrf = (await response.json()).csrfToken;
  response = await fetch(`${base}/api/admin/overview`, { headers: { Cookie: session } });
  check(response.status === 200, 'admin com 2FA segue acessando o plano administrativo');
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD, code: codeValid });
  check(response.status === 401, `replay de codigo deve ser rejeitado (status=${response.status})`);
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD, code: generateTotp(OTHER_SECRET, step()) });
  check(response.status === 401, `codigo de outro emissor deve ser rejeitado (status=${response.status})`);

  // 7. Desativacao posterior: senha + codigo atual; login volta a aceitar so senha.
  response = await postJson(`${base}/api/auth/mfa/disable`, { password: PASSWORD, code: generateTotp(enrollment.manualSecret, step() + 1) }, csrfHeaders(session, csrf));
  check(response.status === 200, `disable com codigo atual deve desativar (status=${response.status})`);
  // Desativar revoga as sessoes do usuario: entrar de novo sem codigo e conferir o status.
  response = await postJson(`${base}/api/auth/login`, { username: USERNAME, password: PASSWORD });
  check(response.status === 200, `login sem codigo volta a funcionar (status=${response.status})`);
  session = sessionCookie(response);
  csrf = (await response.json()).csrfToken;
  response = await fetch(`${base}/api/auth/mfa/status`, { headers: { Cookie: session } });
  payload = await response.json();
  check(payload.mfaEnabled === false, 'status deve refletir o 2FA desativado');
  response = await postJson(`${base}/api/auth/logout`, {}, csrfHeaders(session, csrf));
  check(response.status === 200, 'logout deve concluir');
  response = await fetch(`${base}/api/admin/overview`, { headers: { Cookie: session } });
  check(response.status === 401, `sessao revogada perde o plano administrativo (status=${response.status})`);
  response = await fetch(`${base}/api/admin/overview`, { headers: { Cookie: 'keller_session=forjada' } });
  check(response.status === 401, `cookie invalido recebe 401 (status=${response.status})`);

  console.log(`admin_mfa_enforcement: PASS (${assertions} assercoes)`);
} finally {
  await server.stop();
  await new Promise(resolve => setTimeout(resolve, 700));
}
process.exit(0);
