import { generateTotp } from '../../../security.mjs';
import { randomUUID } from 'node:crypto';
import { sanitizePjeUrlForTelemetry, assertSafePjeControl } from '../safety.mjs';

export class PjeAuthError extends Error {
  constructor(message, { errorCode, humanRequired = false, details = {} } = {}) {
    super(message);
    this.name = 'PjeAuthError';
    this.errorCode = errorCode || 'AUTH-FAILED';
    this.humanRequired = humanRequired;
    this.details = details;
    Object.assign(this, details);
  }
}

export const PJE_PANEL_SELECTORS = Object.freeze([
  'a:has-text("Expedientes")',
  'a:has-text("Acervo")',
  'a:has-text("Painel do Advogado")',
  '#navbar a[href*="painel"]',
  'a[href*="expediente" i]'
]);

export const PJE_TOTP_SELECTORS = Object.freeze([
  '#otp',
  'input[name="otp"]',
  'input[name="totp"]',
  'input[autocomplete="one-time-code"]',
  'input[placeholder*="digo" i]',
  'input[aria-label*="digo" i]'
]);

export const PJE_CERTIFICATE_SELECTORS = Object.freeze([
  '#kc-pje-office',
  'input[name="login-pje-office"]',
  'input.botao-certificado',
  'input[type="button"][value*="certificado" i]',
  'input[type="submit"][value*="certificado" i]',
  '#kc-login-certificate',
  'button[name="loginCertificate"]',
  'button:has-text("Certificado Digital")',
  'button:has-text("Certificado digital")',
  'a:has-text("Seu certificado digital")',
  'button:has-text("Seu certificado digital")',
  'a:has-text("Entrar com PDPJ")',
  'button:has-text("Entrar com PDPJ")'
]);

export const PJE_HELPER_SELECTORS = Object.freeze([
  '#kc-pje-office',
  'input[name="login-pje-office"]',
  'input.botao-certificado'
]);

export const PJE_HELPER_ONCLICK_SELECTORS = Object.freeze([
  'a[onclick*="autenticar"]',
  'input[onclick*="autenticar"]',
  'button[onclick*="autenticar"]'
]);

export const PJE_PJEOFFICE_HELPER_URL = 'http://127.0.0.1:8800/pjeOffice/?&u=';
export const PJE_PJEOFFICE_TASK_URL = 'http://127.0.0.1:8800/pjeOffice/requisicao/?u=';
export const PJE_HELPER_ONCLICK_RE = /autenticar\('([^']+)'\s*,\s*'([^']*)'\)/;

export async function probePjeOfficeHelper({
  timeoutMs = 8_000,
  attempts = 2,
  retryDelayMs = 1_200,
  fetchImpl = fetch
} = {}) {
  const totalAttempts = Math.max(1, Math.trunc(Number(attempts)) || 1);
  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    if (attempt > 0 && retryDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${PJE_PJEOFFICE_HELPER_URL}${Date.now()}`, { signal: controller.signal });
      if (response.status === 200) return true;
    } catch {
      // tentativa indisponível; o retry cobre partida lenta do assinador local sob carga
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

export function parsePjeHelperImage(buffer) {
  if (!buffer || buffer.length < 10) return { format: 'desconhecido', width: 0, height: 0 };
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { format: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return { format: 'desconhecido', width: 0, height: 0 };
}

async function readPjeHelperChallenge(element) {
  try {
    if (typeof element?.getAttribute !== 'function') return null;
    const onclick = String((await element.getAttribute('onclick')) || '');
    const match = onclick.match(PJE_HELPER_ONCLICK_RE);
    if (match) return { codigoSeguranca: match[1], mensagem: match[2] };
    const single = onclick.match(/autenticar\('([^']+)'/);
    if (single) return { codigoSeguranca: single[1], mensagem: '' };
    return null;
  } catch {
    return null;
  }
}

// Executa a mesma tarefa que o botão CERTIFICADO DIGITAL dispara no navegador do usuário:
// monta o payload oficial (sessão, código de segurança, challengePhrase) e chama o PJeOffice local,
// que assina com o A1 do cofre da máquina e devolve a imagem-sinal (largura 2 = erro).
export async function runPjeOfficeSsoTask(page, portal, { deps = {}, timeoutMs = 180_000 } = {}) {
  const control = await findPjeHelperControl(page);
  if (!control) return { ok: false, reason: 'helper_control_absent' };
  const challenge = await readPjeHelperChallenge(control.element);
  if (!challenge) return { ok: false, reason: 'challenge_absent' };
  const readCookie = deps.readSessionCookieFn || (target => target.evaluate(() => document.cookie));
  const submitToken = deps.submitHelperTokenFn || ((target, value) => target.evaluate(helperToken => {
    const field = document.getElementById('pjeoffice-code');
    if (field) field.value = helperToken;
    if (document.forms[0]) document.forms[0].submit();
  }, value));
  let sessionCookie = '';
  try {
    sessionCookie = await readCookie(page);
  } catch {
    sessionCookie = '';
  }
  const token = (deps.randomUUIDFn || randomUUID)();
  const payload = {
    sessao: sessionCookie,
    aplicacao: 'PJe',
    servidor: 'https://sso.cloud.pje.jus.br/auth/realms/pje',
    codigoSeguranca: challenge.codigoSeguranca,
    tarefaId: 'sso.autenticador',
    tarefa: JSON.stringify({ enviarPara: '/pjeoffice-rest', mensagem: challenge.mensagem || '', token })
  };
  const fetchImpl = deps.fetchImpl || fetch;
  let response;
  let buffer;
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    response = await fetchImpl(`${PJE_PJEOFFICE_TASK_URL}${Date.now()}&r=${encodeURIComponent(JSON.stringify(payload))}`, {
      headers: { Referer: page.url() },
      signal: controller.signal
    });
    clearTimeout(timer);
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return {
      ok: false,
      reason: 'helper_unreachable',
      error: String(error?.name === 'AbortError' ? 'timeout' : error?.message || error).slice(0, 160)
    };
  }
  const image = parsePjeHelperImage(buffer);
  if (response.status !== 200 || image.width === 2 || image.width === 0) {
    return { ok: false, reason: 'helper_rejected', status: response.status, image };
  }
  try {
    await submitToken(page, token);
  } catch (error) {
    return { ok: false, reason: 'helper_submit_failed', error: String(error?.message || error).slice(0, 160) };
  }
  return { ok: true, status: response.status, image, elapsedMs: Date.now() - startedAt };
}

export async function findPjeHelperControl(page) {
  const primary = await firstVisible(page, PJE_HELPER_SELECTORS);
  if (primary) return primary;
  const visibleOnclick = await firstVisible(page, PJE_HELPER_ONCLICK_SELECTORS);
  if (visibleOnclick) return visibleOnclick;
  return firstExisting(page, PJE_HELPER_ONCLICK_SELECTORS);
}

export async function waitForPjeHelperControl(page, timeoutMs = 8_000, stepMs = 750) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    const control = await findPjeHelperControl(page);
    if (control) return control;
    if (Date.now() >= deadline) return null;
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(stepMs);
    }
  }
}

export async function tryPjeLoginEntry(page, portal) {
  const selector = portal?.loginEntrySelector || portal?.confirmedRoutes?.loginEntrySelector || '';
  if (!selector) return false;
  const root = page.locator(selector);
  const count = await root.count().catch(() => 0);
  if (!count) return false;
  const locator = root.first();
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) return false;
  const text = await locator.innerText().catch(() => 'Entrar com PDPJ');
  const href = await locator.getAttribute('href').catch(() => '');
  assertSafePjeControl({ text, href: href || '', portal });
  await locator.click({ timeout: 10_000 }).catch(() => {});
  return true;
}

export const PJE_MANUAL_LOGIN_SELECTORS = Object.freeze([
  'input[name="username"]',
  '#username',
  'input[type="password"]',
  'button:has-text("gov.br")',
  'a:has-text("gov.br")'
]);

/**
 * Formulário de credenciais do PDPJ (Keycloak de sso.cloud.pje.jus.br): o advogado
 * sem A1 entra com CPF (usuário) e senha. O preenchimento usa apenas o cofre do
 * workspace; CAPTCHA/gov.br continuam exigindo intervenção humana.
 */
export const PJE_PDPJ_CREDENTIAL_SELECTORS = Object.freeze({
  user: Object.freeze([
    '#username',
    'input[name="username"]',
    'input[name="cpf"]',
    '#cpf',
    'input[name*="usuario" i]'
  ]),
  password: Object.freeze([
    '#password',
    'input[name="password"]',
    'input[type="password"]'
  ]),
  submit: Object.freeze([
    '#kc-login',
    'input[name="login"]',
    'button[type="submit"]',
    'input[type="submit"]'
  ])
});

const DEFAULT_BUDGET = Object.freeze({
  timeoutMs: 180_000,
  maxTransitions: 14,
  settleMs: 800,
  unknownTolerance: 4,
  helperCooldownMs: 150_000,
  entryCooldownMs: 20_000,
  helperGraceMs: 8_000,
  helperGraceStepMs: 750
});

function safeOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return 'invalid-url';
  }
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (!count) continue;
      const element = locator.first();
      const visible = await element.isVisible().catch(() => false);
      if (visible) return { selector, element };
    } catch {
      // selector inválido no estado atual da página
    }
  }
  return null;
}

async function firstExisting(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) return { selector, element: locator.first() };
    } catch {
      // selector inválido no estado atual da página
    }
  }
  return null;
}

export async function isPjePanelVisible(page, portal) {
  const url = String(page.url?.() || '');
  const origin = safeOrigin(url);
  const portalOrigin = safeOrigin(portal?.url);
  const ssoOrigins = new Set((portal?.trustedAuthOrigins || []).map(safeOrigin));
  // Evidência negativa: se há controle de login visível, a página NÃO é o painel,
  // mesmo quando a URL coincide com a rota esperada (SSO costuma preservar o caminho).
  const loginControl = await firstVisible(page, [
    ...PJE_TOTP_SELECTORS,
    ...PJE_CERTIFICATE_SELECTORS,
    ...PJE_PDPJ_CREDENTIAL_SELECTORS.user,
    ...PJE_MANUAL_LOGIN_SELECTORS
  ]);
  if (loginControl) return false;
  if (origin && origin === portalOrigin && !ssoOrigins.has(origin)) {
    const panelRoute = portal?.confirmedRoutes?.panel;
    if (panelRoute) {
      try {
        const expected = new URL(panelRoute);
        const current = new URL(url);
        if (current.pathname === expected.pathname) return true;
      } catch {
        // rota esperada inválida; segue para os marcadores visuais
      }
    }
    for (const pattern of portal?.authenticatedUrlPatterns || []) {
      try {
        if (new RegExp(pattern, 'i').test(url)) return true;
      } catch {
        // padrão inválido é ignorado
      }
    }
  }
  const markers = await firstVisible(page, PJE_PANEL_SELECTORS);
  if (markers) return true;
  if (portal?.authenticatedSelectors?.length) {
    return Boolean(await firstVisible(page, portal.authenticatedSelectors));
  }
  return false;
}

export async function detectPjeAuthState(page, portal) {
  const url = String(page.url?.() || '');
  if (await isPjePanelVisible(page, portal)) {
    return { kind: 'panel', url, origin: safeOrigin(url) };
  }
  const totp = await firstVisible(page, PJE_TOTP_SELECTORS);
  if (totp) return { kind: 'totp', url, origin: safeOrigin(url), control: totp };
  const certificate = await firstVisible(page, PJE_CERTIFICATE_SELECTORS);
  if (certificate) return { kind: 'certificate', url, origin: safeOrigin(url), control: certificate };
  const helperControl = await findPjeHelperControl(page);
  if (helperControl) return { kind: 'certificate', url, origin: safeOrigin(url), control: helperControl, helperExisting: true };
  if (portal?.loginEntrySelector) {
    const entry = await firstVisible(page, [portal.loginEntrySelector]);
    if (entry) return { kind: 'login_entry', url, origin: safeOrigin(url), control: entry };
  }
  const credentialUser = await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.user);
  if (credentialUser) {
    const credentialPassword = await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.password);
    if (credentialPassword) {
      const credentialSubmit = await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.submit);
      return {
        kind: 'credentials',
        url,
        origin: safeOrigin(url),
        controls: { user: credentialUser, password: credentialPassword, submit: credentialSubmit }
      };
    }
  }
  const manual = await firstVisible(page, PJE_MANUAL_LOGIN_SELECTORS);
  if (manual) return { kind: 'manual', url, origin: safeOrigin(url), control: manual };
  return { kind: 'unknown', url, origin: safeOrigin(url) };
}

async function settle(page, settleMs) {
  if (typeof page.waitForLoadState === 'function') {
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
  }
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(settleMs);
  }
}

async function submitTotp(page, control, secret, deps) {
  const generate = deps.generateTotpFn || generateTotp;
  const code = generate(String(secret).replace(/\s+/g, ''));
  await control.element.fill(code);
  const submit = await firstVisible(page, [
    '#kc-login',
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Validar")',
    'button:has-text("Confirmar")'
  ]);
  if (submit) {
    await submit.element.click();
  } else if (typeof control.element.press === 'function') {
    await control.element.press('Enter');
  }
}

async function isPjeHelperControl(element) {
  try {
    if (typeof element?.getAttribute !== 'function') return false;
    const id = String((await element.getAttribute('id')) || '');
    const name = String((await element.getAttribute('name')) || '');
    const className = String((await element.getAttribute('class')) || '');
    if (/kc-pje-office|login-pje-office|botao-certificado/i.test(`${id} ${name} ${className}`)) return true;
    const onclick = String((await element.getAttribute('onclick')) || '');
    return /autenticar\s*\(/.test(onclick);
  } catch {
    return false;
  }
}

async function fillPjeCredentialForm(page, credentials) {
  const username = String(credentials?.username || credentials?.cpf || '').trim();
  const password = String(credentials?.password || '');
  if (!username || !password) return { submitted: false, missing: true, fields: false };
  const user = await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.user);
  const pass = user ? await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.password) : null;
  if (!user || !pass) return { submitted: false, missing: false, fields: false };
  await user.element.fill(username);
  await pass.element.fill(password);
  const submit = await firstVisible(page, PJE_PDPJ_CREDENTIAL_SELECTORS.submit);
  if (submit?.element) {
    await submit.element.click();
  } else if (typeof pass.element.press === 'function') {
    await pass.element.press('Enter');
  }
  return { submitted: true, missing: false, fields: true };
}

function authSignature(state) {
  let path = '';
  try {
    path = new URL(state.url).pathname;
  } catch {
    path = 'invalid-url';
  }
  return `${state.kind}|${state.origin}|${path}`;
}

export async function authenticatePjeSession({
  page,
  portal,
  credentials = {},
  budget = {},
  onEvent,
  deps = {}
} = {}) {
  const limits = { ...DEFAULT_BUDGET, ...budget };
  const startedAt = Date.now();
  const totals = { transitions: 0, certificateClicks: 0, helperTasks: 0, totpSubmissions: 0, credentialSubmissions: 0, unknownTicks: 0, helperWaits: 0, entryWaits: 0 };
  let lastSignature = null;
  let signatureRepeats = 0;
  let helperClickAt = 0;
  let entryClickedAt = 0;
  const steps = [];

  const emit = event => {
    steps.push(event);
    if (typeof onEvent === 'function') onEvent(event);
  };

  while (totals.transitions < limits.maxTransitions) {
    if (Date.now() - startedAt > limits.timeoutMs) {
      throw new PjeAuthError('Tempo esgotado durante a autenticação PJe sem estado final estável.', {
        errorCode: 'AUTH-TIMEOUT',
        details: { steps: steps.map(step => ({ kind: step.kind, origin: step.origin })) }
      });
    }
    await settle(page, limits.settleMs);
    const state = await detectPjeAuthState(page, portal);
    emit({ kind: state.kind, origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });

    if (state.kind === 'panel') {
      return {
        ok: true,
        verifiedAt: new Date().toISOString(),
        origin: state.origin,
        steps,
        totals
      };
    }

    const signature = authSignature(state);
    if (signature === lastSignature) {
      signatureRepeats += 1;
      const helperWaiting = helperClickAt && (Date.now() - helperClickAt) < limits.helperCooldownMs;
      if (signatureRepeats >= 2 && !helperWaiting) {
        throw new PjeAuthError('Autenticação PJe entrou em loop sem progresso de estado.', {
          errorCode: 'AUTH-LOOP',
          details: { signature: { kind: state.kind, origin: state.origin } }
        });
      }
    } else {
      signatureRepeats = 0;
      lastSignature = signature;
    }

    if (state.kind === 'totp') {
      if (!credentials.totpSecret) {
        throw new PjeAuthError(
          'Segundo fator TOTP exigido pelo PJe, mas nenhum segredo PDPJ está vinculado a este workspace.',
          { errorCode: 'AUTH-TOTP-REQUIRED', humanRequired: true }
        );
      }
      await submitTotp(page, state.control, credentials.totpSecret, deps);
      totals.totpSubmissions += 1;
      totals.transitions += 1;
      continue;
    }

    if (state.kind === 'certificate') {
      assertSafePjeControl({ text: 'Certificado Digital', href: '', portal });
      const helperRequired = await isPjeHelperControl(state.control.element);
      if (helperRequired) {
        if (helperClickAt && (Date.now() - helperClickAt) < limits.helperCooldownMs) {
          totals.helperWaits += 1;
          continue;
        }
        const probeHelper = deps.probePjeOfficeHelperFn || probePjeOfficeHelper;
        const available = await probeHelper();
        if (!available) {
          emit({ kind: 'certificate_helper', origin: state.origin, available: false, seconds: Math.round((Date.now() - startedAt) / 1000) });
          // Sem assinador local: tenta a conta PDPJ (CPF/senha) na própria página antes de desistir.
          const filled = await fillPjeCredentialForm(page, credentials);
          if (filled.submitted) {
            totals.credentialSubmissions += 1;
            emit({ kind: 'credentials_submitted', origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });
            totals.transitions += 1;
            continue;
          }
          const enteredWithoutHelper = await tryPjeLoginEntry(page, portal);
          if (enteredWithoutHelper) {
            entryClickedAt = Date.now();
            emit({ kind: 'login_entry', origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });
            totals.transitions += 1;
            continue;
          }
          throw new PjeAuthError(
            'O login por certificado deste portal é realizado pelo PJeOffice local (127.0.0.1:8800), indisponível neste runtime. '
            + 'Execute o mesmo coletor no runtime com o assinador local ou habilite o portal nele.',
            {
              errorCode: 'AUTH-HELPER-REQUIRED',
              humanRequired: true,
              details: { helper: 'pjeoffice', origin: state.origin }
            }
          );
        }
        const task = await runPjeOfficeSsoTask(page, portal, { deps });
        emit({
          kind: 'certificate_helper',
          origin: state.origin,
          available: true,
          task: task.ok ? 'ok' : task.reason,
          seconds: Math.round((Date.now() - startedAt) / 1000)
        });
        if (task.ok) {
          helperClickAt = Date.now();
          totals.helperTasks += 1;
          totals.transitions += 1;
          continue;
        }
        if (task.reason === 'helper_control_absent' || task.reason === 'challenge_absent') {
          await state.control.element.click({ timeout: 8_000 }).catch(() => {});
          helperClickAt = Date.now();
          totals.certificateClicks += 1;
          totals.transitions += 1;
          continue;
        }
        throw new PjeAuthError(
          task.reason === 'helper_unreachable'
            ? 'PJeOffice local não respondeu à tarefa de autenticação dentro do tempo esperado.'
            : 'O PJeOffice local rejeitou a tarefa de autenticação deste portal.',
          {
            errorCode: task.reason === 'helper_unreachable' ? 'AUTH-HELPER-REQUIRED' : 'AUTH-HELPER-REJECTED',
            humanRequired: true,
            details: { helper: 'pjeoffice', status: task.status, image: task.image }
          }
        );
      }
      await state.control.element.click({ timeout: 8_000 }).catch(() => {});
      totals.certificateClicks += 1;
      totals.transitions += 1;
      continue;
    }

    if (state.kind === 'login_entry') {
      if (entryClickedAt && (Date.now() - entryClickedAt) < limits.entryCooldownMs) {
        totals.entryWaits += 1;
        continue;
      }
      assertSafePjeControl({ text: 'Entrar com PDPJ', href: '', portal });
      await state.control.element.click();
      entryClickedAt = Date.now();
      emit({ kind: 'login_entry', origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });
      totals.transitions += 1;
      continue;
    }

    if (state.kind === 'credentials') {
      const filled = await fillPjeCredentialForm(page, credentials);
      if (!filled.submitted) {
        throw new PjeAuthError(
          filled.missing
            ? 'O PDPJ exige usuário (CPF) e senha, mas nenhuma conta do tribunal está vinculada a este workspace.'
            : 'O formulário do PDPJ não foi reconhecido para preenchimento automático.',
          { errorCode: filled.missing ? 'AUTH-CREDENTIALS-REQUIRED' : 'AUTH-STATE-UNKNOWN', humanRequired: true, details: { origin: state.origin } }
        );
      }
      totals.credentialSubmissions += 1;
      emit({ kind: 'credentials_submitted', origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });
      totals.transitions += 1;
      continue;
    }

    if (state.kind === 'unknown' || state.kind === 'manual') {
      if (!(entryClickedAt && (Date.now() - entryClickedAt) < limits.entryCooldownMs)) {
        const entered = await tryPjeLoginEntry(page, portal);
        if (entered) {
          entryClickedAt = Date.now();
          emit({ kind: 'login_entry', origin: state.origin, seconds: Math.round((Date.now() - startedAt) / 1000) });
          totals.transitions += 1;
          continue;
        }
      }
    }

    if (state.kind === 'manual') {
      const helperAppeared = await waitForPjeHelperControl(page, limits.helperGraceMs, limits.helperGraceStepMs);
      if (helperAppeared) {
        totals.transitions += 1;
        continue;
      }
      let snapshot = null;
      try {
        snapshot = await page.evaluate(() => ({
          url: location.href,
          hasCertificateControl: Boolean(document.querySelector('#kc-pje-office, a[onclick*="autenticar"], input[onclick*="autenticar"], [onclick*="PJeOffice"]')),
          body: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240)
        }));
      } catch {
        snapshot = null;
      }
      throw new PjeAuthError(
        'O portal PJe exige login manual (usuário/senha ou gov.br). Use o certificado digital A1 para evitar intervenção humana.',
        {
          errorCode: 'AUTH-MANUAL-REQUIRED',
          humanRequired: true,
          details: { steps: steps.map(step => ({ kind: step.kind, origin: step.origin })), snapshot }
        }
      );
    }

    totals.unknownTicks += 1;
    if (totals.unknownTicks >= limits.unknownTolerance) {
      throw new PjeAuthError('Estado de autenticação PJe não reconhecido após aguardar a página estabilizar.', {
        errorCode: 'AUTH-STATE-UNKNOWN',
        humanRequired: true,
        details: {
          origin: sanitizePjeUrlForTelemetry(state.url),
          steps: steps.map(step => ({ kind: step.kind, origin: step.origin }))
        }
      });
    }
    totals.transitions += 1;
  }

  throw new PjeAuthError('Limite de transições de autenticação PJe atingido.', { errorCode: 'AUTH-TIMEOUT' });
}

export const pjeAuthInternals = Object.freeze({
  detectPjeAuthState,
  isPjePanelVisible,
  authSignature,
  readPjeHelperChallenge,
  isPjeHelperControl
});
