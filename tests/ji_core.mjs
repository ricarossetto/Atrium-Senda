import assert from 'node:assert/strict';
import {
  JI_ERROR_CODES,
  JudicialIntelligenceError,
  isRetryableError,
  toPublicError,
  assertJi,
  humanRequiredError
} from '../lib/judicial-intelligence/core/errors.mjs';
import {
  clampConfidence,
  combineConfidence,
  confidenceFromBasis,
  describeConfidence,
  decideAbstention,
  ABSTENTION_CODE
} from '../lib/judicial-intelligence/core/confidence.mjs';
import {
  SOURCE_IDS,
  createProvenance,
  detectConflict,
  mergeFieldProvenance,
  hashPayload,
  provenanceSummary
} from '../lib/judicial-intelligence/core/provenance.mjs';
import {
  CAPABILITIES,
  createProvider,
  probeProviderHealth,
  CapabilityRegistry
} from '../lib/judicial-intelligence/core/capability-registry.mjs';
import {
  HttpTransport,
  assertSafeUrl,
  detectHumanChallenge,
  readJson,
  HTTP_POLICY_DEFAULTS
} from '../lib/judicial-intelligence/core/http.mjs';
import {
  OPERATION_STATUS,
  redactText,
  redactForLog,
  OperationRecorder
} from '../lib/judicial-intelligence/core/observability.mjs';
import {
  BETA_FLAG_IDS,
  parseFlagValue,
  isBetaFlagEnabled,
  assertBetaFlagEnabled,
  readBetaFlags
} from '../lib/judicial-intelligence/beta/feature-flags.mjs';
import { BetaStatusRegistry, MODULE_STATUS } from '../lib/judicial-intelligence/beta/beta-status.mjs';
import {
  VERIFICATION_STATES,
  combineVerificationStates,
  verificationBadge,
  neverOverclaim,
  isVerificationState
} from '../lib/judicial-intelligence/core/verification-state.mjs';
import {
  automationsDisabled,
  automationPolicy,
  assertAutomationsEnabled,
  AUTOMATION_KILL_SWITCH
} from '../lib/judicial-intelligence/beta/automation-guard.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JUDICIAL INTELLIGENCE BETA: CORE CONTRACTS');
console.log('===============================================================\n');

console.log('[T1] Erros tipados, retryabilidade e sanitização...');
{
  const error = new JudicialIntelligenceError(JI_ERROR_CODES.RATE_LIMITED, 'Limite excedido.', { provider: 'pdpj', status: 429 });
  assert.equal(error.code, 'RATE_LIMITED');
  assert.equal(error.retryable, true);
  assert.equal(error.status, 429);
  assert.equal(JSON.parse(JSON.stringify(error)).provider, 'pdpj');
  assert.throws(() => new JudicialIntelligenceError('NOPE', 'x'), /inválido/);
  assert.equal(isRetryableError(error), true);
  assert.equal(isRetryableError(new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'x')), false);
  assert.equal(isRetryableError({ name: 'TimeoutError' }), true);
  const publicError = toPublicError(new Error('segredo interno: token=abc'), { provider: 'x', operation: 'y' });
  assert.equal(publicError.code, 'INTERNAL');
  assert.equal(publicError.message.includes('token'), false);
  assert.throws(() => assertJi(false, JI_ERROR_CODES.NOT_FOUND, 'ausente'), error => error.code === 'NOT_FOUND');
  assert.equal(humanRequiredError('pdpj', 'login', 'Faça login no portal.').code, 'HUMAN_REQUIRED');
}

console.log('[T2] Confiança, agregação e abstenção explícita...');
{
  assert.equal(clampConfidence(1.4), 1);
  assert.equal(clampConfidence(-2), 0);
  assert.equal(clampConfidence('x', 0.5), 0.5);
  assert.equal(combineConfidence([0.9, 0.4]), 0.4);
  assert.equal(combineConfidence([0.9, 0.4], { mode: 'max' }), 0.9);
  assert.equal(combineConfidence([0.9, 0.4], { mode: 'average' }), 0.65);
  assert.equal(confidenceFromBasis([{ confidence: 1, weight: 3 }, { confidence: 0, weight: 1 }]), 0.75);
  assert.equal(describeConfidence(0.95), 'high');
  const abstention = decideAbstention({ confidence: 0.2, evidenceCount: 0 });
  assert.equal(abstention.abstain, true);
  assert.equal(abstention.code, ABSTENTION_CODE);
  assert.deepEqual(abstention.reasons, ['LOW_CONFIDENCE', 'MISSING_EVIDENCE']);
  assert.equal(decideAbstention({ confidence: 0.9, evidenceCount: 2 }).abstain, false);
}

console.log('[T3] Proveniência, hash determinístico e conflito preservado...');
{
  const payloadA = { b: 2, a: 1 };
  const payloadB = { a: 1, b: 2 };
  assert.equal(hashPayload(payloadA), hashPayload(payloadB));
  assert.match(hashPayload(payloadA), /^[a-f0-9]{64}$/);
  assert.throws(() => createProvenance({ source: 'INVALIDO' }), /desconhecida/);
  const first = createProvenance({ source: SOURCE_IDS.PDPJ, kind: 'PROCESS_METADATA', confidence: 0.95, payload: payloadA, sourceUpdatedAt: '2026-01-01T00:00:00.000Z' });
  const second = createProvenance({ source: SOURCE_IDS.DATAJUD, kind: 'PROCESS_METADATA', confidence: 0.9, payload: payloadB, sourceUpdatedAt: '2026-01-02T00:00:00.000Z' });
  const merged = mergeFieldProvenance([
    { value: 'Vara Central', provenance: [first] },
    { value: 'Vara Cível', provenance: [second] }
  ]);
  assert.equal(merged.conflict, true);
  assert.equal(merged.conflicts[0].kind, 'VALUE_DIVERGENCE');
  assert.equal(merged.provenance.length, 2);
  const aligned = mergeFieldProvenance([
    { value: '0000000-00.0000.0.00.0000', provenance: [first] },
    { value: '0000000-00.0000.0.00.0000', provenance: [second] }
  ]);
  assert.equal(aligned.conflict, false);
  assert.equal(detectConflict([{ value: 1 }, { value: 1 }, { value: 2 }]).conflict, true);
  const summary = provenanceSummary([first, second, first]);
  assert.deepEqual(summary.map(entry => entry.source), ['PDPJ', 'DATAJUD']);
  assert.equal(summary[0].entries, 2);
}

console.log('[T4] Contrato de provider e registry de capabilities...');
{
  assert.throws(() => createProvider({ id: 'X', capabilities: [] }), /inválido/);
  assert.throws(() => createProvider({ id: 'ok-id', capabilities: [CAPABILITIES.MOVEMENTS] }), /listMovements/);
  const provider = createProvider({
    id: 'datajud',
    label: 'DataJud',
    source: SOURCE_IDS.DATAJUD,
    maturity: 'verified_readonly',
    capabilities: [CAPABILITIES.PROCESS_SEARCH, CAPABILITIES.MOVEMENTS],
    implementation: {
      findProcesses: async () => [],
      listMovements: async () => []
    },
    probe: async () => ({ status: 'ok' })
  });
  assert.deepEqual(provider.capabilities(), ['PROCESS_SEARCH', 'MOVEMENTS']);
  assert.equal(provider.has(CAPABILITIES.PROCESS_SEARCH), true);
  assert.equal(provider.has(CAPABILITIES.DOCUMENT_LIST), false);
  const health = await provider.health();
  assert.equal(health.status, 'ok');
  assert.equal(health.maturity, 'verified_readonly');

  const registry = new CapabilityRegistry();
  registry.register(provider);
  assert.equal(registry.has('datajud'), true);
  assert.equal(registry.get('datajud').id, 'datajud');
  assert.deepEqual(registry.ids(), ['datajud']);
  assert.equal(registry.forCapability(CAPABILITIES.PROCESS_SEARCH).length, 1);
  assert.equal(registry.require('datajud', CAPABILITIES.MOVEMENTS).id, 'datajud');
  assert.throws(() => registry.require('datajud', CAPABILITIES.CERTIFICATES), error => error.code === 'CAPABILITY_UNSUPPORTED');
  assert.throws(() => registry.get('inexistente'), error => error.code === 'NOT_FOUND');
  assert.throws(() => registry.register(provider), error => error.code === 'CONFLICT');
  assert.throws(() => registry.forCapability('NOPE'), error => error.code === 'INVALID_ARGUMENT');

  const silent = createProvider({ id: 'silent', capabilities: [], probe: () => new Promise(() => {}) });
  const silentHealth = await silent.health({ timeoutMs: 25 });
  assert.equal(silentHealth.status, 'unavailable');
  const humanProvider = createProvider({
    id: 'human-gate',
    capabilities: [],
    probe: async () => { throw humanRequiredError('human-gate', 'probe', 'Etapa humana necessária.'); }
  });
  assert.equal((await humanProvider.health()).status, 'human_required');
  const fallback = await probeProviderHealth({ id: 'no-probe', maturity: 'experimental' });
  assert.equal(fallback.status, 'experimental');
}

console.log('[T5] Feature flags fail-closed e leitura de ambiente...');
{
  for (const flagId of BETA_FLAG_IDS) {
    assert.equal(isBetaFlagEnabled(flagId, {}), false, `${flagId} deve ser false por padrão.`);
  }
  assert.throws(() => isBetaFlagEnabled('BETA_INEXISTENTE', {}), /desconhecida/);
  assert.equal(parseFlagValue('true'), true);
  assert.equal(parseFlagValue('ENABLED'), true);
  assert.equal(parseFlagValue('off'), false);
  assert.equal(parseFlagValue(''), false);
  assert.equal(parseFlagValue('talvez'), false);
  assert.equal(parseFlagValue(undefined, true), true);
  assert.equal(isBetaFlagEnabled('BETA_LEGAL_RAG', { BETA_LEGAL_RAG: '1' }), true);
  assert.throws(() => assertBetaFlagEnabled('BETA_LEGAL_RAG', {}), error => error.code === 'DISABLED' && error.humanAction.includes('BETA_LEGAL_RAG'));
  const flags = readBetaFlags({ BETA_LEGAL_RAG: 'true' });
  assert.equal(flags.find(flag => flag.id === 'BETA_LEGAL_RAG').source, 'environment');
  assert.equal(flags.find(flag => flag.id === 'BETA_PDPJ_PROVIDER').source, 'default');
}

console.log('[T6] Snapshot de status beta por módulo...');
{
  const disabled = await new BetaStatusRegistry({ env: {} }).snapshot();
  assert.deepEqual(Object.values(disabled.modules), Array(8).fill('disabled'));
  assert.deepEqual(Object.values(disabled.verification), Array(8).fill('UNAVAILABLE'));
  assert.equal(disabled.authority, 'non-authoritative');
  assert.equal(disabled.isolation, 'beta-namespace');
  const enabled = await new BetaStatusRegistry({ env: { BETA_LEGAL_RAG: 'true' } }).snapshot();
  assert.equal(enabled.modules.rag, MODULE_STATUS.EXPERIMENTAL);
  // Sem probe, o estado declarado é UNVERIFIED e a evidência é declarada.
  assert.equal(enabled.verification.rag, 'UNVERIFIED');
  assert.equal(enabled.verificationEvidence.rag, 'declared');
  assert.equal(enabled.modules.pdpj, MODULE_STATUS.DISABLED);
  assert.equal(enabled.verification.pdpj, 'UNAVAILABLE');
  const probed = await new BetaStatusRegistry({ env: { BETA_LEGAL_RAG: 'true' } })
    .snapshot({ probes: { rag: async () => ({ status: 'ok', verificationState: 'LIVE_PARTIAL', note: 'probe sintetico' }) } });
  assert.equal(probed.modules.rag, MODULE_STATUS.OK);
  assert.equal(probed.verification.rag, 'LIVE_PARTIAL');
  assert.equal(probed.verificationEvidence.rag, 'probed');
  assert.equal(probed.verificationNotes.rag, 'probe sintetico');
  // human_required é etapa humana, não degradação.
  const human = await new BetaStatusRegistry({ env: { BETA_LEGAL_RAG: 'true' } })
    .snapshot({ probes: { rag: async () => ({ status: 'human_required', verificationState: 'HUMAN_REQUIRED' }) } });
  assert.equal(human.modules.rag, MODULE_STATUS.EXPERIMENTAL);
  assert.equal(human.verification.rag, 'HUMAN_REQUIRED');
  const failing = await new BetaStatusRegistry({ env: { BETA_LEGAL_RAG: 'true' } })
    .snapshot({ probes: { rag: async () => { throw new Error('synthetic failure'); } } });
  assert.equal(failing.modules.rag, MODULE_STATUS.UNAVAILABLE);
}

console.log('[T7] Observabilidade sem segredo, token, CPF ou documento completo...');
{
  const masked = redactText('CPF 123.456.789-09, CNPJ 12.345.678/0001-90, email teste@example.test');
  assert.equal(masked.includes('123.456.789-09'), false);
  assert.equal(masked.includes('12.345.678/0001-90'), false);
  assert.equal(masked.includes('teste@example.test'), false);
  assert.equal(redactText('x'.repeat(500)).length, 160);
  const redacted = redactForLog({
    token: 'eyJhbGciOiJIUzI1NiJ9',
    authorization: 'Bearer abc',
    cookie: 'keller_session=abc',
    nested: { senha: 'segredo', ok: 'valor', cpf: '12345678909' }
  });
  assert.equal(redacted.token, '[REDACTED]');
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.cookie, '[REDACTED]');
  assert.equal(redacted.nested.senha, '[REDACTED]');
  assert.equal(redacted.nested.cpf, '[CPF]');
  assert.equal(redacted.nested.ok, 'valor');

  let clock = 1000;
  const recorder = new OperationRecorder({ now: () => clock, limit: 2 });
  const first = recorder.start('pdpj', 'findProcesses');
  clock += 5;
  first.finish({ status: OPERATION_STATUS.OK, items: 3, cacheHit: false });
  const second = recorder.start('pdpj', 'getProcess');
  clock += 5;
  second.finish({ status: OPERATION_STATUS.FAILED, errorClass: 'UNAVAILABLE' });
  const third = recorder.start('datajud', 'listMovements');
  third.finish({});
  const records = recorder.records();
  assert.equal(records.length, 2);
  assert.equal(records[0].durationMs, 5);
  assert.deepEqual(Object.keys(records[0]), ['provider', 'operation', 'status', 'durationMs', 'items', 'cacheHit', 'errorClass', 'startedAt']);
  const summary = recorder.summary();
  assert.equal(summary.byProvider.pdpj.failures, 1);
  recorder.clear();
  assert.equal(recorder.records().length, 0);
}

console.log('[T8] Transporte HTTP judicial: allowlist, retry, timeout, tamanho e desafio humano...');
{
  assert.equal(assertSafeUrl('https://api-publica.datajud.cnj.jus.br/x').hostname, 'api-publica.datajud.cnj.jus.br');
  for (const unsafe of ['ftp://example.test/x', 'https://user:pass@example.test/x', 'http://localhost:3100/x', 'http://192.168.0.10/x', 'http://10.0.0.5/x']) {
    assert.throws(() => assertSafeUrl(unsafe), error => error.code === 'FORBIDDEN' || error.code === 'INVALID_ARGUMENT', unsafe);
  }
  assert.equal(assertSafeUrl('http://localhost:3100/x', { allowLoopback: true }).hostname, 'localhost');
  assert.throws(() => assertSafeUrl('https://example.test/x', { allowedHosts: ['outro.test'] }), /allowlist/);
  assert.equal(assertSafeUrl('https://example.test/x', { allowedHosts: ['example.test'] }).hostname, 'example.test');
  assert.throws(() => assertSafeUrl('nao-e-url'), /inválida/);
  // IPv6 e IPv4-mapeados não escapam do bloqueio de loopback/privado
  // (hostname IPv6 chega entre colchetes; a classificação é por faixa real).
  for (const unsafeIpv6 of [
    'http://[::1]/x',
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:7f00:1]/x',
    'http://[fe80::1]/x',
    'http://[fd00::1]/x',
    'http://[fc00::1]/x',
    'http://[::]/x'
  ]) {
    assert.throws(() => assertSafeUrl(unsafeIpv6), error => error.code === 'FORBIDDEN', unsafeIpv6);
  }
  assert.equal(assertSafeUrl('https://[2606:4700::1111]/x').hostname, '[2606:4700::1111]');

  assert.equal(detectHumanChallenge({ status: 403, bodyText: 'Just a moment... cf_chl_opt' }).kind, 'cloudflare');
  assert.equal(detectHumanChallenge({ status: 403, bodyText: 'g-recaptcha' }).kind, 'captcha');
  assert.equal(detectHumanChallenge({ status: 200, bodyText: 'g-recaptcha' }).required, false);

  const textResponse = ({ status = 200, body = '', headers = {}, url = '' } = {}) => {
    const buffer = Buffer.from(body, 'utf8');
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(headers),
      body: null,
      url,
      arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  };

  const sleeps = [];
  const sleep = ms => { sleeps.push(ms); return Promise.resolve(); };
  let attemptCounter = 0;
  const retrying = new HttpTransport({
    policy: { hostSpacingMs: 0, backoffBaseMs: 5, maxBackoffMs: 50, jitterMs: 0, maxAttempts: 3, timeoutMs: 500 },
    sleep,
    fetchImpl: async () => {
      attemptCounter += 1;
      if (attemptCounter === 1) return textResponse({ status: 429, headers: { 'retry-after': '0.02' } });
      return textResponse({ body: '{"ok":true}' });
    }
  });
  const retried = await retrying.request('https://api-publica.datajud.cnj.jus.br/_search');
  assert.equal(retried.status, 200);
  assert.equal(retried.attempts, 2);
  assert.equal(sleeps.includes(20), true);
  assert.deepEqual(readJson(retried), { ok: true });

  let failingCounter = 0;
  const failing = new HttpTransport({
    policy: { hostSpacingMs: 0, backoffBaseMs: 1, maxBackoffMs: 5, jitterMs: 0, maxAttempts: 2, timeoutMs: 500 },
    sleep,
    fetchImpl: async () => { failingCounter += 1; return textResponse({ status: 503, body: 'indisponivel' }); }
  });
  await assert.rejects(() => failing.request('https://example.test/x'), error => error.code === 'UNAVAILABLE' && error.status === 503);
  assert.equal(failingCounter, 2);

  const timeoutTransport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 2, backoffBaseMs: 1, jitterMs: 0 },
    sleep,
    fetchImpl: async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; }
  });
  await assert.rejects(() => timeoutTransport.request('https://example.test/x'), error => error.code === 'TIMEOUT');

  const tooLarge = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1, maxResponseBytes: 4 },
    sleep,
    fetchImpl: async () => textResponse({ body: 'conteudo-maior-que-o-limite' })
  });
  await assert.rejects(() => tooLarge.request('https://example.test/x'), error => error.code === 'TOO_LARGE');

  // Redirect: cada hop é validado ANTES de ser seguido; destino proibido nunca
  // recebe requisição e cross-origin continua bloqueado.
  let forbiddenHopFetches = 0;
  const forbiddenHop = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    fetchImpl: async () => {
      forbiddenHopFetches += 1;
      return textResponse({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    }
  });
  await assert.rejects(
    () => forbiddenHop.request('https://example.test/x'),
    error => error.code === 'FORBIDDEN',
    'redirect para metadata endpoint deve ser bloqueado'
  );
  assert.equal(forbiddenHopFetches, 1, 'destino proibido não pode receber requisição');

  let crossOriginHopFetches = 0;
  const crossOrigin = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    fetchImpl: async () => {
      crossOriginHopFetches += 1;
      return textResponse({ status: 302, headers: { location: 'https://evil.example/x' } });
    }
  });
  await assert.rejects(
    () => crossOrigin.request('https://example.test/x'),
    error => error.code === 'FORBIDDEN',
    'redirect cross-origin deve ser bloqueado'
  );
  assert.equal(crossOriginHopFetches, 1, 'cross-origin não pode receber requisição');

  let sameOriginHops = 0;
  const sameOrigin = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    fetchImpl: async () => {
      sameOriginHops += 1;
      if (sameOriginHops === 1) return textResponse({ status: 302, headers: { location: '/v2/ok' } });
      return textResponse({ body: '{"ok":true}' });
    }
  });
  const followed = await sameOrigin.request('https://example.test/v2/inicio');
  assert.equal(followed.status, 200);
  assert.equal(followed.finalUrl, 'https://example.test/v2/ok');
  assert.equal(sameOriginHops, 2, 'redirect same-origin válido deve ser seguido');

  const loopTransport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1, maxRedirects: 3 },
    sleep,
    fetchImpl: async () => textResponse({ status: 302, headers: { location: '/loop' } })
  });
  await assert.rejects(() => loopTransport.request('https://example.test/loop'), error => error.code === 'FORBIDDEN');

  // HTTPS obrigatório para transporte com credencial.
  assert.throws(() => assertSafeUrl('http://example.test/x', { requireHttps: true }), /HTTPS/);
  assert.equal(assertSafeUrl('https://example.test/x', { requireHttps: true }).protocol, 'https:');
  const insecureCredentialTransport = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    requireHttps: true,
    fetchImpl: async () => textResponse({ body: 'nao deveria conectar' })
  });
  await assert.rejects(() => insecureCredentialTransport.request('http://example.test/x'), error => error.code === 'FORBIDDEN');

  const invalidJson = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    fetchImpl: async () => textResponse({ body: '<html>nao json</html>' })
  });
  const htmlResult = await invalidJson.request('https://example.test/x');
  assert.throws(() => readJson(htmlResult), error => error.code === 'PARSE_ERROR');

  const spacingSleeps = [];
  const spaced = new HttpTransport({
    policy: { hostSpacingMs: 50, maxAttempts: 1, jitterMs: 0 },
    sleep: ms => { spacingSleeps.push(ms); return Promise.resolve(); },
    fetchImpl: async () => textResponse({ body: 'ok' })
  });
  await spaced.request('https://example.test/a');
  await spaced.request('https://example.test/b');
  assert.equal(spacingSleeps.some(ms => ms >= 40 && ms <= 60), true, 'Serialização por host deve aguardar o espaçamento.');

  const order = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const serialized = new HttpTransport({
    policy: { hostSpacingMs: 0, maxAttempts: 1 },
    sleep,
    fetchImpl: async url => {
      order.push(`start:${url}`);
      if (url.endsWith('/a')) await gate;
      order.push(`end:${url}`);
      return textResponse({ body: 'ok' });
    }
  });
  const firstRequest = serialized.request('https://example.test/a');
  const secondRequest = serialized.request('https://example.test/b');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(order, ['start:https://example.test/a'], 'Segunda chamada não pode iniciar antes da primeira terminar.');
  releaseFirst();
  await Promise.all([firstRequest, secondRequest]);
  assert.deepEqual(order, ['start:https://example.test/a', 'end:https://example.test/a', 'start:https://example.test/b', 'end:https://example.test/b']);
  assert.equal(HTTP_POLICY_DEFAULTS.timeoutMs, 15000);
}

console.log('[T9] Vocabulário de verificação e kill-switch de automação...');
{
  assert.deepEqual(Object.values(VERIFICATION_STATES).sort(), [
    'FIXTURE_VALIDATED', 'HUMAN_REQUIRED', 'LIVE_PARTIAL', 'LIVE_VERIFIED', 'UNAVAILABLE', 'UNVERIFIED'
  ]);
  assert.equal(isVerificationState('LIVE_VERIFIED'), true);
  assert.equal(isVerificationState('OK'), false);
  assert.throws(() => verificationBadge('OK'), /inválido/);
  assert.equal(verificationBadge('LIVE_PARTIAL').live, true);
  assert.equal(verificationBadge('FIXTURE_VALIDATED').live, false);
  assert.equal(verificationBadge('HUMAN_REQUIRED').requiresHuman, true);
  assert.equal(verificationBadge('FIXTURE_VALIDATED').isOfficialClaim, false);
  assert.equal(combineVerificationStates(['LIVE_VERIFIED', 'FIXTURE_VALIDATED']), 'FIXTURE_VALIDATED');
  assert.equal(combineVerificationStates(['FIXTURE_VALIDATED', 'UNVERIFIED', 'LIVE_PARTIAL']), 'UNVERIFIED');
  assert.equal(combineVerificationStates([]), 'UNVERIFIED');
  assert.equal(neverOverclaim('LIVE_VERIFIED', { floor: 'FIXTURE_VALIDATED' }), 'FIXTURE_VALIDATED', 'Reivindicação acima do piso documentado é rebaixada.');
  assert.equal(neverOverclaim('LIVE_PARTIAL', { floor: 'FIXTURE_VALIDATED' }), 'FIXTURE_VALIDATED');
  assert.equal(neverOverclaim('UNVERIFIED', { floor: 'FIXTURE_VALIDATED' }), 'UNVERIFIED', 'Estado mais conservador que o piso é preservado.');

  assert.equal(automationsDisabled({}), true, `${AUTOMATION_KILL_SWITCH} deve ser true por padrão.`);
  assert.equal(automationsDisabled({ [AUTOMATION_KILL_SWITCH]: 'false' }), false);
  assert.equal(automationPolicy({}).source, 'default');
  assert.equal(automationPolicy({ [AUTOMATION_KILL_SWITCH]: 'false' }).automationsDisabled, false);
  assert.throws(
    () => assertAutomationsEnabled({}, { operation: 'mass-download', provider: 'fixture' }),
    error => error.code === 'DISABLED' && error.humanAction.includes(AUTOMATION_KILL_SWITCH)
  );
  assert.equal(assertAutomationsEnabled({ [AUTOMATION_KILL_SWITCH]: 'false' }), true);
}

console.log('\n>>> JUDICIAL INTELLIGENCE CORE: PASS <<<\n');
