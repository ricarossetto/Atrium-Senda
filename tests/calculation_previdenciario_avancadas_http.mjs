/**
 * Rotas reais dos três motores portados: projeção, pensão e qualidade de segurado.
 *
 * Por que este teste existe: as suítes de rota usavam um `json` de mentira que só
 * guardava o objeto recebido. O envelope da projeção publicava `centavos` como
 * BigInt e `JSON.stringify` lançava `TypeError` no caminho feliz — o servidor real
 * responderia HTTP 500 e nenhum teste veria. Aqui o servidor é real (`server.mjs`),
 * a serialização é a de produção e a resposta é lida com `response.json()`.
 *
 * Execução: node tests/calculation_previdenciario_avancadas_http.mjs
 */
import assert from 'node:assert/strict';

import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

async function abrirSessao(server) {
  const password = 'Senha-Avancadas-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_avancadas',
    displayName: 'Advogada Teste Avançadas',
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
  return cookie.split(';')[0];
}

async function buscarCsrf(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/auth/status`, { headers: { cookie } });
  const body = await response.json();
  assert.ok(body?.csrfToken, 'Token CSRF ausente em /api/auth/status');
  return body.csrfToken;
}

/** 360 competências contínuas a 3000, começando em 1996-06. */
function competenciasContinuas(anoInicial, mesInicial, total, salario) {
  const lista = [];
  let ano = anoInicial;
  let mes = mesInicial;
  for (let i = 0; i < total; i += 1) {
    lista.push({ competencia: `${ano}-${String(mes).padStart(2, '0')}`, salario });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return lista;
}

const server = await startTestServer({ env: { JEV_CMD_BIN: process.execPath } });
try {
  const cookie = await abrirSessao(server);
  const csrf = await buscarCsrf(server.baseUrl, cookie);
  const base = `${server.baseUrl}/api/calc/previdenciario`;
  const autenticado = { cookie, 'x-csrf-token': csrf };

  /* --- Sessão obrigatória nas três rotas --- */
  for (const rota of ['projecao', 'pensao', 'qualidade-segurado']) {
    const semSessao = await postJson(`${base}/${rota}`, {});
    assert.equal(semSessao.status, 401, `${rota} sem sessão deve responder 401`);
  }

  /* --- CSRF obrigatório em mutação --- */
  const semCsrf = await postJson(`${base}/projecao`, { sexo: 'masculino' }, { cookie });
  assert.equal(semCsrf.status, 403, 'Mutação sem CSRF deve responder 403');

  /* --- 1. Projeção no caminho feliz: 200, JSON parseável e sem BigInt --- */
  {
    const response = await postJson(`${base}/projecao`, {
      sexo: 'masculino',
      dataNascimento: '1966-05-10',
      dataReferencia: '2026-10-09',
      competencias: competenciasContinuas(1996, 6, 360, '3000.00')
    }, autenticado);
    const texto = await response.text();
    assert.equal(response.status, 200, `Projeção falhou: HTTP ${response.status} — ${texto.slice(0, 200)}`);
    const body = JSON.parse(texto);
    assert.equal(body.ok, true, 'envelope com ok');
    assert.equal(body.status, 'experimental', 'projeção do caso-base é experimental');
    assert.equal(body.legal_validation_performed, false, 'não declara validação jurídica');
    assert.equal(body.actual_entitlement_verified, false, 'não declara direito verificado');
    assert.equal(body.data.native_result.rmi, '2640.00', 'RMI do caso-base');

    /* A regressão real: BigInt no payload derrubava `JSON.stringify`. */
    assert.ok(!texto.includes('"centavos"'), 'BigInt interno não pode ir para o payload');
    const regras = body.data.native_result.regrasElegiveis;
    assert.ok(Array.isArray(regras) && regras.length > 0, 'regras elegíveis publicadas');
    for (const regra of regras) {
      assert.equal(regra.centavos, undefined, `regra ${regra.id} não pode publicar centavos`);
      assert.ok(
        regra.rmi === null || /^\d+\.\d{2}$/.test(regra.rmi),
        `regra ${regra.id} deve publicar RMI decimal, veio ${JSON.stringify(regra.rmi)}`
      );
    }
    console.log(`  projecao: 200, ${regras.length} regras elegíveis, RMI ${body.data.native_result.rmi}`);
  }

  /* --- 2. Projeção sem regra atingível: 200 com unsupported e data null --- */
  {
    const response = await postJson(`${base}/projecao`, {
      sexo: 'masculino',
      dataNascimento: '2006-01-01',
      dataReferencia: '2026-01-01',
      competencias: [{ competencia: '2025-01', salario: '2000.00' }]
    }, autenticado);
    const body = await response.json();
    assert.equal(response.status, 200, 'unsupported ainda é HTTP 200');
    assert.equal(body.status, 'unsupported', 'sem regra é unsupported');
    assert.equal(body.data, null, 'unsupported não carrega dado financeiro');
  }

  /* --- 3. Pensão: 200, JSON parseável --- */
  {
    const response = await postJson(`${base}/pensao`, {
      referenceDate: '2026-10-19',
      referenceBase: '3000.00',
      incomes: ['4000.00', '2500.00', '1500.00'],
      rounding: 'half-up'
    }, autenticado);
    const texto = await response.text();
    assert.equal(response.status, 200, `Pensão falhou: HTTP ${response.status} — ${texto.slice(0, 200)}`);
    const body = JSON.parse(texto);
    assert.equal(body.status, 'experimental', 'pensão experimental');
    assert.ok(body.data.native_result.combinedTotal, 'total combinado presente');
    assert.equal(body.data.native_result.incomes.length, 3, 'três rendas acumuladas');
    console.log(`  pensao: 200, total combinado ${body.data.native_result.combinedTotal}`);
  }

  /* --- 4. Qualidade de segurado: os dois modelos, JSON parseável --- */
  {
    const response = await postJson(`${base}/qualidade-segurado`, {
      insuredCategory: 'facultative',
      stoppedContributing: true,
      currentlyReceivingBenefit: false,
      lastContributionDate: '2026-05-10',
      contribuicoesMeses: 130,
      dataReferencia: '2026-09-30'
    }, autenticado);
    const texto = await response.text();
    assert.equal(response.status, 200, `Qualidade falhou: HTTP ${response.status} — ${texto.slice(0, 200)}`);
    const body = JSON.parse(texto);
    assert.equal(body.status, 'experimental', 'qualidade experimental');
    assert.equal(body.modelo_aplicado, 'geral_e_facultativa', 'os dois modelos são declarados no envelope');
    assert.ok(body.data.native_result.facultativa, 'variante facultativa presente');
    assert.ok(body.data.native_result.geral, 'regra geral presente');
    console.log(`  qualidade: 200, modelo ${body.modelo_aplicado}`);
  }

  /* --- 5. Sem modelo aplicável: 200 com unsupported e motivo --- */
  {
    const response = await postJson(`${base}/qualidade-segurado`, {
      insuredCategory: 'employee',
      stoppedContributing: false,
      currentlyReceivingBenefit: false
    }, autenticado);
    const body = await response.json();
    assert.equal(response.status, 200, 'ausência de modelo é HTTP 200');
    assert.equal(body.status, 'unsupported', 'sem modelo é unsupported');
    assert.deepEqual(body.missing, ['qualidade_modelo_aplicavel'], 'motivo declarado');
  }

  console.log('Rotas avançadas aprovadas: projecao, pensao e qualidade-segurado respondem 200 com JSON serializável, sem BigInt no payload e com falha fechada declarada.');
} finally {
  await server.stop();
}
