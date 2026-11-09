import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CSRF NAS ROTAS LEGADAS EPROC (H2, COMMIT 2)         ');
console.log('===============================================================\n');

const PASSWORD = 'Senha-H2-Csrf-2026!';
const server = await startTestServer({});

try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-h2-csrf',
    displayName: 'Dra. Csrf Teste',
    email: 'csrf@example.test',
    workspaceName: 'Csrf Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  assert.ok(pending.setupToken, 'Falha ao iniciar o cadastro do workspace de teste.');
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const body = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = body.csrfToken;
  assert.ok(cookie && csrf, 'Sessão de teste sem cookie ou CSRF.');

  const legacyRoutes = [
    '/api/integrations/eproc/sweep',
    '/api/integrations/eproc/processes/enrich-single',
    '/api/integrations/eproc/processes/download-autos'
  ];

  for (const route of legacyRoutes) {
    const denied = await postJson(`${server.baseUrl}${route}`, {}, { Cookie: cookie });
    assert.equal(denied.status, 403, `${route} deve rejeitar mutação sem X-CSRF-Token (recebido ${denied.status}).`);
  }
  const statusAfterDenied = await (await fetch(`${server.baseUrl}/api/integrations/eproc/sweep/status`, {
    headers: { Cookie: cookie }
  })).json();
  assert.equal(statusAfterDenied.status, 'idle', 'Requisição sem CSRF não pode iniciar varredura eproc.');
  console.log('  ✓ [1] sweep, enrich-single e download-autos retornam 403 sem CSRF e não iniciam job.');

  const enrichAllowed = await postJson(`${server.baseUrl}/api/integrations/eproc/processes/enrich-single`, {}, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(enrichAllowed.status, 400, 'enrich-single com CSRF deve falhar pela validação de CNJ, não por CSRF.');

  const downloadAllowed = await postJson(`${server.baseUrl}/api/integrations/eproc/processes/download-autos`, {}, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(downloadAllowed.status, 400, 'download-autos com CSRF deve falhar pela validação de CNJ, não por CSRF.');
  console.log('  ✓ [2] Com CSRF, as rotas seguem para suas validações de negócio (400 por CNJ ausente).');

  const serverSource = serverSourceText;
  assert.match(serverSource, /async function waitForActiveEprocSync/, 'Download de autos deve entrar na fila do ciclo ativo em vez de recusar.');
  assert.match(serverSource, /await waitForActiveEprocSync\(orch, currentWorkspaceId\(\)\)/);
  assert.doesNotMatch(serverSource, /Aguarde a conclusão antes de baixar autos/, 'A recusa imediata por sincronização ativa não pode voltar.');
  console.log('  ✓ [2b] Sincronização ativa libera o download por fila honesta, sem recusa imediata.');

  const sweepAllowed = await postJson(`${server.baseUrl}/api/integrations/eproc/sweep`, {}, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(sweepAllowed.status, 202, 'Sweep com CSRF deve ser aceito e retornar o job em segundo plano.');
  console.log('  ✓ [3] Sweep com CSRF aceito (202) e acompanhável pelo status oficial.');

  console.log('\n>>> EPROC LEGACY ROUTES CSRF: PASS <<<\n');
} finally {
  await server.stop();
}
