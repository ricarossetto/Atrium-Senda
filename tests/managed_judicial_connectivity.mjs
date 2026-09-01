import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';
import { JudicialSessionManager, SESSION_STATUS } from '../lib/judicial/session-manager.mjs';
import {
  CONNECTIVITY_STATUS,
  FORBIDDEN_JUDICIAL_OPERATIONS,
  ManagedJudicialConnectivity,
  computeNextRefresh,
  deduplicateJudicialRecords,
  isRefreshDue,
  normalizeCnjNumber,
  portalVerificationState,
  resolvePortalAuthStrategy,
  sanitizeJudicialError,
  suggestCanonicalCases
} from '../lib/judicial/managed-connectivity.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'atrium-managed-judicial-'));
const secretMarker = 'SYNTHETIC_MANAGED_TOTP_SECRET';
const passwordMarker = 'SYNTHETIC_MANAGED_PASSWORD';
const clock = { value: Date.parse('2026-09-01T10:00:00.000Z') };
const security = {
  encrypt(value) { return Buffer.from(value, 'utf8').toString('base64'); },
  decrypt(value) { return Buffer.from(value, 'base64').toString('utf8'); }
};

try {
  const credentials = new JudicialCredentialManager({ dataDirectory: root, securityManager: security });
  const sessions = new JudicialSessionManager({ dataDirectory: root });
  await credentials.init();
  await sessions.init();

  await credentials.savePortalCredentials('eproc-sandbox', {
    username: 'identity-a', password: passwordMarker, oab: '000000', uf: 'RS', identityId: 'identity-a'
  });
  await credentials.savePortalCredentials('eproc-sandbox', {
    username: 'identity-b', password: 'SYNTHETIC_OTHER_PASSWORD', oab: '000001', uf: 'SC', identityId: 'identity-b'
  });
  assert.equal((await credentials.getPortalCredentials('eproc-sandbox', 'identity-a')).username, 'identity-a');
  assert.equal((await credentials.getPortalCredentials('eproc-sandbox', 'identity-b')).username, 'identity-b');
  assert.notEqual((await credentials.getPortalCredentials('eproc-sandbox', 'identity-a')).password, (await credentials.getPortalCredentials('eproc-sandbox', 'identity-b')).password);

  const credentialEnvelope = await readFile(path.join(root, 'judicial-integrations.json'), 'utf8');
  assert.doesNotMatch(credentialEnvelope, new RegExp(passwordMarker));
  assert.doesNotMatch(credentialEnvelope, new RegExp(secretMarker));

  const portal = {
    id: 'eproc-sandbox', name: 'eproc Sandbox Sintético', system: 'eproc', strategy: 'eproc',
    authStrategy: 'username-password-plus-totp', verificationEvidence: { verifiedAt: '2026-09-01T00:00:00.000Z' }
  };
  const calls = { authenticate: 0, health: 0, discoverCases: 0, fetchMovements: 0, fetchPublications: 0, disconnect: 0 };
  let mode = 'success';
  let lastCredential = null;
  const adapterFactory = () => ({
    readOnly: true,
    async authenticate(input) {
      calls.authenticate += 1;
      assert.equal(input.readOnly, true);
      lastCredential = input.credential;
      if (mode === 'human') return { humanActionRequired: true, humanAction: 'Concluir CAPTCHA sintético.' };
      if (mode === 'error') throw new Error(`password=${passwordMarker} token=ABCDEF1234567890 código 123456`);
      return { authenticated: true };
    },
    async health(input) { calls.health += 1; assert.equal(input.readOnly, true); return mode === 'expired' ? { expired: true, humanAction: 'Reconectar sessão sintética.' } : { ok: true }; },
    async discoverCases() {
      calls.discoverCases += 1;
      return [
        { id: 'external-case-a', number: '5000000-00.2026.8.21.0001', source: 'sandbox' },
        { id: 'external-case-a-duplicate', number: '5000000-00.2026.8.21.0001', source: 'sandbox' }
      ];
    },
    async fetchMovements() {
      calls.fetchMovements += 1;
      return [
        { externalId: 'movement-1', process: '5000000-00.2026.8.21.0001', description: 'Movimento sintético.' },
        { externalId: 'movement-1', process: '5000000-00.2026.8.21.0001', description: 'Movimento sintético repetido.' }
      ];
    },
    async fetchPublications() {
      calls.fetchPublications += 1;
      return [
        { externalId: 'publication-1', process: '5000000-00.2026.8.21.0001', title: 'Publicação sintética.' },
        { externalId: 'publication-1', process: '5000000-00.2026.8.21.0001', title: 'Publicação sintética repetida.' }
      ];
    },
    async disconnect(input) { calls.disconnect += 1; assert.equal(input.readOnly, true); }
  });

  const managed = new ManagedJudicialConnectivity({
    credentialManager: credentials,
    sessionManager: sessions,
    portalsConfig: [portal],
    adapterFactory,
    now: () => clock.value,
    successCadenceMs: 30 * 60 * 1000,
    backoffBaseMs: 10 * 60 * 1000,
    backoffMaxMs: 60 * 60 * 1000
  });

  const canonicalCases = [{ id: 'canonical-case', number: '5000000-00.2026.8.21.0001', client: 'Cliente Sintético', court: 'TJRS' }];
  const success = await managed.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: portal.id, canonicalCases });
  assert.equal(success.ok, true);
  assert.equal(success.readOnly, true);
  assert.equal(success.cases.length, 1, 'CNJ deve deduplicar o acervo descoberto.');
  assert.equal(success.movements.length, 1, 'Movimento deve deduplicar por referência estável.');
  assert.equal(success.publications.length, 1, 'Publicação deve deduplicar por referência estável.');
  assert.deepEqual(success.suggestions, [{ caseId: 'canonical-case', reason: 'CNJ_EXACT', source: 'eproc Sandbox Sintético', confidence: 1 }]);
  assert.equal(lastCredential.username, 'identity-a');
  assert.equal(lastCredential.password, passwordMarker);
  assert.equal(calls.disconnect, 1);

  const connected = await sessions.getSessionStatus('collector-user', portal.id, 'identity-a');
  assert.equal(connected.status, SESSION_STATUS.CONNECTED);
  assert.equal(connected.failureCount, 0);
  assert.equal(connected.nextRefreshAt, '2026-09-01T10:30:00.000Z');
  assert.equal(isRefreshDue(connected, clock.value), false);
  const skipped = await managed.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: portal.id });
  assert.equal(skipped.skipped, true);
  assert.equal(calls.authenticate, 1, 'Cadência não pode repetir autenticação antes da hora.');

  mode = 'error';
  clock.value += 31 * 60 * 1000;
  const failure = await managed.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: portal.id });
  assert.equal(failure.state, SESSION_STATUS.ERROR);
  assert.doesNotMatch(failure.error, new RegExp(passwordMarker));
  assert.doesNotMatch(failure.error, /123456/);
  assert.ok(Date.parse(failure.nextRefreshAt) > clock.value);
  const stateFile = await readFile(path.join(root, 'judicial-sessions.json'), 'utf8');
  assert.doesNotMatch(stateFile, new RegExp(passwordMarker));

  mode = 'human';
  clock.value = Date.parse(failure.nextRefreshAt) + 1;
  const human = await managed.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: portal.id });
  assert.equal(human.state, SESSION_STATUS.ACTION_REQUIRED);
  assert.equal(human.humanActionRequired, true);
  const humanState = await sessions.getSessionStatus('collector-user', portal.id, 'identity-a');
  assert.equal(humanState.nextRefreshAt, null, 'Intervenção humana deve pausar retries automáticos.');
  assert.equal(isRefreshDue(humanState, clock.value + 86_400_000), false);

  mode = 'expired';
  clock.value += 1;
  const expired = await managed.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: portal.id, force: true });
  assert.equal(expired.state, SESSION_STATUS.EXPIRED);
  assert.equal(expired.humanActionRequired, true);

  const coverage = await managed.coverage('collector-user', 'identity-a');
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0].authStrategy, 'username-password-plus-totp');
  assert.equal(coverage[0].verification, 'verified');
  assert.equal(coverage[0].readOnly, true);
  assert.equal(Object.hasOwn(coverage[0], 'credential'), false);

  assert.equal(normalizeCnjNumber('5000000-00.2026.8.21.0001'), '50000000020268210001');
  assert.equal(normalizeCnjNumber('inválido'), '');
  assert.equal(resolvePortalAuthStrategy({ strategy: 'pje', certificateMode: 'pjeoffice' }), 'pjeoffice-local');
  assert.equal(resolvePortalAuthStrategy({ strategy: 'eproc', certificateMode: 'windows-store' }), 'windows-store');
  assert.equal(resolvePortalAuthStrategy({ strategy: 'unknown' }), 'interactive-human-required');
  assert.equal(portalVerificationState({ automationLevel: 'supported' }), 'not_verified');
  assert.equal(portalVerificationState({ strategy: 'djen' }), 'verified');
  assert.equal(computeNextRefresh({ now: clock.value, authenticationRequired: true }), null);
  assert.match(sanitizeJudicialError(`cookie=secret ${secretMarker} 123456`), /oculto/);
  assert.equal(deduplicateJudicialRecords([{ externalId: 'x' }, { externalId: 'x' }]).length, 1);
  assert.equal(suggestCanonicalCases({ client: 'Cliente Sintético', court: 'TJRS' }, canonicalCases, { source: 'sandbox' })[0].reason, 'PARTY_AND_COURT');
  assert.ok(FORBIDDEN_JUDICIAL_OPERATIONS.includes('science'));
  assert.equal(CONNECTIVITY_STATUS.CONNECTED, 'connected');

  const unsafe = new ManagedJudicialConnectivity({
    credentialManager: credentials,
    sessionManager: sessions,
    portalsConfig: [{ ...portal, id: 'unsafe' }],
    adapterFactory: () => ({ ...adapterFactory(), sign() {} })
  });
  await assert.rejects(() => unsafe.syncPortal({ userId: 'collector-user', identityId: 'identity-a', portalId: 'unsafe' }), /operação judicial proibida/i);

  console.log('✓ Managed Judicial Connectivity: isolamento, estratégias, sessão, backoff, discovery, dedup, matching, segredos e read-only PASS.');
} finally {
  await rm(root, { recursive: true, force: true });
}
