/**
 * Teste focal: cliente de consulta pública por chave do eproc (W4/Fase 1).
 *
 * 100% sintético e offline: nenhum acesso de rede, nenhum certificado e nenhuma
 * chave real. Cobre contrato de retorno, confirmação semântica (HTTP 200 não é
 * sucesso), classificação de bloqueios, higiene de segredo, transporte com
 * allowlist/redirect/timeout/limite de bytes e reuso dos parsers oficiais.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEprocPublicSearchClient,
  PUBLIC_SEARCH_SOURCE
} from '../lib/judicial/eproc/public-search/index.mjs';
import {
  createDirectHttpTransport,
  EprocTransportError
} from '../lib/judicial/eproc/public-search/http-transport.mjs';
import {
  parseEprocCaseDetails,
  parseEprocParties
} from '../lib/judicial/eproc/parsers/case-parser.mjs';
import { parseEprocMovements } from '../lib/judicial/eproc/parsers/movement-parser.mjs';
import { parseEprocDocuments } from '../lib/judicial/eproc/parsers/document-parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'eproc-public-search');
const fixture = name => readFileSync(path.join(FIXTURE_DIR, name), 'utf8');

const CNJ = '5000001-79.2026.8.21.0016';
const CNJ_DIGITS = '50000017920268210016';
const RAW_KEY = 'CHAVE-SINTETICA-TESTE-0001';
const PORTAL_ID = 'tjrs-eproc-1g';
const PUBLIC_SEARCH_URL = 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica';

let checks = 0;
function pass(message) {
  checks += 1;
  console.log(`ok ${checks} - ${message}`);
}

function fakeTransport(handler) {
  const calls = [];
  return {
    calls,
    async request(options) {
      calls.push(options);
      return handler(options, calls.length - 1);
    }
  };
}

function clientReturning(body, { status = 200, transport, logger, now } = {}) {
  const responder = transport || fakeTransport(async (_options, callIndex) => {
    if (callIndex === 0) {
      return { status: 200, ok: true, headers: new Headers(), body: fixture('key-form-plain.html'), finalUrl: PUBLIC_SEARCH_URL, hops: 0 };
    }
    return { status, ok: status >= 200 && status < 300, headers: new Headers(), body, finalUrl: PUBLIC_SEARCH_URL, hops: 0 };
  });
  const client = createEprocPublicSearchClient({ transport: responder, logger, now });
  return { client, transport: responder };
}

function htmlResponse(status, body, headerEntries = {}) {
  return { status, headers: new Headers(headerEntries), text: async () => body };
}

async function expectTransportCode(promiseFactory, code) {
  await assert.rejects(promiseFactory, error => {
    assert.ok(error instanceof EprocTransportError, `esperava EprocTransportError, veio ${error?.name}`);
    assert.equal(error.code, code);
    return true;
  });
  pass(`transporte rejeita com ${code}`);
}

async function run() {
  console.log('=== TESTE FOCAL: CLIENTE DE CONSULTA PÚBLICA POR CHAVE (EPROC) ===\n');

  // 1. Sucesso oficial completo -------------------------------------------------
  {
    const fixedNow = new Date('2026-09-18T12:00:00.000Z');
    const { client, transport } = clientReturning(fixture('key-success.html'), { now: () => fixedNow });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });

    assert.equal(result.ok, true);
    assert.equal(result.portalId, PORTAL_ID);
    assert.equal(result.cnj, CNJ_DIGITS);
    assert.equal(result.source, PUBLIC_SEARCH_SOURCE);
    assert.equal(result.collectedAt, '2026-09-18T12:00:00.000Z');
    assert.equal(result.metadata.actionClass, 'PROCEDIMENTO COMUM CÍVEL');
    assert.equal(result.metadata.status, 'ATIVO');
    assert.equal(result.metadata.secrecyLevel, 0);
    assert.equal(Object.hasOwn(result.metadata, 'accessKey'), false);
    assert.equal(result.parties.length, 4);
    assert.equal(result.parties[0].role, 'AUTOR');
    assert.equal(result.parties[0].name, 'CLIENTE TESTE');
    assert.equal(result.parties[1].oab, 'RS000000');
    assert.deepEqual(result.movements.map(m => m.sequence), [3, 2, 1]);
    assert.equal(result.movements[0].occurredAt, '2026-09-15T14:30:00.000Z');
    assert.equal(result.documents.length, 3);
    assert.equal(result.provenance.transport, 'direct-http');
    assert.equal(result.provenance.validation.cnjMatched, true);
    assert.equal(result.provenance.validation.eventsRecognized, true);
    assert.equal(transport.calls[0].method, 'GET');
    assert.equal(transport.calls[0].url, 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica_chave/consultar');
    assert.equal(transport.calls[1].method, 'POST');
    assert.equal(transport.calls[1].url, 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=processo_consulta_publica_chave%2Fconsultar&acao_origem=processo_consulta_publica_chave%2Fconsultar&acao_retorno=');
    assert.equal(transport.calls[1].form.txtNumProcesso, CNJ);
    assert.equal(transport.calls[1].form.txtNumChaveDocumento, RAW_KEY);
    assert.equal(transport.calls[1].headers.referer, transport.calls[0].url);
    assert.deepEqual(transport.calls[1].secrets, [RAW_KEY]);
    assert.equal(JSON.stringify(result).includes(RAW_KEY), false, 'resultado não pode conter a chave');
    pass('sucesso: capa, partes, movimentos e documentos de referência; nenhuma chave no resultado');
  }

  // 1b. Captcha na página do formulário: CAPTCHA_REQUIRED tipado, sem POST --------
  for (const [file, type] of [['key-form-turnstile.html', 'turnstile'], ['key-form-hcaptcha.html', 'hcaptcha'], ['key-form-image.html', 'image']]) {
    const transport = fakeTransport(async () => ({
      status: 200,
      ok: true,
      headers: new Headers(),
      body: fixture(file),
      finalUrl: PUBLIC_SEARCH_URL,
      hops: 0
    }));
    const client = createEprocPublicSearchClient({ transport });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'CAPTCHA_REQUIRED');
    assert.equal(result.captchaType, type);
    assert.equal(JSON.stringify(result).includes(RAW_KEY), false);
    assert.equal(transport.calls.length, 1, 'captcha não pode gerar POST automático');
    pass(`captcha ${type}: CAPTCHA_REQUIRED tipado, sem POST e sem chave`);
  }

  // 1c. Sessão encerrada após o POST: AUTH_REQUIRED ------------------------------
  {
    const transport = fakeTransport(async (_options, callIndex) => ({
      status: 200,
      ok: true,
      headers: new Headers(),
      body: callIndex === 0 ? fixture('key-form-plain.html') : fixture('session-ended.html'),
      finalUrl: PUBLIC_SEARCH_URL,
      hops: 0
    }));
    const client = createEprocPublicSearchClient({ transport });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'AUTH_REQUIRED');
    pass('sessão encerrada: AUTH_REQUIRED honesto, sem tentativa de contorno');
  }

  // 2. Reuso dos parsers oficiais ----------------------------------------------
  {
    const html = fixture('key-success.html');
    const { client } = clientReturning(html);
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    const { accessKey: _ignored, ...expectedMetadata } = parseEprocCaseDetails(html);
    assert.deepEqual(result.metadata, expectedMetadata);
    assert.deepEqual(result.parties, parseEprocParties(html));
    assert.deepEqual(result.movements, parseEprocMovements(html));
    assert.deepEqual(result.documents, parseEprocDocuments(html));
    pass('reuso: resultado idêntico às funções oficiais de case/movement/document parser');
  }

  // 3. Falhas tipadas por fixture -------------------------------------------------
  {
    const scenarios = [
      ['key-invalid.html', 'KEY_INVALID'],
      ['key-expired.html', 'KEY_EXPIRED'],
      ['not-found.html', 'NOT_FOUND'],
      ['captcha-required.html', 'CAPTCHA_REQUIRED'],
      ['human-required.html', 'HUMAN_REQUIRED'],
      ['auth-required.html', 'AUTH_REQUIRED'],
      ['rate-limited.html', 'RATE_LIMITED'],
      ['parse-error.html', 'PARSE_ERROR'],
      ['cnj-mismatch.html', 'PARSE_ERROR'],
      ['document-restricted.html', 'DOCUMENT_RESTRICTED']
    ];
    for (const [file, reason] of scenarios) {
      const { client } = clientReturning(fixture(file));
      const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
      assert.equal(result.ok, false, `${file} deve falhar`);
      assert.equal(result.reason, reason, `${file} deve mapear para ${reason}`);
      assert.equal(typeof result.error, 'string');
      assert.ok(result.error.length > 0, `${file} deve ter mensagem`);
    }
    pass('falhas: chave inválida/expirada, não encontrado, captcha, humano, auth, rate limit, parse e restrição');
  }

  // 4. HTTP 200 não é sucesso: CNJ divergente --------------------------------
  {
    const { client } = clientReturning(fixture('cnj-mismatch.html'));
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PARSE_ERROR');
    assert.match(result.error, /divergente/i);
    pass('confirmação semântica: página de outro processo (CNJ divergente) não vira sucesso');
  }

  // 5. Status HTTP -----------------------------------------------------------------
  {
    const rate = clientReturning(fixture('key-success.html'), { status: 429 });
    assert.equal((await rate.client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID })).reason, 'RATE_LIMITED');
    const auth = clientReturning(fixture('key-success.html'), { status: 401 });
    assert.equal((await auth.client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID })).reason, 'AUTH_REQUIRED');
    const down = clientReturning(fixture('key-success.html'), { status: 503 });
    assert.equal((await down.client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID })).reason, 'PORTAL_UNAVAILABLE');
    const missing = clientReturning('', { status: 200 });
    assert.equal((await missing.client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID })).reason, 'PARSE_ERROR');
    pass('status HTTP: 429, 401, 503 e corpo vazio classificados sem presumir sucesso');
  }

  // 6. Entradas inválidas e default-deny ------------------------------------------
  {
    const { client, transport } = clientReturning(fixture('key-success.html'));
    const badCnj = await client.searchByProcessKey({ cnj: '123', accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(badCnj.reason, 'UNSUPPORTED');
    assert.equal(badCnj.errorCode, 'INVALID_CNJ');
    const badDigit = await client.searchByProcessKey({ cnj: '50000010020268210016', accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(badDigit.reason, 'UNSUPPORTED');
    const unknown = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: 'portal-inexistente' });
    assert.equal(unknown.reason, 'UNSUPPORTED');
    assert.equal(unknown.errorCode, 'UNKNOWN_PORTAL');
    const noKey = await client.searchByProcessKey({ cnj: CNJ, accessKey: '', portalId: PORTAL_ID });
    assert.equal(noKey.reason, 'AUTH_REQUIRED');
    assert.equal(noKey.errorCode, 'MISSING_ACCESS_KEY');
    assert.equal(transport.calls.length, 0, 'entradas inválidas não podem chamar o transporte');

    const noPath = createEprocPublicSearchClient({
      transport: fakeTransport(async () => { throw new Error('não deveria chamar'); }),
      registry: [{ id: 'portal-sem-consulta', baseUrl: 'https://eproc.test.jus.br/eproc/', publicSearchPath: '' }]
    });
    const unsupported = await noPath.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: 'portal-sem-consulta' });
    assert.equal(unsupported.reason, 'UNSUPPORTED');
    assert.equal(unsupported.errorCode, 'NO_PUBLIC_SEARCH_PATH');
    pass('default-deny: CNJ inválido, portal desconhecido, portal sem consulta pública e chave ausente');
  }

  // 7. Higiene de segredo: erro e log ---------------------------------------------
  {
    const logs = [];
    const logger = {
      info: message => logs.push(['info', message]),
      warn: message => logs.push(['warn', message]),
      error: message => logs.push(['error', message]),
      debug: message => logs.push(['debug', message])
    };
    const transport = fakeTransport(async () => {
      throw new Error(`falha sintética ao transmitir a chave ${RAW_KEY} para o portal`);
    });
    const client = createEprocPublicSearchClient({ transport, logger });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PORTAL_UNAVAILABLE');
    assert.equal(result.error.includes(RAW_KEY), false);
    assert.ok(result.error.includes('[segredo oculto]'));
    assert.equal(JSON.stringify(result).includes(RAW_KEY), false);
    assert.equal(JSON.stringify(logs).includes(RAW_KEY), false, 'nenhum log pode conter a chave');
    assert.deepEqual(transport.calls[0].secrets, [RAW_KEY]);
    pass('higiene: chave ausente do erro, do resultado e dos logs (spy), mesmo em exceção do transporte');
  }

  // 8. Higiene de segredo: URL final sanitizada ------------------------------------
  {
    const transport = fakeTransport(async () => ({
      status: 200,
      ok: true,
      headers: new Headers(),
      body: fixture('key-success.html'),
      finalUrl: `https://eproc1g.tjrs.jus.br/eproc/redirect?chave=${RAW_KEY}`,
      hops: 1
    }));
    const spyLogs = [];
    const client = createEprocPublicSearchClient({ transport, logger: { warn: m => spyLogs.push(m) } });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, true);
    assert.equal(result.provenance.finalUrl.includes(RAW_KEY), false);
    assert.equal(JSON.stringify(result).includes(RAW_KEY), false);
    pass('higiene: URL final de proveniência não carrega a chave');
  }

  // 9. Transporte: HTTPS obrigatório e allowlist -----------------------------------
  {
    const insecure = createDirectHttpTransport({
      fetchImpl: async () => { throw new Error('não deveria chamar'); },
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await expectTransportCode(
      () => insecure.request({ url: 'http://eproc1g.tjrs.jus.br/eproc/externo_controlador.php', method: 'POST' }),
      'INSECURE_TRANSPORT'
    );

    const blockedHost = createDirectHttpTransport({
      fetchImpl: async () => htmlResponse(200, 'ok'),
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await expectTransportCode(
      () => blockedHost.request({ url: 'https://evil.example/collect', method: 'POST' }),
      'HOST_NOT_ALLOWED'
    );

    const subdomain = createDirectHttpTransport({
      fetchImpl: async () => htmlResponse(200, 'ok'),
      allowlist: ['tjrs.jus.br']
    });
    const allowed = await subdomain.request({ url: 'https://eproc1g.tjrs.jus.br/eproc/x', method: 'GET' });
    assert.equal(allowed.status, 200);
    pass('transporte: HTTPS obrigatório, host fora da allowlist bloqueado e subdomínio permitido');
  }

  // 10. Transporte: redirect bloqueado ---------------------------------------------
  {
    let calls = 0;
    const transport = createDirectHttpTransport({
      fetchImpl: async () => {
        calls += 1;
        return { status: 302, headers: new Headers({ location: 'https://evil.example/collect' }), text: async () => '' };
      },
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await expectTransportCode(
      () => transport.request({ url: PUBLIC_SEARCH_URL, method: 'POST', form: { txtChaveAcesso: RAW_KEY } }),
      'REDIRECT_BLOCKED'
    );
    assert.equal(calls, 1);
  }

  // 11. Transporte: redirect hop-a-hop + cookie + POST->GET ------------------------
  {
    const seen = [];
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls += 1;
      seen.push({ url, method: init.method, headers: init.headers, body: init.body });
      if (calls === 1) {
        return {
          status: 302,
          headers: new Headers({
            location: '/eproc/externo_controlador.php?acao=processo_consulta_publica',
            'set-cookie': 'JSESSIONID=sintetico123; Path=/; HttpOnly'
          }),
          text: async () => ''
        };
      }
      return htmlResponse(200, '<html><body>ok</body></html>');
    };
    const transport = createDirectHttpTransport({ fetchImpl, allowlist: ['eproc1g.tjrs.jus.br'] });
    const response = await transport.request({
      url: PUBLIC_SEARCH_URL,
      method: 'POST',
      form: { txtChaveAcesso: RAW_KEY },
      secrets: [RAW_KEY]
    });
    assert.equal(response.status, 200);
    assert.equal(response.hops, 1);
    assert.equal(seen[0].method, 'POST');
    assert.match(String(seen[0].body), /txtChaveAcesso=CHAVE-SINTETICA-TESTE-0001/);
    assert.equal(seen[1].method, 'GET');
    assert.equal(seen[1].body, undefined);
    assert.match(String(seen[1].headers.cookie), /JSESSIONID=sintetico123/);
    assert.equal(String(seen[1].url).startsWith('https://eproc1g.tjrs.jus.br/eproc/'), true);
    pass('transporte: redirect controlado, POST degrada para GET e cookie jar em memória funciona');
  }

  // 12. Transporte: timeout e limite de bytes ---------------------------------------
  {
    const hanging = createDirectHttpTransport({
      fetchImpl: (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
      timeoutMs: 20,
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await expectTransportCode(
      () => hanging.request({ url: PUBLIC_SEARCH_URL, method: 'POST' }),
      'TIMEOUT'
    );

    const oversized = createDirectHttpTransport({
      fetchImpl: async () => htmlResponse(200, 'x'.repeat(2048)),
      maxBytes: 128,
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await expectTransportCode(
      () => oversized.request({ url: PUBLIC_SEARCH_URL, method: 'GET' }),
      'RESPONSE_TOO_LARGE'
    );
  }

  // 13. Transporte: mensagem de erro sanitizada --------------------------------------
  {
    const transport = createDirectHttpTransport({
      fetchImpl: async () => { throw new Error(`connect ECONNREFUSED para chave ${RAW_KEY}`); },
      allowlist: ['eproc1g.tjrs.jus.br']
    });
    await assert.rejects(
      () => transport.request({ url: PUBLIC_SEARCH_URL, method: 'POST', form: { txtChaveAcesso: RAW_KEY }, secrets: [RAW_KEY] }),
      error => {
        assert.equal(error.code, 'NETWORK_ERROR');
        assert.equal(String(error.message).includes(RAW_KEY), false);
        assert.ok(String(error.message).includes('[segredo oculto]'));
        return true;
      }
    );
    pass('transporte: mensagem de erro nunca contém a chave (redação por valor exato)');
  }

  // 14. Mapeamento de erro de transporte no cliente -----------------------------------
  {
    const transport = fakeTransport(async () => {
      throw new EprocTransportError('HOST_NOT_ALLOWED', 'host sintético bloqueado', { url: 'https://evil.example' });
    });
    const client = createEprocPublicSearchClient({ transport });
    const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: PORTAL_ID });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'UNSUPPORTED');
    assert.equal(result.errorCode, 'HOST_NOT_ALLOWED');
    pass('cliente: bloqueio de transporte mapeado para falha tipada sem sucesso presumido');
  }

  console.log(`\n[PASS] ${checks} verificações do cliente de consulta pública por chave concluídas.`);
}

run().catch(error => {
  console.error('\n[FAIL] Teste focal da consulta pública por chave falhou.');
  console.error(error);
  process.exit(1);
});
