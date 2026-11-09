import assert from 'node:assert/strict';
import { createReauthRunner } from '../js/core/reauth.js';

// 1. Resposta direta: sem 403 não abre modal nem reexecuta.
{
  const opened = [];
  const runner = createReauthRunner({ openModal: (...args) => opened.push(args), closeModal: () => {} });
  const calls = [];
  const response = await runner.withReauth(async stepUp => {
    calls.push(stepUp);
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1, 'execução direta usa uma única chamada');
  assert.equal(opened.length, 0, 'sem 403 REAUTH_REQUIRED o modal não abre');
}

// 2. REAUTH_REQUIRED por código e header: pede credenciais e reexecuta com password+code no body.
{
  const opened = [];
  let closed = 0;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => {
      opened.push({ mode, fields });
      defaults.onSubmit({ password: '  senha com espacos  ', code: ' 123456 ' });
    },
    closeModal: () => { closed += 1; }
  });
  const calls = [];
  let attempt = 0;
  const response = await runner.withReauth(async stepUp => {
    calls.push(stepUp);
    attempt += 1;
    if (attempt === 1) {
      return {
        status: 403,
        ok: false,
        headers: new Headers({ 'x-atrium-reauth': 'required' }),
        clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED' }) })
      };
    }
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  });
  assert.equal(response.status, 200, 'reexecução com credenciais conclui');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {});
  assert.deepEqual(calls[1], { password: '  senha com espacos  ', code: '123456' }, 'senha preservada sem trim e código com trim');
  assert.equal(opened.length, 1);
  assert.equal(opened[0].mode, 'reauth');
  assert.ok(opened[0].fields.some(field => field.name === 'password' && field.type === 'password'), 'campo de senha mascarado');
  assert.ok(opened[0].fields.some(field => field.name === 'code'), 'campo de código presente');
  assert.equal(closed, 1, 'modal fecha após submeter');
}

// 3. 403 de outra natureza (ex.: MFA_REQUIRED) não abre o modal de reauth.
{
  const opened = [];
  const runner = createReauthRunner({ openModal: (...args) => opened.push(args), closeModal: () => {} });
  const response = await runner.withReauth(async () => ({
    status: 403,
    ok: false,
    headers: new Headers({}),
    clone: () => ({ json: async () => ({ code: 'MFA_REQUIRED', message: 'Acesso ao plano administrativo exige autenticação em duas etapas ativa.' }) })
  }));
  assert.equal(response.status, 403);
  assert.equal(opened.length, 0, 'outros 403 não disparam reautenticação');
}

// 4. Single-flight compartilhado: múltiplos chamadores concorrentes aguardam o mesmo prompt e recebem as credenciais.
{
  let captured = null;
  let openCount = 0;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => {
      openCount += 1;
      captured = defaults;
    },
    closeModal: () => {}
  });

  const p1 = runner.promptCredentials();
  const p2 = runner.promptCredentials();
  assert.equal(openCount, 1, 'apenas um modal é aberto para chamadas simultâneas');

  captured.onSubmit({ password: 'senha-compartilhada', code: '999888' });
  const [res1, res2] = await Promise.all([p1, p2]);
  assert.deepEqual(res1, { password: 'senha-compartilhada', code: '999888' });
  assert.deepEqual(res2, { password: 'senha-compartilhada', code: '999888' });
}

// 5. Cancelamento deny-by-default: cancelPrompt resolve todos os waiters com null e ação original não é reexecutada.
{
  let openCount = 0;
  const runner = createReauthRunner({
    openModal: () => { openCount += 1; },
    closeModal: () => {}
  });

  const calls = [];
  const reauthPromise = runner.withReauth(async stepUp => {
    calls.push(stepUp);
    if (calls.length === 1) {
      return {
        status: 403,
        ok: false,
        headers: new Headers({ 'x-atrium-reauth': 'required' }),
        clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED' }) })
      };
    }
    return { status: 200, ok: true };
  });

  // Aguarda a chamada inicial assíncrona atingir o promptCredentials
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(openCount, 1);
  assert.equal(calls.length, 1);

  runner.cancelPrompt();
  const result = await reauthPromise;
  assert.equal(result.status, 403, 'quando cancelado, retorna o 403 original');
  assert.equal(result.reauthCancelled, true, 'cancelamento é sinalizado ao chamador');
  assert.equal(calls.length, 1, 'mutação sensível NÃO é repetida em caso de cancelamento');
}

// 6. Validação de senha/código vazios: onSubmit lança erro sem fechar modal nem resolver credenciais vazias.
{
  let captured = null;
  let closed = false;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => { captured = defaults; },
    closeModal: () => { closed = true; }
  });

  const promptPromise = runner.promptCredentials();
  await assert.rejects(
    async () => captured.onSubmit({ password: '', code: '' }),
    /Informe a senha e o código do autenticador/
  );
  assert.equal(closed, false, 'modal permanece aberto se validação falhar');

  // Submete com credenciais válidas depois
  captured.onSubmit({ password: 'senha-ok', code: '112233' });
  const creds = await promptPromise;
  assert.deepEqual(creds, { password: 'senha-ok', code: '112233' });
  assert.equal(closed, true);
}

// 7. Sem loop de retry: retry que falha retorna o erro e não reabre reauth infinitamente.
{
  let modalCount = 0;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => {
      modalCount += 1;
      defaults.onSubmit({ password: 'senha-errada', code: '000000' });
    },
    closeModal: () => {}
  });

  let execCount = 0;
  const response = await runner.withReauth(async () => {
    execCount += 1;
    return {
      status: 403,
      ok: false,
      headers: new Headers({ 'x-atrium-reauth': 'required' }),
      clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED', message: 'Credenciais inválidas' }) })
    };
  });

  assert.equal(response.status, 403);
  assert.equal(execCount, 2, 'executa no máximo 1 inicial + 1 retry');
  assert.equal(modalCount, 1, 'não reabre modal em loop após falha de retry');
}

// 8. Troca de view durante requisição inicial: não abre modal e não reexecuta.
{
  let currentView = 'configuration';
  let modalCount = 0;
  const runner = createReauthRunner({
    openModal: () => { modalCount += 1; },
    closeModal: () => {},
    getCurrentView: () => currentView
  });

  const calls = [];
  const response = await runner.withReauth(async stepUp => {
    calls.push(stepUp);
    currentView = 'dashboard';
    return {
      status: 403,
      ok: false,
      headers: new Headers({ 'x-atrium-reauth': 'required' }),
      clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED' }) })
    };
  });

  assert.equal(response.status, 403);
  assert.equal(modalCount, 0, 'troca de view durante requisição inicial não abre modal');
  assert.equal(calls.length, 1, 'ação antiga não reexecuta após troca de view');
}

// 9. Callback antigo não resolve prompt novo (proteção de instância).
{
  const callbacks = [];
  let modalCount = 0;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => {
      modalCount += 1;
      callbacks.push(defaults.onSubmit);
    },
    closeModal: () => {}
  });

  const first = runner.promptCredentials();
  runner.cancelPrompt();
  assert.equal(await first, null, 'primeiro prompt cancelado');

  const second = runner.promptCredentials();
  assert.equal(modalCount, 2, 'novo prompt abre novo modal');
  assert.equal(callbacks.length, 2);

  // Callback antigo tenta resolver o prompt novo — deve ser ignorado.
  await callbacks[0]({ password: 'credencial-antiga', code: '111111' });
  // Verifica que o prompt novo ainda está pendente ao enviar credenciais válidas.
  callbacks[1]({ password: 'credencial-nova', code: '222222' });
  assert.deepEqual(await second, { password: 'credencial-nova', code: '222222' }, 'callback antigo não resolve prompt novo');
}

// 10. Proteção contra sobrescrita de modal ativo: se outro modal estiver aberto, não sobrescreve.
{
  let modalCount = 0;
  let currentModalMode = { mode: 'task', defaults: {} };
  const runner = createReauthRunner({
    openModal: () => { modalCount += 1; },
    closeModal: () => {},
    getModalMode: () => currentModalMode
  });

  const response = await runner.withReauth(async () => ({
    status: 403,
    ok: false,
    headers: new Headers({ 'x-atrium-reauth': 'required' }),
    clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED' }) })
  }));

  assert.equal(response.status, 403);
  assert.equal(modalCount, 0, 'não sobrescreve modal ativo de outra tarefa/formulário');
}

// 11. Chamadores concorrentes compartilham o prompt mesmo com modal reauth já aberto.
{
  let modalCount = 0;
  let currentModalMode = null;
  let captured = null;
  const runner = createReauthRunner({
    openModal: (mode, title, eyebrow, fields, defaults) => {
      modalCount += 1;
      captured = defaults;
      currentModalMode = { mode: 'reauth', defaults };
    },
    closeModal: () => { currentModalMode = null; },
    getModalMode: () => currentModalMode
  });

  const execFactory = () => {
    let attempt = 0;
    return async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          status: 403,
          ok: false,
          headers: new Headers({ 'x-atrium-reauth': 'required' }),
          clone: () => ({ json: async () => ({ code: 'REAUTH_REQUIRED' }) })
        };
      }
      return { status: 200, ok: true };
    };
  };

  const first = runner.withReauth(execFactory());
  const second = (async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return runner.withReauth(execFactory());
  })();

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(modalCount, 1, 'chamadores concorrentes compartilham o mesmo modal reauth');
  captured.onSubmit({ password: 'senha-compartilhada', code: '444555' });
  const [finalA, finalB] = await Promise.all([first, second]);
  assert.equal(finalA.status, 200, 'primeiro chamador completa retry');
  assert.equal(finalB.status, 200, 'segundo chamador completa retry');
}

// 12. Contrato estático e estrutural do portal.js: dispatch de onSubmit e cancelamento
{
  const { readFileSync } = await import('node:fs');
  const portalCode = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');

  assert.match(
    portalCode,
    /if\s*\(\s*typeof\s+this\.modalMode\.defaults\?\.onSubmit\s*===\s*['"]function['"]\s*\)\s*\{[\s\S]*?if\s*\(\s*submittedMode\s*===\s*['"]reauth['"]\s*\)\s*\{\s*await\s+onSubmit\(data\);\s*return;\s*\}[\s\S]*?this\.closeModal\(\);[\s\S]*?onSubmit\(data\)[\s\S]*?return;\s*\}/,
    'handleModalSubmit deve despachar diretamente para defaults.onSubmit e desacoplar modais de origem'
  );

  assert.match(
    portalCode,
    /if\s*\(\s*modalMode\?\.mode\s*!==\s*['"]reauth['"]\s*\)\s*\{\s*reauthRunner\?\.cancelPrompt\(\);\s*\}/,
    'mudança de modo do modal deve cancelar qualquer prompt reauth pendente'
  );

  assert.match(
    portalCode,
    /switchView\(view\)\s*\{\s*if\s*\(\s*this\.modalMode\?\.mode\s*===\s*['"]reauth['"]\s*\)\s*\{\s*this\.closeModal\(\);\s*\}\s*reauthRunner\?\.cancelPrompt\(\);/,
    'switchView deve fechar modal reauth e cancelar prompt pendente'
  );
}

console.log('ui_reauth_feature: PASS');
