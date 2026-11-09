import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticateEprocWithCredentials } from '../collector/adapters/eproc.mjs';
import { lookupSiblingDegreeTotp } from '../lib/judicial/credential-manager.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL_URL = 'https://eproc.example/jus.br/eproc/externo_controlador.php?acao=SSO/login';
const CREDENTIALS = Object.freeze({
  username: 'USUARIO-SINTETICO',
  password: 'SENHA-SINTETICA',
  totpSecret: 'JBSWY3DPEHPK3PXP'
});

function pass(message) {
  console.log(`ok - ${message}`);
}

function fakeLocator(selector, page) {
  const visible = () => {
    if (selector === '#otp') return page.state.otpVisible;
    if (page.native) return ['#txtUsuario', '#pwdSenha', '#sbmEntrar'].includes(selector);
    return ['#kc-login', '#username', '#password'].includes(selector);
  };
  return {
    first() { return this; },
    async count() { return visible() ? 1 : 0; },
    async isVisible() { return visible(); },
    async waitFor(options = {}) {
      if (options?.state === 'visible' && !visible()) throw new Error('timeout');
    },
    async fill(value) { page.calls.fills.push({ selector, value }); },
    async click() {
      page.calls.clicks.push(selector);
      if (['#kc-login', '#sbmEntrar'].includes(selector) && page.state.otpFilled) page.state.otpVisible = false;
    },
    async press(key) { page.calls.presses.push({ selector, key }); },
    async pressSequentially(value) { page.calls.typed.push({ selector, value }); }
  };
}

function fakePage({ sessionActive = [false, true], captcha = {}, bodyText = '', otp = true, native = false, formGone = false } = {}) {
  const page = {
    native,
    calls: { goto: [], fills: [], typed: [], clicks: [], presses: [] },
    state: { otpVisible: otp, otpFilled: false, sessionChecks: 0, evaluateCalls: 0 },
    async goto(url) { page.calls.goto.push(url); },
    url() { return 'https://eproc.example/controlador.php?acao=painel_adv_listar&hash=deadbeef'; },
    locator(selector) { return fakeLocator(selector, page); },
    async evaluate() {
      const index = page.state.evaluateCalls++;
      if (index === 1 && formGone) return true;
      return index === 0 ? bodyText : '';
    },
    async waitForTimeout() {}
  };
  const originalFill = page.locator;
  page.locator = (selector) => {
    const locator = originalFill(selector);
    if (selector === '#otp') {
      const original = locator.fill.bind(locator);
      locator.fill = async (value) => { page.state.otpFilled = true; return original(value); };
    }
    return locator;
  };
  return page;
}

async function run() {
  console.log('=== TESTE FOCAL: LOGIN EPROC POR CONTA (USUARIO/SENHA + TOTP) ===\n');

  // 1. Contrato de higiene: credenciais ausentes falham antes de qualquer navegação
  await assert.rejects(
    () => authenticateEprocWithCredentials(fakePage(), PORTAL_URL, { password: 'x', totpSecret: CREDENTIALS.totpSecret }, { sleep: async () => {} }),
    (error) => error.code === 'EPROC_CREDENTIALS_MISSING'
  );
  pass('credenciais ausentes falham de forma tipada antes da rede');

  // 1b. Portal sem 2FA: conta com senha autentica sem TOTP
  {
    const page = fakePage({ otp: false });
    const sessionChecks = [false, true];
    const result = await authenticateEprocWithCredentials(page, PORTAL_URL, {
      username: CREDENTIALS.username,
      password: CREDENTIALS.password
    }, {
      sleep: async () => {},
      detectCaptcha: async () => ({}),
      isSessionActive: async () => sessionChecks.shift() ?? true
    });
    assert.equal(result.ok, true);
    assert.equal(page.calls.fills.filter((call) => call.selector === '#otp').length, 0);
    pass('portal sem 2FA autentica só com usuário e senha');
  }

  // 1c. Portal exige 2FA e não há segredo: erro tipado para revisão humana
  await assert.rejects(
    () => authenticateEprocWithCredentials(fakePage({ otp: true }), PORTAL_URL, {
      username: CREDENTIALS.username,
      password: CREDENTIALS.password
    }, {
      sleep: async () => {},
      detectCaptcha: async () => ({}),
      isSessionActive: async () => false
    }),
    (error) => error.code === 'AUTH-TOTP-REQUIRED' && error.humanRequired === true
  );
  pass('2FA exigido sem segredo gera AUTH-TOTP-REQUIRED');

  // 2. CAPTCHA no login: encerra com AUTH-CAPTCHA-REQUIRED e sem preencher nada
  {
    const page = fakePage();
    await assert.rejects(
      () => authenticateEprocWithCredentials(page, PORTAL_URL, CREDENTIALS, {
        sleep: async () => {},
        detectCaptcha: async () => ({ turnstile: true }),
        isSessionActive: async () => false
      }),
      (error) => error.code === 'AUTH-CAPTCHA-REQUIRED' && error.humanRequired === true
    );
    assert.equal(page.calls.fills.length, 0, 'CAPTCHA não pode gerar preenchimento');
    assert.equal(page.calls.typed.length, 0, 'CAPTCHA não pode gerar digitação de senha');
    pass('CAPTCHA no login encerra sem preencher credenciais (sem contorno)');
  }

  // 3. Sessão já ativa: nada é preenchido
  {
    const page = fakePage();
    const result = await authenticateEprocWithCredentials(page, PORTAL_URL, CREDENTIALS, {
      sleep: async () => {},
      detectCaptcha: async () => ({}),
      isSessionActive: async () => true
    });
    assert.equal(result.ok, true);
    assert.equal(page.calls.fills.length, 0);
    assert.equal(page.calls.typed.length, 0);
    pass('sessão já ativa retorna CONNECTED sem tocar no formulário');
  }

  // 4. Fluxo completo: usuário + senha na mesma página, TOTP e sessão confirmada
  {
    const page = fakePage();
    const sessionChecks = [false, true];
    const result = await authenticateEprocWithCredentials(page, PORTAL_URL, CREDENTIALS, {
      sleep: async () => {},
      detectCaptcha: async () => ({}),
      isSessionActive: async () => sessionChecks.shift() ?? true
    });
    assert.equal(result.ok, true);
    assert.equal(result.state, 'CONNECTED');
    assert.deepEqual(page.calls.goto, [PORTAL_URL]);
    assert.equal(page.calls.fills[0].selector, '#username');
    assert.equal(page.calls.fills[0].value, CREDENTIALS.username);
    assert.equal(page.calls.typed[0].selector, '#password');
    assert.equal(page.calls.typed[0].value, CREDENTIALS.password);
    const otpFill = page.calls.fills.find((call) => call.selector === '#otp');
    assert.match(otpFill.value, /^\d{6}$/, 'TOTP deve ser código de 6 dígitos');
    assert.ok(page.calls.clicks.includes('#kc-login'), 'submit oficial do SSO deve ser clicado');
    pass('fluxo real: usuário, senha, TOTP de 6 dígitos e sessão confirmada');
  }

  // 4b. Fluxo nativo (txtUsuario/pwdSenha/sbmEntrar) sem 2FA
  {
    const page = fakePage({ native: true, otp: false });
    const sessionChecks = [false, true];
    const result = await authenticateEprocWithCredentials(page, PORTAL_URL, {
      username: CREDENTIALS.username,
      password: CREDENTIALS.password
    }, {
      sleep: async () => {},
      detectCaptcha: async () => ({}),
      isSessionActive: async () => sessionChecks.shift() ?? true
    });
    assert.equal(result.ok, true);
    assert.ok(page.calls.fills.some((call) => call.selector === '#txtUsuario'));
    assert.ok(page.calls.typed.some((call) => call.selector === '#pwdSenha'));
    assert.ok(page.calls.clicks.includes('#sbmEntrar'), 'botão nativo Entrar deve ser clicado');
    pass('fluxo nativo (txtUsuario/pwdSenha/sbmEntrar) autentica sem TOTP');
  }

  // 4c. Credencial recusada: formulário saiu de cena e nenhuma sessão confirmada
  {
    const page = fakePage({ native: true, otp: false, formGone: true });
    await assert.rejects(
      () => authenticateEprocWithCredentials(page, PORTAL_URL, {
        username: CREDENTIALS.username,
        password: CREDENTIALS.password
      }, {
        sleep: async () => {},
        detectCaptcha: async () => ({}),
        isSessionActive: async () => false
      }),
      (error) => error.code === 'AUTH-CREDENTIALS-INVALID' && error.humanRequired === true
    );
    pass('sessão não confirmada após submit gera AUTH-CREDENTIALS-INVALID (nunca sucesso presumido)');
  }

  // 4d. TOTP é por tribunal: 1G/2G e a família TRF4 compartilham o vínculo
  {
    const shared = lookupSiblingDegreeTotp({ 'eproc-tjrs-1g': { secret: 'SINTETICO-TJRS' } }, 'tjrs-eproc-2g');
    assert.equal(shared?.secret, 'SINTETICO-TJRS');
    const region = lookupSiblingDegreeTotp({ 'jfrs-eproc-1g': { secret: 'SINTETICO-TRF4' } }, 'trf4-eproc-2g');
    assert.equal(region?.secret, 'SINTETICO-TRF4');
    pass('TOTP compartilhado por tribunal (1G/2G) e família TRF4 é resolvido no cofre');
  }

  // 5. Credenciais inválidas: erro tipado sem retry infinito
  {
    const page = fakePage({ bodyText: 'Nome de usuário ou senha inválida.' });
    await assert.rejects(
      () => authenticateEprocWithCredentials(page, PORTAL_URL, CREDENTIALS, {
        sleep: async () => {},
        detectCaptcha: async () => ({}),
        isSessionActive: async () => false
      }),
      (error) => error.code === 'AUTH-CREDENTIALS-INVALID' && error.humanRequired === true
    );
    pass('credenciais recusadas pelo tribunal geram erro tipado para revisão humana');
  }

  // 6. Contrato do wiring no downloader/varredura: modo credenciais sem certificado
  {
    const source = await readFile(path.join(ROOT, 'lib', 'judicial', 'eproc-a1-downloader.mjs'), 'utf8');
    assert.match(source, /authenticateEprocWithCredentials/, 'downloader deve importar o login por conta');
    assert.match(source, /hasUsableCertificate/, 'download e varredura devem decidir entre A1 e conta');
    assert.match(source, /credentialsAuthFn/, 'varredura deve ter o caminho de credenciais');
    assert.match(source, /clientCertificates: clientCerts\.length \? clientCerts : undefined/, 'sem certificado não pode enviar lista vazia de certificados');
    assert.match(source, /const authFn = hasUsableCertificate\s*\?\s*\(deps\.authenticateEprocWithCertAndTotp/, 'download deve escolher o login pelo modo de credencial (bug latente corrigido)');
    assert.match(source, /const authFn = deps\.authenticateEprocWithCertAndTotp/, 'varredura deve manter o login A1 injetável');
    assert.doesNotMatch(source, /if \(!certPath \|\| !existsSync\(certPath\)\) \{\s*throw/, 'certificado não pode continuar obrigatório quando há conta configurada');
    pass('wiring: download e varredura preferem A1 e caem para conta sem certificado');
  }

  console.log('\n=== TODOS OS TESTES DE LOGIN POR CONTA DO EPROC PASSARAM ===');
}

await run();
