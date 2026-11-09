/**
 * Rotas HTTP dos três motores portados na 6.43.0.
 *
 * Prova o contrato de fronteira, não só o cálculo: sessão obrigatória, CSRF nas
 * mutações, envelope de domínio com as duas declarações de honestidade, erro de
 * domínio mapeado para 400 e nenhuma rota vazando resultado sem envelope.
 */
import assert from 'node:assert/strict';

import { createCalcHttpHandler } from '../lib/http/calc-routes.mjs';
import { createCalcSource } from '../lib/calc/source.mjs';

let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };
const igual = (a, b, msg) => check(a === b, `${msg} (recebido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);

const source = createCalcSource({ fetchSeriesImpl: async () => [] });

const csrfFlags = [];
const assertAuthenticated = (req, requireCsrf = false) => {
  csrfFlags.push(Boolean(requireCsrf));
  if (requireCsrf && req.headers?.['x-csrf-token'] !== 'token-teste') {
    throw Object.assign(new Error('CSRF inválido.'), { statusCode: 403 });
  }
  return { username: 'teste', role: 'admin' };
};

let nextBody = {};
const handler = createCalcHttpHandler({
  source,
  assertAuthenticated,
  readJson: async () => nextBody,
  /* O `json` real do servidor é `res.end(JSON.stringify(payload))`. Serializar aqui,
   * de verdade, é o que reproduz produção: um payload com BigInt passa batido por um
   * stub que só guarda o objeto e explode em 500 no servidor. */
  json: (res, status, payload) => {
    res.statusCode = status;
    res.serializado = JSON.stringify(payload);
    res.body = JSON.parse(res.serializado);
  }
});

async function post(path, body, { csrf = true, ip = '127.0.0.1' } = {}) {
  nextBody = body;
  const res = {};
  const headers = csrf ? { 'x-csrf-token': 'token-teste' } : {};
  const tratou = await handler(
    { method: 'POST', socket: { remoteAddress: ip }, headers },
    res,
    new URL(`http://localhost${path}`)
  );
  return { tratou, res };
}

async function erroDe(path, body) {
  try {
    const { res } = await post(path, body);
    return { status: res.statusCode, body: res.body };
  } catch (e) {
    return { status: e.statusCode ?? null, name: e.name, message: e.message };
  }
}

/* ---------- 1. Envelope de projeção ---------- */
{
  const competencias = [];
  let ano = 1996;
  let mes = 6;
  for (let i = 0; i < 360; i += 1) {
    competencias.push({ competencia: `${ano}-${String(mes).padStart(2, '0')}`, salario: '3000.00' });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  const { tratou, res } = await post('/api/calc/previdenciario/projecao', {
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias
  });
  igual(tratou, true, 'rota de projeção tratada');
  igual(res.statusCode, 200, 'status 200');
  igual(res.body.ok, true, 'envelope com ok');
  igual(res.body.status, 'experimental', 'status de domínio experimental');
  igual(res.body.legal_validation_performed, false, 'não declara validação jurídica');
  igual(res.body.actual_entitlement_verified, false, 'não declara direito verificado');
  igual(res.body.data.native_result.rmi, '2640.00', 'RMI no native_result');
  check(Array.isArray(res.body.warnings) && res.body.warnings.length > 0, 'avisos presentes');
  /* Regressão real: `regrasElegiveis[].centavos` era BigInt e `JSON.stringify` lançava
   * no caminho feliz — a rota responderia 500. O envelope tem de ser serializável e
   * publicar a RMI como decimal, nunca o BigInt interno. */
  check(typeof res.serializado === 'string' && res.serializado.length > 0, 'envelope serializável em JSON');
  check(!res.serializado.includes('"centavos"'), 'BigInt interno não pode ir para o payload');
  const regras = res.body.data.native_result.regrasElegiveis;
  check(Array.isArray(regras) && regras.length > 0, 'regras elegíveis publicadas');
  check(regras.every(regra => regra.centavos === undefined), 'nenhuma regra publica centavos');
  check(regras.every(regra => regra.rmi === null || /^\d+\.\d{2}$/.test(regra.rmi)), 'RMI publicada como decimal');
}

/* ---------- 2. Projeção sem regra atingível → unsupported, data null ---------- */
{
  const { res } = await post('/api/calc/previdenciario/projecao', {
    sexo: 'masculino',
    dataNascimento: '2006-01-01',
    dataReferencia: '2026-01-01',
    competencias: [{ competencia: '2025-01', salario: '2000.00' }]
  });
  igual(res.statusCode, 200, 'unsupported ainda é HTTP 200');
  igual(res.body.status, 'unsupported', 'status unsupported');
  igual(res.body.data, null, 'unsupported não carrega dado');
}

/* ---------- 3. Erro de domínio vira 400, não 500 ---------- */
{
  const r = await erroDe('/api/calc/previdenciario/projecao', { sexo: 'outro' });
  igual(r.status, 400, 'entrada inválida mapeada para 400');
  igual(r.name, 'ProjecaoError', 'erro de domínio preservado');
}

/* ---------- 4. Envelope de pensão ---------- */
{
  const { tratou, res } = await post('/api/calc/previdenciario/pensao', {
    referenceDate: '2026-10-19',
    incomes: ['3000.00', '2500.00'],
    referenceBase: '1000.00'
  });
  igual(tratou, true, 'rota de pensão tratada');
  igual(res.statusCode, 200, 'status 200');
  igual(res.body.status, 'experimental', 'pensão é experimental');
  igual(res.body.legal_validation_performed, false, 'não valida juridicamente');
  igual(res.body.data.native_result.combinedTotal, '4800.00', 'total combinado');
  igual(res.body.actual_entitlement_verified, false, 'não verifica direito');
}

/* ---------- 5. Pensão inválida vira 400 ---------- */
{
  const r = await erroDe('/api/calc/previdenciario/pensao', { referenceDate: '2026-10-19', incomes: [], referenceBase: '1000.00' });
  igual(r.status, 400, 'pensão sem rendas mapeada para 400');
  igual(r.name, 'PensaoError', 'erro de domínio da pensão');
}

/* ---------- 6. Qualidade de segurado: variante facultativa ---------- */
{
  const { tratou, res } = await post('/api/calc/previdenciario/qualidade-segurado', {
    stoppedContributing: true,
    currentlyReceivingBenefit: false,
    insuredCategory: 'facultative',
    lastContributionDate: '2026-03-10'
  });
  igual(tratou, true, 'rota de qualidade tratada');
  igual(res.statusCode, 200, 'status 200');
  igual(res.body.status, 'experimental', 'qualidade facultativa é experimental');
  igual(res.body.modelo_aplicado, 'facultativa', 'modelo declarado');
  igual(res.body.data.native_result.facultativa.qualityLossDate, '2026-11-16', 'perda calculada');
}

/* ---------- 7. Qualidade sem modelo aplicável → unsupported ---------- */
{
  const { res } = await post('/api/calc/previdenciario/qualidade-segurado', {
    stoppedContributing: false,
    insuredCategory: 'employee'
  });
  igual(res.body.status, 'unsupported', 'sem modelo é unsupported');
  igual(res.body.data, null, 'unsupported sem dado');
  check(res.body.missing.includes('qualidade_modelo_aplicavel'), 'missing declara o motivo');
}

/* ---------- 8. CSRF é exigido nas três rotas ---------- */
{
  for (const [rota, corpo] of [
    ['/api/calc/previdenciario/projecao', { sexo: 'masculino' }],
    ['/api/calc/previdenciario/pensao', { referenceDate: '2026-10-19', incomes: ['1.00'], referenceBase: '1.00' }],
    ['/api/calc/previdenciario/qualidade-segurado', { insuredCategory: 'employee' }]
  ]) {
    let bloqueado = false;
    try {
      await post(rota, corpo, { csrf: false });
    } catch (e) {
      bloqueado = e.statusCode === 403;
    }
    check(bloqueado, `${rota} deveria exigir CSRF`);
  }
}

/* ---------- 9. As três rotas exigem sessão (requireCsrf = true) ---------- */
{
  const antes = csrfFlags.length;
  await post('/api/calc/previdenciario/projecao', { sexo: 'outro' }).catch(() => {});
  const novos = csrfFlags.slice(antes);
  check(novos.length > 0 && novos.every(Boolean), 'rotas novas exigem sessão com CSRF');
}

/* ---------- 10. Rota desconhecida sob o prefixo responde 404 determinístico ---------- */
{
  nextBody = {};
  const res = {};
  const tratou = await handler(
    { method: 'POST', socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-csrf-token': 'token-teste' } },
    res,
    new URL('http://localhost/api/calc/previdenciario/inventada')
  );
  // O handler é dono do prefixo `/api/calc/`: rota desconhecida responde 404 em
  // vez de devolver `false`, para o 404 ser determinístico e não cair em outra
  // camada de roteamento.
  igual(tratou, true, 'prefixo é do handler');
  igual(res.statusCode, 404, 'rota desconhecida responde 404');
}

/* ---------- 11. Fora do prefixo, o handler se abstém ---------- */
{
  const res = {};
  const tratou = await handler(
    { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: {} },
    res,
    new URL('http://localhost/api/publicacoes')
  );
  igual(tratou, false, 'fora de /api/calc/ o handler devolve false');
}

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
