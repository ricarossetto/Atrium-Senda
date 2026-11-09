import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

// ── Achado run-5 v01: contexto de IA montado sobre o estado consolidado cru ──────────
// Dois membros no MESMO workspace. B cria um processo privado com sentinela. Como A,
// o payload enviado ao provedor NÃO pode conter a sentinela de B, mas DEVE conter o
// registro de escritório de A. O transporte do provedor é mockado (sem rede real) via
// preload `--import` no processo do servidor, que registra o corpo da requisição.

const ADMIN_PASSWORD = 'Contexto-Ai-Acesso-2026!';
const MEMBER_PASSWORD = 'Contexto-Ai-Membro-2026!';
const MEMBER_USERNAME = 'membro_contexto_ai';
const MEMBER_EMAIL = 'membro.contexto.ai@example.test';
const SYNTHETIC_AI_KEY = 'synthetic-ai-key-0000000000';

const A_CLIENT = 'Trabalhista SENTINELA-OFICIO-A-4c1a';
const B_CLIENT = 'Trabalhista SENTINELA-PRIVADO-B-9e2b';
const A_SENTINEL = 'SENTINELA-OFICIO-A-4c1a';
const B_SENTINEL = 'SENTINELA-PRIVADO-B-9e2b';
const MESSAGE = 'Analise a materia trabalhista do acervo sintetico.';
const RUNTIME_CNJ_OFFICE = '0000011-11.2026.8.21.0001';
const RUNTIME_CNJ_PRIV = '0000022-22.2026.8.21.0001';
const RUNTIME_OFFICE_SENTINEL = 'RUNTIME-OFICIO-A-7d3c';
const RUNTIME_PRIV_SENTINEL = 'RUNTIME-PRIVADO-B-1f8e';

const PRELOAD_SOURCE = `
import { appendFileSync } from 'node:fs';
const capturePath = process.env.ATRIUM_TEST_AI_CAPTURE;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (/generativelanguage\\.googleapis\\.com/.test(url)) {
    if (capturePath) {
      try { appendFileSync(capturePath, JSON.stringify({ url, body: init && init.body ? String(init.body) : '' }) + '\\n'); } catch {}
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Resposta sintetica do provedor.' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(input, init);
};
`;

console.log('\n===============================================================');
console.log('  ATRIUM — CONTEXTO DE IA RESPEITA O ACESSO (ESCOPO PRIVADO)');
console.log('===============================================================\n');

const workDir = await mkdtemp(path.join(tmpdir(), 'atrium-ai-context-'));
const capturePath = path.join(workDir, 'ai-capture.jsonl');
const preloadPath = path.join(workDir, 'ai-fetch-preload.mjs');
await writeFile(preloadPath, PRELOAD_SOURCE, 'utf8');
const preloadUrl = pathToFileURL(preloadPath).href;

const server = await startTestServer({
  env: {
    NODE_OPTIONS: `--import ${preloadUrl}`,
    ATRIUM_TEST_AI_CAPTURE: capturePath
  }
});

const authHeaders = (cookie, csrf) => ({ Cookie: cookie, 'X-CSRF-Token': csrf });
const readCapture = async () => {
  if (!existsSync(capturePath)) return [];
  const text = await readFile(capturePath, 'utf8');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
};

try {
  // ── Membro A (master_admin) ────────────────────────────────────────────────
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.contexto.ai',
    displayName: 'Administradora Contexto Sintetico',
    password: ADMIN_PASSWORD
  });
  const setup = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setup));
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200, JSON.stringify(verified));
  const aCookie = response.headers.get('set-cookie').split(';')[0];
  const aCsrf = verified.csrfToken;
  assert.ok(aCookie && aCsrf, 'Sessão de A sem cookie ou CSRF.');

  // ── Provedor de IA (gemini) com transporte mockado ─────────────────────────
  response = await postJson(`${server.baseUrl}/api/ai/configure`, {
    provider: 'gemini',
    apiKey: SYNTHETIC_AI_KEY,
    model: 'gemini-3.5-flash-lite'
  }, authHeaders(aCookie, aCsrf));
  const configured = await response.json();
  assert.equal(response.status, 200, JSON.stringify(configured));

  // ── Membro B (associado) no MESMO workspace ────────────────────────────────
  response = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: MEMBER_USERNAME,
    displayName: 'Membro Contexto Sintetico',
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
    officeRoleId: 'associate'
  }, authHeaders(aCookie, aCsrf));
  const registered = await response.json();
  assert.equal(response.status, 200, JSON.stringify(registered));

  response = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: registered.setupToken,
    code: generateTotp(registered.manualSecret)
  });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));

  response = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: aCookie } });
  const usersList = await response.json();
  const memberUser = usersList.users.find(user => user.username === MEMBER_USERNAME);
  assert.ok(memberUser, 'membro não encontrado para aprovação');
  response = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: memberUser.id,
    status: 'active',
    password: ADMIN_PASSWORD,
    code: generateTotp(setup.manualSecret)
  }, authHeaders(aCookie, aCsrf));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));

  response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: MEMBER_USERNAME,
    password: MEMBER_PASSWORD,
    code: generateTotp(registered.manualSecret)
  });
  const logged = await response.json();
  assert.equal(response.status, 200, JSON.stringify(logged));
  const bCookie = response.headers.get('set-cookie').split(';')[0];
  const bCsrf = logged.csrfToken;
  const bId = logged.user?.id;
  assert.ok(bCookie && bCsrf && bId, 'Sessão de B incompleta.');

  // ── A semeia um processo de ESCRITÓRIO (acessível) ─────────────────────────
  const aEnvelope = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: aCookie } })).json();
  const aId = verified.user?.id || '';
  const aProcess = {
    id: 'proc-oficio-a', number: 'PROC-OFICIO-A', client: A_CLIENT,
    scope: 'office', assignmentStatus: 'assigned',
    responsibleUserIds: [aId].filter(Boolean),
    assignedTeamIds: [], accessGrants: []
  };
  response = await postJson(`${server.baseUrl}/api/state`, {
    state: { ...(aEnvelope.state || {}), processes: [aProcess] },
    revision: aEnvelope.revision
  }, authHeaders(aCookie, aCsrf));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));

  // ── B cria um processo PRIVADO com sentinela ───────────────────────────────
  const bEnvelope = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: bCookie } })).json();
  const bProcess = {
    id: 'proc-privado-b', number: 'PROC-PRIVADO-B', client: B_CLIENT,
    scope: 'private', privateOwnerUserId: bId, assignmentStatus: 'assigned',
    responsibleUserIds: [bId], assignedTeamIds: [], accessGrants: []
  };
  response = await postJson(`${server.baseUrl}/api/state`, {
    state: { ...(bEnvelope.state || {}), processes: [...(bEnvelope.state?.processes || []), bProcess] },
    revision: bEnvelope.revision
  }, authHeaders(bCookie, bCsrf));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));

  // Sanidade do cenário: o processo privado de B existe no estado consolidado.
  const canonical = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: aCookie } })).json();
  const canonicalIds = (canonical.state?.processes || []).map(item => item.id);
  assert.ok(canonicalIds.includes('proc-oficio-a'), 'processo de escritório de A deve existir');
  assert.ok(!canonicalIds.includes('proc-privado-b'), 'processo privado de B não pode aparecer para A');

  // ── A conversa com o Assistente ────────────────────────────────────────────
  response = await postJson(`${server.baseUrl}/api/ai/chat`, {
    message: MESSAGE,
    context: {},
    history: []
  }, authHeaders(aCookie, aCsrf));
  const chat = await response.json();
  assert.equal(response.status, 200, JSON.stringify(chat));
  assert.ok(chat.reply, 'O Assistente deve responder normalmente.');

  // ── O payload enviado ao provedor não pode conter a sentinela privada de B ──
  const captured = await readCapture();
  const chatPayloads = captured.filter(item => String(item.body).includes('Assistente Jur'));
  assert.equal(chatPayloads.length, 1, `Esperado exatamente um payload de chat; recebidos ${chatPayloads.length}.`);
  const providerPayload = chatPayloads[0].body;
  assert.ok(providerPayload.includes(A_SENTINEL), 'O registro de escritório de A deve compor o contexto do Assistente.');
  assert.ok(!providerPayload.includes(B_SENTINEL), 'A sentinela do processo privado de B NÃO pode vazar para o provedor.');

  // ── Runtime: registro privado de B não pode vazar para o provedor ──────────
  // O runtime (capturado pelos coletores) carrega scope/privateOwnerUserId e é
  // mesclado no contexto; precisa passar pela mesma projeção de acesso.
  const runtimeManager = new SecurityManager({
    dataDirectory: server.dataDirectory,
    encryptionKey: server.encryptionKey,
    sessionSecret: server.sessionSecret
  });
  const runtimePayload = {
    events: [], tasks: [], intimations: [], contacts: [], sources: [], updatedAt: new Date().toISOString(),
    processes: [
      { id: 'rt-oficio', number: RUNTIME_CNJ_OFFICE, client: RUNTIME_OFFICE_SENTINEL, scope: 'office' },
      { id: 'rt-priv', number: RUNTIME_CNJ_PRIV, client: RUNTIME_PRIV_SENTINEL, scope: 'private', privateOwnerUserId: bId }
    ]
  };
  await writeFile(path.join(server.dataDirectory, 'runtime.json'), JSON.stringify({
    version: 1, algorithm: 'aes-256-gcm', updatedAt: new Date().toISOString(),
    encrypted: runtimeManager.encrypt(JSON.stringify(runtimePayload))
  }), { mode: 0o600 });

  response = await postJson(`${server.baseUrl}/api/ai/chat`, {
    message: `Analise os processos ${RUNTIME_CNJ_OFFICE} e ${RUNTIME_CNJ_PRIV}.`,
    context: {},
    history: []
  }, authHeaders(aCookie, aCsrf));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));

  const capturedRuntime = await readCapture();
  const runtimePayloads = capturedRuntime.filter(item => String(item.body).includes('Assistente Jur'));
  assert.equal(runtimePayloads.length, 2, `Esperado dois payloads de chat; recebidos ${runtimePayloads.length}.`);
  const runtimeBody = runtimePayloads[1].body;
  assert.ok(runtimeBody.includes(RUNTIME_OFFICE_SENTINEL), 'O runtime de escritório deve compor o contexto do Assistente.');
  assert.ok(!runtimeBody.includes(RUNTIME_PRIV_SENTINEL), 'O runtime privado de B NÃO pode vazar para o provedor.');

  console.log('  [1] Payload do provedor contém o registro de escritório de A.');
  console.log('  [2] Payload do provedor NÃO contém a sentinela privada de B.');
  console.log('  [3] Payload do provedor contém o runtime de escritório e NÃO o runtime privado de B.');
  console.log('\n>>> CONTEXTO DE IA RESPEITA O ACESSO: PASS <<<\n');
} finally {
  await server.stop();
}
