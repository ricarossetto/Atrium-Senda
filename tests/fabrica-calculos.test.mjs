import assert from 'node:assert/strict';
import { createFabricaClient, FabricaError, FABRICA_LIMITS, readFabricaEnvelope, summarizeFabricaResult } from '../lib/calc/fabrica.mjs';

console.log('\n=== FÁBRICA DE CÁLCULOS (TRF3) — CLIENTE E CONTRATOS ===\n');

const calls = [];
function fakeFetch(responses) {
  let index = 0;
  return async (url, options = {}) => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    calls.push({ url: String(url), options });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: name => response.headers?.[String(name).toLowerCase()] ?? null },
      json: async () => response.body,
      text: async () => (typeof response.body === 'string' ? response.body : JSON.stringify(response.body))
    };
  };
}

// Não configurado: erro claro, sem chamada de rede.
const offline = createFabricaClient({ apiKey: '', fetchImpl: fakeFetch([]) });
assert.equal(offline.configured, false);
await assert.rejects(() => offline.indices('tabela'), error => {
  assert.equal(error.name, 'FabricaError');
  assert.equal(error.code, 'FABRICA_NOT_CONFIGURED');
  assert.equal(error.statusCode, 409);
  return true;
});
console.log('✓ Sem chave, a integração falha fechada com erro claro.');

// GET de índices: header oficial, URL e envelope.
calls.length = 0;
const okFetch = fakeFetch([{
  status: 200,
  body: { status: 'ok', code: '200', messages: [], result: { '2024-01': { ipca: '0,44' } } }
}]);
const client = createFabricaClient({ apiKey: 'chave-sintetica', fetchImpl: okFetch });
const tabela = await client.indices('tabela', { competenciaInicial: '2024-01', competenciaFinal: '2024-01', indice: ['ipca'] });
assert.equal(calls[0].url, 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela?competenciaInicial=2024-01&competenciaFinal=2024-01&indice=ipca');
assert.equal(calls[0].options.headers['x-api-key'], 'chave-sintetica');
assert.equal(calls[0].options.headers.accept, 'application/json');
assert.equal(readFabricaEnvelope({ status: 'ok', result: 1 }).ok, true);
assert.equal(tabela.result['2024-01'].ipca, '0,44');
assert.equal(calls[0].options.redirect, 'error');
console.log('✓ Índices oficiais: GET com x-api-key e envelope validado.');

// Leitura de CNIS: multipart com arquivo e nome.
calls.length = 0;
const cnisFetch = fakeFetch([{
  status: 200,
  body: { status: 'ok', messages: [], result: { dadosSegurado: { nome: 'Segurado Sintético' }, periodosContribuicao: [], salarios: [] } }
}]);
const cnisClient = createFabricaClient({ apiKey: 'chave-sintetica', fetchImpl: cnisFetch });
const leitura = await cnisClient.lerCnis({ buffer: Buffer.from('%PDF-1.4 sintetico'), filename: 'cnis-sintetico.pdf' });
assert.equal(calls[0].url.endsWith('/rgps/api/v1/documentos/cnis/ler'), true);
assert.ok(calls[0].options.body instanceof FormData, 'Leitura documental deve usar multipart/form-data.');
assert.equal(calls[0].options.headers['content-type'], undefined, 'FormData define o boundary sozinho.');
assert.equal(leitura.result.dadosSegurado.nome, 'Segurado Sintético');
console.log('✓ Leitura de CNIS via endpoint oficial (multipart, sem content-type manual).');

// Cálculo: POST JSON com corpo íntegro e envelope.
calls.length = 0;
const calcFetch = fakeFetch([{
  status: 200,
  body: { status: 'ok', messages: [], result: [{ marcoTemporal: 'NA_DIB', beneficiosMaisVantajosos: [] }] }
}]);
const calcClient = createFabricaClient({ apiKey: 'chave-sintetica', fetchImpl: calcFetch });
const calculo = await calcClient.calcularRmi({ dataApuracao: '2026-09-21', dadosSegurado: { sexo: 'M' } });
assert.equal(calls[0].url, 'https://fabrica-de-calculos.app.trf3.jus.br/rgps/api/v1/calculos-rmi');
assert.equal(calls[0].options.headers['content-type'], 'application/json');
assert.deepEqual(JSON.parse(calls[0].options.body).dadosSegurado, { sexo: 'M' });
assert.equal(calculo.result[0].marcoTemporal, 'NA_DIB');
console.log('✓ Cálculo oficial: POST JSON com envelope de resultado.');

// 429 com Retry-After: espera e repete; depois desiste com erro honesto.
calls.length = 0;
const waits = [];
const rateLimited = createFabricaClient({
  apiKey: 'chave-sintetica',
  maxRetries: 1,
  sleep: milliseconds => { waits.push(milliseconds); return Promise.resolve(); },
  fetchImpl: fakeFetch([
    { status: 429, headers: { 'retry-after': '7' }, body: { status: 'error', code: '429', messages: ['Capacidade temporária atingida'] } },
    { status: 200, body: { status: 'ok', messages: [], result: { ok: true } } }
  ])
});
const afterRetry = await rateLimited.calcularAtrasados({ dadosProcesso: {} });
assert.deepEqual(waits, [7_000], 'Retry-After deve ser respeitado.');
assert.equal(afterRetry.result.ok, true);

const alwaysLimited = createFabricaClient({
  apiKey: 'chave-sintetica',
  maxRetries: 0,
  fetchImpl: fakeFetch([{ status: 429, headers: { 'retry-after': '3' }, body: { status: 'error', code: '429', messages: ['Capacidade temporária atingida'] } }])
});
await assert.rejects(() => alwaysLimited.calcularAtrasados({}), error => {
  assert.equal(error.code, 'FABRICA_RATE_LIMITED');
  assert.equal(error.statusCode, 429);
  assert.equal(error.retryAfterSeconds, 3);
  return true;
});
console.log('✓ Cota oficial: Retry-After respeitado e 429 final declarado.');

// Fronteiras de erro: chave recusada e conteúdo não processável.
const unauthorized = createFabricaClient({ apiKey: 'chave-invalida', fetchImpl: fakeFetch([{ status: 401, body: { status: 'error', code: '401', messages: ['Chave de API ausente, inválida ou desativada.'] } }]) });
await assert.rejects(() => unauthorized.info(), error => {
  assert.equal(error.code, 'FABRICA_UNAUTHORIZED');
  assert.match(error.message, /Chave de API/);
  return true;
});
// Metadados sem envelope: /info e /status respondem o conteudo direto (2xx confirma).
const statuslessClient = createFabricaClient({
  apiKey: 'chave-sintetica',
  fetchImpl: fakeFetch([{ status: 200, body: { nomeServico: 'Fabrica de Calculos', descricao: 'Servico oficial.' } }])
});
const infoEnvelope = await statuslessClient.info();
assert.equal(infoEnvelope.status, 'unknown');
assert.equal(infoEnvelope.result.nomeServico, 'Fabrica de Calculos');
console.log('OK: /info sem envelope e aceito como metadados (2xx confirma).');

const unprocessable = createFabricaClient({ apiKey: 'chave-sintetica', fetchImpl: fakeFetch([{ status: 422, body: { status: 'error', code: '422', messages: ['Nenhum documento identificado.'] } }]) });
await assert.rejects(() => unprocessable.lerRdctc({ buffer: Buffer.from('x') }), error => {
  assert.equal(error.code, 'FABRICA_UNPROCESSABLE');
  assert.deepEqual(error.messages, ['Nenhum documento identificado.']);
  return true;
});
console.log('✓ Erros oficiais mapeados (401/422) com mensagem real.');

// Job assíncrono aceita in-progress e expõe o jobId.
calls.length = 0;
const jobFetch = fakeFetch([{ status: 202, body: { status: 'in-progress', code: '202', messages: [], result: { jobId: 'job-1', status: 'pendente' } } }]);
const jobClient = createFabricaClient({ apiKey: 'chave-sintetica', fetchImpl: jobFetch });
const job = await jobClient.criarJobRmi({ dataApuracao: '2026-09-21' }, { idempotencyKey: 'abc-123' });
assert.equal(job.inProgress, true);
assert.equal(job.result.jobId, 'job-1');
assert.equal(calls[0].options.headers['idempotency-key'], 'abc-123');
console.log('✓ Job assíncrono de RMI com Idempotency-Key.');

// Resumo minimizado: nunca carrega PII.
const resumo = summarizeFabricaResult({
  status: 'ok',
  permalink: 'https://fabrica-de-calculos.app.trf3.jus.br/tc?p=abc',
  messages: [],
  result: { dadosSegurado: { nome: 'Fulana de Tal', cpf: '000.000.000-00', nit: '000.00000.00-0' }, periodosContribuicao: [] }
});
assert.deepEqual(Object.keys(resumo).sort(), ['code', 'fields', 'messages', 'permalink', 'status']);
assert.equal(JSON.stringify(resumo).includes('000.000.000-00'), false);
assert.equal(JSON.stringify(resumo).includes('Fulana'), false);
console.log('✓ Resumo operacional sem PII (só status, código, permalink e nomes de campos).');

assert.equal(FABRICA_LIMITS.publicPostsPerMinute, 30);
assert.equal(FABRICA_LIMITS.mcpBodyBytes, 8 * 1024 * 1024);
assert.ok(FabricaError.prototype instanceof Error);
console.log('✓ Limites públicos documentados e erro tipado.');

console.log('\n>>> FÁBRICA DE CÁLCULOS: PASS <<<\n');
