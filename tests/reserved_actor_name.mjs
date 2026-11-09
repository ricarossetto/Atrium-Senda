import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — NOME RESERVADO DO ATOR AUTÔNOMO (Atrium IA)');
console.log('===============================================================\n');

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-reserved-name-'));
const server = await startTestServer({ dataDirectory });

try {
  const password = 'Senha-Reservada-2026!';
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_reservado',
    displayName: 'Advogada Teste',
    password
  })).json();
  const verificado = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const cookie = verificado.headers.get('set-cookie')?.split(';')[0] || '';
  const corpo = await verificado.json().catch(() => ({}));
  const csrf = verificado.headers.get('x-csrf-token') || corpo.csrfToken || '';
  assert.ok(cookie, 'a sessão sintética precisa existir');
  const headers = { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf, Accept: 'application/json' };
  const atualizarPerfil = async displayName => {
    const response = await fetch(`${server.baseUrl}/api/auth/profile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ displayName, email: 'teste@example.test', phone: '', avatar: '' })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  console.log('[N1] O nome do ator autônomo é reservado: ninguém se renomeia para "Atrium IA"...');
  {
    for (const tentativa of ['Atrium IA', 'atrium ia', '  ATRIUM   IÁ ', 'átrium iá']) {
      const recusado = await atualizarPerfil(tentativa);
      assert.equal(recusado.status, 400, `"${tentativa}" precisa ser recusado`);
      assert.match(String(recusado.body.message || recusado.body.error || ''), /reservado|Atrium IA/i, 'a recusa explica o motivo');
    }
    const perfilDepois = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: cookie } }).then(res => res.json());
    const nomeAtual = String(perfilDepois.user?.displayName || perfilDepois.displayName || '');
    assert.equal(nomeAtual, 'Advogada Teste', 'a recusa não altera o nome atual');

    const aceito = await atualizarPerfil('Atrium IA do escritório');
    assert.equal(aceito.status, 200, 'nome que apenas contém a marca continua permitido (a reserva é do nome exato)');
    const voltou = await atualizarPerfil('Advogada Teste');
    assert.equal(voltou.status, 200, 'o nome normal volta a ser aceito');
    console.log('  OK: reserva exata, com mensagem clara e sem alterar o perfil na recusa.');
  }

  console.log('\n>>> NOME RESERVADO DO ATOR AUTÔNOMO: PASS <<<\n');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}
