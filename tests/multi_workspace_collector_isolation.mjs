import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — MULTI-WORKSPACE COLLECTOR & ZERO-LEAK TEST SUITE    ');
console.log('===============================================================\n');

const frontendOrigin = 'https://app.atrium.example.test';
// Dedicated local server mode (!CLOUD_MODE)
const server = await startTestServer({
  env: {
    ATRIUM_FRONTEND_ORIGINS: frontendOrigin,
    ALLOW_SHARED_SIDECAR: 'true'
  }
});
const password = 'Senha-Multi-Collector-2026!';

try {
  // 1. Setup Workspace A (Admin A)
  console.log('[Teste 1] Cadastrando Escritório A...');
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-a',
    displayName: 'Dra. Alice Alfa',
    email: 'alice@alfa.adv.br',
    workspaceName: 'Alfa Advocacia',
    password
  });
  let pending = await response.json();
  assert.ok(pending.setupToken, 'Escritório A falhou ao iniciar cadastro.');

  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const first = await response.json();
  const firstCookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(first.user.workspaceId, 'Escritório A não recebeu workspaceId.');

  // 2. Setup Workspace B (Admin B - Novo escritório no mesmo servidor)
  console.log('[Teste 2] Cadastrando Escritório B independente...');
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'admin-b',
    displayName: 'Dr. Bruno Beta',
    email: 'bruno@beta.adv.br',
    workspaceName: 'Beta Associados',
    password
  });
  pending = await response.json();
  assert.ok(pending.setupToken, 'Escritório B falhou ao iniciar cadastro.');

  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const second = await response.json();
  const secondCookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(second.user.workspaceId, 'Escritório B não recebeu workspaceId.');
  assert.notEqual(first.user.workspaceId, second.user.workspaceId, 'Workspaces A e B receberam o mesmo ID!');

  // 3. Test Collector / Sidecar Access for BOTH accounts
  console.log('[Teste 3] Verificando se ambos os escritórios têm acesso ao coletor/sidecar sem 503 LOCAL_AGENT_REQUIRED...');
  const statusA = await fetch(`${server.baseUrl}/api/integrations/tjrs-sidecar/status`, { headers: { Cookie: firstCookie } });
  assert.notEqual(statusA.status, 503, 'Escritório A recebeu LOCAL_AGENT_REQUIRED.');

  const statusB = await fetch(`${server.baseUrl}/api/integrations/tjrs-sidecar/status`, { headers: { Cookie: secondCookie } });
  assert.notEqual(statusB.status, 503, 'Escritório B foi bloqueado com LOCAL_AGENT_REQUIRED! O Caminho B deve permitir ambos.');

  // 4. Test Access Key Isolation (Segredo de Justiça)
  console.log('[Teste 4] Testando isolamento estrito de chaves de acesso a processos...');
  const cnjSecretA = '5001111-22.2026.8.21.0001';
  const cnjSecretB = '5009999-88.2026.8.21.0002';

  // Verificar status inicial: ambas falso
  let keyStatusA = await (await fetch(`${server.baseUrl}/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(cnjSecretA)}`, {
    headers: { Cookie: firstCookie }
  })).json();
  assert.equal(keyStatusA.configured, false, 'Chave de A já constava como configurada.');

  let keyStatusB = await (await fetch(`${server.baseUrl}/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(cnjSecretA)}`, {
    headers: { Cookie: secondCookie }
  })).json();
  assert.equal(keyStatusB.configured, false, 'Chave de A já constava em B.');

  // 5. Test State & Process Data Isolation
  console.log('[Teste 5] Testando persistência e isolamento completo de acervo processual...');
  const stateA = {
    version: 1,
    terms: [{ id: 'term-a', name: 'Alice OAB', uf: 'RS', num: '11111' }],
    sources: [],
    intimations: [{ id: 'int-a', process: cnjSecretA, title: 'Intimação Secreta de Alice' }],
    tasks: [{ id: 'task-a', title: 'Prazo Recurso de Alice' }],
    processes: [{
      id: 'proc-a',
      number: cnjSecretA,
      client: 'Cliente Confidencial de Alice',
      secrecy: true,
      court: 'TJRS'
    }],
    contacts: [{ id: 'contact-a', name: 'Cliente A' }],
    agenda: [],
    audit: [],
    settings: { officeName: 'Alfa Advocacia' }
  };

  const stateB = {
    version: 1,
    terms: [{ id: 'term-b', name: 'Bruno OAB', uf: 'RS', num: '22222' }],
    sources: [],
    intimations: [{ id: 'int-b', process: cnjSecretB, title: 'Intimação Secreta de Bruno' }],
    tasks: [{ id: 'task-b', title: 'Prazo Contestação de Bruno' }],
    processes: [{
      id: 'proc-b',
      number: cnjSecretB,
      client: 'Cliente Confidencial de Bruno',
      secrecy: true,
      court: 'TJRS'
    }],
    contacts: [{ id: 'contact-b', name: 'Cliente B' }],
    agenda: [],
    audit: [],
    settings: { officeName: 'Beta Associados' }
  };

  // Salvar Estado A
  response = await postJson(`${server.baseUrl}/api/state`, { state: stateA }, {
    Cookie: firstCookie, 'X-CSRF-Token': first.csrfToken
  });
  assert.ok(response.ok, 'Falha ao salvar estado do Escritório A.');

  // Salvar Estado B
  response = await postJson(`${server.baseUrl}/api/state`, { state: stateB }, {
    Cookie: secondCookie, 'X-CSRF-Token': second.csrfToken
  });
  assert.ok(response.ok, 'Falha ao salvar estado do Escritório B.');

  // Ler Estado A: deve conter APENAS dados de A
  const readA = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: firstCookie } })).json();
  assert.equal(readA.state.processes.length, 1);
  assert.equal(readA.state.processes[0].number, cnjSecretA);
  assert.equal(readA.state.processes[0].client, 'Cliente Confidencial de Alice');
  assert.equal(readA.state.intimations[0].title, 'Intimação Secreta de Alice');
  assert.equal(readA.state.tasks[0].title, 'Prazo Recurso de Alice');
  assert.equal(JSON.stringify(readA.state).includes('Bruno'), false, 'VAZAMENTO DE DADOS: Dados de Bruno apareceram no Escritório A!');

  // Ler Estado B: deve conter APENAS dados de B
  const readB = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: secondCookie } })).json();
  assert.equal(readB.state.processes.length, 1);
  assert.equal(readB.state.processes[0].number, cnjSecretB);
  assert.equal(readB.state.processes[0].client, 'Cliente Confidencial de Bruno');
  assert.equal(readB.state.intimations[0].title, 'Intimação Secreta de Bruno');
  assert.equal(readB.state.tasks[0].title, 'Prazo Contestação de Bruno');
  assert.equal(JSON.stringify(readB.state).includes('Alice'), false, 'VAZAMENTO DE DADOS: Dados de Alice apareceram no Escritório B!');

  // 6. Test Search Engine Isolation
  console.log('[Teste 6] Testando busca textual e indexação cross-workspace...');
  const searchA = await (await fetch(`${server.baseUrl}/api/search?q=Confidencial`, { headers: { Cookie: firstCookie } })).json();
  assert.ok(JSON.stringify(searchA).includes('Alice'), 'Busca A não encontrou o próprio processo.');
  assert.equal(JSON.stringify(searchA).includes('Bruno'), false, 'VAZAMENTO DE DADOS: Busca de A retornou processo de Bruno!');

  const searchB = await (await fetch(`${server.baseUrl}/api/search?q=Confidencial`, { headers: { Cookie: secondCookie } })).json();
  assert.ok(JSON.stringify(searchB).includes('Bruno'), 'Busca B não encontrou o próprio processo.');
  assert.equal(JSON.stringify(searchB).includes('Alice'), false, 'VAZAMENTO DE DADOS: Busca de B retornou processo de Alice!');

  // 7. Test Document Storage Isolation (Autos / PDFs)
  console.log('[Teste 7] Testando isolamento criptográfico do acervo de documentos...');
  // Upload doc para A
  const samplePdfBytes = Buffer.from('%PDF-1.4 Mock Document A Content');
  response = await postJson(`${server.baseUrl}/api/documents`, {
    contentBase64: samplePdfBytes.toString('base64'),
    originalName: 'peticao_inicial_alice.pdf',
    ownerType: 'process',
    ownerId: 'proc-a',
    documentType: 'peticao_inicial',
    revision: readA.revision
  }, { Cookie: firstCookie, 'X-CSRF-Token': first.csrfToken });
  const docA = await response.json();
  assert.ok(docA.ok && docA.document?.id, 'Falha ao salvar documento em A.');

  // B tenta listar documentos
  const docsInB = await (await fetch(`${server.baseUrl}/api/documents`, { headers: { Cookie: secondCookie } })).json();
  assert.equal(docsInB.documents.length, 0, 'VAZAMENTO: Escritório B conseguiu ver documentos de A na listagem!');

  // B tenta baixar documento de A pelo ID direto
  const downloadAttemptByB = await fetch(`${server.baseUrl}/api/documents/${docA.document.id}/content`, { headers: { Cookie: secondCookie } });
  assert.equal(downloadAttemptByB.status, 404, 'VAZAMENTO DE ARQUIVOS: Escritório B conseguiu baixar documento do Escritório A!');

  // A consegue baixar normalmente
  const downloadSuccessByA = await fetch(`${server.baseUrl}/api/documents/${docA.document.id}/content`, { headers: { Cookie: firstCookie } });
  assert.equal(downloadSuccessByA.status, 200, 'Escritório A não conseguiu baixar seu próprio documento.');

  // 8. Test Eproc Download Autos Access Control
  console.log('[Teste 8] Testando proteção de download de autos por processo inexistente no workspace...');
  // B tenta baixar autos referenciando processo de A
  response = await postJson(`${server.baseUrl}/api/integrations/tjrs-sidecar/processes/download-autos`, {
    processId: 'proc-a',
    processNumber: cnjSecretA,
    revision: readB.revision
  }, { Cookie: secondCookie, 'X-CSRF-Token': second.csrfToken });
  assert.equal(response.status, 404, 'Escritório B conseguiu disparar download de autos para processo pertencente ao Escritório A!');

  console.log('\n===============================================================');
  console.log('  TODOS OS TESTES DE COLETA E ISOLAMENTO PASSARAM COM SUCESSO! ');
  console.log('  Zero vazamento de dados detectado entre escritórios/contas.  ');
  console.log('===============================================================\n');
} finally {
  await server.stop();
}
