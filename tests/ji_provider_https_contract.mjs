import assert from 'node:assert/strict';
import { createPdpjProvider } from '../lib/judicial-intelligence/providers/pdpj/index.mjs';
import { createDatajudProvider } from '../lib/judicial-intelligence/providers/datajud/index.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JI PROVIDERS: HTTPS OBRIGATÓRIO COM CREDENCIAL     ');
console.log('===============================================================\n');

// JWT sintético (sem segredo real): header {"alg":"none"}, payload {"sub":"teste","exp":4102444800}.
const SYNTHETIC_JWT = [
  'eyJhbGciOiJub25lIn0',
  Buffer.from(JSON.stringify({ sub: 'teste.sintetico', exp: 4102444800 })).toString('base64url'),
  'assinatura-sintetica'
].join('.');

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('rede proibida neste teste de contrato');
};

try {
  // Factory PDPJ: baseUrl http com token presente deve falhar por HTTPS antes de qualquer requisição.
  const pdpj = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true' },
    baseUrl: 'http://example.test',
    token: SYNTHETIC_JWT
  });
  const pdpjError = await pdpj.findProcesses('0000000-00.0000.0.00.0000').then(() => null, error => error);
  assert.equal(pdpjError?.code, 'FORBIDDEN', 'PDPJ deve recusar http com credencial');
  assert.match(String(pdpjError?.message), /HTTPS/i);
  assert.equal(fetchCalls, 0, 'PDPJ não pode tocar a rede antes de validar HTTPS');

  // Factory DataJud: baseUrl http com API key deve falhar por HTTPS antes de qualquer requisição.
  const datajud = createDatajudProvider({
    env: { BETA_PROCESS_INTELLIGENCE: 'true' },
    baseUrl: 'http://example.test',
    apiKey: 'chave-sintetica'
  });
  const datajudError = await datajud.getProcess('0000000-00.2026.8.21.0000').then(() => null, error => error);
  assert.equal(datajudError?.code, 'FORBIDDEN', 'DataJud deve recusar http com credencial');
  assert.match(String(datajudError?.message), /HTTPS/i);
  assert.equal(fetchCalls, 0, 'DataJud não pode tocar a rede antes de validar HTTPS');

  // Caminho por variável de ambiente: PDPJ_API_BASE_URL http também é recusado.
  const pdpjByEnv = createPdpjProvider({
    env: { BETA_PDPJ_PROVIDER: 'true', PDPJ_API_BASE_URL: 'http://example.test' },
    token: SYNTHETIC_JWT
  });
  const envError = await pdpjByEnv.getProcess('0000000-00.0000.0.00.0000').then(() => null, error => error);
  assert.equal(envError?.code, 'FORBIDDEN', 'PDPJ_API_BASE_URL http deve ser recusado com credencial');
  assert.match(String(envError?.message), /HTTPS/i);
  assert.equal(fetchCalls, 0, 'PDPJ_API_BASE_URL http não pode tocar a rede');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('PASS contrato HTTPS: factories de PDPJ e DataJud recusam http com credencial sem tocar a rede.');
