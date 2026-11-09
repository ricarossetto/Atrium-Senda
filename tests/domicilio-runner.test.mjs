import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDomicilioRunner } from '../lib/judicial/domicilio/domicilio-runner.mjs';
import { readDomicilioSyncState } from '../lib/judicial/domicilio/domicilio-sync-state.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DOMICÍLIO NO SERVIDOR (RUNNER CLOUD-FIRST)           ');
console.log('===============================================================\n');

const CNJ_DIGITS = '50012345620248210001';

function makeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => (map.has(key) ? map.get(key) : null)
  };
}

function fakePage({ hasSession = true, certButton = true } = {}) {
  const clicks = [];
  return {
    clicks,
    url: () => 'https://portaldeservicos.pdpj.jus.br/',
    frames: () => [{ locator: () => ({ innerText: async () => 'Painel do advogado' }) }],
    goto: async () => {},
    waitForTimeout: async () => {},
    locator: selector => ({
      first() { return this; },
      count: async () => (certButton && /certificate|Certificado/.test(selector) ? 1 : 0),
      isVisible: async () => certButton && /certificate|Certificado/.test(selector),
      click: async () => { clicks.push(selector); }
    }),
    evaluate: async (fn, arg) => {
      const previous = globalThis.window;
      globalThis.window = {
        localStorage: makeStorage(hasSession ? { access_token: 'jwt-sintetico', tenantId: '00000000-0000-4000-8000-000000000000' } : {}),
        sessionStorage: makeStorage({})
      };
      try { return await fn(arg); } finally { globalThis.window = previous; }
    }
  };
}

function fakeContext(page) {
  return { pages: () => [page], newPage: async () => page, close: async () => {} };
}

function certificateManager({ configured = true } = {}) {
  return {
    async getCertificateSecrets() {
      return configured ? { path: 'C:/sintetico/certificado-a1.pfx', passphrase: 'senha-sintetica' } : null;
    }
  };
}

const fakeModernize = async () => ({ modernPath: 'C:/temp/cert-moderno.pfx', modernPassphrase: 'sintetica', cleanup: async () => {} });

const comunicacao = {
  numeroComunicacao: 'SRV-1',
  numeroProcesso: CNJ_DIGITS,
  tribunalOrigem: 'TJRS',
  tipoComunicacao: 'Intimação',
  dataComunicacao: '2026-09-20',
  dataFinalCiencia: '2026-09-27',
  prazo: '2026-09-30'
};

console.log('[C1] Sem A1 o ciclo é pulado com motivo claro (nunca sucesso presumido)...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    const runner = createDomicilioRunner({
      credentialManager: certificateManager({ configured: false }),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async () => { throw new Error('não deveria persistir sem A1'); }
    });
    const result = await runner.run();
    assert.equal(result.status, 'SKIPPED_NO_CREDENTIALS');
    assert.equal(result.error.code, 'DOMICILIO_CREDENTIALS_MISSING');
    assert.equal(result.resumo.normalizadas, 0);
    assert.equal((await readDomicilioSyncState(dir)).captures, 0, 'Ciclo pulado não marca a janela.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  console.log('  ✓ SKIPPED_NO_CERTIFICATE sem persistência e sem avançar o marcador.');
}

console.log('[C2] Captura no servidor: A1, sessão lida da página, persistência oficial e janela...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    const page = fakePage();
    const persisted = [];
    const runner = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async (intimations, { trigger }) => { persisted.push({ intimations, trigger }); return { persisted: true, revision: 'rev-1' }; },
      launchPersistentContext: async () => fakeContext(page),
      modernizePfx: fakeModernize,
      resolveOab: async () => ({ uf: 'RS', numero: '000000' }),
      captureFromPortal: async () => ({ status: 'ok', items: [{ numeroComunicacao: 'SRV-1', numero_processo: CNJ_DIGITS, datadisponibilizacao: '2026-09-20', tipoDocumento: 'Intima??o', texto: 'Texto integral da intima??o sint?tica com todos os detalhes.' }] }),
      createClient: () => ({ listarComunicacoes: async () => ({ items: [comunicacao], pages: [{ page: 0, items: 1 }], truncated: false }) }),
      now: () => new Date('2026-09-21T12:00:00Z')
    });
    const result = await runner.run();
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.window.dataInicio, '2026-09-15');
    assert.equal(result.window.days, 7);
    assert.equal(result.resumo.normalizadas, 1);
    assert.equal(result.persisted.persisted, true);
    assert.equal(persisted.length, 1, 'Intimações do servidor passam pela persistência oficial.');
    assert.equal(persisted[0].trigger, 'domicilio');
    assert.equal(persisted[0].intimations[0].externalId, 'domicilio:SRV-1');
    assert.match(persisted[0].intimations[0].text, /Texto integral da intima/, 'Texto integral da Central entra no registro.');
    assert.equal(persisted[0].intimations[0].fullTextSource, 'domicilio');
    assert.equal('deadline' in persisted[0].intimations[0], false, 'Prazo nunca é aplicado automaticamente pelo Domicílio.');
    const state = await readDomicilioSyncState(dir);
    assert.equal(state.captures, 1);
    assert.equal(state.firstCapturedAt, '2026-09-21T12:00:00.000Z');

    // Segundo ciclo no mesmo dia: janela vira rotina (2 dias) e reaproveita a sessão.
    const second = await runner.run();
    assert.equal(second.window.days, 2, 'Depois da primeira captura a janela é de 2 dias.');
    assert.equal(page.clicks.length, 0, 'Com sessão válida o runner não tenta clicar em login de certificado.');
    assert.equal((await readDomicilioSyncState(dir)).captures, 2);
    console.log('  ✓ A1 + sessão + persistência oficial + janela 7/2 idempotente.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

console.log('[C3] Sem sessão e sem login por certificado: interação humana declarada, nada contornado...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    const runner = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async () => { throw new Error('não deveria persistir sem sessão'); },
      launchPersistentContext: async () => fakeContext(fakePage({ hasSession: false, certButton: false })),
      modernizePfx: fakeModernize,
      createClient: () => ({ listarComunicacoes: async () => { throw new Error('não deveria consultar a API sem sessão'); } })
    });
    const result = await runner.run();
    assert.equal(result.status, 'HUMAN_ACTION_REQUIRED');
    assert.equal(result.error.code, 'DOMICILIO_LOGIN_REQUIRED');
    assert.match(result.error.message, /interação humana/i);
    assert.equal((await readDomicilioSyncState(dir)).captures, 0);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  console.log('  ✓ HUMAN_ACTION_REQUIRED honesto, sem contornar CAPTCHA/2FA.');
}

console.log('[C4] Falha da API oficial não vira sucesso e não avança a janela...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    const runner = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async () => { throw new Error('não deveria persistir em falha'); },
      launchPersistentContext: async () => fakeContext(fakePage()),
      modernizePfx: fakeModernize,
      resolveOab: async () => ({ uf: 'RS', numero: '000000' }),
      captureFromPortal: async () => ({ status: 'failed', items: [], error: { code: 'DOMICILIO_CENTRAL_HTTP', message: 'A Central respondeu 401 na consulta.' } }),
      createClient: () => ({ listarComunicacoes: async () => { const error = new Error('Sessão expirada.'); error.code = 'DOMICILIO_UNAUTHORIZED'; error.statusCode = 401; throw error; } })
    });
    const result = await runner.run();
    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'DOMICILIO_CENTRAL_HTTP');
    assert.equal((await readDomicilioSyncState(dir)).captures, 0, 'Falha não marca a janela como capturada.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  console.log('  ✓ Falha declarada com código real e marcador intacto.');
}

console.log('[C5] Portal bloqueando o servidor (403) e declarado, com e sem proxy...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    const blockedPage = fakePage({ hasSession: false, certButton: false });
    blockedPage.evaluate = async (fn, arg) => {
      if (typeof arg === 'undefined') return { title: '403 Forbidden', body: '403 Forbidden' };
      return await fakePage({ hasSession: false, certButton: false }).evaluate(fn, arg);
    };
    const launchCalls = [];
    const runner = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async () => { throw new Error('nao deveria persistir em bloqueio'); },
      launchPersistentContext: async (profileDir, options) => { launchCalls.push(options); return fakeContext(blockedPage); },
      modernizePfx: fakeModernize,
      proxy: null,
      createClient: () => ({ listarComunicacoes: async () => { throw new Error('nao deveria consultar a API em bloqueio'); } })
    });
    const result = await runner.run();
    assert.equal(result.status, 'PORTAL_BLOCKED');
    assert.equal(result.error.code, 'DOMICILIO_PORTAL_BLOCKED');
    assert.match(result.error.message, /DOMICILIO_PROXY_URL/, 'Sem proxy a mensagem ensina o caminho.');
    assert.equal('proxy' in (launchCalls[0] || {}), false, 'Sem proxy configurado o navegador sai direto.');

    const withProxy = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async () => ({ persisted: false }),
      launchPersistentContext: async (profileDir, options) => { launchCalls.push(options); return fakeContext(fakePage()); },
      modernizePfx: fakeModernize,
      proxy: 'socks5://127.0.0.1:40000',
      createClient: () => ({ listarComunicacoes: async () => ({ items: [], pages: [], truncated: false }) })
    });
    await withProxy.run();
    assert.equal(launchCalls[1].proxy.server, 'socks5://127.0.0.1:40000', 'Proxy configurado vai para o navegador do runner.');
    console.log('  OK: 403 declarado com instrucao de proxy; proxy aplicado quando configurado.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

console.log('[C5] O servidor agenda a captura sem instalação local...');
{
  const serverSource = serverSourceText;
  assert.match(serverSource, /createDomicilioRunner/, 'Servidor precisa criar o runner do Domicílio.');
  assert.match(serverSource, /runDomicilioCaptureForWorkspace\(ws\.id\)/, 'Ciclo agendado precisa rodar a captura no servidor.');
  assert.match(serverSource, /'\/api\/judicial\/domicilio\/sync'/, 'Rota manual autenticada para capturar agora.');
  assert.match(serverSource, /persistExternalCollectionsToCanonical\(\{ intimations \}, \{ trigger \}\)/, 'Persistência do runner usa o caminho oficial compartilhado.');
  assert.match(serverSource, /DomicilioScheduler/, 'Log honesto do agendador do Domicílio.');
  console.log('  ✓ Runner server-side, agendador e rota manual conectados (cloud-first).');
}

console.log('[C6] WAF transit?rio (403) e repetido uma vez antes de declarar bloqueio...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-runner-'));
  try {
    let gotos = 0;
    let evaluateCalls = 0;
    const flakyPage = fakePage();
    flakyPage.goto = async () => { gotos += 1; };
    flakyPage.evaluate = async (fn, arg) => {
      if (typeof arg === 'undefined') {
        evaluateCalls += 1;
        return evaluateCalls === 1 ? { title: '403 Forbidden', body: '403 Forbidden' } : { title: 'Portal de Servicos', body: 'Painel do advogado' };
      }
      return await fakePage().evaluate(fn, arg);
    };
    const runner = createDomicilioRunner({
      credentialManager: certificateManager(),
      securityManager: {},
      dataDirectory: dir,
      persistIntimations: async (intimations) => ({ persisted: true, count: intimations.length }),
      launchPersistentContext: async () => fakeContext(flakyPage),
      modernizePfx: fakeModernize,
      resolveOab: async () => ({ uf: 'RS', numero: '000000' }),
      captureFromPortal: async () => ({ status: 'ok', items: [{ numeroComunicacao: 'RETRY-1', numero_processo: CNJ_DIGITS, datadisponibilizacao: '2026-09-20', tipoDocumento: 'Intima??o', texto: 'Teor integral ap?s retry do WAF.' }] }),
      now: () => new Date('2026-09-21T12:00:00Z')
    });
    const result = await runner.run();
    assert.equal(result.status, 'COMPLETED', 'O 403 transit?rio nao pode derrubar o ciclo.');
    assert.equal(gotos, 2, 'O portal precisa ser aberto duas vezes (retry do 403).');
    assert.equal(result.resumo.normalizadas, 1);
    console.log('  OK: 403 transit?rio repetido uma vez e o ciclo conclui normalmente.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

console.log('\n>>> DOMICÍLIO NO SERVIDOR: PASS <<<\n');
