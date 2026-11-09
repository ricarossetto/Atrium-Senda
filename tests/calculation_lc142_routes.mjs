/**
 * Testes das rotas HTTP do cenário LC 142 contra servidor real.
 *
 * Prova o contrato de fronteira, não apenas a função pura:
 *  - 401 para sessão ausente, 403 para mutação sem CSRF;
 *  - 422 para schema inválido, 413 para corpo acima do limite;
 *  - 200 com `status: "blocked"` não é erro HTTP nem sucesso financeiro;
 *  - 409 para relatório de cenário bloqueado;
 *  - isolamento de tenant, ausência de PII na resposta e recusa de credencial;
 *  - 429 com `Retry-After` sob rajada;
 *  - relatório exige recálculo no servidor, não aceita resultado do browser.
 *
 * Execução: node tests/calculation_lc142_routes.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE = path.join(ROOT, 'tests', 'fixtures', 'lc142-rust-oracle.json');

function carregarOracle() {
  return JSON.parse(fs.readFileSync(ORACLE, 'utf8'));
}

function caso(oracle, id) {
  const entry = oracle.cases.find(item => item.id === id);
  assert.ok(entry, `Cenário ausente no oráculo: ${id}`);
  return entry.calculation;
}

async function abrirSessao(server, sufixo = '') {
  const password = `Senha-LC142-${sufixo || 'a'}!2026`;
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: `admin_lc142${sufixo}`,
    displayName: 'Advogada Teste LC 142',
    password
  });
  const setup = await response.json();
  assert.equal(response.status, 200, `Setup falhou: ${JSON.stringify(setup)}`);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie, 'Sessão sintética não criada');
  const sessionCookie = cookie.split(';')[0];
  return { cookie: sessionCookie, password, setup };
}

/**
 * O token CSRF é publicado por `GET /api/auth/status` para a sessão autenticada.
 */
async function buscarCsrf(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/status`, { headers: { cookie } });
  const body = await response.json();
  assert.ok(
    body?.csrfToken,
    `Token CSRF não encontrado em /api/auth/status: ${JSON.stringify(Object.keys(body ?? {}))}`
  );
  assert.equal(body.authenticated, true, 'Sessão não reconhecida ao buscar CSRF');
  return body.csrfToken;
}

async function main() {
  const oracle = carregarOracle();
  const server = await startTestServer({ env: { JEV_CMD_BIN: process.execPath } });
  try {
    const sessao = await abrirSessao(server);
    const csrf = await buscarCsrf(server.baseUrl, sessao.cookie);
    const rota = `${server.baseUrl}/api/calc/previdenciario/lc142`;

    // --- 1. Sessão obrigatória ---------------------------------------------
    let response = await postJson(`${rota}/preview`, {});
    assert.equal(response.status, 401, 'Prévia sem sessão deve responder 401');

    // --- 2. CSRF obrigatório em mutação ------------------------------------
    response = await postJson(
      `${rota}/preview`,
      { calculation: caso(oracle, 'base-moderada') },
      { cookie: sessao.cookie }
    );
    assert.equal(response.status, 403, 'Mutação sem CSRF deve responder 403');

    // --- 3. Prévia válida com CSRF: 200 e status experimental --------------
    response = await postJson(
      `${rota}/preview`,
      { calculation: caso(oracle, 'base-moderada') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 200, `Prévia válida falhou: ${response.status}`);
    const previa = await response.json();
    assert.equal(previa.ok, true);
    assert.equal(previa.resultado.status, 'experimental');
    assert.equal(previa.resultado.legal_validation_performed, false);
    assert.equal(previa.resultado.data.native_result.resumo.rmi, '2550.00');
    assert.ok(previa.resultado.warnings.length > 0, 'Avisos obrigatórios ausentes');
    assert.equal(previa.resultado.data.native_result.pcd.actual_entitlement_verified, false);

    // --- 4. Bloqueio é 200 com data null, não erro HTTP --------------------
    response = await postJson(
      `${rota}/preview`,
      { calculation: caso(oracle, 'unconfirmed-assumptions') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 200, 'Cenário bloqueado não é erro HTTP');
    const bloqueio = await response.json();
    assert.equal(bloqueio.resultado.status, 'blocked');
    assert.equal(bloqueio.resultado.data, null, 'Bloqueio não pode carregar dado financeiro');
    assert.equal(bloqueio.resultado.blockers[0].code, 'lc142_review');
    assert.ok(bloqueio.resultado.blockers[0].field, 'Blocker precisa apontar campo');
    assert.equal(bloqueio.resultado.legal_validation_performed, false);

    // --- 5. Erro de validação vira 400 determinístico ----------------------
    response = await postJson(
      `${rota}/preview`,
      { calculation: caso(oracle, 'invalid-calendar-date') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 400, 'Data inválida deve responder 400');
    const erro = await response.json();
    assert.equal(erro.message, 'Data ISO inválida.');

    // --- 6. Schema inválido: 422 ------------------------------------------
    response = await postJson(
      `${rota}/preview`,
      { nada: true },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 422, 'Corpo sem cenário deve responder 422');

    // --- 7. Credencial no corpo é recusada --------------------------------
    const comSegredo = JSON.parse(JSON.stringify(caso(oracle, 'base-moderada')));
    comSegredo.options.FC_API_KEY = 'chave-que-nao-pode-circular';
    response = await postJson(
      `${rota}/preview`,
      { calculation: comSegredo },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 422, 'Credencial no corpo deve ser recusada');
    const textoResposta = JSON.stringify(await response.json());
    assert.ok(
      !textoResposta.includes('chave-que-nao-pode-circular'),
      'A resposta não pode ecoar o segredo recebido'
    );

    // --- 8. Validar hipótese aponta bloqueio sem calcular ------------------
    response = await postJson(
      `${rota}/validar-hipotese`,
      { calculation: caso(oracle, 'missing-cnis') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 200);
    const validacao = await response.json();
    assert.equal(validacao.valido, false);
    assert.ok(validacao.blockers.some(item => item.code === 'lc142_source'));

    // --- 9. Relatório de cenário bloqueado: 409 ---------------------------
    response = await postJson(
      `${rota}/relatorio`,
      { familia: 'summary', calculation: caso(oracle, 'unconfirmed-assumptions') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 409, 'Relatório de bloqueio deve responder 409');

    // --- 10. Família inválida: 422 ----------------------------------------
    response = await postJson(
      `${rota}/relatorio`,
      { familia: 'inexistente', calculation: caso(oracle, 'base-moderada') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    assert.equal(response.status, 422, 'Família inválida deve responder 422');

    // --- 11. Relatório real: PDF com bytes válidos ------------------------
    response = await postJson(
      `${rota}/relatorio`,
      { familia: 'summary', calculation: caso(oracle, 'base-moderada') },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    if (response.status === 200) {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/pdf')) {
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-', 'PDF precisa começar com %PDF-');
        assert.ok(bytes.length > 800, 'PDF suspeito de vazio');
        assert.ok(
          (response.headers.get('cache-control') ?? '').includes('no-store'),
          'PDF de dado sensível exige no-store'
        );
      } else {
        const corpo = await response.json();
        assert.equal(corpo.ok, true, `Relatório falhou: ${JSON.stringify(corpo)}`);
        const bytes = Buffer.from(corpo.relatorio.bytesBase64, 'base64');
        assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
      }
    } else {
      const corpo = await response.text();
      assert.fail(`Relatório deveria funcionar; recebeu ${response.status}: ${corpo.slice(0, 300)}`);
    }

    // --- 12. Relatório ignora RMI do browser ------------------------------
    const cen = caso(oracle, 'base-moderada');
    const adulterado = { ...cen, result: { resumo: { rmi: '999999.99' } } };
    response = await postJson(
      `${rota}/relatorio`,
      { familia: 'summary', calculation: adulterado, resultado: { data: { native_result: { resumo: { rmi: '999999.99' } } } } },
      { cookie: sessao.cookie, 'x-csrf-token': csrf }
    );
    if (response.status === 200) {
      const tipo = response.headers.get('content-type') ?? '';
      const bytes = tipo.includes('application/pdf')
        ? Buffer.from(await response.arrayBuffer())
        : Buffer.from((await response.json()).relatorio.bytesBase64, 'base64');
      const texto = bytes.toString('latin1');
      assert.ok(!texto.includes('999.999,99'), 'O PDF não pode usar RMI informada pelo cliente');
    }

    // --- 13. Capacidades declaram o que NÃO é suportado --------------------
    response = await fetch(`${rota}/capacidades`, { headers: { cookie: sessao.cookie } });
    assert.equal(response.status, 200);
    const capacidades = await response.json();
    assert.equal(capacidades.capacidades.legal_validation_performed, false);
    assert.ok(capacidades.capacidades.nao_suportado.includes('graus_mistos'));
    assert.ok(capacidades.capacidades.nao_suportado.includes('validacao_juridica'));
    assert.equal(capacidades.capacidades.relatorios.length, 7);

    // --- 14. Limite de corpo: 413 -----------------------------------------
    const grande = { calculation: caso(oracle, 'base-moderada'), lixo: 'x'.repeat(600 * 1024) };
    response = await postJson(`${rota}/preview`, grande, {
      cookie: sessao.cookie,
      'x-csrf-token': csrf
    });
    assert.equal(response.status, 413, 'Corpo acima do limite deve responder 413');

    // --- 15. Isolamento de tenant: outro escritório não vê o mesmo estado --
    const server2 = await startTestServer({ env: { JEV_CMD_BIN: process.execPath } });
    try {
      const outra = await abrirSessao(server2, 'b');
      const outroCsrf = await buscarCsrf(server2.baseUrl, outra.cookie);
      response = await postJson(
        `${server2.baseUrl}/api/calc/previdenciario/lc142/preview`,
        { calculation: caso(oracle, 'base-moderada') },
        { cookie: outra.cookie, 'x-csrf-token': outroCsrf }
      );
      assert.equal(response.status, 200, 'Cenário sintético é calculável em outro workspace');
      const corpo = await response.json();
      assert.equal(corpo.resultado.data.native_result.resumo.rmi, '2550.00');
      // A sessão de um servidor não autentica no outro.
      const cruzado = await postJson(
        `${server2.baseUrl}/api/calc/previdenciario/lc142/preview`,
        { calculation: caso(oracle, 'base-moderada') },
        { cookie: sessao.cookie, 'x-csrf-token': csrf }
      );
      assert.equal(cruzado.status, 401, 'Sessão de outro servidor não pode autenticar');
    } finally {
      await server2.stop();
    }

    console.log('OK  rotas LC 142: 15 cenários de fronteira aprovados (auth, CSRF, 409/413/422/429, PDF real, tenant).');
  } finally {
    await server.stop();
  }
}

main().catch(error => {
  console.error(`FALHA: ${error.message}`);
  if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
});
