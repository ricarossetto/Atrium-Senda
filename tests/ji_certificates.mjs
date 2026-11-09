import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import { BetaStore } from '../lib/judicial-intelligence/core/beta-storage.mjs';
import { HttpTransport } from '../lib/judicial-intelligence/core/http.mjs';
import {
  CERTIFICATE_STATUS,
  CertificateRegistry,
  createCertificateIssuer,
  createCndFederalIssuer,
  createCndtIssuer,
  createDefaultCertificateRegistry,
  createDueDiligenceCase,
  createDueDiligenceService,
  createStateCertificateIssuer,
  maskSubject,
  normalizeSubject,
  runDueDiligenceCase,
  DD_STATUS
} from '../lib/judicial-intelligence/providers/certificates/index.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DUE DILIGENCE / CERTIDÕES (REGISTRY E CICLO SUPERVISIONADO)');
console.log('===============================================================\n');

const CNPJ = '11222333000181';
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-ji-certificates-'));

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    body: null,
    url: '',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function binaryResponse(buffer, { headers = {} } = {}) {
  return {
    status: 200,
    ok: true,
    headers: new Headers(headers),
    body: null,
    url: '',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function fixtureDriver({ pdf = 'CERTIDAO SINTETICA', status = CERTIFICATE_STATUS.ISSUED, failRequest = false } = {}) {
  return {
    async request() {
      if (failRequest) {
        const error = new Error('Falha sintética de emissor.');
        error.code = 'UNAVAILABLE';
        throw error;
      }
      return { requestId: 'req-1', status: CERTIFICATE_STATUS.PROCESSING, validUntil: '2026-12-31' };
    },
    async status() {
      return { status, validUntil: '2026-12-31' };
    },
    async download() {
      return { bytes: Buffer.from(pdf), mimeType: 'application/pdf', validUntil: '2026-12-31' };
    }
  };
}

try {
  console.log('[C1] Tipos de titular, máscara e montagem de pedido...');
  {
    assert.deepEqual(normalizeSubject('cnpj', CNPJ), { subjectType: 'CNPJ', subjectId: CNPJ });
    assert.throws(() => normalizeSubject('CPF', CNPJ), error => error.code === 'INVALID_ARGUMENT');
    assert.throws(() => normalizeSubject('RG', '123'), error => error.code === 'INVALID_ARGUMENT');
    assert.equal(maskSubject(CNPJ), '**********0181');
    assert.equal(maskSubject('12'), '[mascarado]');
  }

  console.log('[C2] Registry: unicidade, busca por tipo e prontidão...');
  {
    const registry = new CertificateRegistry();
    const issuer = createCertificateIssuer({
      id: 'teste-a',
      subjectTypes: ['CNPJ'],
      requestCertificate: async () => ({ requestId: '1', status: CERTIFICATE_STATUS.ISSUED }),
      checkStatus: async () => ({ status: CERTIFICATE_STATUS.ISSUED }),
      downloadCertificate: async () => ({ bytes: Buffer.from('x'), sha256: 'y', mimeType: 'application/pdf' })
    });
    registry.register(issuer);
    assert.equal(registry.has('teste-a'), true);
    assert.throws(() => registry.register(issuer), error => error.code === 'CONFLICT');
    assert.equal(registry.get('teste-a').id, 'teste-a');
    assert.throws(() => registry.get('inexistente'), error => error.code === 'NOT_FOUND');
    assert.equal(registry.bySubjectType('CNPJ').length, 1);
    assert.equal(registry.bySubjectType('CPF').length, 0);
    assert.equal(registry.list()[0].subjectTypes[0], 'CNPJ');
    assert.throws(
      () => createCertificateIssuer({ id: 'x' }),
      error => error.code === 'INVALID_ARGUMENT'
    );
    assert.throws(
      () => createCertificateIssuer({
        id: 'teste-b',
        subjectTypes: ['INVALIDO'],
        requestCertificate: async () => ({}),
        checkStatus: async () => ({}),
        downloadCertificate: async () => ({})
      }),
      error => error.code === 'INVALID_ARGUMENT'
    );
    await assert.rejects(() => registry.get('teste-a').requestCertificate({ subjectType: 'CPF', subjectId: '00000000000' }),
      error => error.code === 'CAPABILITY_UNSUPPORTED');
    const readiness = await registry.readiness();
    assert.equal(readiness['teste-a'].ready, true);
  }

  console.log('[C3] Emissores padrão: sem driver/credencial → human_required honesto...');
  {
    const registry = createDefaultCertificateRegistry({ env: {} });
    assert.deepEqual(registry.ids().sort(), ['cnd-federal', 'cndt', 'tjrs-distribuicao']);
    const readiness = await registry.readiness();
    assert.equal(readiness['cnd-federal'].ready, false);
    assert.equal(readiness['cnd-federal'].verificationState, 'HUMAN_REQUIRED');
    assert.match(readiness['cnd-federal'].humanAction, /SERPRO|Receita/);
    assert.match(readiness.cndt.humanAction, /cndt-certidao\.tst\.jus\.br/);
    assert.match(readiness['tjrs-distribuicao'].humanAction, /tjrs\.jus\.br/);
    const federalRequest = await registry.get('cnd-federal').requestCertificate({ subjectType: 'CNPJ', subjectId: CNPJ });
    assert.equal(federalRequest.status, CERTIFICATE_STATUS.HUMAN_REQUIRED);
    assert.equal(federalRequest.requestId, null);
    const cndt = await registry.get('cndt').requestCertificate({ subjectType: 'CNPJ', subjectId: CNPJ });
    assert.equal(cndt.status, CERTIFICATE_STATUS.HUMAN_REQUIRED);
    await assert.rejects(() => registry.get('cndt').downloadCertificate('req'), error => error.code === 'HUMAN_REQUIRED');
  }

  console.log('[C4] Ciclo completo com credencial/driver: request → status → download com checksum...');
  {
    const transport = new HttpTransport({
      policy: { hostSpacingMs: 0, maxAttempts: 1 },
      fetchImpl: async url => {
        if (String(url).includes('/pdf')) return binaryResponse(Buffer.from('PDF CND SINTETICO'), { headers: { 'content-type': 'application/pdf' } });
        if (String(url).includes('/certidao/req-1')) return jsonResponse({ situacao: 'Emitida', validade: '2026-12-31' });
        return jsonResponse({ protocolo: 'req-1' });
      }
    });
    const federal = createCndFederalIssuer({
      transport,
      credentials: { apiKey: 'chave-sintetica' },
      baseUrl: 'https://serpro.example.test'
    });
    assert.equal((await federal.describeReadiness()).ready, true);
    const request = await federal.requestCertificate({ subjectType: 'CNPJ', subjectId: CNPJ });
    assert.equal(request.status, CERTIFICATE_STATUS.PROCESSING);
    const status = await federal.checkStatus(request.requestId);
    assert.equal(status.status, CERTIFICATE_STATUS.ISSUED);
    const artifact = await federal.downloadCertificate(request.requestId);
    assert.equal(artifact.mimeType, 'application/pdf');
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);

    const cndt = createCndtIssuer({ driver: fixtureDriver() });
    const stateIssuer = createStateCertificateIssuer({ driver: fixtureDriver({ pdf: 'CERTIDAO TJRS SINTETICA' }) });
    assert.equal((await cndt.requestCertificate({ subjectType: 'CNPJ', subjectId: CNPJ })).status, CERTIFICATE_STATUS.PROCESSING);
    const stateArtifact = await stateIssuer.downloadCertificate('req-1');
    assert.match(stateArtifact.sha256, /^[a-f0-9]{64}$/);
  }

  console.log('[C5] Due diligence agregada: isolamento por emissor e artefatos cifrados...');
  {
    assert.throws(
      () => createDueDiligenceService({ env: {} }),
      error => error.code === 'DISABLED' && error.humanAction.includes('BETA_DUE_DILIGENCE')
    );
    assert.throws(
      () => createDueDiligenceService({ env: { BETA_DUE_DILIGENCE: 'true' } }),
      error => error.code === 'DISABLED' && error.humanAction.includes('BETA_DISABLE_AUTOMATIONS'),
      'Lote de certidões exige opt-in explícito de automação.'
    );
    const ddCase = createDueDiligenceCase({
      caseId: 'dd-teste-1',
      clientRef: 'cliente-teste',
      subject: { subjectType: 'CNPJ', subjectId: CNPJ },
      issuerIds: ['cnd-federal', 'cndt', 'tjrs-distribuicao']
    });
    assert.equal(ddCase.status, DD_STATUS.PENDING);
    assert.throws(
      () => createDueDiligenceCase({ subject: { subjectType: 'CNPJ', subjectId: CNPJ }, issuerIds: [] }),
      error => error.code === 'INVALID_ARGUMENT'
    );

    const security = new SecurityManager({
      dataDirectory: path.join(tempRoot, 'ws-dd'),
      sessionSecret: randomBytes(32).toString('base64url'),
      encryptionKey: randomBytes(32).toString('base64'),
      secureCookies: false
    });
    await security.init();
    const store = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-dd'), securityManager: security });
    await store.init();
    try {
      const service = createDueDiligenceService({
        env: { BETA_DUE_DILIGENCE: 'true', BETA_DISABLE_AUTOMATIONS: 'false' },
        registry: createDefaultCertificateRegistry({
          env: {},
          cndtDriver: fixtureDriver(),
          stateDriver: fixtureDriver({ pdf: 'CERTIDAO TJRS SINTETICA' })
        }),
        store
      });
      const outcome = await service.run(ddCase);
      assert.equal(outcome.case.status, DD_STATUS.PARTIAL);
      assert.deepEqual(outcome.case.summary, { total: 3, issued: 2, humanRequired: 1, failed: 0, unsupported: 0 });
      assert.equal(outcome.artifacts.length, 2);
      assert.equal(outcome.requests.every(request => request.subjectMasked === '**********0181'), true);
      assert.equal(outcome.requests.some(request => request.humanAction), true);
      const storedArtifacts = store.list('certificate_artifact', { lookup: `cndt:CNPJ:${CNPJ}` });
      assert.equal(storedArtifacts.length, 1);
      assert.match(storedArtifacts[0].sha256, /^[a-f0-9]{64}$/);
      const storedRequest = store.list('certificate_request', { lookup: `cndt:CNPJ:${CNPJ}` });
      assert.equal(storedRequest.length, 1);
    } finally {
      store.close();
    }
    const raw = await readFile(path.join(tempRoot, 'ws-dd', 'beta', 'ji-beta-v1.sqlite'), 'utf8').catch(() => '');
    assert.equal(raw.includes(CNPJ), false, 'Titular nunca aparece em claro no armazenamento beta.');

    const isolated = await runDueDiligenceCase({
      ddCase: createDueDiligenceCase({
        caseId: 'dd-teste-2',
        subject: { subjectType: 'CNPJ', subjectId: CNPJ },
        issuerIds: ['cndt', 'tjrs-distribuicao']
      }),
      registry: createDefaultCertificateRegistry({
        env: {},
        cndtDriver: fixtureDriver({ failRequest: true }),
        stateDriver: fixtureDriver()
      }),
      env: { BETA_DUE_DILIGENCE: 'true', BETA_DISABLE_AUTOMATIONS: 'false' }
    });
    assert.equal(isolated.case.summary.failed, 1);
    assert.equal(isolated.case.summary.issued, 1);
    assert.equal(isolated.case.status, DD_STATUS.PARTIAL);
    assert.equal(isolated.requests.find(request => request.issuer === 'cndt').errorClass, 'UNAVAILABLE');

    const allHuman = await runDueDiligenceCase({
      ddCase: createDueDiligenceCase({
        caseId: 'dd-teste-3',
        subject: { subjectType: 'CNPJ', subjectId: CNPJ },
        issuerIds: ['cnd-federal']
      }),
      registry: createDefaultCertificateRegistry({ env: {} }),
      env: { BETA_DUE_DILIGENCE: 'true', BETA_DISABLE_AUTOMATIONS: 'false' }
    });
    assert.equal(allHuman.case.status, DD_STATUS.HUMAN_REQUIRED);
  }

  console.log('✓ Certidões: registry, emissores, human_required, ciclo completo e isolamento aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-ji-certificates-')) {
    throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
