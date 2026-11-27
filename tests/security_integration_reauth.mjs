/**
 * Integração das correções de segurança: reautenticação no perfil, limpeza das
 * duas sessões no logout e projeção de acesso no alias de download do TJRS.
 * Dados sintéticos: nomes, e-mails, processos e segredos fictícios.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { SecurityManager } from '../lib/security.mjs';
import { createTjrsSidecarHttpHandler } from '../lib/http/tjrs-sidecar-routes.mjs';

const SENHA_SINTETICA = 'senha-Teste-2026!';
const EMAIL_ATUAL = 'teste@example.test';
const CNJ_PRIVADO = '0000033-33.2026.8.21.0001';
const CNJ_COMPARTILHADO = '0000044-44.2026.8.21.0001';

test('logout limpa os dois nomes de cookie e mantém a limpeza do dispositivo confiável', async () => {
  const manager = new SecurityManager({
    dataDirectory: 'tmp-integracao-logout',
    sessionSecret: randomBytes(32).toString('base64url'),
    encryptionKey: randomBytes(32).toString('base64')
  });
  const clears = manager.clearSessionCookies();
  assert.equal(clears.length, 2, 'devem ser devolvidos os dois nomes de sessão');
  assert.ok(clears.some(cookie => cookie.startsWith('atrium_session=')), 'cookie legado precisa expirar');
  assert.ok(clears.some(cookie => cookie.startsWith('keller_session=')), 'cookie atual precisa expirar');
  assert.ok(clears.every(cookie => /Max-Age=0/.test(cookie)), 'ambos expiram imediatamente');

  const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const start = serverSource.indexOf("url.pathname === '/api/auth/logout'");
  assert.ok(start >= 0, 'rota de logout não localizada');
  const logoutBlock = serverSource.slice(start, start + 400);
  assert.match(logoutBlock, /clearSessionCookies\(\)/, 'logout deve limpar os dois cookies de sessão');
  assert.doesNotMatch(logoutBlock, /security\.clearCookie\(\)/, 'logout não pode limpar só um nome');
  assert.match(logoutBlock, /clearTrustedDeviceCookie\(\)/, 'dispositivo confiável continua sendo limpo');
});

// DOM mínimo para exercitar saveProfile sem navegador. Nenhuma credencial real.
const elements = new Map();
const focused = [];
const timers = [];
const fakeElement = id => ({
  id,
  value: '',
  textContent: '',
  className: '',
  hidden: false,
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  focus() { focused.push(id); },
  querySelectorAll() { return []; },
  setAttribute() {},
  removeAttribute() {},
  appendChild() {},
  replaceChildren() {}
});
const byId = id => {
  if (!elements.has(id)) elements.set(id, fakeElement(id));
  return elements.get(id);
};
globalThis.document = {
  getElementById: byId,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: fakeElement,
  body: { classList: { add() {}, remove() {} } }
};
globalThis.window = {
  addEventListener() {},
  dispatchEvent() {},
  confirm: () => true,
  setTimeout(callback, ms) { timers.push({ callback, ms }); return timers.length; },
  location: { href: '' },
  history: { replaceState() {} }
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};

await import('../js/auth.js');
const Auth = globalThis.window.AtriumAuth;
assert.ok(Auth, 'módulo de autenticação deve publicar AtriumAuth');

const applyProfileReal = Auth.applyProfile;
applyProfileReal.call(Auth, { displayName: 'Advogada Teste', email: EMAIL_ATUAL, role: 'admin' });
Auth.applyProfile = () => {};
Auth.busy = () => {};
Auth.closeProfile = () => { Auth.__closes = (Auth.__closes || 0) + 1; return true; };

function fakeResponse(status, body, headers = new Headers()) {
  return { status, ok: status >= 200 && status < 300, headers, json: async () => body };
}

test('saveProfile envia senha e código só na troca de e-mail', async () => {
  const calls = [];
  let next = fakeResponse(200, { user: { displayName: 'Advogada Teste', email: EMAIL_ATUAL } });
  Auth.secureFetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return next;
  };
  const event = () => ({ preventDefault() {}, currentTarget: { querySelectorAll: () => [] } });

  byId('profileDisplayName').value = 'Advogada Teste';
  byId('profileEmail').value = EMAIL_ATUAL;
  byId('profilePhone').value = '';
  byId('profileEmailCurrentPassword').value = SENHA_SINTETICA;
  byId('profileEmailMfaCode').value = '123456';

  await Auth.saveProfile(event());
  const withoutChange = calls.at(-1).body;
  assert.deepEqual(Object.keys(withoutChange).sort(), ['avatar', 'displayName', 'email', 'phone']);
  assert.equal('currentPassword' in withoutChange, false, 'nome/telefone/foto não exigem step-up');
  assert.equal('mfaCode' in withoutChange, false);

  byId('profileEmail').value = 'novo@example.test';
  await Auth.saveProfile(event());
  const withChange = calls.at(-1).body;
  assert.equal(withChange.email, 'novo@example.test');
  assert.equal(withChange.currentPassword, SENHA_SINTETICA);
  assert.equal(withChange.mfaCode, '123456');
  assert.equal(byId('profileEmailCurrentPassword').value, '', 'credenciais não ficam no campo após sucesso');
  assert.equal(byId('profileEmailMfaCode').value, '');
});

test('403 REAUTH_REQUIRED mantém modal aberto, mensagem clara e conteúdo digitado', async () => {
  const headers = new Headers({ 'x-atrium-reauth': 'required' });
  const denied = fakeResponse(403, { code: 'REAUTH_REQUIRED', message: 'Confirme sua senha atual para alterar o e-mail.' }, headers);
  Auth.secureFetch = async () => denied;
  byId('profileEmail').value = 'outro@example.test';
  byId('profileEmailCurrentPassword').value = SENHA_SINTETICA;
  byId('profileEmailMfaCode').value = '654321';

  const closesBefore = Auth.__closes || 0;
  const timersBefore = timers.length;
  await Auth.saveProfile({ preventDefault() {}, currentTarget: { querySelectorAll: () => [] } });

  assert.equal(Auth.__closes || 0, closesBefore, 'modal não pode fechar em caso de reautenticação');
  assert.equal(timers.length, timersBefore, 'não pode agendar o fechamento após 450 ms');
  assert.match(byId('profileSettingsFeedback').textContent, /senha/i);
  assert.match(byId('profileSettingsFeedback').textContent, /autenticador/i);
  assert.equal(byId('profileEmail').value, 'outro@example.test', 'e-mail digitado deve ser preservado');
  assert.equal(byId('profileEmailCurrentPassword').value, SENHA_SINTETICA, 'senha digitada deve ser preservada');
  assert.equal(byId('profileEmailMfaCode').value, '654321', 'código digitado deve ser preservado');
  assert.ok(focused.includes('profileEmailCurrentPassword'), 'foco deve voltar ao campo de confirmação');
});

test('REAUTH_REQUIRED exibe o bloco correto e foca a senha depois de reabilitar o campo', async () => {
  // Reproduz o navegador: busy() desabilita os campos durante a request e
  // focus() só funciona em campo habilitado. O foco não pode cair no BODY nem
  // na seção "Alterar senha", e os valores digitados devem ser preservados.
  const passwordField = byId('profileEmailCurrentPassword');
  const mfaField = byId('profileEmailMfaCode');
  const changePasswordField = byId('profileCurrentPassword');
  const reauthBlock = byId('profileEmailReauthBlock');

  focused.length = 0;
  const scrolled = [];
  reauthBlock.scrollIntoView = options => scrolled.push(options);
  reauthBlock.hidden = true;

  const denied = fakeResponse(403, { code: 'REAUTH_REQUIRED' }, new Headers({ 'x-atrium-reauth': 'required' }));
  Auth.secureFetch = async () => denied;
  byId('profileEmail').value = 'sem-senha@example.test';
  passwordField.value = '';
  mfaField.value = '';

  const focusReal = function () { if (!this.disabled) focused.push(this.id); };
  passwordField.focus = focusReal;
  mfaField.focus = focusReal;
  changePasswordField.focus = focusReal;
  const busyOriginal = Auth.busy;
  Auth.busy = (form, active) => {
    [passwordField, mfaField, changePasswordField].forEach(element => { element.disabled = active; });
  };
  const event = () => ({ preventDefault() {}, currentTarget: { querySelectorAll: () => [] } });

  try {
    await Auth.saveProfile(event());
  } finally {
    Auth.busy = busyOriginal;
    delete reauthBlock.scrollIntoView;
  }

  assert.equal(passwordField.disabled, false, 'campos reabilitados ao final da requisição');
  assert.ok(focused.includes('profileEmailCurrentPassword'), 'foco no campo de senha do bloco de confirmação');
  assert.equal(focused.includes('profileCurrentPassword'), false, 'não pode focar a seção "Alterar senha"');
  assert.equal(reauthBlock.hidden, false, 'bloco de confirmação precisa ser exibido');
  assert.equal(scrolled.length, 1, 'bloco de confirmação trazido para a área visível');
  assert.equal(byId('profileEmail').value, 'sem-senha@example.test', 'e-mail digitado preservado');
  assert.equal(passwordField.value, '', 'campo de senha preservado');
});

test('deleteProfile envia senha e código do bloco de confirmação e mantém o modal em 403 de reautenticação', async () => {
  globalThis.sessionStorage = { clear() {} };
  const calls = [];
  let next = fakeResponse(200, { ok: true, deleted: true });
  Auth.secureFetch = async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    return next;
  };
  byId('profileEmailCurrentPassword').value = SENHA_SINTETICA;
  byId('profileEmailMfaCode').value = '246810';

  await Auth.deleteProfile();
  const sent = calls.at(-1);
  assert.equal(sent.url, '/api/auth/profile/delete');
  assert.equal(sent.options.method, 'POST');
  assert.deepEqual(sent.body, { password: SENHA_SINTETICA, code: '246810' }, 'a exclusão precisa levar o step-up digitado');

  // 403 REAUTH_REQUIRED: mensagem clara, foco no campo e perfil preservado.
  calls.length = 0;
  next = fakeResponse(403, { code: 'REAUTH_REQUIRED' }, new Headers({ 'x-atrium-reauth': 'required' }));
  const closesBefore = Auth.__closes || 0;
  await Auth.deleteProfile();
  assert.equal(calls.at(-1).url, '/api/auth/profile/delete');
  assert.match(byId('profileSettingsFeedback').textContent, /senha/i);
  assert.match(byId('profileSettingsFeedback').textContent, /autenticador/i);
  assert.equal(Auth.__closes || 0, closesBefore, 'recusa de reautenticação não pode fechar o perfil');
  assert.equal(focused.at(-1), 'profileEmailCurrentPassword', 'foco volta ao campo de confirmação');
});

test('alias download-autos não resolve processo nem devolve documento fora do escopo', async () => {
  const idMembro = 'usr-membro-teste';
  const idAdmin = 'usr-admin-teste';
  const state = {
    processes: [
      {
        id: 'proc-privado', number: CNJ_PRIVADO, client: 'Cliente Teste Privado', court: 'TJRS',
        scope: 'private', privateOwnerUserId: idAdmin, responsibleUserIds: [idAdmin],
        judicialMovements: [{ date: '2026-09-01', description: 'Distribuição do processo' }]
      },
      {
        id: 'proc-compartilhado', number: CNJ_COMPARTILHADO, client: 'Cliente Teste Compartilhado', court: 'TJRS',
        responsibleUserIds: [idMembro],
        judicialMovements: [{ date: '2026-09-01', description: 'Distribuição do processo' }]
      }
    ],
    documents: [
      { id: 'doc-privado', name: 'privado.pdf', ownerType: 'process', ownerId: 'proc-privado', scope: 'private', privateOwnerUserId: idAdmin },
      { id: 'doc-compartilhado', name: 'compartilhado.pdf', ownerType: 'process', ownerId: 'proc-compartilhado' }
    ],
    audit: []
  };
  let sidecarCalls = 0;
  const handler = createTjrsSidecarHttpHandler({
    client: {
      health: async () => ({ ok: true }),
      getProcess: async () => { sidecarCalls += 1; throw new Error('sem snapshot sintético'); }
    },
    assertAuthenticated: () => ({ id: idMembro, username: 'membro_teste', displayName: 'Membro Teste', permissions: [], teamIds: [] }),
    readJson: async req => req.body,
    readStateEnvelope: async () => ({ state, revision: 'rev-teste' }),
    saveState: async () => ({ revision: 'rev-nova', updatedAt: new Date().toISOString() }),
    documentStorage: { put: async () => ({ ok: true }) },
    json: (res, status, body) => Object.assign(res, { status, body })
  });
  const url = new URL('http://localhost/api/integrations/tjrs-sidecar/processes/download-autos');
  const post = body => {
    const res = {};
    return handler({ method: 'POST', body: { revision: 'rev-teste', ...body } }, res, url).then(() => res);
  };

  await assert.rejects(
    () => post({ processId: 'proc-privado', processNumber: CNJ_PRIVADO }),
    error => {
      assert.equal(error.statusCode, 404, 'processo privado alheio não pode ser resolvido');
      assert.match(error.message, /acervo acessível/i);
      assert.equal(error.message.includes('Cliente Teste Privado'), false, 'a mensagem não pode revelar o processo privado');
      return true;
    }
  );
  assert.equal(sidecarCalls, 0, 'acesso negado não pode chegar ao sidecar');

  const permitido = await post({ processId: 'proc-compartilhado', processNumber: CNJ_COMPARTILHADO });
  assert.equal(permitido.status, 200, 'processo acessível continua utilizável');
  const nomes = (permitido.body.documents || []).map(document => document.name);
  assert.equal(nomes.includes('privado.pdf'), false, 'documento privado alheio não pode ser entregue');
  assert.equal(nomes.includes('compartilhado.pdf'), true, 'documento do processo acessível continua visível');
});

test('sync não resolve processo privado alheio e mantém revisão e CNJ para o processo acessível', async () => {
  const idMembro = 'usr-membro-teste';
  const idAdmin = 'usr-admin-teste';
  const state = {
    processes: [
      {
        id: 'proc-privado', number: CNJ_PRIVADO, client: 'Cliente Teste Privado', court: 'TJRS',
        scope: 'private', privateOwnerUserId: idAdmin, responsibleUserIds: [idAdmin]
      },
      {
        id: 'proc-compartilhado', number: CNJ_COMPARTILHADO, client: 'Cliente Teste Compartilhado', court: 'TJRS',
        responsibleUserIds: [idMembro]
      }
    ],
    documents: [],
    audit: []
  };
  let sidecarCalls = 0;
  let gravacoes = 0;
  const handler = createTjrsSidecarHttpHandler({
    client: {
      health: async () => { sidecarCalls += 1; return { ok: true }; },
      getProcess: async () => { sidecarCalls += 1; throw new Error('sem snapshot sintético'); },
      getDiff: async () => ({ hasChanges: false })
    },
    assertAuthenticated: () => ({ id: idMembro, username: 'membro_teste', displayName: 'Membro Teste', permissions: [], teamIds: [] }),
    readJson: async req => req.body,
    readStateEnvelope: async () => ({ state, revision: 'rev-teste' }),
    saveState: async () => { gravacoes += 1; return { revision: 'rev-nova', updatedAt: new Date().toISOString() }; },
    json: (res, status, body) => Object.assign(res, { status, body })
  });
  const url = new URL('http://localhost/api/integrations/tjrs-sidecar/processes/sync');
  const post = body => {
    const res = {};
    return handler({ method: 'POST', body }, res, url).then(() => res);
  };

  await assert.rejects(
    () => post({ processId: 'proc-privado', processNumber: CNJ_PRIVADO, revision: 'rev-teste' }),
    error => {
      assert.equal(error.statusCode, 404, 'processo privado alheio não pode ser resolvido no sync');
      assert.match(error.message, /acervo acessível/i);
      assert.equal(error.message.includes(CNJ_PRIVADO), false, 'a resposta não pode revelar o número');
      assert.equal(error.message.includes('Cliente Teste Privado'), false, 'a resposta não pode revelar o cliente');
      assert.doesNotMatch(error.message, /chave/i, 'a resposta não pode revelar a exigência de chave');
      return true;
    }
  );
  assert.equal(sidecarCalls, 0, 'acesso negado não pode chegar ao sidecar');
  assert.equal(gravacoes, 0, 'acesso negado não pode gravar estado');

  await assert.rejects(
    () => post({ processId: 'proc-compartilhado', processNumber: CNJ_COMPARTILHADO, revision: 'rev-errada' }),
    error => {
      assert.equal(error.statusCode, 409, 'o processo acessível deve chegar à validação de revisão');
      assert.match(error.message, /atualizados em outra aba/i);
      return true;
    }
  );

  await assert.rejects(
    () => post({ processId: 'proc-compartilhado', processNumber: CNJ_PRIVADO, revision: 'rev-teste' }),
    error => {
      assert.equal(error.statusCode, 409, 'o processo acessível deve chegar à validação de CNJ');
      assert.match(error.message, /diverge do processo local/i);
      return true;
    }
  );
  assert.equal(sidecarCalls, 0, 'as validações de revisão e CNJ ocorrem antes de consultar o sidecar');
  assert.equal(gravacoes, 0, 'nenhum cenário negado pode gravar estado');
});
