import assert from 'node:assert/strict';
import { assertReadOnlyEprocTarget } from '../lib/judicial/managed-connectivity.mjs';
import { buildEprocProgress } from '../lib/judicial/eproc-a1-downloader.mjs';

assert.throws(
  () => assertReadOnlyEprocTarget({ operation: 'navigateReadOnly', url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=peticao_protocolar' }),
  /bloqueada por default-deny/i
);
assert.throws(
  () => assertReadOnlyEprocTarget({ operation: 'downloadDocuments', url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=acao_desconhecida' }),
  /bloqueada por default-deny/i
);
assert.throws(
  () => assertReadOnlyEprocTarget({ operation: 'fetchCaseDetails', url: 'https://example.test/eproc/controlador.php?acao=processo_selecionar' }),
  /origem .* não permitida/i
);
assert.equal(
  assertReadOnlyEprocTarget({ operation: 'fetchCaseDetails', url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=processo_selecionar' }),
  true
);
assert.equal(
  assertReadOnlyEprocTarget({ operation: 'downloadDocuments', url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=documento_download' }),
  true
);
assert.equal(
  assertReadOnlyEprocTarget({ operation: 'authenticate', url: 'https://keycloak-eks.tjrs.jus.br/realms/eproc/protocol/openid-connect/auth' }),
  true
);

assert.equal(
  assertReadOnlyEprocTarget({
    operation: 'authenticate',
    url: 'https://keycloak-eks.tjrs.jus.br/realms/eproc/protocol/openid-connect/auth',
    action: 'doCertificateLogin();',
    controlId: 'kc-login-certificate',
    controlType: 'button'
  }),
  true
);

assert.equal(
  assertReadOnlyEprocTarget({
    operation: 'authenticate',
    url: 'https://keycloak-eks.tjrs.jus.br/realms/eproc/login-actions/authenticate',
    action: 'doOtpSubmit();',
    controlId: 'kc-login',
    controlType: 'submit'
  }),
  true
);

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'navigateReadOnly',
    url: 'https://keycloak-eks.tjrs.jus.br/realms/eproc/login-actions/authenticate',
    action: ''
  }),
  /caminho desconhecido/i
);

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'authenticate',
    url: 'https://keycloak-eks.tjrs.jus.br/realms/eproc/protocol/openid-connect/auth',
    action: 'handlerDesconhecido();',
    controlId: 'outro-controle',
    controlType: 'button'
  }),
  /handler dinâmico desconhecido/i
);

assert.throws(
  () => assertReadOnlyEprocTarget({
    operation: 'authenticate',
    url: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php',
    action: 'handlerDesconhecido();',
    controlId: 'kc-login-certificate',
    controlType: 'button'
  }),
  /handler dinâmico desconhecido/i
);

assert.deepEqual(buildEprocProgress(0, 0), { determinate: false, progress: null, completed: null, total: null });
assert.deepEqual(buildEprocProgress(0, 2), { determinate: true, progress: 0, completed: 0, total: 2 });
assert.deepEqual(buildEprocProgress(1, 2), { determinate: true, progress: 50, completed: 1, total: 2 });
assert.deepEqual(buildEprocProgress(2, 2), { determinate: true, progress: 100, completed: 2, total: 2 });

console.log('EPROC READ-ONLY ACTIONS AND TELEMETRY: PASS');

const federalAuthUrls = [
  'https://eproc-sso.trf4.jus.br/realms/eproc/protocol/openid-connect/auth',
  'https://eproc-sso.trf4.jus.br/realms/eproc/login-actions/authenticate',
  'https://eproc-sso-certificado.trf4.jus.br/realms/eproc/protocol/openid-connect/auth',
  'https://sso.cloud.pje.jus.br/auth/realms/pje/protocol/openid-connect/auth',
  'https://sso.cloud.pje.jus.br/auth/realms/pje/broker/trf4/login'
];
for (const url of federalAuthUrls) {
  assert.equal(assertReadOnlyEprocTarget({ operation: 'authenticate', url }), true);
  for (const operation of ['navigateReadOnly', 'fetchDeadlines', 'downloadDocuments']) {
    assert.throws(() => assertReadOnlyEprocTarget({ operation, url, action: 'authenticate' }), /default-deny/);
  }
  for (const acao of ['peticao_protocolar', 'acao_desconhecida', 'ciencia']) {
    assert.throws(() => assertReadOnlyEprocTarget({ operation: 'authenticate', url: `${url}?acao=${acao}`, action: 'authenticate' }), /default-deny/);
  }
}
for (const url of [
  'https://eproc-sso.trf4.jus.br/admin',
  'https://eproc-sso-certificado.trf4.jus.br/realms/other/protocol/openid-connect/auth',
  'https://sso.cloud.pje.jus.br/auth/realms/pje/broker/other/login',
  'https://sso.cloud.pje.jus.br/auth/realms/pje/broker/trf4/endpoint',
  'https://eproc-sso.trf4.jus.br.example.test/realms/eproc/protocol/openid-connect/auth'
]) assert.throws(() => assertReadOnlyEprocTarget({ operation: 'authenticate', url, action: 'authenticate' }), /default-deny/);
const federalLogin = 'https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=SSO%2Flogin';
assert.equal(assertReadOnlyEprocTarget({ operation: 'authenticate', url: federalLogin }), true);
assert.throws(() => assertReadOnlyEprocTarget({ operation: 'navigateReadOnly', url: federalLogin }), /default-deny/);
assert.throws(() => assertReadOnlyEprocTarget({ operation: 'authenticate', url: `${federalLogin}&acao=peticao_protocolar` }), /default-deny/);
console.log('FEDERAL SSO AUTH-ONLY DEFAULT-DENY: PASS');
