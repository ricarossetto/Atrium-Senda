import assert from 'node:assert/strict';
import {
  EPROC_PORTALS,
  EPROC_STATUS,
  EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS,
  getPortalPublicAccess
} from '../lib/judicial/eproc/portal-registry.mjs';
import {
  AccessKeyEnrichmentStrategy,
  PUBLIC_SEARCH_DEGRADABLE_REASONS
} from '../lib/judicial/eproc/enrichment/access-key-strategy.mjs';
import {
  createEprocPublicSearchRuntime,
  createEprocPublicSearchHttpTransport,
  isEprocPublicKeyEnabled,
  EPROC_PUBLIC_KEY_ENABLED_ENV
} from '../lib/judicial/eproc/enrichment/public-search-runtime.mjs';
import { createEprocRuntimeExecutor } from '../lib/judicial/eproc/runtime-executor.mjs';

const VAULT_KEY = 'CHAVE-SINTETICA-W4-000111222';
const REFRESHED_KEY = 'CHAVE-SINTETICA-W4-REFRESH-333444';
const PORTAL = 'tjrs-eproc-1g';

function vaultManager(initial = {}) {
  const vault = new Map(Object.entries(initial));
  return {
    vault,
    getProcessAccessKey: async (cnj) => vault.get(cnj) || null,
    saveProcessAccessKey: async (cnj, { accessKey }) => { vault.set(cnj, accessKey); }
  };
}

function publicClient(handler) {
  return { searchByProcessKey: handler };
}

async function runPublicKeyWiringTest() {
  console.log('=== TESTE FOCAL: EPROC PUBLIC KEY WIRING (W4/FASE 1) ===\n');

  // ---------------------------------------------------------------------------
  // 1. Registry: publicAccess candidato, 21 portais e status intactos
  // ---------------------------------------------------------------------------
  assert.equal(EPROC_PORTALS.length, 21, 'Registry deve manter exatamente 21 portais.');
  const byStatus = EPROC_PORTALS.reduce((acc, portal) => {
    acc[portal.status] = (acc[portal.status] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(byStatus, { [EPROC_STATUS.ACTIVE]: 16, [EPROC_STATUS.PARTIAL]: 2, [EPROC_STATUS.PILOT]: 3 });

  const expectedKeys = [
    'browserFallback', 'captcha', 'credentialKinds', 'directHttp', 'documentKeySupported',
    'entryPath', 'processDocumentsSupported', 'processKeySupported', 'supported', 'verificationState'
  ].sort();
  const captchaTypes = new Set(['turnstile', 'hcaptcha', 'image']);
  const observedIds = Object.keys(EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS);
  assert.equal(observedIds.length, 4, 'Apenas os 4 portais observados live podem declarar captcha.');
  for (const [id, type] of Object.entries(EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS)) {
    assert.ok(captchaTypes.has(type), `Captcha observado inválido em ${id}.`);
    assert.ok(EPROC_PORTALS.some((portal) => portal.id === id), `Observação live de portal inexistente: ${id}.`);
  }
  for (const portal of EPROC_PORTALS) {
    const access = portal.publicAccess;
    const observed = EPROC_PUBLIC_ACCESS_CAPTCHA_OBSERVATIONS[portal.id] || null;
    assert.ok(access, `Portal ${portal.id} deve declarar publicAccess.`);
    assert.deepEqual(Object.keys(access).sort(), expectedKeys, `publicAccess de ${portal.id} deve seguir o contrato.`);
    if (observed) {
      assert.equal(access.verificationState, 'ENTRYPOINT_OBSERVED', `Portal ${portal.id} deve declarar a observação live.`);
      assert.equal(access.directHttp, 'blocked_by_captcha', `HTTP direto de ${portal.id} está bloqueado por captcha.`);
      assert.equal(access.captcha, observed);
    } else {
      assert.equal(access.verificationState, 'UNVERIFIED', `Portal ${portal.id} não pode se declarar verificado.`);
      assert.equal(access.directHttp, 'candidate');
      assert.equal(access.captcha, 'unknown');
    }
    assert.equal(access.documentKeySupported, false);
    assert.equal(access.processDocumentsSupported, false);
    assert.equal(access.browserFallback, true);
    assert.deepEqual(access.credentialKinds, ['EPROC_PROCESS_KEY']);
    assert.ok(access.entryPath.includes('processo_consulta_publica'), `entryPath oficial ausente em ${portal.id}.`);
    assert.equal(access.supported, portal.status === EPROC_STATUS.ACTIVE, `supported deve ser honesto em ${portal.id}.`);
    assert.equal(access.processKeySupported, portal.status === EPROC_STATUS.ACTIVE, `processKeySupported deve ser honesto em ${portal.id}.`);
    assert.doesNotMatch(JSON.stringify(access), /LIVE_VERIFIED/, `Nada de LIVE_VERIFIED sem teste real (${portal.id}).`);
  }
  assert.deepEqual(getPortalPublicAccess('eproc-tjrs-1g'), getPortalPublicAccess(PORTAL), 'Alias legado deve resolver o mesmo publicAccess.');
  console.log('✓ 1. Registry: 21 portais; 4 com captcha observado live (HTTP bloqueado) e os demais UNVERIFIED.');

  // ---------------------------------------------------------------------------
  // 2. Runtime desligado por padrão: nenhum import, nenhum transporte, nada muda
  // ---------------------------------------------------------------------------
  assert.equal(isEprocPublicKeyEnabled({}), false);
  assert.equal(isEprocPublicKeyEnabled({ [EPROC_PUBLIC_KEY_ENABLED_ENV]: 'false' }), false);
  assert.equal(isEprocPublicKeyEnabled({ [EPROC_PUBLIC_KEY_ENABLED_ENV]: 'on' }), true);

  let offFactoryCalls = 0;
  const offRuntime = await createEprocPublicSearchRuntime({
    env: {},
    logger: { warn: () => {} },
    clientFactory: () => { offFactoryCalls += 1; return publicClient(async () => ({ ok: true })); }
  });
  assert.equal(offFactoryCalls, 0, 'Flag desligada não pode sequer chamar a fábrica do cliente.');
  assert.deepEqual(
    { enabled: offRuntime.enabled, state: offRuntime.state, client: offRuntime.client },
    { enabled: false, state: 'disabled', client: null }
  );
  console.log('✓ 2. Flag desligada (default): cliente não é importado nem criado; pipeline atual intacto.');

  // ---------------------------------------------------------------------------
  // 3. Flag ligada com cliente válido: pronto para uso
  // ---------------------------------------------------------------------------
  const onRuntime = await createEprocPublicSearchRuntime({
    env: { [EPROC_PUBLIC_KEY_ENABLED_ENV]: 'true' },
    logger: { warn: () => {} },
    clientFactory: async () => publicClient(async () => ({ ok: true }))
  });
  assert.equal(onRuntime.enabled, true);
  assert.equal(onRuntime.state, 'ready');
  assert.equal(typeof onRuntime.client.searchByProcessKey, 'function');
  console.log('✓ 3. Flag ligada: cliente público instanciado e pronto.');

  // ---------------------------------------------------------------------------
  // 4. Flag ligada sem cliente confiável: degrada honestamente, sem fingir sucesso
  // ---------------------------------------------------------------------------
  const warnLogs = [];
  const invalidRuntime = await createEprocPublicSearchRuntime({
    env: { [EPROC_PUBLIC_KEY_ENABLED_ENV]: 'true' },
    logger: { warn: (message) => warnLogs.push(String(message)) },
    clientFactory: async () => null
  });
  assert.deepEqual(
    { enabled: invalidRuntime.enabled, state: invalidRuntime.state, client: invalidRuntime.client, reason: invalidRuntime.reason },
    { enabled: true, state: 'invalid', client: null, reason: 'CLIENT_CONTRACT_INVALID' }
  );
  const failedRuntime = await createEprocPublicSearchRuntime({
    env: { [EPROC_PUBLIC_KEY_ENABLED_ENV]: 'true' },
    logger: { warn: (message) => warnLogs.push(String(message)) },
    clientFactory: async () => { throw new Error('falha sintética de inicialização'); }
  });
  assert.equal(failedRuntime.state, 'failed');
  assert.equal(failedRuntime.reason, 'CLIENT_INIT_FAILED');
  assert.equal(failedRuntime.client, null);
  for (const log of warnLogs) assert.doesNotMatch(log, /CHAVE-SINTETICA/, 'Logs do runtime nunca podem conter chave.');
  const transport = createEprocPublicSearchHttpTransport({ fetchImpl: async () => ({ status: 200, ok: true, headers: {}, text: async () => 'ok' }) });
  const envelope = await transport.request('https://example.test/consulta');
  assert.deepEqual({ status: envelope.status, body: envelope.body }, { status: 200, body: 'ok' });
  console.log('✓ 4. Sem cliente confiável: estado honesto (invalid/failed), logger sem segredo e transporte HTTP funcional.');

  // ---------------------------------------------------------------------------
  // 5. Estratégia desligada: comportamento atual (sessão autenticada) sem tocar o cliente
  // ---------------------------------------------------------------------------
  const vaultOff = vaultManager({ '50000010020268210016': VAULT_KEY });
  let offClientCalls = 0;
  const strategyOff = new AccessKeyEnrichmentStrategy({
    credentialManager: vaultOff,
    publicSearchClient: publicClient(async () => { offClientCalls += 1; return { ok: true }; }),
    sessionObserver: { fetchProcessAccessKey: async () => ({ ok: true, accessKey: REFRESHED_KEY }) },
    options: { publicSearchEnabled: false }
  });
  const resOff = await strategyOff.enrichProcess({ cnj: '5000001-00.2026.8.21.0016', portalId: PORTAL });
  assert.equal(offClientCalls, 0, 'Desligado: nenhuma chamada pública.');
  assert.equal(resOff.ok, true);
  assert.equal(resOff.strategy, 'SESSION_ENRICHMENT_DIRECT');
  assert.equal(resOff.keyRefreshed, true);
  assert.equal(vaultOff.vault.get('50000010020268210016'), REFRESHED_KEY);
  console.log('✓ 5. Desligado: estratégia segue exatamente o caminho autenticado, sem consulta pública.');

  // ---------------------------------------------------------------------------
  // 6. Ligado com sucesso do novo contrato EPROC_PUBLIC_KEY
  // ---------------------------------------------------------------------------
  const vaultOk = vaultManager({ '50000020020268210016': VAULT_KEY });
  let sessionCallsOk = 0;
  const strategyOk = new AccessKeyEnrichmentStrategy({
    credentialManager: vaultOk,
    publicSearchClient: publicClient(async () => ({
      ok: true,
      portalId: PORTAL,
      cnj: '50000020020268210016',
      source: 'EPROC_PUBLIC_KEY',
      collectedAt: '2026-09-18T12:00:00.000Z',
      metadata: { actionClass: 'Procedimento Comum', accessKey: VAULT_KEY },
      parties: [{ name: 'Autora Teste', role: 'Autor' }],
      movements: [{ date: '2026-09-17', description: 'Movimento sintético' }],
      documents: [{ id: 'doc-1', name: 'Documento sintético', accessKey: VAULT_KEY }],
      provenance: { via: 'public-search', url: `https://example.test/${VAULT_KEY}` }
    })),
    sessionObserver: { fetchProcessAccessKey: async () => { sessionCallsOk += 1; return { ok: true, accessKey: REFRESHED_KEY }; } }
  });
  const resOk = await strategyOk.enrichProcess({ cnj: '5000002-00.2026.8.21.0016', portalId: PORTAL });
  assert.equal(resOk.ok, true);
  assert.equal(resOk.strategy, 'VAULT_KEY_PUBLIC_SEARCH');
  assert.equal(resOk.keyRefreshed, false);
  assert.equal(sessionCallsOk, 0, 'Sucesso público não deve abrir sessão autenticada.');
  assert.equal(resOk.data.parties[0].name, 'Autora Teste');
  assert.equal(resOk.data.source, 'EPROC_PUBLIC_KEY');
  assert.equal(resOk.data.metadata.accessKey, undefined, 'Redação deve remover accessKey dos dados.');
  assert.equal(resOk.data.documents[0].accessKey, undefined);
  assert.ok(!JSON.stringify(resOk).includes(VAULT_KEY), 'Resultado nunca pode carregar a chave.');
  console.log('✓ 6. Ligado: sucesso do cliente EPROC_PUBLIC_KEY enriquece sem sessão e sem vazar a chave.');

  // ---------------------------------------------------------------------------
  // 7. KEY_INVALID: refresh único via sessão autenticada e retry com chave nova
  // ---------------------------------------------------------------------------
  const vaultInvalid = vaultManager({ '50000030020268210016': VAULT_KEY });
  let sessionCallsInvalid = 0;
  let publicCallsInvalid = 0;
  const strategyInvalid = new AccessKeyEnrichmentStrategy({
    credentialManager: vaultInvalid,
    publicSearchClient: publicClient(async ({ accessKey }) => {
      publicCallsInvalid += 1;
      if (accessKey === VAULT_KEY) {
        return { ok: false, reason: 'KEY_INVALID', error: `Chave ${VAULT_KEY} inválida no portal.` };
      }
      return {
        ok: true,
        portalId: PORTAL,
        cnj: '50000030020268210016',
        source: 'EPROC_PUBLIC_KEY',
        collectedAt: '2026-09-18T12:00:00.000Z',
        metadata: null,
        parties: [],
        movements: [],
        documents: [],
        provenance: null
      };
    }),
    sessionObserver: { fetchProcessAccessKey: async () => { sessionCallsInvalid += 1; return { ok: true, accessKey: REFRESHED_KEY }; } }
  });
  const resInvalid = await strategyInvalid.enrichProcess({ cnj: '5000003-00.2026.8.21.0016', portalId: PORTAL });
  assert.equal(resInvalid.ok, true);
  assert.equal(resInvalid.strategy, 'REFRESHED_KEY_PUBLIC_SEARCH');
  assert.equal(resInvalid.keyRefreshed, true);
  assert.equal(sessionCallsInvalid, 1, 'Exatamente UMA tentativa de refresh autenticado.');
  assert.equal(publicCallsInvalid, 2, 'Consulta com a chave velha e retry com a renovada.');
  assert.equal(vaultInvalid.vault.get('50000030020268210016'), REFRESHED_KEY);
  assert.ok(!JSON.stringify(resInvalid).includes(VAULT_KEY));
  assert.ok(!JSON.stringify(resInvalid).includes(REFRESHED_KEY));
  console.log('✓ 7. KEY_INVALID: fallback autenticado único, cofre atualizado e retry público sem vazar chaves.');

  // ---------------------------------------------------------------------------
  // 8. HUMAN_REQUIRED / CAPTCHA_REQUIRED / UNSUPPORTED: fallback honesto, sem erro falso
  // ---------------------------------------------------------------------------
  for (const reason of PUBLIC_SEARCH_DEGRADABLE_REASONS) {
    const vaultDegraded = vaultManager({ '50000040020268210016': VAULT_KEY });
    let sessionCallsDegraded = 0;
    const strategyDegraded = new AccessKeyEnrichmentStrategy({
      credentialManager: vaultDegraded,
      publicSearchClient: publicClient(async () => ({
        ok: false,
        reason,
        error: `Portal exige intervenção humana (${VAULT_KEY}).`
      })),
      sessionObserver: { fetchProcessAccessKey: async () => { sessionCallsDegraded += 1; return { ok: true, accessKey: REFRESHED_KEY, caseData: { source: 'SESSION' } }; } }
    });
    const resDegraded = await strategyDegraded.enrichProcess({ cnj: '5000004-00.2026.8.21.0016', portalId: PORTAL });
    assert.equal(resDegraded.ok, true, `${reason} não pode gerar erro falso.`);
    assert.equal(resDegraded.strategy, 'SESSION_ENRICHMENT_DIRECT');
    assert.equal(resDegraded.publicSearchDegraded, reason);
    assert.equal(resDegraded.error, undefined);
    assert.equal(sessionCallsDegraded, 1);
    assert.ok(!JSON.stringify(resDegraded).includes(VAULT_KEY));
  }
  console.log('✓ 8. HUMAN_REQUIRED/CAPTCHA_REQUIRED/UNSUPPORTED degradam para a sessão autenticada sem erro falso.');

  // ---------------------------------------------------------------------------
  // 9. Sem chave no cofre: sessão autenticada primeiro e retry público com a chave extraída
  // ---------------------------------------------------------------------------
  const vaultEmpty = vaultManager();
  let publicCallsEmpty = 0;
  const strategyEmpty = new AccessKeyEnrichmentStrategy({
    credentialManager: vaultEmpty,
    publicSearchClient: publicClient(async ({ accessKey }) => {
      publicCallsEmpty += 1;
      return {
        ok: true,
        portalId: PORTAL,
        cnj: '50000050020268210016',
        source: 'EPROC_PUBLIC_KEY',
        collectedAt: '2026-09-18T12:00:00.000Z',
        metadata: null,
        parties: [],
        movements: [],
        documents: [],
        provenance: null,
        echo: accessKey
      };
    }),
    sessionObserver: { fetchProcessAccessKey: async () => ({ ok: true, accessKey: REFRESHED_KEY }) }
  });
  const resEmpty = await strategyEmpty.enrichProcess({ cnj: '5000005-00.2026.8.21.0016', portalId: PORTAL });
  assert.equal(resEmpty.ok, true);
  assert.equal(resEmpty.strategy, 'AUTHENTICATED_EXTRACTION_PUBLIC_SEARCH');
  assert.equal(publicCallsEmpty, 1, 'Sem chave no cofre a consulta pública só ocorre após a extração.');
  assert.equal(vaultEmpty.vault.get('50000050020268210016'), REFRESHED_KEY);
  assert.ok(!JSON.stringify(resEmpty).includes(REFRESHED_KEY));
  console.log('✓ 9. Sem chave no cofre: extração pela sessão, cofre atualizado e retry público com a chave nova.');

  // ---------------------------------------------------------------------------
  // 10. Falha pública não-KEY mantém o erro atual, porém redigido
  // ---------------------------------------------------------------------------
  const vaultError = vaultManager({ '50000060020268210016': VAULT_KEY });
  const strategyError = new AccessKeyEnrichmentStrategy({
    credentialManager: vaultError,
    publicSearchClient: publicClient(async () => ({
      ok: false,
      reason: 'NOT_FOUND',
      error: `Nenhum processo retornado para a chave ${VAULT_KEY}.`
    })),
    sessionObserver: { fetchProcessAccessKey: async () => { throw new Error('não deveria ser chamada'); } }
  });
  const resError = await strategyError.enrichProcess({ cnj: '5000006-00.2026.8.21.0016', portalId: PORTAL });
  assert.equal(resError.ok, false);
  assert.equal(resError.reason, 'NOT_FOUND');
  assert.ok(resError.error.includes('[redigido]'));
  assert.ok(!resError.error.includes(VAULT_KEY));
  console.log('✓ 10. NOT_FOUND permanece erro honesto sem expor a chave.');

  // ---------------------------------------------------------------------------
  // 11. Executor expõe o status do wiring sem vazar o cliente
  // ---------------------------------------------------------------------------
  const executorOff = createEprocRuntimeExecutor({ sweep: async () => ({ ok: true }) });
  assert.deepEqual(await executorOff.getPublicSearchStatus(), { enabled: false, state: 'disabled', client: false, reason: null });
  const executorOn = createEprocRuntimeExecutor({
    sweep: async () => ({ ok: true }),
    publicSearchRuntime: Promise.resolve(onRuntime)
  });
  const statusOn = await executorOn.getPublicSearchStatus();
  assert.deepEqual(statusOn, { enabled: true, state: 'ready', client: true, reason: null });
  console.log('✓ 11. Executor reporta o estado do wiring (desligado/pronto) sem expor o cliente.');

  console.log('\n>>> EPROC PUBLIC KEY WIRING TEST PASSED! <<<\n');
}

runPublicKeyWiringTest().catch(err => {
  console.error('Falha no teste de wiring da consulta pública por chave:', err);
  process.exit(1);
});
