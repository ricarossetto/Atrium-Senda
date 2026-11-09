import assert from 'node:assert/strict';
import { shouldRetryEprocLogin } from '../collector/adapters/eproc.mjs';

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

console.log('--- Iniciando Testes: repetição do login por certificado (TJRS) ---');

check(shouldRetryEprocLogin({ bodyText: 'Ocorreu uma instabilidade temporária no fluxo de autenticação.', outcome: { ok: false, state: 'UNKNOWN' }, attempt: 1, attempts: 3 }) === true,
  'tela de instabilidade do SSO deve repetir');
check(shouldRetryEprocLogin({ bodyText: 'Não é possível fazer o login, a configuração de credencial é necessária.', outcome: { ok: false, state: 'UNKNOWN' }, attempt: 1, attempts: 3 }) === true,
  'tela de credencial do SSO deve repetir');
check(shouldRetryEprocLogin({ bodyText: '', outcome: { ok: false, state: 'UNKNOWN' }, attempt: 2, attempts: 3 }) === true,
  'resultado inconclusivo deve repetir');
check(shouldRetryEprocLogin({ bodyText: 'instabilidade temporária', outcome: { ok: false, state: 'UNKNOWN' }, attempt: 3, attempts: 3 }) === false,
  'última tentativa não repete');
check(shouldRetryEprocLogin({ bodyText: '', outcome: { ok: false, state: 'ERROR', error: new Error('Segundo fator exigido pelo tribunal, mas nenhum segredo TOTP foi configurado.') }, attempt: 1, attempts: 3 }) === false,
  'falta de segredo TOTP é definitiva');
check(shouldRetryEprocLogin({ bodyText: 'Certificado inválido', outcome: { ok: false, state: 'ERROR', error: new Error('Certificado digital rejeitado') }, attempt: 1, attempts: 3 }) === false,
  'erro explícito do portal não repete');
check(shouldRetryEprocLogin({ bodyText: '', outcome: { ok: true, state: 'CONNECTED' }, attempt: 1, attempts: 3 }) === false,
  'sucesso não repete');

console.log(`✓ ${assertions} verificações aprovadas.`);
console.log('PASS: repetição do login por certificado validada.');
