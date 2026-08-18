import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', password: 'Senha-202' });
  assert(response.status === 400, 'Senha com menos de 10 caracteres foi aceita.');
  response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'admin', displayName: 'Advogado Administrador', password }); payload = await response.json();
  assert(response.ok && payload.setupToken && payload.manualSecret && payload.qrCode.startsWith('data:image/png'), 'Configuração TOTP não foi iniciada.');

  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: payload.setupToken, code: generateTotp(payload.manualSecret) });
  const verified = await response.json();
  assert(response.ok && verified.recoveryCodes.length === 8, 'Segundo fator não foi ativado.');
  const cookie = response.headers.get('set-cookie').split(';')[0]; const csrf = verified.csrfToken; const recovery = verified.recoveryCodes[0];
  response = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } }); assert(response.ok, 'Sessão autenticada não acessou a API.');
  response = await postJson(`${server.baseUrl}/api/sync`, {}, { Cookie: cookie }); assert(response.status === 403, 'POST autenticado foi aceito sem CSRF.');
  response = await postJson(`${server.baseUrl}/api/sync`, {}, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'POST com sessão e CSRF foi recusado.');
  const protectedState = { version: 1, terms: [], sources: [], intimations: [{ id: 'secret', title: 'Segredo de teste' }], tasks: [], processes: [], agenda: [], audit: [], settings: {} };
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie }); assert(response.status === 403, 'Estado foi gravado sem CSRF.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'Estado autenticado não foi gravado.');
  const encryptedFile = await readFile(path.join(server.dataDirectory, 'app-state.json'), 'utf8');
  assert(!encryptedFile.includes('Segredo de teste') && encryptedFile.includes('aes-256-gcm'), 'Dados jurídicos não ficaram criptografados em repouso.');
  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const recoveredState = await response.json();
  assert(recoveredState.state.intimations[0].title === 'Segredo de teste' && recoveredState.revision, 'Estado criptografado não pôde ser recuperado após autenticação.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.status === 409, 'Uma aba desatualizada conseguiu sobrescrever o estado mais recente.');
  response = await postJson(`${server.baseUrl}/api/state`, { state: protectedState, revision: recoveredState.revision }, { Cookie: cookie, 'X-CSRF-Token': csrf });
  assert(response.ok, 'A versão atual do estado não pôde ser salva.');

  response = await postJson(`${server.baseUrl}/api/ingest`, {
    events: [], tasks: [], intimations: [], sources: [],
    processes: [{ id: 'collector-secret', number: '5000000-00.2026.8.21.0001', client: 'Cliente sigiloso do coletor' }]
  }, { Authorization: `Bearer ${server.collectorToken}` });
  assert(response.ok, 'O coletor autorizado não conseguiu gravar o estado intermediário.');
  const encryptedRuntime = await readFile(path.join(server.dataDirectory, 'runtime.json'), 'utf8');
  assert(encryptedRuntime.includes('aes-256-gcm') && !encryptedRuntime.includes('Cliente sigiloso do coletor') && !encryptedRuntime.includes('5000000-00.2026.8.21.0001'), 'O estado intermediário do coletor não ficou criptografado em repouso.');

  response = await postJson(`${server.baseUrl}/api/auth/logout`, {}, { Cookie: cookie, 'X-CSRF-Token': csrf }); assert(response.ok, 'Logout protegido falhou.');
  response = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } }); assert(response.status === 401, 'Sessão continuou válida após logout.');
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: recovery }); assert(response.ok, 'Código de recuperação válido foi recusado.');
  const recovered = await response.json(); const recoveryCookie = response.headers.get('set-cookie').split(';')[0];
  await postJson(`${server.baseUrl}/api/auth/logout`, {}, { Cookie: recoveryCookie, 'X-CSRF-Token': recovered.csrfToken });
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: recovery }); assert(response.status === 401, 'Código de recuperação foi reutilizado.');

  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'admin', password, code: generateTotp(payload.manualSecret), trustBrowser: true });
  const trustedLogin = await response.json();
  const trustedCookies = response.headers.getSetCookie();
  const trustedCookie = trustedCookies.map(value => value.split(';')[0]).find(value => value.startsWith('keller_trusted='));
  assert(response.ok && trustedLogin.trustedDevice && trustedCookie, 'A opção de confiar no navegador não criou um dispositivo confiável.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: trustedCookie } });
  const trustedStatus = await response.json();
  assert(trustedStatus.authenticated && trustedStatus.trustedDevice && trustedStatus.csrfToken, 'O navegador confiável não restaurou a sessão sem novo TOTP.');
  response = await postJson(`${server.baseUrl}/api/auth/trusted-device/revoke`, {}, { Cookie: trustedCookie, 'X-CSRF-Token': trustedStatus.csrfToken });
  assert(response.ok, 'A confiança do navegador não pôde ser revogada.');
  response = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: trustedCookie } });
  assert(!(await response.json()).authenticated, 'O navegador continuou confiável após a revogação.');

  for (let index = 0; index < 5; index++) await postJson(`${server.baseUrl}/api/auth/login`, { username: 'bloqueio', password: 'Incorreta-123456!', code: '000000' });
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'bloqueio', password: 'Incorreta-123456!', code: '000000' });
  assert(response.status === 429 && response.headers.has('retry-after'), 'Limitação de tentativas não bloqueou o atacante.');
  console.log('Security test aprovado: senha, TOTP, navegador confiável, revogação, recuperação, sessão, CSRF, rate limit, CSP, arquivos privados, estado principal e coleta criptografados.');
} finally { await server.stop(); }

function assert(condition, message) { if (!condition) throw new Error(message); }
