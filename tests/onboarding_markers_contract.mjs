// Contrato: a marcação de primeiro acesso (apresentação vista, bloco "Comece por aqui"
// ocultado) fica no perfil do usuário no servidor e vale em qualquer navegador.
// Diretório de dados isolado e contas sintéticas.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { postJson, startTestServer } from './helpers.mjs';

const password = 'Senha-Onboarding-2026!';
let server = await startTestServer({ preserveDataDirectory: true });
const dataDirectory = server.dataDirectory;
const secrets = { AUTH_SESSION_SECRET: server.sessionSecret, AUTH_ENCRYPTION_KEY: server.encryptionKey };

const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

async function register(route, username, workspaceName) {
  let response = await postJson(`${server.baseUrl}${route}`, {
    username, displayName: `Advogada Teste ${username}`, email: `${username}@example.test`, workspaceName, password
  });
  const pending = await response.json();
  assert.equal(response.ok, true, pending.message);
  response = await postJson(`${server.baseUrl}${route}/verify`, { setupToken: pending.setupToken, skipMfa: true });
  const session = await response.json();
  assert.equal(response.ok, true, session.message);
  return { ...session, cookie: cookieOf(response) };
}

// Contas sem segundo fator (como no cadastro pela interface): o login não depende do
// passo do TOTP, que recusa reuso do mesmo código entre reinícios rápidos.
async function login(username) {
  const response = await postJson(`${server.baseUrl}/api/auth/login`, { username, password });
  const body = await response.json();
  assert.equal(response.ok, true, body.message);
  return { ...body, cookie: cookieOf(response) };
}

async function status(session) {
  const response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: session.cookie } });
  return (await response.json()).user;
}

const mark = (session, marker, headers = {}) => postJson(`${server.baseUrl}/api/auth/onboarding`, { marker }, { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, ...headers });

try {
  const first = await register('/api/auth/setup', 'onboarding-a', 'Escritório Teste A');
  assert.deepEqual(first.user.onboarding, { productTourDone: false, firstStepsHidden: false }, 'Conta nova precisa ver a apresentação e o bloco no primeiro acesso.');
  assert.deepEqual((await status(first)).onboarding, { productTourDone: false, firstStepsHidden: false });

  // Mutação autenticada exige CSRF, sessão e marcação conhecida.
  let response = await postJson(`${server.baseUrl}/api/auth/onboarding`, { marker: 'productTour' });
  assert.equal(response.status, 401, 'Sem sessão a marcação não pode ser gravada.');
  response = await postJson(`${server.baseUrl}/api/auth/onboarding`, { marker: 'productTour' }, { Cookie: first.cookie });
  assert.equal(response.status, 403, 'Sem CSRF a marcação não pode ser gravada.');
  response = await mark(first, 'qualquerCoisa');
  assert.equal(response.status, 400, 'Marcação fora da lista precisa ser recusada.');
  response = await mark(first, ['productTour']);
  assert.equal(response.status, 400, 'Marcação que não é texto precisa ser recusada.');

  // Navegador A: conclui a apresentação.
  response = await mark(first, 'productTour');
  assert.equal(response.ok, true);
  assert.deepEqual((await response.json()).onboarding, { productTourDone: true, firstStepsHidden: false });

  // Navegador B (sessão nova, sem nada local): o servidor já informa a apresentação vista.
  const secondBrowser = await login('onboarding-a');
  assert.equal(secondBrowser.user.onboarding.productTourDone, true, 'Login em outro navegador não pode reabrir a apresentação.');
  assert.equal(secondBrowser.user.onboarding.firstStepsHidden, false);

  // Navegador B oculta o bloco; o navegador A passa a ver a marcação na próxima leitura.
  response = await mark(secondBrowser, 'firstSteps');
  assert.equal(response.ok, true);
  assert.deepEqual((await status(first)).onboarding, { productTourDone: true, firstStepsHidden: true });
  response = await mark(secondBrowser, 'firstSteps');
  assert.equal(response.ok, true, 'Repetir a marcação é idempotente.');

  // Conta criada depois não herda a marcação de outra pessoa.
  const second = await register('/api/auth/workspaces/register', 'onboarding-b', 'Escritório Teste B');
  assert.deepEqual(second.user.onboarding, { productTourDone: false, firstStepsHidden: false });

  // Reinício: marcações preservadas e a migração não reabre nem fecha contas novas.
  await server.stop();
  server = await startTestServer({ dataDirectory, env: secrets, preserveDataDirectory: true });
  assert.deepEqual((await login('onboarding-a')).user.onboarding, { productTourDone: true, firstStepsHidden: true });
  assert.deepEqual((await login('onboarding-b')).user.onboarding, { productTourDone: false, firstStepsHidden: false }, 'Reinício não pode marcar como vista a conta nova.');

  // Conta existente antes da marcação no servidor: a migração única a considera já vista.
  await server.stop();
  const securityFile = path.join(dataDirectory, 'security.json');
  const stored = JSON.parse(await readFile(securityFile, 'utf8'));
  delete stored.onboardingMarkersVersion;
  for (const user of stored.users) if (user.username === 'onboarding-b') delete user.onboarding;
  await writeFile(securityFile, JSON.stringify(stored, null, 2), 'utf8');
  server = await startTestServer({ dataDirectory, env: secrets, preserveDataDirectory: true });
  const legacy = await login('onboarding-b');
  assert.deepEqual(legacy.user.onboarding, { productTourDone: true, firstStepsHidden: true }, 'Conta existente não pode voltar a ver a apresentação e o bloco.');
  const migrated = JSON.parse(await readFile(securityFile, 'utf8'));
  assert.equal(migrated.onboardingMarkersVersion, 1);
  assert.equal(migrated.users.find(user => user.username === 'onboarding-b').onboarding.source, 'legacy');

  console.log('Contrato de marcação de primeiro acesso: ok.');
} finally {
  await server.stop();
}
