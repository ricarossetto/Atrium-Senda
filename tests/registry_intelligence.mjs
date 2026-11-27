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
const NUMERIC_CNPJS = [
  '10001111000176',
  '10002222000105',
  '10003333000128',
  '10004444000159',
  '10005555000180',
  '10006666000100'
];
const fetchFn = async url => {
  const target = String(url);
  requests.push(target);
  if (target.startsWith('https://open.cnpja.com/office/')) {
    const taxId = target.split('/').pop();
    return response({
      taxId,
      updated: '2026-11-23T19:13:22.997Z',
      alias: 'EMPRESA SINTÉTICA OPEN',
      founded: '2020-06-05',
      head: true,
      statusDate: '2020-06-05',
      status: { id: 2, text: 'Ativa' },
      company: {
        name: `SOCIEDADE CNPJA OPEN ${taxId} LTDA`,
        equity: 25000,
        nature: { id: 2062, text: 'Sociedade Empresária Limitada' },
        size: { id: 1, acronym: 'ME', text: 'Microempresa' },
        simples: { optant: true, since: '2020-06-05', events: [{ regime: 'IBS', from: '2027-01-01', text: 'Regime Regular' }] },
        simei: { optant: false, since: null },
        members: [
          {
            since: '2020-06-05',
            person: { type: 'NATURAL', name: 'SÓCIA CNPJA SINTÉTICA', taxId: '***111222**', country: { name: 'Brasil' } },
            role: { id: 49, text: 'Sócio-Administrador' }
          }
        ]
      },
      address: {
        municipality: 4314902,
        street: 'Avenida dos Testes Open',
        number: '500',
        details: 'Sala 402',
        district: 'Centro Histórico',
        city: 'Porto Alegre',
        state: 'RS',
        zip: '90010000'
      },
      phones: [
        { type: 'LANDLINE', area: '51', number: '30001000' },
        { type: 'MOBILE', area: '51', number: '991234567' }
      ],
      emails: [
        { ownership: 'PERSONAL', address: 'PESSOAL@EXAMPLE.TEST', domain: 'example.test' },
        { ownership: 'CORPORATE', address: 'JURIDICO@EXAMPLE.TEST', domain: 'example.test' }
      ],
      mainActivity: { id: 6204000, text: 'Consultoria em tecnologia sintética' },
      sideActivities: [{ id: 6911701, text: 'Atividades auxiliares sintéticas' }],
      suframa: []
    });
  }
  if (target.includes('brasilapi.com.br/api/cnpj/')) {
    const cnpj = decodeURIComponent(target.split('/').pop());
    return response({
      cnpj, razao_social: `SOCIEDADE BRASILAPI ${cnpj} LTDA`, nome_fantasia: 'SINTÉTICA',
      descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2026-08-01', natureza_juridica: 'Sociedade Empresária Limitada',
      data_situacao_cadastral: '2026-08-02', opcao_pelo_simples: true, opcao_pelo_mei: false, codigo_municipio_ibge: '4300000',
      porte: 'MICRO EMPRESA', email: 'CADASTRO@EXAMPLE.TEST', ddd_telefone_1: '51900000000',
      descricao_tipo_de_logradouro: 'RUA', logradouro: 'DOS TESTES', numero: '100', complemento: 'SALA 1', bairro: 'CENTRO',
      cep: '98765000', municipio: 'CIDADE SINTÉTICA', uf: 'RS', capital_social: 1000,
      cnae_fiscal: '6911701', cnae_fiscal_descricao: 'Atividade sintética', cnaes_secundarios: [{ codigo: '6911702', descricao: 'Atividade secundária sintética' }], qsa: [{ nome_socio: 'PESSOA SÓCIA SINTÉTICA', qualificacao_socio: 'Sócio-Administrador' }]
    });
  }
  if (target.includes('/api/cep/v1/01001000')) return response({ cep: '01001000', street: 'Praça da Sé', city: 'São Paulo', state: 'SP' });
  if (target.includes('brasilapi.com.br/api/cep/')) return response({ message: 'indisponível' }, 503);
  if (target.includes('viacep.com.br/ws/')) return response({ cep: '98765-000', logradouro: 'Rua Alternativa', bairro: 'Centro', localidade: 'Cidade Sintética', uf: 'RS', ibge: '4300000' });
  if (target.endsWith('/api/banks/v1')) return response([
    { ispb: '00000000', code: 1, name: 'BCO SINTÉTICO S.A.', fullName: 'BANCO SINTÉTICO S.A.' },
    { ispb: '11111111', code: 999, name: 'COOPERATIVA DE TESTE', fullName: 'COOPERATIVA DE CRÉDITO DE TESTE' }
  ]);
  throw new Error(`URL inesperada no mock: ${target}`);
};

const service = new RegistryService({ fetchFn, now: () => now, timeoutMs: 100 });

// 1. Consulta primária de CNPJ numérico via CNPJá Open + coalescência in-flight
const [openLive, openConcurrent] = await Promise.all([
  service.lookupCnpj(NUMERIC_CNPJS[0]),
  service.lookupCnpj(NUMERIC_CNPJS[0])
]);
assert.equal(openLive.legalName, `SOCIEDADE CNPJA OPEN ${NUMERIC_CNPJS[0]} LTDA`);
assert.equal(openLive.tradeName, 'EMPRESA SINTÉTICA OPEN');
assert.equal(openLive.establishmentType, 'Matriz');
assert.equal(openLive.sizeAcronym, 'ME');
assert.equal(openLive.mobile, '(51) 99123-4567');
assert.equal(openLive.phone, '(51) 3000-1000');
assert.equal(openLive.email, 'juridico@example.test', 'Deve priorizar e-mail corporativo.');
assert.equal(openLive.address, 'Avenida dos Testes Open, 500, Sala 402');
assert.equal(openLive.primaryActivityCode, '6204000');
assert.equal(openLive.taxEvents.length, 1);
assert.equal(openLive.qsa[0].personType, 'PF');
assert.equal(openLive.registry.providerId, 'cnpja-open');
assert.equal(openConcurrent.legalName, openLive.legalName);
assert.equal(requests.filter(u => u.includes('open.cnpja.com')).length, 1, 'Chamadas simultâneas ao mesmo CNPJ devem compartilhar uma única ida à rede.');

// 2. CNPJ alfanumérico roteia direto para BrasilAPI
const cnpjLive = await service.lookupCnpj('12.ABC.345/01DE-35');
assert.equal(cnpjLive.legalName, 'SOCIEDADE BRASILAPI 12ABC34501DE35 LTDA');
assert.equal(cnpjLive.registry.freshness, 'live');
assert.equal(cnpjLive.registry.providerId, 'brasilapi');
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

// 3. Orçamento CNPJá Open (5 req/min) + failover automático para BrasilAPI
await service.lookupCnpj(NUMERIC_CNPJS[1]);
await service.lookupCnpj(NUMERIC_CNPJS[2]);
await service.lookupCnpj(NUMERIC_CNPJS[3]);
await service.lookupCnpj(NUMERIC_CNPJS[4]);
assert.equal(requests.filter(u => u.includes('open.cnpja.com')).length, 5);
const sixthFailover = await service.lookupCnpj(NUMERIC_CNPJS[5]);
assert.equal(sixthFailover.registry.providerId, 'brasilapi', '6º CNPJ dentro de 1 min deve fazer failover local sem disparar à CNPJá Open.');
assert.equal(sixthFailover.registry.fallbackFrom, 'cnpja-open');
assert.equal(requests.filter(u => u.includes('open.cnpja.com')).length, 5);
await assert.rejects(() => service.testProvider('cnpja-open'), /Limite público da CNPJá Open/i);

// Após janela de 61s, orçamento da CNPJá Open reabre
now += 61_000;
const testOpen = await service.testProvider('cnpja-open');
assert.equal(testOpen.state, 'available');

// Failover automático quando CNPJá Open responde HTTP 429
const failoverService = new RegistryService({
  now: () => now,
  fetchFn: async url => {
    const target = String(url);
    if (target.startsWith('https://open.cnpja.com/')) return response({ message: 'rate limit' }, 429);
    return fetchFn(url);
  }
});
const recoveredFrom429 = await failoverService.lookupCnpj(NUMERIC_CNPJS[0]);
assert.equal(recoveredFrom429.registry.providerId, 'brasilapi');
assert.equal(recoveredFrom429.registry.fallbackFrom, 'cnpja-open');

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

assert.equal(service.validateDocument('111.444.777-35').externalLookup, 'local_validation');
assert.match(service.validateDocument('111.444.777-35').message, /dígitos verificadores/i);
await assert.rejects(() => service.fetchJson('https://example.test/segredo', 'evil'), /não autorizada/i);

const status = service.status();
assert.equal(status.providers.length, 4);
assert.equal(status.providers.find(item => item.id === 'cpf-local').configured, true);
assert.equal(status.policy.applyMode, 'review_required');
assert.equal(status.policy.arbitraryOutboundUrls, false);
assert.equal(status.providers.find(item => item.id === 'cnpja-open').priority, 1);
assert.equal(status.providers.find(item => item.id === 'cnpja-open').rateLimitPerMinute, 5);
assert.equal(status.providers.find(item => item.id === 'brasilapi').priority, 2);
assert.equal(status.providers.find(item => item.id === 'brasilapi').enabled, true);
const providerTest = await service.testProvider('brasilapi');
assert.equal(providerTest.state, 'available');
assert.ok(service.status().providers.find(item => item.id === 'brasilapi').lastSuccessAt);
assert.equal((await service.testProvider('cpf-local')).mode, 'local');
await assert.rejects(() => service.testProvider('unknown'), /não pode ser testado/i);

const server = await startTestServer();
try {
  let response = await fetch(`${server.baseUrl}/api/registry/status`);
  assert.equal(response.status, 401, 'Endpoints cadastrais exigem autenticação.');
  const session = await setupMaster(server.baseUrl);
  response = await fetch(`${server.baseUrl}/api/registry/status`, { headers: { Cookie: session.cookie } });
  assert.equal(response.status, 200);
  const serverStatus = await response.json();
  assert.equal(serverStatus.providers.length, 4);
  response = await fetch(`${server.baseUrl}/api/registry/document/validate?value=${encodeURIComponent('111.444.777-35')}`, { headers: { Cookie: session.cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).externalLookup, 'local_validation');
} finally {
  await server.stop();
}

console.log('✓ CNPJá Open, failover 5/min, coalescência, CPF local, CNPJ alfanumérico, cache, bancos, allowlist e autenticação aprovados.');

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
