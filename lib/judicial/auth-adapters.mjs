import { generateTotp } from '../security.mjs';

export const AUTH_STRATEGIES = {
  PUBLIC: 'public',
  TOTP: 'totp',
  USERNAME_PASSWORD_TOTP: 'username-password-plus-totp',
  CREDENTIALS_TOTP: 'credentials-totp',
  CLIENT_CERT_MTLS: 'client-cert-mtls',
  PJEOFFICE_LOCAL: 'pjeoffice-local',
  WINDOWS_STORE: 'windows-store',
  INTERACTIVE_HUMAN_REQUIRED: 'interactive-human-required',
  MANUAL_PERSISTENT_SESSION: 'manual-persistent-session'
};

export class BaseAuthAdapter {
  constructor(strategy) {
    this.strategy = strategy;
  }

  async authenticate(context, page, portal, credentials) {
    throw new Error(`Método authenticate() não implementado para a estratégia ${this.strategy}.`);
  }

  async validateSession(page, portal) {
    return true;
  }
}

export class PublicAuthAdapter extends BaseAuthAdapter {
  constructor() {
    super(AUTH_STRATEGIES.PUBLIC);
  }

  async authenticate() {
    return { ok: true, strategy: this.strategy, authenticated: true };
  }

  async validateSession() {
    return true;
  }
}

export class ClientCertMtlsAuthAdapter extends BaseAuthAdapter {
  constructor() {
    super(AUTH_STRATEGIES.CLIENT_CERT_MTLS);
  }

  async authenticate(context, page, portal, credentials = {}) {
    const targetUrl = portal.url || 'https://eproc1g.tjrs.jus.br/eproc/';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1_500);

    const isEproc = portal?.strategy === 'eproc' || portal?.system === 'eproc' || /eproc/i.test(portal?.name || targetUrl);
    if (isEproc) {
      const hasLogout = await page.locator('a[href*="acao=usuario_sair"], a:has-text("Sair"), #lnkInfraSair').count().catch(() => 0);
      const hasPainel = await page.locator('a[href*="acao=painel_adv_listar"]').count().catch(() => 0);
      if (hasLogout > 0 || hasPainel > 0) return { ok: true, strategy: this.strategy, authenticated: true };

      const certLoginBtn = page.locator('#kc-login-certificate, button[name="loginCertificate"], button:has-text("Certificado Digital"), a:has-text("Certificado Digital")').first();
      if (await certLoginBtn.count() > 0 && await certLoginBtn.isVisible().catch(() => false)) {
        await certLoginBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(2_000);
      }

      const totpInput = page.locator('#otp, input[name="otp"], input[name="totp"], input[name="code"], input[placeholder*="código" i]').first();
      if (await totpInput.count() > 0 && await totpInput.isVisible().catch(() => false)) {
        const secret = credentials?.totpSecret;
        if (!secret) {
          throw Object.assign(new Error('Segundo fator exigido pelo tribunal, mas nenhum segredo TOTP foi configurado para este portal.'), {
            errorCode: 'AUTH-TOTP-REQUIRED',
            humanRequired: true
          });
        }
        const code = generateTotp(secret);
        await totpInput.fill(code);
        await page.waitForTimeout(300);

        const submitBtn = page.locator('#kc-login, input[type="submit"], button[type="submit"]').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
        } else {
          await totpInput.press('Enter');
        }
        await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(2_000);
      }
    }

    return { ok: true, strategy: this.strategy };
  }

  async validateSession(page, portal) {
    const content = await page.textContent('body').catch(() => '');
    if (content.includes('403 Forbidden') || content.includes('Certificado Inválido') || content.includes('Código inválido')) {
      return false;
    }
    const isEproc = portal?.strategy === 'eproc' || portal?.system === 'eproc' || /eproc/i.test(portal?.name || portal?.url || '');
    if (isEproc) {
      const url = page.url();
      if (url.includes('keycloak') || url.includes('/login') || url.includes('openid-connect')) return false;
      const hasLoginBtn = await page.locator('#kc-login-certificate, #kc-form-login, #frm-login').count().catch(() => 0);
      if (hasLoginBtn > 0) return false;
    }
    return true;
  }
}

export class PjeOfficeAuthAdapter extends BaseAuthAdapter {
  constructor() {
    super(AUTH_STRATEGIES.PJEOFFICE_LOCAL);
  }

  async checkHealth() {
    try {
      const resp = await fetch('http://127.0.0.1:8800/pjeOffice/', { signal: AbortSignal.timeout(2_000) });
      return { available: resp.ok, status: resp.status };
    } catch {
      return { available: false, status: null };
    }
  }

  async authenticate(context, page, portal) {
    const health = await this.checkHealth();
    if (!health.available) {
      throw Object.assign(new Error('O aplicativo PJeOffice Pro não está em execução na porta 8800.'), {
        errorCode: 'PJE-001',
        requiresApp: true
      });
    }
    await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return { ok: true, strategy: this.strategy };
  }

  async validateSession(page) {
    const isLogin = await page.locator('input[type="password"], #btnLogin, #btnEntrar, .login-btn').count().catch(() => 0);
    return isLogin === 0;
  }
}

export class CredentialsTotpAuthAdapter extends BaseAuthAdapter {
  constructor() {
    super(AUTH_STRATEGIES.CREDENTIALS_TOTP);
  }

  async authenticate(context, page, portal, credentials) {
    if (!credentials?.username || !credentials?.password) {
      throw Object.assign(new Error('Credenciais de usuário e senha não configuradas para este tribunal.'), {
        errorCode: 'AUTH-001'
      });
    }

    const pick = async (selectors, timeout = 1_500) => {
      for (const selector of selectors) {
        const locator = page.locator(selector).first();
        if ((await locator.count().catch(() => 0)) === 0) continue;
        if (await locator.isVisible().catch(() => false)) return locator;
        try {
          await locator.waitFor({ state: 'visible', timeout });
          return locator;
        } catch {}
      }
      return null;
    };
    const submit = async (field) => {
      const button = await pick(['#kc-login', 'button[type="submit"]', 'input[type="submit"]', '#btnEntrar', '#btnLogar'], 800);
      if (button) {
        await button.click().catch(() => {});
        return;
      }
      if (field) await field.press('Enter').catch(() => {});
    };

    await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2_000);

    // Detecção de CAPTCHA (Turnstile, hCaptcha, reCAPTCHA ou imagem): nunca contornar.
    const captcha = await page.evaluate(() => ({
      turnstile: Boolean(document.querySelector('.cf-turnstile, script[src*="challenges.cloudflare.com/turnstile"]')),
      hcaptcha: Boolean(document.querySelector('.h-captcha, script[src*="hcaptcha.com"]')),
      recaptcha: Boolean(document.querySelector('.g-recaptcha, iframe[src*="recaptcha"]')),
      image: Boolean(document.querySelector('#txtInfraCaptcha, #divInfraCaptcha img, img[src*="captcha" i]'))
    })).catch(() => ({}));
    if (captcha.turnstile || captcha.hcaptcha || captcha.recaptcha || captcha.image) {
      throw Object.assign(new Error('CAPTCHA detectado no portal. É necessária a intervenção humana.'), {
        errorCode: 'AUTH-CAPTCHA-REQUIRED',
        humanRequired: true
      });
    }

    const userField = await pick(['#username', 'input[name="username"]', '#txtUsuario', 'input[name*="usuario" i]', 'input[name*="login" i]', 'input[name*="cpf" i]'], 8_000);
    if (!userField) {
      throw Object.assign(new Error('Campo de usuário não encontrado no portal.'), {
        errorCode: 'AUTH-002',
        humanRequired: true
      });
    }
    await userField.fill(credentials.username);

    let passField = await pick(['#password', 'input[type="password"]:visible', '#pwdSenha', 'input[name*="senha" i]'], 2_000);
    if (passField) {
      await passField.click().catch(() => {});
      if (typeof passField.pressSequentially === 'function') {
        await passField.pressSequentially(credentials.password, { delay: 40 }).catch(async () => passField.fill(credentials.password));
      } else {
        await passField.fill(credentials.password).catch(() => {});
      }
      await page.waitForTimeout(400);
      await submit(passField);
    } else {
      await submit(userField);
      await page.waitForTimeout(2_000);
      passField = await pick(['#password', 'input[type="password"]:visible', '#pwdSenha'], 10_000);
      if (!passField) {
        throw Object.assign(new Error('Campo de senha não encontrado no portal.'), {
          errorCode: 'AUTH-002',
          humanRequired: true
        });
      }
      await passField.fill(credentials.password);
      await submit(passField);
    }
    await page.waitForTimeout(2_500);

    // Preenchimento de TOTP se o portal pedir o segundo fator
    const otpField = await pick(['#otp', 'input[name*="otp" i]', 'input[name*="totp" i]', 'input[name*="token" i]', 'input[placeholder*="código" i]'], 12_000);
    if (otpField && credentials.totpSecret) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const code = generateTotp(credentials.totpSecret);
        await otpField.fill(code);
        await submit(otpField);
        await page.waitForTimeout(4_000);
        const stillOtp = await otpField.isVisible().catch(() => false);
        if (!stillOtp) break;
        if (attempt === 1) await page.waitForTimeout(31_000);
      }
    }

    return { ok: true, strategy: this.strategy };
  }

  async validateSession(page) {
    const isLogin = await page.locator('input[type="password"], #btnEntrar, #btnLogar').count().catch(() => 0);
    return isLogin === 0;
  }
}

export class ManualPersistentSessionAdapter extends BaseAuthAdapter {
  constructor() {
    super(AUTH_STRATEGIES.MANUAL_PERSISTENT_SESSION);
  }

  async authenticate(context, page, portal) {
    await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return { ok: true, strategy: this.strategy, manual: true };
  }

  async validateSession(page) {
    const isLogin = await page.locator('input[type="password"], #btnEntrar, #btnLogar').count().catch(() => 0);
    return isLogin === 0;
  }
}

export function getAuthAdapter(strategy) {
  switch (strategy) {
    case AUTH_STRATEGIES.PUBLIC:
      return new PublicAuthAdapter();
    case AUTH_STRATEGIES.CLIENT_CERT_MTLS:
      return new ClientCertMtlsAuthAdapter();
    case AUTH_STRATEGIES.PJEOFFICE_LOCAL:
      return new PjeOfficeAuthAdapter();
    case AUTH_STRATEGIES.CREDENTIALS_TOTP:
    case AUTH_STRATEGIES.USERNAME_PASSWORD_TOTP:
      return new CredentialsTotpAuthAdapter();
    case AUTH_STRATEGIES.TOTP:
    case AUTH_STRATEGIES.WINDOWS_STORE:
    case AUTH_STRATEGIES.INTERACTIVE_HUMAN_REQUIRED:
    case AUTH_STRATEGIES.MANUAL_PERSISTENT_SESSION:
      return new ManualPersistentSessionAdapter();
    default:
      return new ManualPersistentSessionAdapter();
  }
}
