import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createJudicialIntegrationsFeature } from '../js/features/judicial-integrations.js';
import { postJson, startTestServer } from './helpers.mjs';

const PFX_MARKER = 'SYNTHETIC_PFX_SECRET_MARKER';
const TOTP_MARKER = 'SYNTHETIC_TOTP_SECRET_MARKER';
const PASSPHRASE_MARKER = 'SYNTHETIC_PASSPHRASE_MARKER';
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');

const moduleSource = readFileSync(new URL('../js/features/judicial-integrations.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
const portalHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createJudicialIntegrationsFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
assert.doesNotMatch(moduleSource, /\bStore\b|localStorage|sessionStorage/);
assert.match(portalSource, /refreshJudicialStatus\(showError = false\) \{ return getJudicialIntegrationsFeature\(\)\.refreshStatus\(showError\); \}/);
assert.match(portalSource, /saveCertificate\(event\) \{ return getJudicialIntegrationsFeature\(\)\.saveCertificate\(event\); \}/);
assert.doesNotMatch(portalSource, /byId\('certificateGuideButton'\)|getElementById\('certificateGuideButton'\)/);
assert.match(portalHtml, /id="savePortalCoverageButton"/);
assert.match(moduleSource, /savePortalCoverageButton/);
assert.match(portalHtml, /id="launchPortalLoginButton"/);
assert.match(moduleSource, /launchPortalLoginButton/);
assert.match(portalHtml, /certificado válido não significa sessão autenticada/i);

const listenerIds = [
  'certificateGuideButton', 'judicialSetupClose', 'judicialSetupBackdrop', 'certificateFileInput',
  'certificateSetupForm', 'portalQrInput', 'portalTotpForm', 'removePortalTotpButton',
  'resetJudicialConnectionsButton', 'savePortalCoverageButton', 'syncJudicialNowButton', 'launchPortalLoginButton', 'portalCoverageList'
];
const listenerCounts = new Map();
const listenerElements = new Map(listenerIds.map(id => [id, {
  addEventListener(type) { listenerCounts.set(`${id}:${type}`, (listenerCounts.get(`${id}:${type}`) || 0) + 1); }
}]));
let initRequests = 0;
const initFeature = createJudicialIntegrationsFeature({
  documentRef: { getElementById: id => listenerElements.get(id) || null },
  windowRef: {},
  secureFetch: async () => { initRequests++; throw new Error('não deveria consultar automaticamente'); }
});
assert.equal(initFeature.init(), true);
assert.equal(initFeature.init(), false);
assert.equal(initRequests, 0);
for (const id of listenerIds) assert.equal(listenerCounts.get(`${id}:${id.includes('Form') ? 'submit' : id.includes('Input') ? 'change' : 'click'}`), 1);

function createQrDocument() {
  const elements = {
    portalQrStatus: { textContent: '' },
    portalTotpSecret: { value: '' },
    portalTotpCode: { focus() {} }
  };
  return {
    elements,
    documentRef: {
      getElementById: id => elements[id] || null,
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })
        })
      })
    }
  };
}

const jsQrFixture = createQrDocument();
class SyntheticImage {
  set src(_value) {
    this.naturalWidth = 2;
    this.naturalHeight = 2;
    queueMicrotask(() => this.onload?.());
  }
}
const jsQrFeature = createJudicialIntegrationsFeature({
  documentRef: jsQrFixture.documentRef,
  windowRef: {
    Image: SyntheticImage,
    URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
    jsQR: () => ({ data: TOTP_MARKER })
  },
  secureFetch: async url => ({
    ok: true,
    async json() {
      assert.equal(url, '/api/integrations/judicial/totp/parse');
      return { type: 'single', account: { secret: TOTP_MARKER, name: 'Conta Sintética', issuer: 'Tribunal Sintético', digits: 6 } };
    }
  })
});
await jsQrFeature.readPortalQr({ name: 'qr-jsqr.png' });
assert.equal(jsQrFixture.elements.portalTotpSecret.value, '', 'Segredo extraído do QR não deve permanecer no DOM.');

const barcodeFixture = createQrDocument();
const warnings = [];
const barcodeFeature = createJudicialIntegrationsFeature({
  documentRef: barcodeFixture.documentRef,
  windowRef: {
    Image: SyntheticImage,
    URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
    jsQR: () => { throw new Error(TOTP_MARKER); },
    BarcodeDetector: class { async detect() { return [{ rawValue: 'SYNTHETIC_BARCODE_SECRET_MARKER' }]; } },
    createImageBitmap: async () => ({ close() {} })
  },
  secureFetch: async url => ({
    ok: true,
    async json() {
      assert.equal(url, '/api/integrations/judicial/totp/parse');
      return { type: 'single', account: { secret: 'JBSWY3DPEHPK3PXP', name: 'Conta Barcode', issuer: 'Tribunal Barcode', digits: 6 } };
    }
  }),
  warn: message => warnings.push(message)
});
await barcodeFeature.readPortalQr({ name: 'qr-barcode.png' });
assert.equal(barcodeFixture.elements.portalTotpSecret.value, '');
assert.equal(JSON.stringify(warnings).includes(TOTP_MARKER), false);

const failedQrFixture = createQrDocument();
const failedQrToasts = [];
const failedQrFeature = createJudicialIntegrationsFeature({
  documentRef: failedQrFixture.documentRef,
  windowRef: {},
  secureFetch: async () => { throw new Error('não deveria consultar'); },
  showToast: (message, type) => failedQrToasts.push({ message, type })
});
failedQrFixture.elements.portalTotpSecret.value = TOTP_MARKER;
await failedQrFeature.readPortalQr({ name: 'qr-invalido.png' });
assert.equal(failedQrFixture.elements.portalTotpSecret.value, '');
assert.ok(failedQrToasts.some(item => item.type === 'error'));

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{ name: session.cookie.slice(0, separator), value: session.cookie.slice(separator + 1), url: server.baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const fixture = {
    certificate: {
      valid: true, accessible: true, status: 'operational', fileName: 'synthetic.pfx',
      summary: { holder: 'Titular Sintético', documentMasked: '***.000.***-**', issuer: 'AC Sintética, ICP-Brasil', notAfter: '2027-08-29T00:00:00.000Z' }
    },
    pjeOffice: { available: true },
    interactiveCollectorRunning: false,
    portals: [
      { id: 'portal-a', name: 'Portal A Sintético', group: 'Justiça Sintética', enabled: true, supportsTotp: true, totpConfigured: true, system: 'PJe', automationLevel: 'stable' },
      { id: 'portal-b', name: 'Portal B Sintético', group: 'Justiça Sintética', enabled: false, supportsTotp: true, totpConfigured: false, system: 'eproc', automationLevel: 'experimental' },
      { id: 'portal-c', name: 'Portal C Sintético', group: 'Outros tribunais', enabled: false, supportsTotp: false, certificateMode: 'windows', automationLevel: 'stable' }
    ]
  };
  const coverage = await page.evaluate(async statusFixture => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const requests = [];
    const audits = [];
    const toasts = [];
    const makeResponse = (ok, payload) => ({ ok, async json() { return payload; } });
    store.audit = (action, detail) => audits.push({ action, detail });
    app.toast = (message, type) => toasts.push({ message, type });
    app.syncAll = async () => {};
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
      if (url === '/api/integrations/judicial') return makeResponse(true, statusFixture);
      if (url.endsWith('/reset')) return makeResponse(true, { certificatePreserved: true });
      if (url.endsWith('/a1/sandbox')) return makeResponse(true, { sandbox: { operational: true, steps: [{ id: 'pfxFile', name: 'Arquivo PFX', status: 'OK' }] } });
      return makeResponse(true, { ok: true });
    };

    await app.refreshJudicialStatus(true);
    const rendered = {
      status: document.getElementById('certificateIntegrationStatus').textContent,
      statusClass: document.getElementById('certificateIntegrationStatus').className,
      badge: document.getElementById('certificateFileBadge').textContent,
      holder: document.getElementById('a1HolderName').textContent,
      coverageRows: document.querySelectorAll('[data-portal-enabled]').length,
      enabled: [...document.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value),
      totpOptions: [...document.getElementById('totpPortalSelect').options].map(option => ({ value: option.value, text: option.textContent }))
    };

    await app.openJudicialSetup();
    document.getElementById('portalTotpSecret').value = 'SECRET_TO_CLEAR';
    document.getElementById('portalTotpCode').value = '123456';
    document.getElementById('certificatePassphrase').value = 'PASSPHRASE_TO_CLEAR';
    app.closeJudicialSetup();
    const cleanup = {
      secret: document.getElementById('portalTotpSecret').value,
      code: document.getElementById('portalTotpCode').value,
      passphrase: document.getElementById('certificatePassphrase').value
    };

    document.querySelector('[data-portal-enabled][value="portal-a"]').checked = false;
    document.querySelector('[data-portal-enabled][value="portal-b"]').checked = true;
    await app.savePortalCoverage();
    await app.launchAssistedSession(document.getElementById('launchPortalLoginButton'));
    document.getElementById('totpPortalSelect').value = 'portal-a';
    document.getElementById('portalTotpSecret').value = 'SYNTHETIC_TOTP_SECRET_MARKER';
    document.getElementById('portalTotpCode').value = '123456';
    await app.savePortalTotp({ preventDefault() {}, currentTarget: document.getElementById('portalTotpForm') });
    document.getElementById('totpPortalSelect').value = 'portal-a';
    await app.removePortalTotp();

    window.confirm = () => false;
    await app.resetJudicialConnections();
    const resetBeforeConfirm = requests.filter(item => item.url.endsWith('/reset')).length;
    window.confirm = () => true;
    await app.resetJudicialConnections();

    await app.testA1Sandbox();
    let syncCalls = 0;
    app.syncAll = async () => { syncCalls++; return true; };
    await app.syncJudicialNow();

    return { rendered, cleanup, requests, audits, toasts, resetBeforeConfirm, syncCalls };
  }, fixture);

  const validation = await page.evaluate(async () => {
    const app = window.portalApp;
    const toasts = [];
    app.toast = (message, type) => toasts.push({ message, type });
    await app.saveCertificate({ preventDefault() {}, currentTarget: document.getElementById('certificateSetupForm') });
    document.getElementById('portalTotpCode').value = '12345';
    await app.savePortalTotp({ preventDefault() {}, currentTarget: document.getElementById('portalTotpForm') });
    return toasts;
  });

  await page.locator('#certificateFileInput').setInputFiles({ name: 'synthetic.pfx', mimeType: 'application/x-pkcs12', buffer: Buffer.from(PFX_MARKER) });
  await page.evaluate(marker => { document.getElementById('certificatePassphrase').value = marker; }, PASSPHRASE_MARKER);
  const certificate = await page.evaluate(async () => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const requests = [];
    const audits = [];
    const makeResponse = (ok, payload) => ({ ok, async json() { return payload; } });
    store.audit = (action, detail) => audits.push({ action, detail });
    app.toast = () => {};
    app.syncAll = async () => {};
    app.refreshJudicialStatus = async () => {};
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return makeResponse(true, { ok: true });
    };
    await app.saveCertificate({ preventDefault() {}, currentTarget: document.getElementById('certificateSetupForm') });
    return { requests, audits, storeHasSecret: JSON.stringify(store.state).includes('SYNTHETIC_') };
  });

  await page.locator('#certificateFileInput').setInputFiles({ name: 'too-large.pfx', mimeType: 'application/x-pkcs12', buffer: Buffer.alloc(5_000_001, 1) });
  await page.evaluate(marker => { document.getElementById('certificatePassphrase').value = marker; }, PASSPHRASE_MARKER);
  const tooLarge = await page.evaluate(async () => {
    const app = window.portalApp;
    const toasts = [];
    let requests = 0;
    app.toast = (message, type) => toasts.push({ message, type });
    window.KellerAuth.secureFetch = async () => { requests++; throw new Error('não deveria chamar'); };
    await app.saveCertificate({ preventDefault() {}, currentTarget: document.getElementById('certificateSetupForm') });
    return { toasts, requests };
  });

  await page.locator('#portalQrInput').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  const qr = await page.evaluate(async () => {
    const app = window.portalApp;
    const input = document.getElementById('portalQrInput');
    const file = input.files[0];
    const toasts = [];
    app.toast = (message, type) => toasts.push({ message, type });
    window.BarcodeDetector = class { async detect() { return [{ rawValue: 'JBSWY3DPEHPK3PXP' }]; } };
    window.createImageBitmap = async () => ({ close() {} });
    window.KellerAuth.secureFetch = async url => ({
      ok: true,
      async json() {
        if (url.endsWith('/totp/parse')) return { type: 'single', account: { secret: 'JBSWY3DPEHPK3PXP', name: 'Conta Sintética', issuer: 'Tribunal Sintético', digits: 6 } };
        return { ok: true };
      }
    });
    await app.readPortalQr(file);
    const barcodeSecret = document.getElementById('portalTotpSecret').value;
    const barcodeStatus = document.getElementById('portalQrStatus').textContent;
    delete window.BarcodeDetector;
    await app.readPortalQr(file);
    const failureSecret = document.getElementById('portalTotpSecret').value;
    return { barcodeSecret, barcodeStatus, failureSecret, toasts };
  });

  assert.equal(coverage.rendered.status, 'A1 Operacional · 1 2FA');
  assert.equal(coverage.rendered.badge, 'A1 OPERATIONAL');
  assert.equal(coverage.rendered.holder, 'Titular Sintético');
  assert.equal(coverage.rendered.coverageRows, 3);
  assert.deepEqual(coverage.rendered.enabled, ['portal-a']);
  assert.deepEqual(coverage.cleanup, { secret: '', code: '', passphrase: '' });
  assert.deepEqual(coverage.requests.find(item => item.url.endsWith('/portals')).body, { enabledIds: ['portal-b'] });
  assert.deepEqual(coverage.requests.find(item => item.url.endsWith('/connect')).body, { portalIds: ['portal-a'] });
  assert.deepEqual(coverage.requests.find(item => item.url.endsWith('/2fa') && !item.body.remove).body, { portalId: 'portal-a', secret: TOTP_MARKER, code: '123456' });
  assert.deepEqual(coverage.requests.find(item => item.url.endsWith('/2fa') && item.body.remove).body, { portalId: 'portal-a', remove: true });
  assert.equal(coverage.resetBeforeConfirm, 0);
  assert.deepEqual(coverage.requests.find(item => item.url.endsWith('/reset')).body, { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
  assert.ok(coverage.requests.some(item => item.url.endsWith('/a1/sandbox') && item.method === 'POST'));
  assert.equal(coverage.syncCalls, 1);
  assert.ok(validation.some(item => item.message.includes('Selecione o PFX')));
  assert.ok(validation.some(item => item.message.includes('seis dígitos')));
  const certificateRequest = certificate.requests[0];
  assert.equal(certificateRequest.url, '/api/integrations/judicial/certificate');
  assert.equal(certificateRequest.method, 'POST');
  assert.equal(certificateRequest.body.fileName, 'synthetic.pfx');
  assert.equal(atobNode(certificateRequest.body.pfxBase64), PFX_MARKER);
  assert.equal(certificateRequest.body.passphrase, PASSPHRASE_MARKER);
  assert.equal(certificate.storeHasSecret, false);
  assert.equal(JSON.stringify(certificate.audits).includes(PASSPHRASE_MARKER), false);
  assert.equal(JSON.stringify(certificate.audits).includes(PFX_MARKER), false);
  assert.equal(tooLarge.requests, 0);
  assert.ok(tooLarge.toasts.some(item => item.message.includes('5 MB')));
  assert.equal(qr.barcodeSecret, '');
  assert.match(qr.barcodeStatus, /QR lido com sucesso/);
  assert.equal(qr.failureSecret, '');
  console.log('✓ Feature modular de integrações judiciais preservada (A1, mTLS sandbox, TOTP, QR, cobertura, reset e sync)');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

function atobNode(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.judicial.feature', displayName: 'Administradora Judicial Sintética', password: 'Judicial-Feature-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
