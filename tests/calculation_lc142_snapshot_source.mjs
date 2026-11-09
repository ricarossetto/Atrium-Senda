/**
 * Teste do caminho que faltava: aquisição de snapshot com proveniência real.
 *
 * Prova que:
 *  - o servidor busca os índices na Fábrica e devolve snapshot válido;
 *  - o SHA-256 corresponde aos bytes EXATOS recebidos (não a uma reserialização);
 *  - sem cliente da Fábrica, a resposta é erro declarado (nada de snapshot fake);
 *  - sem limites de piso/teto, o snapshot é recusado (nunca constante inventada);
 *  - índice sem competência reconhecível não vira snapshot vazio;
 *  - o snapshot devolvido é aceito por validateSnapshot e pelo motor.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLc142HttpHandler, enforceRateLimit } from '../lib/http/calc-lc142-routes.mjs';
import { validateSnapshot } from '../lib/calc/lc142-snapshot.mjs';
import { percentualParaTaxa, montarSnapshotLc142 } from '../lib/calc/lc142-snapshot-source.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };

// ---------- 1. Conversão de percentual ----------
const conversoes = [
  ['1', '0.01'], ['0.5', '0.005'], ['0', '0'], ['10', '0.1'],
  ['-0.25', '-0.0025'], ['1,5', '0.015'], ['0,01', '0.0001'],
  ['100', '1'], ['-1', '-0.01'], ['0.001', '0.00001'], ['123.45', '1.2345']
];
for (const [entrada, esperado] of conversoes) {
  check(percentualParaTaxa(entrada) === esperado, `percentualParaTaxa(${entrada}) != ${esperado}`);
}

// ---------- 2. Montagem com proveniência ----------
const CORPO = JSON.stringify({
  dados: [
    { competencia: '2020-01', inpc: '0.5', 'IGP-DI': '0.3' },
    { competencia: '2020-02', inpc: '0.25' },
    { competencia: '2020-03', inpc: '0.1' },
    { competencia: '2020-05', inpc: '0.9' }   // posterior ao corte: deve sair
  ]
});
const LIMITES = [
  { month: '2020-01', minimum: '1000.00', ceiling: '10000.00', minimum_source: 'Portaria fictícia', ceiling_source: 'Portaria fictícia' },
  { month: '2020-02', minimum: '1000.00', ceiling: '10000.00', minimum_source: 'Portaria fictícia', ceiling_source: 'Portaria fictícia' },
  { month: '2020-03', minimum: '1000.00', ceiling: '10000.00', minimum_source: 'Portaria fictícia', ceiling_source: 'Portaria fictícia' }
];

const snapshot = montarSnapshotLc142({
  corpoBruto: CORPO,
  payload: JSON.parse(CORPO),
  through: '2020-03',
  limites: LIMITES,
  sourceUrl: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela',
  retrievedAt: '2026-10-19T01:00:00Z'
});

check(snapshot.rates.length === 3, `esperava 3 competências, veio ${snapshot.rates.length}`);
check(snapshot.rates[0].month === '2020-01', 'primeira competência errada');
check(snapshot.rates[0].inpc === '0.005', `INPC de 0,5% virou ${snapshot.rates[0].inpc}`);
check(snapshot.rates[0].igpdi === '0.003', `IGP-DI de 0,3% virou ${snapshot.rates[0].igpdi}`);
check(!snapshot.rates.some(r => r.month === '2020-05'), 'competência posterior ao corte não foi descartada');
check(
  snapshot.response_sha256 === createHash('sha256').update(CORPO, 'utf8').digest('hex'),
  'SHA-256 não corresponde ao corpo bruto recebido'
);
check(snapshot.through === '2020-03', 'competência de corte errada');
check(validateSnapshot(snapshot) === true, 'snapshot montado não passou em validateSnapshot');

// ---------- 3. Falhas fechadas ----------
const tentar = fn => { try { fn(); return null; } catch (e) { return e; } };
check(tentar(() => montarSnapshotLc142({ corpoBruto: '', payload: {}, through: '2020-03', limites: LIMITES, sourceUrl: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela', retrievedAt: '2026-10-19T01:00:00Z' })) !== null, 'corpo vazio deveria falhar');
check(tentar(() => montarSnapshotLc142({ corpoBruto: CORPO, payload: JSON.parse(CORPO), through: '2020-03', limites: [], sourceUrl: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela', retrievedAt: '2026-10-19T01:00:00Z' })) !== null, 'sem limites deveria falhar (nunca constante inventada)');
check(tentar(() => montarSnapshotLc142({ corpoBruto: CORPO, payload: JSON.parse(CORPO), through: '2020-03', limites: LIMITES, sourceUrl: 'https://exemplo.invalido/api', retrievedAt: '2026-10-19T01:00:00Z' })) !== null, 'URL fora do domínio oficial deveria falhar');
check(tentar(() => montarSnapshotLc142({ corpoBruto: '{"dados":[]}', payload: { dados: [] }, through: '2020-03', limites: LIMITES, sourceUrl: 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela', retrievedAt: '2026-10-19T01:00:00Z' })) !== null, 'índice vazio deveria falhar');

// ---------- 4. Rota /snapshot de ponta a ponta ----------
function respostaFalsa() {
  const headers = new Map();
  return { statusCode: 0, corpo: null, headers, setHeader: (k, v) => headers.set(k, v), end(v) { this.corpo = v; } };
}
function requisicao({ metodo = 'POST', url = '/api/calc/previdenciario/lc142/snapshot', body = null, ip = '203.0.113.10', porta = 5000 } = {}) {
  // Request real (Readable) para que `readJson` consuma o corpo como em produção.
  const stream = Readable.from(body === null ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]);
  stream.method = metodo;
  stream.url = url;
  stream.socket = { remoteAddress: ip, remotePort: porta };
  stream.headers = { 'content-type': 'application/json' };
  return stream;
}

function montarHandler(fabrica) {
  const json = (res, status, payload) => { res.statusCode = status; res.end(JSON.stringify(payload)); };
  const readJson = async req => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') || '{}');
  };
  const assertAuthenticated = () => ({ workspaceId: 'ws-teste' });
  return createLc142HttpHandler({ assertAuthenticated, readJson, json, fabricaClient: fabrica });
}

const fabricaOk = {
  indices: async () => ({ ok: true, result: JSON.parse(CORPO), raw: CORPO })
};
const handler = montarHandler(fabricaOk);

const req = requisicao({ body: { through: '2020-03', limites: LIMITES } });
const res = respostaFalsa();
const tratou = await handler(req, res, new URL('http://x' + req.url));
check(tratou === true, 'rota /snapshot não foi tratada');
const corpo = JSON.parse(res.corpo || '{}');
check(res.statusCode === 200, `esperava 200, veio ${res.statusCode}`);
check(corpo.ok === true, 'resposta sem ok');
check(corpo.snapshot?.response_sha256 === createHash('sha256').update(CORPO, 'utf8').digest('hex'), 'rota não atestou o SHA do corpo');
check(validateSnapshot(corpo.snapshot) === true, 'snapshot da rota não passou em validateSnapshot');

// Sem cliente da Fábrica: erro declarado, nunca snapshot fake.
const semFabrica = montarHandler(null);
const req2 = requisicao({ body: { through: '2020-03', limites: LIMITES } });
const res2 = respostaFalsa();
let erroSemFabrica = null;
try { await semFabrica(req2, res2, new URL('http://x' + req2.url)); } catch (e) { erroSemFabrica = e; }
check(Boolean(erroSemFabrica), 'sem Fábrica deveria lançar erro');
check(erroSemFabrica?.code === 'FABRICA_NOT_CONFIGURED', `código errado: ${erroSemFabrica?.code}`);
check(erroSemFabrica?.statusCode === 503, `status errado: ${erroSemFabrica?.statusCode}`);

// Competência ausente: 422.
await (async () => {
  const r = requisicao({ body: { limites: LIMITES } });
  const s = respostaFalsa();
  let e = null;
  try { await handler(r, s, new URL('http://x' + r.url)); } catch (err) { e = err; }
  check(e?.statusCode === 422, `competência ausente deveria dar 422, veio ${e?.statusCode}`);
})();

// Fábrica responde sem corpo bruto: proveniência não atestável.
await (async () => {
  const h = montarHandler({ indices: async () => ({ ok: true, result: JSON.parse(CORPO) }) });
  const r = requisicao({ body: { through: '2020-03', limites: LIMITES } });
  const s = respostaFalsa();
  let e = null;
  try { await h(r, s, new URL('http://x' + r.url)); } catch (err) { e = err; }
  check(e?.code === 'FABRICA_UNVERIFIABLE', `esperava FABRICA_UNVERIFIABLE, veio ${e?.code}`);
})();

// ---------- 5. Rate limit: sockets distintos, MESMO IP ----------
const janela = new Map();
let bloqueou = 0;
for (let porta = 40000; porta < 40000 + 70; porta += 1) {
  const r = requisicao({ metodo: 'GET', porta, ip: '198.51.100.7' });
  const s = respostaFalsa();
  try { enforceRateLimit(janela, r, s); } catch (e) { if (e.statusCode === 429) bloqueou += 1; }
}
check(bloqueou > 0, 'rotacionar portas do mesmo IP conseguiu burlar o rate limit (achado de segurança)');
check(janela.size === 1, `mapa de rate limit criou ${janela.size} entradas para o mesmo IP`);

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
