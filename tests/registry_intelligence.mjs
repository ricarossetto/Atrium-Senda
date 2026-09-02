import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import {
  classifyBrazilianDocument,
  formatCnpj,
  isValidCnpj,
  isValidCpf,
  normalizeCnpj
} from '../lib/registry/identifiers.mjs';
import { RegistryService } from '../lib/registry/registry-service.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\nATRIUM — INTELIGÊNCIA CADASTRAL BRASILEIRA');

assert.equal(isValidCpf('111.444.777-35'), true);
assert.equal(isValidCpf('111.444.777-34'), false);
assert.deepEqual(classifyBrazilianDocument('111.444.777-35'), {
  type: 'cpf', normalized: '11144477735', formatted: '111.444.777-35', valid: true
});

assert.equal(normalizeCnpj('12.ABC.345/01DE-35'), '12ABC34501DE35');
assert.equal(formatCnpj('12ABC34501DE35'), '12.ABC.345/01DE-35');
assert.equal(isValidCnpj('12.ABC.345/01DE-35'), true, 'Exemplo oficial alfanumérico da Receita deve validar.');
assert.equal(isValidCnpj('00.000.000/E08G-12'), true, 'Primeiro CNPJ alfanumérico oficial deve validar.');
assert.equal(isValidCnpj('19.131.243/0001-97'), true, 'CNPJ numérico legado deve continuar válido.');
assert.equal(isValidCnpj('12.ABC.345/01DE-34'), false);

let now = Date.parse('2026-09-02T12:00:00.000Z');
const requests = [];
const fetchFn = async url => {
  requests.push(String(url));
  if (String(url).includes('/api/cnpj/')) return response({
    cnpj: '12ABC34501DE35', razao_social: 'SOCIEDADE SINTÉTICA DE TESTE LTDA', nome_fantasia: 'SINTÉTICA',
    descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2026-08-01', natureza_juridica: 'Sociedade Empresária Limitada',
    data_situacao_cadastral: '2026-08-02', opcao_pelo_simples: true, opcao_pelo_mei: false, codigo_municipio_ibge: '4300000',
    porte: 'MICRO EMPRESA', email: 'CADASTRO@EXAMPLE.TEST', ddd_telefone_1: '51900000000',
    descricao_tipo_de_logradouro: 'RUA', logradouro: 'DOS TESTES', numero: '100', complemento: 'SALA 1', bairro: 'CENTRO',
    cep: '98765000', municipio: 'CIDADE SINTÉTICA', uf: 'RS', capital_social: 1000,
    cnae_fiscal: '6911701', cnae_fiscal_descricao: 'Atividade sintética', cnaes_secundarios: [{ codigo: '6911702', descricao: 'Atividade secundária sintética' }], qsa: [{ nome_socio: 'PESSOA SÓCIA SINTÉTICA', qualificacao_socio: 'Sócio-Administrador' }]
  });
  if (String(url).includes('/api/cep/v1/01001000')) return response({ cep: '01001000', street: 'Praça da Sé', city: 'São Paulo', state: 'SP' });
  if (String(url).includes('brasilapi.com.br/api/cep/')) return response({ message: 'indisponível' }, 503);
  if (String(url).includes('viacep.com.br/ws/')) return response({ cep: '98765-000', logradouro: 'Rua Alternativa', bairro: 'Centro', localidade: 'Cidade Sintética', uf: 'RS', ibge: '4300000' });
  if (String(url).endsWith('/api/banks/v1')) return response([
    { ispb: '00000000', code: 1, name: 'BCO SINTÉTICO S.A.', fullName: 'BANCO SINTÉTICO S.A.' },
    { ispb: '11111111', code: 999, name: 'COOPERATIVA DE TESTE', fullName: 'COOPERATIVA DE CRÉDITO DE TESTE' }
  ]);
  throw new Error('URL inesperada no mock.');
};

const service = new RegistryService({ fetchFn, now: () => now, timeoutMs: 100 });
const cnpjLive = await service.lookupCnpj('12.ABC.345/01DE-35');
assert.equal(cnpjLive.legalName, 'SOCIEDADE SINTÉTICA DE TESTE LTDA');
assert.equal(cnpjLive.registry.freshness, 'live');
assert.equal(cnpjLive.qsa.length, 1);
assert.equal(cnpjLive.address, 'RUA DOS TESTES, 100, SALA 1');
assert.equal(cnpjLive.statusDate, '2026-08-02');
assert.equal(cnpjLive.simpleNational, true);
assert.equal(cnpjLive.mei, false);
assert.equal(cnpjLive.municipalityIbgeCode, '4300000');
assert.equal(cnpjLive.secondaryActivities.length, 1);
const cnpjRequests = requests.length;
const cnpjCached = await service.lookupCnpj('12ABC34501DE35');
assert.equal(cnpjCached.registry.freshness, 'cached');
assert.equal(requests.length, cnpjRequests, 'Cache não pode repetir consulta de CNPJ durante o TTL.');

const cep = await service.lookupCep('98765-000');
assert.equal(cep.address, 'Rua Alternativa');
assert.equal(cep.registry.source, 'ViaCEP · endereço público por CEP');
assert.equal(requests.filter(url => url.includes('/api/cep/')).length, 1);
assert.equal(requests.filter(url => url.includes('viacep.com.br/ws/')).length, 1);

const banks = await service.searchBanks('001');
assert.equal(banks.records.length, 1);
assert.equal(banks.records[0].code, '001');
assert.equal((await service.searchBanks('cooperativa')).records[0].code, '999');
assert.equal(requests.filter(url => url.endsWith('/api/banks/v1')).length, 1, 'Diretório bancário deve ser cacheado.');

assert.equal(service.validateDocument('111.444.777-35').externalLookup, 'not_configured');
assert.match(service.validateDocument('111.444.777-35').message, /não configurada/i);
await assert.rejects(() => service.fetchJson('https://example.test/segredo', 'evil'), /não autorizada/i);

const status = service.status();
assert.equal(status.providers.find(item => item.id === 'cpf-external').configured, false);
assert.equal(status.policy.applyMode, 'review_required');
assert.equal(status.policy.arbitraryOutboundUrls, false);
assert.equal(status.providers.find(item => item.id === 'brasilapi').priority, 1);
assert.equal(status.providers.find(item => item.id === 'brasilapi').enabled, true);
const providerTest = await service.testProvider('brasilapi');
assert.equal(providerTest.state, 'available');
assert.ok(service.status().providers.find(item => item.id === 'brasilapi').lastSuccessAt);
await assert.rejects(() => service.testProvider('unknown'), /não pode ser testado/i);

const server = await startTestServer();
try {
  let response = await fetch(`${server.baseUrl}/api/registry/status`);
  assert.equal(response.status, 401, 'Endpoints cadastrais exigem autenticação.');
  const session = await setupMaster(server.baseUrl);
  response = await fetch(`${server.baseUrl}/api/registry/status`, { headers: { Cookie: session.cookie } });
  assert.equal(response.status, 200);
  const serverStatus = await response.json();
  assert.equal(serverStatus.providers.length, 3);
  response = await fetch(`${server.baseUrl}/api/registry/document/validate?value=${encodeURIComponent('111.444.777-35')}`, { headers: { Cookie: session.cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).externalLookup, 'not_configured');
} finally {
  await server.stop();
}

console.log('✓ CPF local, CNPJ alfanumérico, cache, fallback, bancos, allowlist e autenticação aprovados.');

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(payload); } };
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'registry.admin', displayName: 'Administradora Cadastral', password: 'Senha-Registry-Sintetica-2026!'
  });
  const setup = await response.json();
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
