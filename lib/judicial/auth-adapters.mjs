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

  async authenticate(context, page, portal) {
    await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return { ok: true, strategy: this.strategy };
  }

  async validateSession(page, portal) {
    const content = await page.textContent('body').catch(() => '');
    return !content.includes('403 Forbidden') && !content.includes('Certificado Inválido');
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

    await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // Detecção de CAPTCHA
    const hasCaptcha = await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, #captcha').count().catch(() => 0);
    if (hasCaptcha > 0) {
      throw Object.assign(new Error('CAPTCHA detectado no portal. É necessária a intervenção humana.'), {
        errorCode: 'AUTH-CAPTCHA-REQUIRED',
        humanRequired: true
      });
    }

    // Preenchimento de usuário e senha
    const userField = page.locator('input[type="text"]:visible, input[name*="usuario" i], input[name*="login" i], input[name*="cpf" i], #txtUsuario').first();
    const passField = page.locator('input[type="password"]:visible, #pwdSenha, input[name*="senha" i]').first();

    if ((await userField.count()) && (await passField.count())) {
      await userField.fill(credentials.username);
      await passField.fill(credentials.password);

      // Preenchimento de TOTP se campo 2FA estiver visível
      if (credentials.totpSecret) {
        const totpField = page.locator('input[name*="otp" i], input[name*="totp" i], input[name*="token" i], input[placeholder*="código" i]').first();
        if (await totpField.count()) {
          const code = generateTotp(credentials.totpSecret);
          await totpField.fill(code);
        }
      }

      const submitBtn = page.locator('button[type="submit"], input[type="submit"], #btnEntrar, #btnLogar, .btn-primary').first();
      if (await submitBtn.count()) {
        await submitBtn.click();
        await page.waitForTimeout(3_000);
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
