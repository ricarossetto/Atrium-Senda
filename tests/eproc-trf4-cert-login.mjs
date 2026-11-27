/**
 * eproc 9.24 da 4ª Região: entrada direta com certificado A1 no TRF4 2º grau e na JFRS.
 *
 * Os testes usam apenas endereços públicos da página de entrada e estado sintético.
 */
import assert from 'node:assert/strict';
import { assertReadOnlyEprocTarget } from '../lib/judicial/managed-connectivity.mjs';
import { getEprocPortalById } from '../lib/judicial/eproc/portal-registry.mjs';
import { pickEprocCertLoginForm, EPROC_TOTP_INPUT_SELECTOR } from '../collector/adapters/eproc.mjs';
import { applyPortalAuthFailureSource, createEprocCertLogin, parseSetCookieHeaders } from '../lib/judicial/eproc-a1-downloader.mjs';

const JFRS_PAGE = 'https://eproc.jfrs.jus.br/eprocV2/';
const TRF4_PAGE = 'https://eproc.trf4.jus.br/eproc2trf4/';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };
async function checkAsync(name, fn) { await fn(); passed += 1; console.log(`ok - ${name}`); }

check('acesso direto com A1 habilitado no TRF4 2G e na JFRS sem origem alternativa', () => {
  for (const id of ['trf4-eproc-2g', 'jfrs-eproc-1g']) {
    const auth = getEprocPortalById(id).auth;
    assert.equal(auth.directCertLogin, true);
    assert.equal(auth.alternateCertOrigins, undefined);
  }
  assert.equal(getEprocPortalById('tjrs-eproc-1g').auth.directCertLogin, undefined);
});

check('autenticador externo removido e acao alternativa seguem bloqueados por default-deny', () => {
  assert.throws(
    () => assertReadOnlyEprocTarget({
      operation: 'authenticate',
      url: 'https://autenticador.certisign.com.br/CertisignLogin/certificado/login',
      baseUrl: JFRS_PAGE
    }),
    /default-deny/
  );
  assert.throws(
    () => assertReadOnlyEprocTarget({
      operation: 'authenticate',
      url: 'https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=entrar_certificado_certisign',
      baseUrl: JFRS_PAGE
    }),
    /default-deny/
  );
});

check('o campo do segundo fator inclui a tela própria do eproc', () => {
  assert.match(EPROC_TOTP_INPUT_SELECTOR, /#otp/);
  assert.match(EPROC_TOTP_INPUT_SELECTOR, /one-time-code/);
  assert.match(EPROC_TOTP_INPUT_SELECTOR, /codigo/);
});

check('falha de entrada marca a fonte como erro e guarda o último sucesso', () => {
  const sources = [
    { id: 'djen-cnj', status: 'ok', lastCheck: '2026-11-21T10:00:00.000Z', detail: 'DJEN sintético' },
    { id: 'eproc-jfrs', name: 'TRF4 · JFRS eproc 1º grau', short: 'FRS', status: 'ok', lastCheck: '2026-11-18T10:11:59.238Z', detail: 'Relatório oficial: 3 processo(s).' }
  ];
  const next = applyPortalAuthFailureSource(sources, {
    portalId: 'jfrs-eproc-1g',
    portalLabel: 'JFRS 1G',
    portal: getEprocPortalById('jfrs-eproc-1g'),
    message: 'Falha na autenticação do eproc JFRS 1G com o Certificado A1 e TOTP.',
    nowIso: '2026-11-22T00:52:55.791Z'
  });
  assert.equal(next.length, 2);
  const jfrs = next.find(source => source.id === 'eproc-jfrs');
  assert.equal(jfrs.status, 'error');
  assert.equal(jfrs.lastCheck, '2026-11-22T00:52:55.791Z');
  assert.equal(jfrs.lastSuccessAt, '2026-11-18T10:11:59.238Z');
  assert.equal(jfrs.name, 'TRF4 · JFRS eproc 1º grau');
  assert.match(jfrs.detail, /^Falha na autenticação do eproc JFRS 1G/);
  assert.match(jfrs.detail, /Nenhum dado foi alterado/);
  assert.deepEqual(next.find(source => source.id === 'djen-cnj'), sources[0]);
  assert.equal(sources[1].status, 'ok', 'a entrada original não é alterada');
});

check('falhas seguidas mantêm a data do último sucesso', () => {
  const first = applyPortalAuthFailureSource([
    { id: 'eproc-trf4-2g', status: 'ok', lastCheck: '2026-11-18T10:09:31.226Z' }
  ], { portalId: 'trf4-eproc-2g', portalLabel: 'TRF4 2G', message: 'x', nowIso: '2026-11-21T10:00:00.000Z' });
  const second = applyPortalAuthFailureSource(first, { portalId: 'trf4-eproc-2g', portalLabel: 'TRF4 2G', message: 'y', nowIso: '2026-11-22T00:53:20.117Z' });
  assert.equal(second.length, 1);
  assert.equal(second[0].lastSuccessAt, '2026-11-18T10:09:31.226Z');
  assert.equal(second[0].lastCheck, '2026-11-22T00:53:20.117Z');
});

check('portal sem fonte anterior ganha entrada nova sem sucesso inventado', () => {
  const next = applyPortalAuthFailureSource([], { portalId: 'trf4-eproc-2g', portalLabel: 'TRF4 2G', portal: { court: 'TRF4' }, message: 'x', nowIso: '2026-11-22T00:00:00.000Z' });
  assert.equal(next[0].id, 'trf4-eproc-2g');
  assert.equal(next[0].status, 'error');
  assert.equal(next[0].lastSuccessAt, null);
});

const LOGIN_CERT = 'https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=login_cert';

check('lê o formulário do acesso principal sem usuário nem senha', () => {
  const form = pickEprocCertLoginForm({
    destino: LOGIN_CERT,
    fields: [['txtUsuario', ''], ['pwdSenha', 'nao-enviar'], ['hdnAcao', 'login'], ['strAcaoSubmit', 'login']]
  }, JFRS_PAGE);
  assert.equal(form.action, LOGIN_CERT);
  assert.deepEqual(form.fields, [['hdnAcao', 'login'], ['strAcaoSubmit', 'login']]);
  assert.equal(pickEprocCertLoginForm({ destino: LOGIN_CERT, fields: [] }, TRF4_PAGE), null);
  assert.equal(pickEprocCertLoginForm({ destino: LOGIN_CERT.replace('login_cert', 'processo_cadastrar'), fields: [] }, JFRS_PAGE), null);
  assert.equal(pickEprocCertLoginForm(null, JFRS_PAGE), null);
});

check('acao=login_cert só passa na autenticação', () => {
  assert.equal(assertReadOnlyEprocTarget({ operation: 'authenticate', url: LOGIN_CERT, baseUrl: JFRS_PAGE }), true);
  assert.throws(() => assertReadOnlyEprocTarget({ operation: 'fetchCaseDetails', url: LOGIN_CERT, baseUrl: JFRS_PAGE }), /default-deny/);
});

check('lê os cookies devolvidos e ignora os apagados', () => {
  assert.deepEqual(parseSetCookieHeaders([
    'PHPSESSID=sessao-sintetica; path=/; secure; HttpOnly',
    'infra_cookie=valor; Path=/eprocV2',
    'antigo=x; expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'removido=; Max-Age=0',
    'semvalor'
  ]), [
    { name: 'PHPSESSID', value: 'sessao-sintetica', httpOnly: true },
    { name: 'infra_cookie', value: 'valor', httpOnly: false }
  ]);
  assert.deepEqual(parseSetCookieHeaders(undefined), []);
});

await checkAsync('o acesso principal envia o formulário com o A1 e os cookies da sessão', async () => {
  const calls = [];
  const fakeRequest = (target, options, onResponse) => {
    const req = {
      on() { return req; },
      destroy() {},
      end(body) {
        calls.push({ target: String(target), options, body });
        const handlers = {};
        const response = {
          statusCode: 302,
          headers: { location: 'controlador.php?acao=painel_adv_listar', 'set-cookie': ['PHPSESSID=nova-sessao; path=/; HttpOnly'] },
          resume() {},
          on(event, fn) { handlers[event] = fn; if (event === 'end') setImmediate(fn); return response; }
        };
        onResponse(response);
      }
    };
    return req;
  };
  const login = createEprocCertLogin({ pfxPath: '/tmp/a1-sintetico.pfx', passphrase: 'senha-sintetica', readPfx: async () => Buffer.from('pfx'), request: fakeRequest });
  const result = await login({ url: LOGIN_CERT, fields: [['hdnAcao', 'login']], cookies: [['PHPSESSID', 'sessao-sintetica']] });
  assert.deepEqual(result, {
    status: 302,
    location: 'https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=painel_adv_listar',
    cookies: [{ name: 'PHPSESSID', value: 'nova-sessao', httpOnly: true }],
    trail: ['302 /eprocV2/externo_controlador.php']
  });
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Cookie, 'PHPSESSID=sessao-sintetica');
  assert.equal(calls[0].body, 'hdnAcao=login');
  await assert.rejects(() => login({ url: LOGIN_CERT.replace('login_cert', 'principal'), fields: [] }), /login_cert|default-deny/);
  await assert.rejects(() => login({ url: 'https://outro.example.test/?acao=login_cert', fields: [] }), /default-deny/);
  assert.equal(calls.length, 1);
});

await checkAsync('segue priv/login_cert.php com o A1 e os cookies acumulados', async () => {
  const steps = [
    { statusCode: 302, headers: { location: 'priv/login_cert.php?origem=sintetica', 'set-cookie': ['PHPSESSID=sessao-2; path=/'] } },
    { statusCode: 302, headers: { location: '../controlador.php?acao=painel_adv_listar', 'set-cookie': ['infra=ok; path=/; HttpOnly'] } }
  ];
  const calls = [];
  const fakeRequest = (target, options, onResponse) => {
    const req = {
      on() { return req; },
      destroy() {},
      end(body) {
        calls.push({ target: String(target), method: options.method, cookie: options.headers.Cookie, pfx: Boolean(options.pfx), body });
        const step = steps[calls.length - 1];
        const response = { statusCode: step.statusCode, headers: step.headers, resume() {}, on(event, fn) { if (event === 'end') setImmediate(fn); return response; } };
        onResponse(response);
      }
    };
    return req;
  };
  const login = createEprocCertLogin({ pfxPath: 'x', passphrase: 'y', readPfx: async () => Buffer.from('pfx'), request: fakeRequest });
  const result = await login({ url: LOGIN_CERT, fields: [['hdnAcao', 'login']], cookies: [['PHPSESSID', 'sessao-1']] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].target, 'https://eproc.jfrs.jus.br/eprocV2/priv/login_cert.php?origem=sintetica');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].cookie, 'PHPSESSID=sessao-2');
  assert.equal(calls[1].pfx, true);
  assert.equal(result.location, 'https://eproc.jfrs.jus.br/eprocV2/controlador.php?acao=painel_adv_listar');
  assert.deepEqual(result.cookies.map(cookie => cookie.name), ['PHPSESSID', 'infra']);
  assert.deepEqual(result.trail, ['302 /eprocV2/externo_controlador.php', '302 /eprocV2/priv/login_cert.php']);
});

check('acao=entrar_cert, destino do acesso principal, só passa na autenticação', () => {
  const url = 'https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=entrar_cert';
  assert.equal(assertReadOnlyEprocTarget({ operation: 'authenticate', url }), true);
  assert.throws(() => assertReadOnlyEprocTarget({ operation: 'fetchCaseDetails', url }), /default-deny/);
  assert.throws(() => assertReadOnlyEprocTarget({ operation: 'authenticate', url: 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php?acao=entrar_cert' }), /default-deny/);
});

check('priv/login_cert.php só passa na autenticação e no eproc federal', () => {
  const url = 'https://eproc.jfrs.jus.br/eprocV2/priv/login_cert.php?acao=qualquer';
  assert.equal(assertReadOnlyEprocTarget({ operation: 'authenticate', url }), true);
  assert.throws(() => assertReadOnlyEprocTarget({ operation: 'fetchCaseDetails', url }), /default-deny/);
  assert.throws(() => assertReadOnlyEprocTarget({ operation: 'authenticate', url: 'https://eproc1g.tjrs.jus.br/eproc/priv/login_cert.php' }), /default-deny/);
});

console.log(`\n${passed} verificações passaram.`);
