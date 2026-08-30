import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const STANDARD_SECRET = base32Encode(Buffer.from('Segredo padrão sintético do QR', 'utf8'));
const STANDARD_URI = `otpauth://totp/Tribunal%20Sintetico:conta%40example.test?secret=${STANDARD_SECRET}&issuer=Tribunal%20Sintetico&algorithm=SHA1&digits=6&period=30`;
const MIGRATION_ACCOUNTS = [
  syntheticAccount('Segredo migrado sintético A', 'Conta Judicial A', 'Tribunal Sintético A'),
  syntheticAccount('Segredo migrado sintético B', 'Conta Judicial B', 'Tribunal Sintético B')
];
const SINGLE_MIGRATION_URI = migrationUri([MIGRATION_ACCOUNTS[0]]);
const MULTI_MIGRATION_URI = migrationUri(MIGRATION_ACCOUNTS);
const HIGH_DENSITY_ACCOUNTS = Array.from({ length: 6 }, (_, index) => syntheticAccount(
  `Segredo denso sintético ${index}`,
  `Conta Judicial Sintética de Alta Densidade ${index} ${'X'.repeat(70)}`,
  `Tribunal Sintético de Integração ${index} ${'Y'.repeat(55)}`
));
const HIGH_DENSITY_URI = migrationUri(HIGH_DENSITY_ACCOUNTS);
const INVALID_IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64');

const [standardPng, singleMigrationPng, multiMigrationPng, highDensityPng] = await Promise.all([
  renderQr(STANDARD_URI, 640),
  renderQr(SINGLE_MIGRATION_URI, 720),
  renderQr(MULTI_MIGRATION_URI, 820),
  renderQr(HIGH_DENSITY_URI, 1200)
]);

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 900 } });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const jsQrCharacterization = await inspectEmbeddedJsQr(page, highDensityPng);
  const standardJsQrCharacterization = await inspectEmbeddedJsQr(page, standardPng);
  const highDensityVersion = QRCode.create(HIGH_DENSITY_URI, { errorCorrectionLevel: 'M' }).version;
  assert.equal(jsQrCharacterization.decoded, false, 'Caracterização deve registrar a falha do jsQR embarcado em resolução natural.');
  assert.equal(standardJsQrCharacterization.decoded, true, JSON.stringify(standardJsQrCharacterization));
  assert.ok(highDensityVersion >= 10, 'Fixture de alta densidade deve exercitar QR versionado complexo.');
  assert.ok(jsQrCharacterization.width >= 1000 && jsQrCharacterization.height >= 1000);

  const parsedStandard = await page.evaluate(async uri => {
    const response = await window.KellerAuth.secureFetch('/api/integrations/judicial/totp/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrData: uri })
    });
    return response.json();
  }, STANDARD_URI);
  assert.equal(parsedStandard.type, 'single');
  assert.equal(parsedStandard.account.secret, STANDARD_SECRET, 'Parser canônico deve preservar a Base32 sintética esperada.');

  const standardResult = await readQrImage(page, standardPng, 'totp-standard-sintetico.png', 'image/png');
  assert.equal(standardResult.errorToasts, 0, JSON.stringify(standardResult));
  assert.equal(standardResult.secretInput, '', 'Payload/segredo extraído do QR não pode permanecer no input DOM.');
  assert.equal(standardResult.accountFieldHidden, true, 'Conta única deve ser selecionada automaticamente em memória.');

  const standardSave = await savePendingTotp(page, generateTotp(STANDARD_SECRET));
  assert.equal(standardSave.successToasts, 1, 'Código sintético de seis dígitos deve ativar o TOTP.');
  assert.equal(standardSave.secretInput, '', 'Segredo deve ser descartado do formulário após persistência.');

  const jpegResult = await readQrImage(page, standardPng, 'totp-standard-sintetico.jpg', 'image/jpeg', true);
  assert.equal(jpegResult.errorToasts, 0, 'QR JPEG sintético deve ser lido localmente.');
  assert.equal(jpegResult.secretInput, '');

  const singleMigration = await readQrImage(page, singleMigrationPng, 'totp-migration-unico-sintetico.png', 'image/png');
  assert.equal(singleMigration.errorToasts, 0, 'otpauth-migration de conta única deve ser aceito.');
  assert.equal(singleMigration.accountFieldHidden, true);

  const multiMigration = await readQrImage(page, multiMigrationPng, 'totp-migration-multiplo-sintetico.png', 'image/png');
  assert.equal(multiMigration.errorToasts, 0);
  assert.equal(multiMigration.accountFieldHidden, false, 'Múltiplas contas devem exibir seleção explícita.');
  assert.equal(multiMigration.accountOptions.length, 3, 'Seletor deve conter placeholder e duas contas, sem segredos.');
  assert(multiMigration.accountOptions.some(label => label.includes('Tribunal Sintético B') && label.includes('Conta Judicial B')));
  assert(MIGRATION_ACCOUNTS.every(account => multiMigration.accountOptions.every(label => !label.includes(account.expectedSecret))), 'Opções não podem exibir Base32.');

  const missingSelection = await savePendingTotp(page, generateTotp(MIGRATION_ACCOUNTS[0].expectedSecret), '');
  assert.equal(missingSelection.successToasts, 0, 'Conta múltipla não pode selecionar account[0] silenciosamente.');
  assert.ok(missingSelection.messages.some(message => message.includes('Selecione também a conta')));

  const selectedMigration = await savePendingTotp(page, generateTotp(MIGRATION_ACCOUNTS[1].expectedSecret), '1');
  assert.equal(selectedMigration.successToasts, 1, 'Conta explicitamente selecionada deve ser validada.');

  const highDensity = await readQrImage(page, highDensityPng, 'totp-migration-alta-densidade-sintetico.png', 'image/png');
  assert.equal(highDensity.errorToasts, 0, 'QR de alta densidade deve sobreviver às tentativas locais determinísticas.');
  assert.equal(highDensity.accountOptions.length, HIGH_DENSITY_ACCOUNTS.length + 1);

  const invalidResult = await readQrImage(page, INVALID_IMAGE, 'imagem-sem-qr.png', 'image/png');
  assert.equal(invalidResult.errorToasts, 1, 'Imagem inválida deve falhar claramente.');
  assert.equal(invalidResult.secretInput, '');

  const secretMarkers = [STANDARD_SECRET, ...MIGRATION_ACCOUNTS.map(account => account.expectedSecret), ...HIGH_DENSITY_ACCOUNTS.map(account => account.expectedSecret)];
  const browserResidue = await page.evaluate(markers => {
    const storeText = JSON.stringify(window.Atrium.Store.state);
    const localText = Object.entries(localStorage).map(([key, value]) => `${key}:${value}`).join('|');
    const sessionText = Object.entries(sessionStorage).map(([key, value]) => `${key}:${value}`).join('|');
    const domText = document.documentElement.innerHTML;
    return markers.some(marker => storeText.includes(marker) || localText.includes(marker) || sessionText.includes(marker) || domText.includes(marker));
  }, secretMarkers);
  assert.equal(browserResidue, false, 'Segredo sintético não pode permanecer em Store, storage ou DOM.');

  const encryptedSecrets = await readFile(path.join(server.dataDirectory, 'judicial-integrations.json'), 'utf8');
  assert.match(encryptedSecrets, /"encrypted"\s*:/, 'Secret store judicial deve usar envelope cifrado.');
  for (const marker of secretMarkers) {
    assert.equal(encryptedSecrets.includes(marker), false, 'Secret store não pode conter Base32 em plaintext.');
    assert.equal(server.output().includes(marker), false, 'Logs do servidor não podem conter Base32.');
  }

  console.log('✓ QR TOTP sintético aprovado: PNG/JPEG, migration, alta densidade, seleção múltipla, código e secret store cifrado.');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function renderQr(payload, width) {
  return QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width });
}

async function inspectEmbeddedJsQr(page, pngBuffer) {
  return page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return { decoded: Boolean(result?.data), version: result?.version || 0, width: canvas.width, height: canvas.height };
  }, pngBuffer.toString('base64'));
}

async function readQrImage(page, pngBuffer, name, mimeType, convertToJpeg = false) {
  return page.evaluate(async ({ base64, name: fileName, mimeType: requestedMime, convertToJpeg: shouldConvert }) => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    let blob = new Blob([bytes], { type: 'image/png' });
    if (shouldConvert) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.96));
    }
    const file = new File([blob], fileName, { type: requestedMime });
    const app = window.portalApp;
    const toasts = [];
    const originalToast = app.toast;
    app.toast = (message, type = '') => toasts.push({ message, type });
    try {
      await app.readPortalQr(file);
      const accountField = document.getElementById('portalTotpAccountField');
      return {
        errorToasts: toasts.filter(item => item.type === 'error').length,
        messages: toasts.map(item => item.message),
        secretInput: document.getElementById('portalTotpSecret').value,
        accountFieldHidden: accountField.classList.contains('hidden'),
        accountOptions: [...document.getElementById('portalTotpAccountSelect').options].map(option => option.textContent),
        status: document.getElementById('portalQrStatus').textContent
      };
    } finally {
      app.toast = originalToast;
    }
  }, { base64: pngBuffer.toString('base64'), name, mimeType, convertToJpeg });
}

async function savePendingTotp(page, code, selectedAccount = null) {
  return page.evaluate(async ({ code: currentCode, selectedAccount: accountIndex }) => {
    const app = window.portalApp;
    const portalSelect = document.getElementById('totpPortalSelect');
    portalSelect.innerHTML = '<option value="pje-custom">Portal Judicial Sintético</option>';
    portalSelect.value = 'pje-custom';
    if (accountIndex !== null) document.getElementById('portalTotpAccountSelect').value = accountIndex;
    document.getElementById('portalTotpCode').value = currentCode;
    const toasts = [];
    const originalToast = app.toast;
    app.toast = (message, type = '') => toasts.push({ message, type });
    try {
      await app.savePortalTotp({ preventDefault() {}, currentTarget: document.getElementById('portalTotpForm') });
      return {
        successToasts: toasts.filter(item => item.type === 'success').length,
        messages: toasts.map(item => item.message),
        secretInput: document.getElementById('portalTotpSecret').value
      };
    } finally {
      app.toast = originalToast;
    }
  }, { code, selectedAccount });
}

function syntheticAccount(secretText, name, issuer) {
  const secret = Buffer.from(secretText, 'utf8');
  return { secret, name, issuer, expectedSecret: base32Encode(secret) };
}

function migrationUri(accounts) {
  const accountMessages = accounts.map(account => fieldBytes(1, Buffer.concat([
    fieldBytes(1, account.secret),
    fieldBytes(2, Buffer.from(account.name, 'utf8')),
    fieldBytes(3, Buffer.from(account.issuer, 'utf8')),
    fieldVarint(4, 1),
    fieldVarint(5, 1),
    fieldVarint(6, 2)
  ])));
  const payload = Buffer.concat([...accountMessages, fieldVarint(2, 1), fieldVarint(3, 1), fieldVarint(4, 0), fieldVarint(5, 1)]);
  return `otpauth-migration://offline?data=${encodeURIComponent(payload.toString('base64'))}`;
}

function fieldBytes(fieldNumber, value) {
  return Buffer.concat([encodeVarint((fieldNumber << 3) | 2), encodeVarint(value.length), value]);
}

function fieldVarint(fieldNumber, value) {
  return Buffer.concat([encodeVarint(fieldNumber << 3), encodeVarint(value)]);
}

function encodeVarint(input) {
  let value = Number(input);
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.qr.synthetic',
    displayName: 'Administradora QR Sintética',
    password: 'Senha-QR-Sintetica-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
