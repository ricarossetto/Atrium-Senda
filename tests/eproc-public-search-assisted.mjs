import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEprocPublicSearchClient } from '../lib/judicial/eproc/public-search/index.mjs';
import { waitForEprocCaptchaResolution } from '../lib/judicial/eproc/public-search/assisted-browser-transport.mjs';
import { createEprocPublicSearchRuntime } from '../lib/judicial/eproc/enrichment/public-search-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CNJ = '50000017920268210016';
const RAW_KEY = 'SINTETICA-CHAVE-ASSISTIDA-0001';

async function fixture(name) {
  return readFile(path.join(ROOT, 'tests', 'fixtures', 'eproc-public-search', name), 'utf8');
}

function assistedFake(handler) {
  const calls = [];
  return {
    id: 'assisted-browser',
    capabilities: { interactiveCaptcha: true },
    calls,
    async request(options) {
      calls.push(options);
      return handler(options, calls.length);
    }
  };
}

function pass(message) {
  console.log(`ok - ${message}`);
}

console.log('=== TESTE FOCAL: CONSULTA PÚBLICA ASSISTIDA (CAPTCHA HUMANO) ===\n');

// 1. Com transporte assistido, o CAPTCHA não encerra a consulta: o POST segue após o humano
{
  const formHtml = await fixture('key-form-turnstile.html');
  const successHtml = await fixture('key-success.html');
  const transport = assistedFake(async (_options, call) => ({
    status: 200,
    ok: true,
    headers: null,
    body: call === 1 ? formHtml : successHtml,
    finalUrl: 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php',
    hops: 0
  }));
  const client = createEprocPublicSearchClient({ transport, now: () => new Date('2026-09-19T12:00:00.000Z') });
  const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: 'tjrs-eproc-1g' });
  assert.equal(result.ok, true, 'consulta assistida deve concluir quando o humano resolve o CAPTCHA');
  assert.equal(result.provenance.transport, 'assisted-browser');
  assert.equal(result.provenance.assisted, true);
  assert.equal(transport.calls.length, 2, 'GET do formulário + POST da consulta');
  assert.equal(transport.calls[0].method, 'GET');
  assert.equal(transport.calls[1].method, 'POST');
  assert.ok(transport.calls[1].form.txtNumChaveDocumento === RAW_KEY, 'a chave deve ir no formulário do portal');
  assert.equal(JSON.stringify(result).includes(RAW_KEY), false, 'resultado nunca contém a chave');
  pass('transporte assistido conclui a consulta com o CAPTCHA resolvido pelo humano, sem vazar a chave');
}

// 2. Sem capacidade interativa, o comportamento honesto continua: CAPTCHA_REQUIRED
{
  const formHtml = await fixture('key-form-turnstile.html');
  const transport = {
    calls: [],
    async request(options) {
      transport.calls.push(options);
      return { status: 200, ok: true, headers: null, body: formHtml, finalUrl: 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php', hops: 0 };
    }
  };
  const client = createEprocPublicSearchClient({ transport });
  const result = await client.searchByProcessKey({ cnj: CNJ, accessKey: RAW_KEY, portalId: 'tjrs-eproc-1g' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CAPTCHA_REQUIRED');
  assert.equal(result.captchaType, 'turnstile');
  assert.equal(transport.calls.length, 1, 'sem modo assistido não pode existir POST');
  pass('sem modo assistido, CAPTCHA continua encerrando com estado tipado (sem POST)');
}

// 3. Espera do CAPTCHA: resolve quando o widget conclui; expira com exigência humana informada
{
  let evaluations = 0;
  const resolvedPage = {
    async evaluate() {
      evaluations += 1;
      return evaluations >= 2 ? { hasWidget: true, solved: true } : { hasWidget: true, solved: false };
    },
    async waitForTimeout() {},
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php'
  };
  const announced = [];
  const resolved = await waitForEprocCaptchaResolution(resolvedPage, {
    timeoutMs: 5_000,
    pollMs: 1,
    captchaType: 'turnstile',
    onHumanRequired: event => announced.push(event.captchaType)
  });
  assert.equal(resolved, true);
  assert.deepEqual(announced, ['turnstile'], 'o humano deve ser avisado uma única vez');

  const stuckPage = {
    async evaluate() {
      return { hasWidget: true, solved: false };
    },
    async waitForTimeout() {},
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/externo_controlador.php'
  };
  const expired = await waitForEprocCaptchaResolution(stuckPage, { timeoutMs: 5, pollMs: 1 });
  assert.equal(expired, false, 'tempo esgotado deve devolver false (sem contorno)');
  pass('espera assistida resolve e expira com honestidade, avisando o humano uma vez');
}

// 4. Runtime: flag interativa escolhe o transporte assistido; padrão continua HTTP direto
{
  let assistedTransport = null;
  const assistedRuntime = await createEprocPublicSearchRuntime({
    env: { EPROC_PUBLIC_KEY_ENABLED: 'on', EPROC_PUBLIC_KEY_INTERACTIVE: 'on' },
    logger: { warn() {} },
    clientFactory: async ({ transport }) => {
      assistedTransport = transport;
      return { searchByProcessKey: async () => ({ ok: true }) };
    }
  });
  assert.equal(assistedRuntime.state, 'ready');
  assert.equal(assistedTransport?.capabilities?.interactiveCaptcha, true);

  let httpTransport = null;
  const httpRuntime = await createEprocPublicSearchRuntime({
    env: { EPROC_PUBLIC_KEY_ENABLED: 'on' },
    logger: { warn() {} },
    clientFactory: async ({ transport }) => {
      httpTransport = transport;
      return { searchByProcessKey: async () => ({ ok: true }) };
    }
  });
  assert.equal(httpRuntime.state, 'ready');
  assert.notEqual(httpTransport?.capabilities?.interactiveCaptcha, true);
  pass('runtime separa modo assistido (opt-in) do HTTP direto padrão');
}

console.log('\n=== TODOS OS TESTES DA CONSULTA ASSISTIDA PASSARAM ===');
