import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: o classificador de IA projeta o estado pela autoridade de acesso da sessão
// antes de ler/egressar. Publicação privada de outro membro não é classificada nem
// indexada. Ver run-5 (crítico, subsistema AI classifier).
const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_cls', displayName: 'Admin Cls', email: 'cls-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const adminCsrf = (await res.json()).csrfToken;

  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_cls', displayName: 'Membro Cls', email: 'cls-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_cls');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_cls', password: 'Senha-Membro-2026!' });
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const memberCsrf = (await res.json()).csrfToken;

  // B cria publicação privada.
  res = await postJson(`${server.baseUrl}/api/state`, {
    state: { intimations: [{ id: 'pub-priv-b', process: '0000041-41.2026.8.21.0001', scope: 'private', privateOwnerUserId: member.id, title: 'Privada B', text: 'SENTINELA-PRIVADO-B-CLS' }] }
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 200, 'B deve criar publicação privada');

  // A (admin) liga o classificador.
  const envA = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  res = await fetch(`${server.baseUrl}/api/ai-classifier/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminAuth, 'X-CSRF-Token': adminCsrf },
    body: JSON.stringify({ enabled: true, revision: envA.revision })
  });
  assert.equal(res.status, 200, 'admin deve ligar o Atrium IA');

  // Sugerir providência para a publicação privada de B como A → não encontrada (projeção).
  res = await postJson(`${server.baseUrl}/api/ai-classifier/suggest-publication-action`, { intimationId: 'pub-priv-b' }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 404, 'publicação privada de B não pode ser classificada por A');

  // A lista sugestões: a chave privada de B não pode aparecer.
  const suggestions = await (await fetch(`${server.baseUrl}/api/ai-classifier/suggestions`, { headers: adminAuth })).json();
  const keys = Object.keys(suggestions.suggestions || {});
  assert.ok(!keys.includes('pub-priv-b'), 'sugestões não podem indexar a publicação privada de B');

  // A leitura de sugestões NÃO pode podar (destrutivamente) a entrada privada de B do store.
  const triageFile = path.join(server.dataDirectory, 'publication-triage.json');
  await writeFile(triageFile, JSON.stringify({
    version: 1, generatedAt: new Date().toISOString(),
    entries: { 'pub-priv-b': { area: 'x', priority: 'y', payloadHash: 'h1', at: new Date().toISOString() } }
  }), 'utf8');
  await fetch(`${server.baseUrl}/api/ai-classifier/suggestions`, { headers: adminAuth });
  const store = JSON.parse(await readFile(triageFile, 'utf8'));
  assert.ok(store.entries['pub-priv-b'], 'a poda não pode remover a entrada de triagem privada de B');

  // B cria contato PRIVADO com despesa aninhada (fonte do vazamento financeiro).
  const envB = await (await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth })).json();
  res = await postJson(`${server.baseUrl}/api/state`, {
    revision: envB.revision,
    state: {
      ...(envB.state || {}),
      contacts: [...(envB.state?.contacts || []), {
        id: 'contact-priv-b', name: 'Contato B', scope: 'private', privateOwnerUserId: member.id,
        expenses: [{ id: 'exp-priv-b', description: 'SENTINELA-CONTATO-PRIVADO-B' }]
      }]
    }
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 200, 'B deve criar contato privado');

  // A dispara a triagem financeira: a despesa do contato privado de B não pode entrar.
  res = await postJson(`${server.baseUrl}/api/ai-classifier/triage-financial`, {}, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'triagem financeira deve responder');
  const financial = await res.json();
  const entryIds = (financial.results || []).map(item => String(item.entryId || ''));
  assert.ok(!entryIds.includes('exp-priv-b'), 'despesa de contato privado de B não pode entrar na triagem financeira');

  console.log('ai_classifier_access: PASS');
} finally {
  await server.stop();
}
process.exit(0);
