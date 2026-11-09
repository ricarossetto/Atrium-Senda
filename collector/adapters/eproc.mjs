import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { generateTotp } from '../../lib/security.mjs';
import { generateAutosIndexPdf } from '../../lib/judicial/tjrs-autos-service.mjs';
import { PROCESS_SECRECY_LEVEL_PATTERN_SOURCES } from '../../lib/judicial/eproc/parsers/process-secrecy.mjs';
import { sanitizeDocumentFilename } from '../../lib/documents/document-service.mjs';
import { assertReadOnlyEprocTarget } from '../../lib/judicial/managed-connectivity.mjs';
import { parseEprocHearings } from '../../lib/judicial/eproc/parsers/hearing-parser.mjs';
import { parseEprocSessions, isEprocSessionsPage } from '../../lib/judicial/eproc/parsers/session-parser.mjs';

async function guardedGoto(page, url, operation, options = {}) {
  assertReadOnlyEprocTarget({ operation, url, baseUrl: page.url() });
  return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 60_000 });
}

async function guardedClick(page, locator, operation, action) {
  const href = await locator.getAttribute('href').catch(() => null);
  const formAction = await locator.getAttribute('formaction').catch(() => null);
  const parentFormAction = await locator.evaluate(element => element.form?.action || '').catch(() => '');
  const onclick = await locator.getAttribute('onclick').catch(() => null);
  // O eproc despacha a operação por um input oculto "acao" e/ou por onclick
  // com query acao=; ambos precisam passar pela mesma classificação read-only.
  const hiddenAction = await locator.evaluate(element => element.form?.querySelector('input[name="acao"]')?.value || '').catch(() => '');
  const controlId = await locator.getAttribute('id').catch(() => null);
  const controlName = await locator.getAttribute('name').catch(() => null);
  const controlType = await locator.getAttribute('type').catch(() => null);
  let target = href && !href.toLowerCase().startsWith('javascript:') ? href : (formAction || parentFormAction);
  // The federal certificate button changes the host instead of using an href.
  // Validate that actual destination rather than trusting the caller's label.
  const certificateHost = onclick?.match(/^\s*document\.location\.host\s*=\s*['"]([^'"]+)['"]\s*;?\s*$/)?.[1];
  if (certificateHost) {
    const certificateUrl = new URL(page.url());
    certificateUrl.host = certificateHost;
    target = certificateUrl.href;
  }
  const onclickAction = onclick?.match(/[?&]acao=([A-Za-z0-9_\-]+)/)?.[1] || '';
  assertReadOnlyEprocTarget({
    operation,
    url: target || page.url(),
    action: [action, onclick, hiddenAction, onclickAction].filter(Boolean).join(' '),
    baseUrl: page.url(),
    controlId,
    controlName,
    controlType
  });
  return await locator.click();
}

async function guardedPressEnter(page, locator, operation, action) {
  const formAction = await locator.evaluate(element => element.form?.action || '').catch(() => '');
  const hiddenAction = await locator.evaluate(element => element.form?.querySelector('input[name="acao"]')?.value || '').catch(() => '');
  assertReadOnlyEprocTarget({ operation, url: formAction || page.url(), action: [action, hiddenAction].filter(Boolean).join(' '), baseUrl: page.url() });
  return await locator.press('Enter');
}

async function waitForAuthNavigation(page, stage) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 });
  } catch (error) {
    const url = page.url();
    const hasTotp = await page.locator('#otp, input[name="otp"], input[name="totp"], input[name="code"]').first().isVisible().catch(() => false);
    if (!hasTotp && /keycloak|login|openid-connect|authenticate/i.test(url)) {
      throw new Error(`Tempo limite na autenticação eproc durante ${stage}. Keycloak não confirmou a transição.`);
    }
    if (!hasTotp && !await isEprocSessionActive(page)) throw error;
  }
}

/**
 * Autentica no eproc TJRS utilizando Certificado A1 (mTLS) e Segundo Fator (TOTP)
 */
/**
 * Autentica no eproc TJRS com Certificado A1 (mTLS) e TOTP, com repetição.
 *
 * O SSO do TJRS devolve, de forma intermitente, a tela "instabilidade temporária
 * no fluxo de autenticação / a configuração de credencial é necessária" antes de
 * mostrar o campo de segundo fator. Uma nova sessão resolve; por isso o login é
 * repetido até três vezes antes de declarar falha.
 */
/**
 * Decide se o login pelo certificado deve ser repetido.
 * Transiente: tela de instabilidade/credencial do SSO ou resultado inconclusivo.
 * Definitivo: falta de segredo TOTP, erro explícito do portal ou última tentativa.
 */
export function shouldRetryEprocLogin({ bodyText = '', outcome = {}, attempt = 1, attempts = 3 } = {}) {
  if (outcome?.ok) return false;
  const message = String(outcome?.error?.message || '');
  if (/segredo TOTP/i.test(message)) return false;
  if (attempt >= attempts) return false;
  if (outcome?.state === 'UNKNOWN') return true;
  return /instabilidade tempor|configura[çc][ãa]o de credencial|Recarregar agora|Tente novamente/i.test(String(bodyText));
}

export async function authenticateEprocWithCertAndTotp(page, portalUrl, credentials = {}) {
  const attempts = 3;
  let lastResult = { ok: false, state: 'UNKNOWN' };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let outcome;
    try {
      outcome = await authenticateWithCertOnce(page, portalUrl, credentials);
    } catch (error) {
      outcome = { ok: false, state: 'ERROR', error };
    }
    lastResult = outcome;
    if (outcome?.ok) return outcome;

    const bodyText = await page.textContent('body').catch(() => '') || '';
    if (!shouldRetryEprocLogin({ bodyText, outcome, attempt, attempts })) {
      if (outcome?.error) throw outcome.error;
      return outcome;
    }

    credentials.onProgress?.({
      phase: 'auth',
      authStage: 'retry',
      timestamp: new Date().toISOString(),
      action: `Nova tentativa de login no tribunal (${attempt + 1}/${attempts})...`,
      log: 'O tribunal não concluiu o login; repetindo com uma nova sessão.',
      determinate: false,
      progress: null,
      completed: null,
      total: null,
      step: 2
    });
    console.log(`[eproc] Login não concluído (tentativa ${attempt}/${attempts}); repetindo com nova sessão.`);
    await page.waitForTimeout(attempt === 1 ? 3_000 : 6_000);
  }
  return lastResult;
}

async function authenticateWithCertOnce(page, portalUrl, credentials = {}) {
  const emit = (authStage, action, log = action) => credentials.onProgress?.({
    phase: 'auth', authStage, timestamp: new Date().toISOString(),
    action, log, determinate: false, progress: null, completed: null, total: null, step: 2
  });
  const targetUrl = portalUrl || 'https://eproc1g.tjrs.jus.br/eproc/';
  emit('a1_loaded', 'Certificado A1 carregado para autenticação supervisionada.');
  console.log(`[eproc] Acessando portal: ${targetUrl}`);
  let portalOrigin = '';
  try { portalOrigin = new URL(targetUrl).origin; } catch {}
  emit('mtls_started', `Iniciando canal seguro mTLS com ${credentials.portalLabel || portalOrigin || 'o portal eproc'}.`);
  // Timeout no primeiro contato com o portal é transitório: até 3 tentativas
  // read-only (a última com timeout ampliado) evitam marcar o portal inteiro como
  // erro por lentidão momentânea do tribunal.
  const retriablePattern = /Timeout|ERR_TIMED_OUT|ERR_CONNECTION|ERR_NETWORK|net::/i;
  let portalLoaded = false;
  let lastNavigationError = null;
  for (let attempt = 1; attempt <= 3 && !portalLoaded; attempt += 1) {
    try {
      await guardedGoto(page, targetUrl, 'authenticate', { timeoutMs: attempt === 3 ? 120_000 : 60_000 });
      portalLoaded = true;
    } catch (navigationError) {
      lastNavigationError = navigationError;
      if (!retriablePattern.test(String(navigationError?.message || ''))) throw navigationError;
      if (attempt < 3) {
        emit('mtls_started', `Nova tentativa (${attempt + 1}/3) de acesso ao portal ${credentials.portalLabel || portalOrigin || 'eproc'} após instabilidade de rede.`);
        await page.waitForTimeout(attempt === 1 ? 4_000 : 10_000);
      }
    }
  }
  if (!portalLoaded) throw lastNavigationError;
  if (page.url().includes('keycloak')) emit('keycloak_opened', 'Tela de identidade Keycloak TJRS aberta.');
  await page.waitForTimeout(1_500);

  // Se já estiver logado no eproc
  if (await isEprocSessionActive(page)) {
    emit('mtls_confirmed', 'Canal seguro mTLS confirmado por sessão autenticada do eproc.');
    emit('eproc_session_confirmed', 'Sessão eproc já estava confirmada pelo painel autenticado.');
    console.log('[eproc] Sessão já autenticada e ativa.');
    return { ok: true, state: 'CONNECTED' };
  }

  // Verifica se está na tela de login do Keycloak
  const certLoginBtn = page.locator('#kc-login-certificate, button[name="loginCertificate"]').first();
  if (await certLoginBtn.count() > 0 && await certLoginBtn.isVisible().catch(() => false)) {
    console.log('[eproc] Tela de login Keycloak detectada. Clicando em "Entrar com Certificado Digital"...');
    await guardedClick(page, certLoginBtn, 'authenticate', 'authenticate');
    emit('cert_login_clicked', 'Login com certificado digital selecionado.');
    await waitForAuthNavigation(page, 'login com certificado');
    await page.waitForTimeout(2_000);
    if (page.url().includes('keycloak')) emit('keycloak_opened', 'Tela de identidade Keycloak TJRS observada após o redirecionamento.');
  }

  // Verifica se a tela solicitou o código 2FA / TOTP
  const totpInput = page.locator('#otp, input[name="otp"], input[name="totp"], input[name="code"], input[placeholder*="código" i]').first();
  if (await totpInput.count() > 0 && await totpInput.isVisible().catch(() => false)) {
    emit('totp_challenge_detected', 'Desafio TOTP detectado pelo tribunal.');
    console.log('[eproc] Desafio de Segundo Fator (2FA/TOTP) detectado.');
    const secret = credentials.totpSecret;
    if (!secret) {
      throw new Error('Segundo fator exigido pelo tribunal, mas nenhum segredo TOTP foi configurado.');
    }

    const code = generateTotp(secret);
    emit('totp_generated', 'Código TOTP gerado localmente (valor não registrado).');
    console.log(`[eproc] Injetando código TOTP de 6 dígitos gerado via RFC 6238...`);
    await totpInput.fill(code);
    await page.waitForTimeout(300);

    const submitBtn = page.locator('#kc-login, input[type="submit"], button[type="submit"]').first();
    if (await submitBtn.count() > 0) {
      await guardedClick(page, submitBtn, 'authenticate', 'authenticate');
    } else {
      await guardedPressEnter(page, totpInput, 'authenticate', 'authenticate');
    }
    emit('totp_submitted', 'Código TOTP submetido ao tribunal (valor não registrado).');

    await waitForAuthNavigation(page, 'submissão do TOTP');
    await page.waitForTimeout(3_000);
  }

  // Aguarda estabilização da navegação pós-login
  await waitForAuthNavigation(page, 'redirecionamento final');
  await page.waitForTimeout(2_000);
  emit('redirect_awaited', 'Redirecionamento pós-autenticação aguardado.');

  // Valida a sessão final
  if (await isEprocSessionActive(page)) {
    emit('mtls_confirmed', 'Canal seguro mTLS confirmado por sessão autenticada do eproc.');
    emit('eproc_session_confirmed', 'Sessão eproc confirmada pelo painel autenticado.');
    console.log('[eproc] Autenticação com Certificado A1 + 2FA concluída com sucesso!');
    return { ok: true, state: 'CONNECTED' };
  }

  // Se ainda estiver na tela de login ou erro
  const bodyText = await page.textContent('body').catch(() => '');
  if (bodyText.includes('Certificado Inválido') || bodyText.includes('403 Forbidden')) {
    throw new Error('Certificado digital rejeitado pelo servidor do tribunal (403 Forbidden / Certificado Inválido).');
  }
  if (bodyText.includes('Código inválido') || bodyText.includes('Código incorreto')) {
    throw new Error('Código 2FA / TOTP incorreto ou rejeitado pelo Keycloak.');
  }

  console.log('[eproc] URL atual pós-login:', page.url());
  return { ok: await isEprocSessionActive(page), state: 'UNKNOWN' };
}

/**
 * Autentica no eproc com conta do tribunal (usuário/senha + TOTP), sem Certificado A1.
 *
 * Fluxo validado live (2026-09-18) no Keycloak eproc TRF4/JFRS e no TJRS: usuário e
 * senha na mesma página do SSO, botão `#kc-login`, desafio TOTP e sessão autenticada
 * sem CAPTCHA. Nunca registra usuário, senha, código ou segredo. CAPTCHA no login
 * encerra com `AUTH-CAPTCHA-REQUIRED` (intervenção humana), sem qualquer contorno.
 */
export async function authenticateEprocWithCredentials(page, portalUrl, credentials = {}, deps = {}) {
  const emit = (authStage, action, log = action) => credentials.onProgress?.({
    phase: 'auth', authStage, timestamp: new Date().toISOString(),
    action, log, determinate: false, progress: null, completed: null, total: null, step: 2
  });
  const isSessionActive = deps.isSessionActive || isEprocSessionActive;
  const sleep = deps.sleep || ((ms) => page.waitForTimeout(ms));
  const detectCaptcha = deps.detectCaptcha || ((target) => target.evaluate(() => ({
    turnstile: Boolean(document.querySelector('.cf-turnstile, script[src*="challenges.cloudflare.com/turnstile"]')),
    hcaptcha: Boolean(document.querySelector('.h-captcha, script[src*="hcaptcha.com"]')),
    recaptcha: Boolean(document.querySelector('.g-recaptcha, iframe[src*="recaptcha"]')),
    image: Boolean(document.querySelector('#txtInfraCaptcha, #divInfraCaptcha img, img[src*="captcha" i]'))
  })));

  const username = String(credentials.username || credentials.oab || '').trim();
  const password = String(credentials.password || '');
  const totpSecret = String(credentials.totpSecret || '').trim();
  if (!username || !password) {
    throw Object.assign(new Error('Conta do tribunal (usuário e senha) não configurada para autenticação no eproc.'), { code: 'EPROC_CREDENTIALS_MISSING', statusCode: 412 });
  }

  const targetUrl = portalUrl || 'https://eproc1g.tjrs.jus.br/eproc/';
  emit('credentials_loaded', 'Conta do tribunal carregada para autenticação supervisionada (sem certificado).');
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await sleep(2_500);

  if (await isSessionActive(page)) {
    emit('eproc_session_confirmed', 'Sessão eproc já estava confirmada pelo painel autenticado.');
    return { ok: true, state: 'CONNECTED' };
  }

  const captcha = await detectCaptcha(page).catch(() => ({}));
  if (captcha.turnstile || captcha.hcaptcha || captcha.recaptcha || captcha.image) {
    throw Object.assign(new Error('O portal exige CAPTCHA no login; a autenticação por conta não prossegue sem intervenção humana.'), { code: 'AUTH-CAPTCHA-REQUIRED', humanRequired: true });
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
    const button = await pick([
      '#kc-login',
      'input[name="login"]',
      '#sbmEntrar',
      'button[type="submit"]',
      'input[type="submit"][value*="Entrar" i]',
      'input[type="submit"]',
      '#btnEntrar',
      '#btnLogar',
      'input[type="button"][value*="Entrar" i]',
      'button:has-text("Entrar")'
    ], 1_200);
    if (button) {
      await button.click().catch(() => {});
      return;
    }
    if (field) await field.press('Enter').catch(() => {});
  };

  const userField = await pick(['#username', 'input[name="username"]', '#txtUsuario', 'input[name*="usuario" i]'], 8_000);
  if (!userField) {
    throw Object.assign(new Error('Campo de usuário não encontrado na página de login do tribunal.'), { code: 'EPROC_LOGIN_FORM_UNRECOGNIZED' });
  }
  await userField.fill(username);
  emit('username_filled', 'Usuário do tribunal preenchido (valor não registrado).');

  let passField = await pick(['#password', 'input[type="password"]:visible', '#pwdSenha'], 2_000);
  if (passField) {
    await passField.click().catch(() => {});
    if (typeof passField.pressSequentially === 'function') {
      await passField.pressSequentially(password, { delay: 40 }).catch(async () => passField.fill(password));
    } else {
      await passField.fill(password).catch(() => {});
    }
    await sleep(500);
    await submit(passField);
  } else {
    await submit(userField);
    await sleep(2_000);
    passField = await pick(['#password', 'input[type="password"]:visible', '#pwdSenha'], 10_000);
    if (!passField) {
      throw Object.assign(new Error('Campo de senha não encontrado na página de login do tribunal.'), { code: 'EPROC_LOGIN_FORM_UNRECOGNIZED' });
    }
    await passField.fill(password).catch(() => {});
    await submit(passField);
  }
  emit('password_submitted', 'Senha submetida ao tribunal (valor não registrado).');
  await sleep(3_000);

  const otpField = await pick(['#otp', 'input[name="otp"]', 'input[name="totp"]', 'input[name="code"]'], 15_000);
  if (otpField) {
    if (!totpSecret) {
      throw Object.assign(new Error('O tribunal exige o segundo fator (TOTP) e nenhum segredo está vinculado a este portal.'), { code: 'AUTH-TOTP-REQUIRED', humanRequired: true });
    }
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const code = generateTotp(totpSecret);
      await otpField.fill(code);
      await submit(otpField);
      emit('totp_submitted', 'Código TOTP submetido ao tribunal (valor não registrado).');
      await sleep(4_500);
      const stillOtp = await otpField.isVisible().catch(() => false);
      if (!stillOtp) break;
      if (attempt === 1) await sleep(31_000);
    }
  }

  const bodyText = await page.evaluate(() => (document.body?.innerText || '')).catch(() => '');
  if (/nome de usu[áa]rio ou senha inv[áa]lida|usu[áa]rio ou senha inv[áa]lid|senha inv[áa]lida|dados inv[áa]lidos|usu[áa]rio inexistente/i.test(bodyText)) {
    throw Object.assign(new Error('O tribunal recusou o usuário ou a senha da conta configurada.'), { code: 'AUTH-CREDENTIALS-INVALID', humanRequired: true });
  }

  if (await isSessionActive(page)) {
    emit('eproc_session_confirmed', 'Sessão eproc confirmada pelo painel autenticado.');
    return { ok: true, state: 'CONNECTED' };
  }

  // Enviou credenciais e o formulário saiu de cena, mas nenhuma sessão foi confirmada:
  // o tribunal recusou a credencial (ou exigiu um fator não configurado). Estado tipado
  // para revisão humana — nunca sucesso presumido.
  const loginFormGone = await page.evaluate(() =>
    !document.querySelector('#txtUsuario, #username, #pwdSenha, #password')
  ).catch(() => false);
  if (loginFormGone) {
    throw Object.assign(
      new Error('O tribunal não confirmou a sessão após o envio das credenciais. Confira usuário, senha e 2FA desta conta.'),
      { code: 'AUTH-CREDENTIALS-INVALID', humanRequired: true }
    );
  }
  return { ok: false, state: 'UNKNOWN' };
}

/**
 * Verifica se a página atual pertence à sessão logada do advogado no eproc
 */
export async function isEprocSessionActive(page) {
  const url = page.url();
  // Se estiver em qualquer tela do Keycloak ou autenticação, não está logado
  if (url.includes('keycloak') || url.includes('/login') || url.includes('openid-connect') || url.includes('/authenticate')) return false;

  // Se houver botão de certificado ou formulário de login visível, NÃO está logado
  const hasLoginBtn = await page.locator('#kc-login-certificate, #kc-form-login, #frm-login, input[name="loginCertificate"]').count().catch(() => 0);
  if (hasLoginBtn > 0) return false;

  // Sessão interna do controlador.php
  if (url.includes('controlador.php') && !url.includes('externo_controlador.php')) {
    if (url.includes('acao=painel_adv') || url.includes('acao=relatorio_processo') || url.includes('acao=processo_') || url.includes('hash=')) {
      return true;
    }
  }

  const hasLogout = await page.locator('a[href*="acao=usuario_sair"], a:has-text("Sair"), #lnkInfraSair').count().catch(() => 0);
  if (hasLogout > 0) return true;

  const hasPainel = await page.locator('a[href*="acao=painel_adv_listar"]').count().catch(() => 0);
  if (hasPainel > 0 && !url.includes('externo_controlador.php')) return true;

  return false;
}

/**
 * Extrai o hash de segurança da sessão do eproc da URL ou do DOM
 */
export async function extractEprocSessionHash(page) {
  try {
    const current = new URL(page.url());
    const hash = current.searchParams.get('hash');
    if (hash) return hash;
  } catch {}

  return page.evaluate(() => {
    const input = document.querySelector('input[name="hash"], #hdnInfraHash');
    if (input && input.value) return input.value;
    const link = document.querySelector('a[href*="hash="]');
    if (link) {
      const m = link.getAttribute('href').match(/[?&]hash=([a-f0-9]+)/i);
      if (m) return m[1];
    }
    return '';
  }).catch(() => '');
}

export async function getEprocUrlWithHash(page, acao, extraParams = {}) {
  const hash = await extractEprocSessionHash(page);
  const current = new URL(page.url());
  const basePath = current.pathname.match(/^(.*\/eproc(?:V2|2trf4)?\/)/i)?.[1] || '/eproc/';
  const target = new URL(`${current.origin}${basePath}controlador.php`);
  target.searchParams.set('acao', acao);
  if (hash) target.searchParams.set('hash', hash);
  for (const [k, v] of Object.entries(extraParams)) {
    target.searchParams.set(k, v);
  }
  return target.href;
}

/**
 * Navega até o Painel do Advogado
 */
export async function navigateToEprocPanel(page) {
  if (/acao=painel_adv(?:ogado)?_listar/i.test(page.url())) return;
  const panelLink = page.locator('a[href*="acao=painel_adv_listar"], a:has-text("Painel do Advogado")').first();
  if (await panelLink.count() > 0 && await panelLink.isVisible().catch(() => false)) {
    await guardedClick(page, panelLink, 'navigateReadOnly', 'painel_adv_listar');
  } else {
    const url = await getEprocUrlWithHash(page, 'painel_adv_listar');
    await guardedGoto(page, url, 'navigateReadOnly');
  }
  await page.waitForTimeout(1_500);
}

export async function firstVisibleHref(page, selector, predicate = () => true) {
  const links = await page.locator(selector).evaluateAll(elements => elements.map(element => ({
    href: element.href || '', text: element.textContent?.replace(/\s+/g, ' ').trim() || '', visible: Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length)
  }))).catch(() => []);
  return links.find(link => link.visible && predicate(link.href, link.text))?.href || '';
}

export async function firstVisibleHrefAcrossFrames(page, selector, predicate = () => true) {
  for (const frame of page.frames()) {
    const href = await firstVisibleHref(frame, selector, predicate).catch(() => '');
    if (href) return href;
  }
  return '';
}

export async function hasEprocProcessTable(page) {
  return page.locator('table').evaluateAll(tables => tables.some(table => {
    const headers = [...table.querySelectorAll('th')].map(cell => cell.textContent.trim());
    return headers.some(h => /Número Processo/i.test(h)) && headers.some(h => /Último Evento/i.test(h));
  })).catch(() => false);
}

/**
 * Navega até o Relatório de Processos
 */
export async function navigateToEprocProcessReport(page) {
  if (await hasEprocProcessTable(page)) return;

  const isProcessReport = value => /acao=(?:relatorio_)?processo_(?:procurador_)?listar/i.test(value) && !/ord_ultimas_movimentacoes=/i.test(value);
  let href = await firstVisibleHrefAcrossFrames(page, 'a', isProcessReport);

  if (!href) {
    for (const frame of page.frames()) {
      const reports = frame.getByRole('link', { name: /relat[oó]rios/i }).first();
      if (!(await reports.count().catch(() => 0)) || !(await reports.isVisible().catch(() => false))) continue;
      await guardedClick(page, reports, 'discoverCases', 'relatorio_processo_listar').catch(() => {});
      await page.waitForTimeout(500);
      href = await firstVisibleHrefAcrossFrames(page, 'a', isProcessReport);
      if (href) break;
    }
  }

  if (!href) {
    href = await firstVisibleHrefAcrossFrames(page, 'a', (_value, text) => /rela[cç][aã]o de processos|processos do procurador|meus processos/i.test(text));
  }

  if (href) {
    console.log(`[eproc] Acessando relação de processos: ${href}`);
    await guardedGoto(page, href, 'discoverCases');
    await page.waitForTimeout(1_500);
    return;
  }

  throw new Error('A sessão foi autenticada, mas o atalho para a relação de processos não foi localizado no menu atual do eproc.');
}

/**
 * Abre a tela "Consulta Processual - Detalhes do Processo" para um determinado CNJ
 */
export async function openEprocProcessDetails(page, cnj) {
  const cleanCnj = cnj.replace(/\D/g, '');
  const formattedCnj = cnj.trim();
  console.log(`[eproc] Abrindo detalhes do processo: ${formattedCnj} (${cleanCnj})`);

  // 1. Navega até o Relatório de Processos do advogado
  console.log('[eproc] Navegando até a Relação de Processos...');
  await navigateToEprocProcessReport(page);

  // 2. Localiza o link específico do processo na tabela ou frames
  const procHref = await firstVisibleHrefAcrossFrames(page, 'a', (h, text) => {
    return (text && (text.includes(cleanCnj) || text.includes(formattedCnj))) || (h && h.includes(cleanCnj));
  });

  if (procHref) {
    console.log(`[eproc] Processo encontrado! Acessando detalhes: ${procHref}`);
    await guardedGoto(page, procHref, 'fetchCaseDetails');
    await page.waitForTimeout(2_000);
    if (await isProcessDetailsPage(page)) {
      console.log('[eproc] Detalhes do processo carregados com sucesso!');
      return true;
    }
  }

  // Se a primeira página do relatório não contém o alvo, evita executar o
  // handler JavaScript dinâmico do botão Buscar. Usa a ação read-only
  // processo_selecionar, cujo destino completo é validado pelo gate.
  const sessionHash = await extractEprocSessionHash(page);
  if (sessionHash) {
    let currentOrigin = '';
    let controllerBase = '/eproc/';
    try {
      const parsed = new URL(page.url());
      if (parsed.origin && parsed.origin !== 'null') currentOrigin = parsed.origin;
      controllerBase = parsed.pathname.match(/^(.*\/eproc(?:V2|2trf4)?\/)/i)?.[1] || controllerBase;
    } catch {}
    if (!currentOrigin) currentOrigin = new URL(page.url()).origin;
    const directUrl = `${currentOrigin}${controllerBase}controlador.php?acao=processo_selecionar&num_processo=${cleanCnj}&hash=${sessionHash}`;
    console.log('[eproc] Tentando acesso read-only direto ao processo com a sessão autenticada.');
    await guardedGoto(page, directUrl, 'fetchCaseDetails');
    await page.waitForTimeout(2_000);
    if (await isProcessDetailsPage(page)) {
      console.log('[eproc] Detalhes do processo carregados com sucesso!');
      return true;
    }
  }

  if (await isProcessDetailsPage(page)) return true;
  throw new Error(`Não foi possível localizar ou abrir os detalhes do processo ${formattedCnj} no eproc. URL atual: ${page.url()}`);
}

export async function isProcessDetailsPage(page) {
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  for (const frame of frames) {
    const title = typeof frame.title === 'function' ? (await frame.title().catch(() => '')) : '';
    if (/Detalhes do Processo|Eventos do Processo|Consulta Processual/i.test(title)) return true;
    const content = typeof frame.textContent === 'function' ? (await frame.textContent('body').catch(() => '')) : '';
    if (
      content.includes('Detalhes do Processo') ||
      content.includes('Eventos do Processo') ||
      (content.includes('Partes e Representantes') && content.includes('Processo')) ||
      (content.includes('Informações Adicionais') && (content.includes('Situação') || content.includes('Classe')))
    ) {
      return true;
    }
    if (typeof frame.locator === 'function') {
      const loc = frame.locator('#tabelaEventos, .infraTable, #divInfraAreaProcesso, #fldDadosProcesso');
      if (typeof loc.count === 'function') {
        const hasTable = await loc.count().catch(() => 0);
        if (hasTable > 0) return true;
      }
    }
  }
  return false;
}

/**
 * Coleta lista de prazos em aberto e pendentes no Painel do Advogado
 */
export async function collectEprocDeadlines(page) {
  const results = {
    openDeadlines: [],
    pendingIntimations: [],
    collectionErrors: [],
    collectionStatus: {
      open_deadline: { discovered: false, collected: false, notFound: false },
      pending_intimation: { discovered: false, collected: false, notFound: false }
    }
  };

  const collectSection = async ({ itemType, selector, operation, resultKey, defaultAction }) => {
    try {
      await navigateToEprocPanel(page);
      const sectionLink = page.locator(selector).first();
      if (await sectionLink.count() === 0) {
        // A seção não existe para este usuário/procuração: registro como indisponível,
        // sem erro de coleta e sem marcar itens como ausentes.
        results.collectionStatus[itemType].notFound = true;
        return;
      }
      const href = await sectionLink.getAttribute('href');
      if (!href) throw new Error('Link da seção sem destino navegável.');
      const target = new URL(href, page.url());
      results.collectionStatus[itemType].discovered = true;
      await guardedGoto(page, target.href, operation);
      // A lista do eproc pode montar depois do domcontentloaded (tabela via JS).
      // Aguardar sinal de lista (tabela ou CNJ) com teto: sem isso a leitura corre
      // contra pagina ainda vazia e o erro vira intermitente. Funcao estatica, sem
      // interpolacao e sem PII.
      await page.waitForFunction(() => {
        const text = String(document.body?.innerText || '');
        if (/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(text)) return true;
        return document.querySelectorAll('table').length > 0;
      }, null, { timeout: 15_000, polling: 500 }).catch(() => {});
      results[resultKey] = await readAllEprocDeadlineRows(page, {
        itemType,
        sourceAction: target.searchParams.get('acao') || defaultAction,
        sourcePath: target.pathname
      });
      results.collectionStatus[itemType].collected = true;
    } catch (error) {
      // Localizacao sem PII no log do servidor: origem + pathname, nunca query
      // (que pode carregar tokens). E o que diz ONDE a lista falhou.
      try {
        const loc = new URL(page.url());
        console.warn(`[eproc] lista '${itemType}' não reconhecida em ${loc.origin}${loc.pathname}`);
      } catch {
        // url invalida: segue sem log de localizacao
      }
      results.collectionErrors.push({ itemType, error: error.message });
    }
  };

  await collectSection({
    itemType: 'open_deadline',
    selector: 'a[href*="acao=citacao_intimacao_prazo_aberto_listar"], a:has-text("prazo em aberto"), a:has-text("Prazos em aberto"), a:has-text("Prazos em Aberto")',
    operation: 'fetchDeadlines',
    resultKey: 'openDeadlines',
    defaultAction: 'citacao_intimacao_prazo_aberto_listar'
  });
  await collectSection({
    itemType: 'pending_intimation',
    selector: 'a[href*="acao=citacao_intimacao_pendente_listar"], a:has-text("pendentes de citação"), a:has-text("pendente de citação"), a:has-text("Pendentes de Intimação")',
    operation: 'fetchPublications',
    resultKey: 'pendingIntimations',
    defaultAction: 'citacao_intimacao_pendente_listar'
  });

  return results;
}

async function readAllEprocDeadlineRows(page, provenance) {
  const items = [];
  const readCurrentPage = async () => {
    const parsed = await readEprocDeadlineRows(page, provenance);
    if (!parsed.recognized) {
      // Diagnostico sem PII: contagens e rotulos de cabecalho, nunca conteudo de linha.
      // E o que separa 'tabela com outro formato' de 'pagina sem tabela' sem copiar conteudo.
      let diag = parsed.diagnostic
        ? ` [tabelas=${parsed.diagnostic.tableCount}, cabecalhos=${parsed.diagnostic.firstHeaders || '-'}, cnjNaPagina=${parsed.diagnostic.hasCnj ? 'sim' : 'nao'}, secao=${parsed.diagnostic.sectionHint || '-'}, texto=${parsed.diagnostic.textLen ?? '-'}]`
        : '';
      if (parsed.diagnostic?.pistas && !parsed.recognized) {
        const pistas = Object.entries(parsed.diagnostic.pistas).map(([k, v]) => `${k}=${v}`).join(',');
        if (pistas) diag += ` {${pistas}}`;
      }
      throw new Error('A lista do eproc não foi reconhecida e não apresentou estado vazio verificável.' + diag);
    }
    items.push(...parsed.items);
  };

  await readCurrentPage();
  const pager = page.locator('select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]').first();
  const totalPages = await pager.count() > 0 ? await pager.locator('option').count().catch(() => 1) : 1;
  for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
    const nextValue = await pager.locator('option').nth(pageIndex).getAttribute('value');
    if (nextValue === null) throw new Error('Paginação do eproc sem identificador navegável.');
    assertReadOnlyEprocTarget({ operation: provenance.itemType === 'open_deadline' ? 'fetchDeadlines' : 'fetchPublications', url: page.url(), action: 'pagination' });
    const pagerSelector = 'select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]';
    const beforeUrl = page.url();
    const beforeTableSignature = await page.locator('table').evaluateAll(tables => tables.map(table => table.innerText || '').join('\n'));
    const transition = page.waitForFunction(({ selector, expectedValue, previousUrl, previousTableSignature, itemType }) => {
      const selectedValue = document.querySelector(selector)?.value;
      const tableSignature = [...document.querySelectorAll('table')].map(table => table.innerText || '').join('\n');
      const bodyText = document.body?.innerText?.replace(/\s+/g, ' ').trim() || '';
      const hasCnjRow = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(tableSignature);
      const sectionIdentified = itemType === 'open_deadline'
        ? /prazos?\s+em\s+aberto/i.test(bodyText)
        : /(?:intimaç(?:ão|ões)|citaç(?:ão|ões))\s+pendentes?|pendentes?\s+de\s+(?:intimaç(?:ão|ões)|citaç(?:ão|ões))/i.test(bodyText);
      const verifiedEmpty = sectionIdentified && (
        /\b0\s+registros?\b/i.test(bodyText)
        || /(?:nenhum|não (?:há|existe|existem))\s+(?:registro|resultado|prazo|intimaç(?:ão|ões)|citaç(?:ão|ões))/i.test(bodyText)
      );
      return selectedValue === expectedValue
        && (window.location.href !== previousUrl || tableSignature !== previousTableSignature)
        && (hasCnjRow || verifiedEmpty);
    }, {
      selector: pagerSelector,
      expectedValue: nextValue,
      previousUrl: beforeUrl,
      previousTableSignature: beforeTableSignature,
      itemType: provenance.itemType
    }, { timeout: 60_000, polling: 100 });
    try {
      await pager.selectOption(nextValue);
      await transition;
    } catch (error) {
      transition.catch(() => {});
      throw error;
    }
    await readCurrentPage();
  }
  return items;
}

export function isVerifiedEprocEmptyState(bodyText, itemType) {
  const normalized = String(bodyText || '').replace(/\s+/g, ' ').trim();
  const sectionIdentified = itemType === 'open_deadline'
    ? /prazos?\s+em\s+aberto/i.test(normalized)
    : /(?:intimaç(?:ão|ões)|citaç(?:ão|ões))\s+pendentes?|pendentes?\s+de\s+(?:intimaç(?:ão|ões)|citaç(?:ão|ões))/i.test(normalized);
  if (!sectionIdentified) return false;
  // Formas oficiales de "vazio" no eproc, incluindo feminino ("nenhuma intimação",
  // "não foram encontradas") — o masculino sozinho deixava a lista vazia real do TJRS
  // 2G sem estado verificável.
  return /\b0\s+registros?\b/i.test(normalized)
    || /(?:nenhum[as]?|não\s+(?:há|existe|existem|foram?\s+encontrad[oa]s?|foi\s+encontrad[oa]))\s+(?:registro|resultado|prazo|intimaç(?:ão|ões)|citaç(?:ão|ões))(?:\s+encontrad[oa]s?)?/i.test(normalized);
}

/**
 * Coleta audiências designadas no Painel do Advogado (acao=audiencia_listar /
 * audiencia_conciliacao_listar), com paginação provada e sem qualquer ato processual.
 */
export async function collectEprocHearings(page, options = {}) {
  const result = {
    hearings: [],
    collectionErrors: [],
    collectionStatus: { discovered: false, collected: false },
    pages: 0
  };
  try {
    await navigateToEprocPanel(page);
    const hearingHref = await firstVisibleHrefAcrossFrames(
      page,
      'a[href*="acao=audiencia_listar"], a[href*="acao=audiencia_conciliacao_listar"], a:has-text("Audiências")',
      href => /acao=(?:audiencia_listar|audiencia_conciliacao_listar)/i.test(String(href || ''))
    );
    if (!hearingHref) {
      return result;
    }
    result.collectionStatus.discovered = true;
    await guardedGoto(page, hearingHref, 'navigateReadOnly');
    await page.waitForTimeout(1_500);

    const readCurrentPage = async () => {
      const html = await page.content().catch(() => '');
      return parseEprocHearings(html, { portalId: options.portalId || 'eproc-generic' });
    };

    result.hearings.push(...await readCurrentPage());
    result.pages = 1;

    const pager = page.locator('select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]').first();
    const totalPages = (await pager.count()) > 0
      ? await pager.locator('option').count().catch(() => 1)
      : 1;
    const pagerSelector = 'select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]';
    for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
      const nextValue = await pager.locator('option').nth(pageIndex).getAttribute('value');
      if (nextValue === null) break;
      assertReadOnlyEprocTarget({ operation: 'navigateReadOnly', url: page.url(), action: 'pagination' });
      const beforeUrl = page.url();
      const beforeSignature = await page.locator('table').evaluateAll(tables => tables.map(table => table.innerText || '').join('\n')).catch(() => '');
      const transition = page.waitForFunction(({ selector, expectedValue, previousUrl, previousSignature }) => {
        const selectedValue = document.querySelector(selector)?.value;
        const tableSignature = [...document.querySelectorAll('table')].map(table => table.innerText || '').join('\n');
        return selectedValue === expectedValue && (window.location.href !== previousUrl || tableSignature !== previousSignature);
      }, {
        selector: pagerSelector,
        expectedValue: nextValue,
        previousUrl: beforeUrl,
        previousSignature: beforeSignature
      }, { timeout: 60_000, polling: 100 });
      try {
        await pager.selectOption(nextValue);
        await transition;
      } catch (error) {
        transition.catch(() => {});
        throw error;
      }
      result.hearings.push(...await readCurrentPage());
      result.pages = pageIndex + 1;
    }
    result.collectionStatus.collected = true;
  } catch (error) {
    result.collectionErrors.push({ itemType: 'hearing', error: error.message });
  }
  return result;
}

/**
 * Lê as linhas da tabela de intimações/prazos do eproc
 */
/**
 * Lê as Sessões de Julgamento do 2º grau (página "Processos em pauta").
 * O link é descoberto no painel; a ação `intimacao_de_pauta_listar` é read-only.
 */
export async function collectEprocSessions(page, options = {}) {
  const result = {
    sessions: [],
    collectionErrors: [],
    collectionStatus: { discovered: false, collected: false },
    pages: 0
  };
  try {
    await navigateToEprocPanel(page);
    // O link "Processos em pauta" só existe no painel principal do advogado
    // (painel_adv_listar). Depois da leitura de intimações/audiências a página pode
    // ficar em painel_advogado_listar; voltar ao painel principal antes de procurar.
    if (!/acao=painel_adv_listar/i.test(page.url())) {
      const panelUrl = await getEprocUrlWithHash(page, 'painel_adv_listar').catch(() => '');
      if (panelUrl) {
        await guardedGoto(page, panelUrl, 'navigateReadOnly').catch(() => {});
        await page.waitForTimeout(1_500);
      }
    }
    const findSessionLink = () => firstVisibleHrefAcrossFrames(
      page,
      'a[href*="acao=intimacao_de_pauta_listar"], a:has-text("Julgamento"), a:has-text("Processos em pauta")',
      href => /acao=intimacao_de_pauta_listar/i.test(String(href || ''))
    );
    let sessionHref = await findSessionLink();
    if (!sessionHref) return result;
    result.collectionStatus.discovered = true;
    await guardedGoto(page, sessionHref, 'navigateReadOnly');
    await page.waitForTimeout(1_500);

    let recognized = false;
    const readCurrentPage = async () => {
      const html = await page.content().catch(() => '');
      if (isEprocSessionsPage(html)) recognized = true;
      return parseEprocSessions(html, { portalId: options.portalId || 'eproc-generic' });
    };

    result.sessions.push(...await readCurrentPage());
    result.pages = 1;

    const pager = page.locator('select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]').first();
    const totalPages = (await pager.count()) > 0
      ? await pager.locator('option').count().catch(() => 1)
      : 1;
    const pagerSelector = 'select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]';
    for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
      const nextValue = await pager.locator('option').nth(pageIndex).getAttribute('value');
      if (nextValue === null) break;
      assertReadOnlyEprocTarget({ operation: 'navigateReadOnly', url: page.url(), action: 'pagination' });
      const beforeUrl = page.url();
      const beforeSignature = await page.locator('table').evaluateAll(tables => tables.map(table => table.innerText || '').join('\n')).catch(() => '');
      const transition = page.waitForFunction(({ selector, expectedValue, previousUrl, previousSignature }) => {
        const selectedValue = document.querySelector(selector)?.value;
        const tableSignature = [...document.querySelectorAll('table')].map(table => table.innerText || '').join('\n');
        return selectedValue === expectedValue && (window.location.href !== previousUrl || tableSignature !== previousSignature);
      }, {
        selector: pagerSelector,
        expectedValue: nextValue,
        previousUrl: beforeUrl,
        previousSignature: beforeSignature
      }, { timeout: 60_000, polling: 100 });
      try {
        await pager.selectOption(nextValue);
        await transition;
      } catch (error) {
        transition.catch(() => {});
        throw error;
      }
      result.sessions.push(...await readCurrentPage());
      result.pages = pageIndex + 1;
    }
    result.collectionStatus.collected = recognized;
  } catch (error) {
    result.collectionErrors.push({ itemType: 'session', error: error.message });
  }
  return result;
}

export async function readEprocDeadlineRows(page, provenance = {}) {
  const bodyText = typeof page.textContent === 'function' ? await page.textContent('body').catch(() => '') : '';
  const verifiedEmpty = isVerifiedEprocEmptyState(bodyText, provenance.itemType);
  const diagnostic = await page.locator('body').evaluate(body => {
    const tables = [...body.querySelectorAll('table')];
    const first = tables[0];
    const headers = first
      ? [...first.querySelectorAll('th')].map(cell => String(cell.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 10)
      : [];
    const text = String(body.innerText || '');
    const flat = text.replace(/\s+/g, ' ').trim();
    // So pathname, nunca query: a query do eproc pode carregar tokens e chaves.
    let path = '';
    try {
      path = String(location.pathname || '').slice(0, 200);
    } catch {
      path = '';
    }
    // Sondas booleanas do vocabulario da pagina: dizem QUAL frase de vazio o portal
    // usa sem copiar nenhuma palavra do conteudo. Se o estado continuar nao
    // reconhecido, as sondas apontam a proxima forma a cobrir.
    const probe = word => word.test(flat) ? 'sim' : 'nao';
    return {
      url: path,
      title: String(document.title || '').slice(0, 160),
      tableCount: tables.length,
      firstHeaders: headers.join(' | ') || '-',
      hasCnj: /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(text),
      // So medidas: a secao foi identificada? quanto texto ha? Separa "pagina errada"
      // de "pagina certa com frase de vazio diferente", sem copiar conteudo.
      textLen: flat.length,
      sectionHint: /intimaç|citaç|prazo/i.test(flat) ? 'sim' : 'nao',
      pistas: {
        nenhuma: probe(/nenhum[as]?/i),
        encontrada: probe(/encontrad[oa]s?/i),
        possui: probe(/possui|possuem/i),
        vazia: probe(/vazi[oa]s?/i),
        semRegistros: probe(/sem\s+(registro|resultado)/i)
      }
    };
  }).catch(() => null);
  return page.locator('table').evaluateAll((tables, source) => {
    const table = tables.find(candidate => {
      const headers = [...candidate.querySelectorAll('th, td')].map(cell => cell.textContent.trim());
      return headers.some(h => /Processo/i.test(h)) && headers.some(h => /Evento|Prazo/i.test(h));
    }) || tables.find(candidate => candidate.innerText && /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(candidate.innerText));
    if (!table) {
      return { recognized: source.verifiedEmpty, items: [], empty: source.verifiedEmpty, diagnostic: source.diagnostic || null };
    }

    const firstRowCells = [...(table.querySelector('tr') ? table.querySelector('tr').querySelectorAll('th, td') : [])];
    const headerTexts = firstRowCells.map(c => c.innerText.trim());
    const classIdx = headerTexts.findIndex(h => /Classe/i.test(h));
    const subjectIdx = headerTexts.findIndex(h => /Assunto/i.test(h));
    const eventIdx = headerTexts.findIndex(h => /Evento/i.test(h));
    const sentIdx = headerTexts.findIndex(h => /Expedi|Envio|Data/i.test(h));
    const startsIdx = headerTexts.findIndex(h => /Início|Ciência|Abertura/i.test(h));
    const deadlineIdx = headerTexts.findIndex(h => /Fim|Final|Término|Limite|Prazo/i.test(h));

    const items = [...table.rows].slice(1).map(row => {
      const cells = [...row.cells].map(cell => cell.innerText.trim().replace(/\s+/g, ' '));
      const rowText = row.innerText.trim().replace(/\s+/g, ' ');
      const processMatch = rowText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
      if (!processMatch) return null;

      const dateMatches = rowText.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/g) || [];
      const rawDeadline = deadlineIdx >= 0 && cells[deadlineIdx] ? cells[deadlineIdx] : (dateMatches[dateMatches.length - 1] || '');
      const rawSent = sentIdx >= 0 && cells[sentIdx] ? cells[sentIdx] : (dateMatches[0] || '');
      const rawStarts = startsIdx >= 0 && cells[startsIdx] ? cells[startsIdx] : (dateMatches[1] || dateMatches[0] || '');

      return {
        itemType: source.itemType || 'pending_intimation',
        processNumber: processMatch[0],
        processDetails: cells[1] || rowText.slice(0, 300),
        className: classIdx >= 0 && cells[classIdx] ? cells[classIdx] : (cells[2] || ''),
        subject: subjectIdx >= 0 && cells[subjectIdx] ? cells[subjectIdx] : (cells[3] || ''),
        event: eventIdx >= 0 && cells[eventIdx] ? cells[eventIdx] : (cells[4] || 'Intimação eletrônica'),
        sentAt: rawSent,
        startsAt: rawStarts,
        deadlineAt: rawDeadline,
        sourceText: rowText.slice(0, 4000),
        sourceAction: source.sourceAction || null,
        sourcePath: source.sourcePath || null
      };
    }).filter(Boolean);
    return { recognized: items.length > 0 || source.verifiedEmpty, items, empty: items.length === 0 && source.verifiedEmpty, diagnostic: source.diagnostic || null };
  }, { ...provenance, verifiedEmpty, diagnostic });
}

/**
 * Submissão controlada e segura do formulário de busca/relatório do eproc,
 * validando form action, host e ação read-only sem executar scripts inline arbitrários.
 */
export async function submitEprocSearchForm(page, searchBtn) {
  const formAction = await searchBtn.evaluate(el => el.form?.action || '').catch(() => '');
  const hiddenAction = await searchBtn.evaluate(el => el.form?.querySelector('input[name="acao"]')?.value || '').catch(() => '');
  const fullUrl = new URL(formAction || page.url(), page.url());
  assertReadOnlyEprocTarget({
    operation: 'discoverCases',
    url: fullUrl.href,
    action: ['search', hiddenAction].filter(Boolean).join(' '),
    baseUrl: page.url()
  });
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {}),
    searchBtn.evaluate(btn => {
      if (btn.form) {
        btn.form.submit();
      } else {
        btn.click();
      }
    }).catch(() => {})
  ]);
  await page.waitForTimeout(1_500);
}

export const EPROC_REPORT_TRIGGER_LABEL = /gerar\s*planilha|planilha|exportar|exporta[cç][aã]o/i;
export const EPROC_REPORT_TRIGGER_DENY = /excluir|assinar|protocolar|peticionar|peti[cç][aã]o|transmitir|enviar|responder|manifestar|ci[êe]ncia|dar\s*ci[êe]ncia|confirmar|aceitar|cancelar|arquivar|baixar\s*autos|download\s*completo|autos\s*integrais|cadastrar|solicitar|homologar|juntar|protocolar|recorrer|impugnar/i;

/**
 * Localiza, com validação de segurança default-deny, o comando oficial de exportação
 * ("Gerar Planilha") na página autenticada do eproc, inclusive dentro de frames.
 * Retorna um locator Playwright e o descritor validado, sem hardcode de hashes/tokens.
 */
export async function discoverEprocReportTrigger(page, options = {}) {
  const labelPattern = options.labelPattern instanceof RegExp ? options.labelPattern : EPROC_REPORT_TRIGGER_LABEL;
  const denyPattern = options.denyPattern instanceof RegExp ? options.denyPattern : EPROC_REPORT_TRIGGER_DENY;
  const frames = typeof page.frames === 'function' ? page.frames() : [page];

  for (const frame of frames) {
    const found = await frame.evaluate(({ labelSource, denySource }) => {
      const labelRe = new RegExp(labelSource, 'i');
      const denyRe = new RegExp(denySource, 'i');
      const isVisible = el => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
      const describe = el => [el.id, el.getAttribute('name'), el.getAttribute('value'), el.getAttribute('title'), el.getAttribute('aria-label'), el.textContent]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const candidates = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"], input[type="image"]')]
        .filter(el => isVisible(el) && !el.disabled && labelRe.test(describe(el)) && !denyRe.test(describe(el)));
      const el = candidates[0];
      if (!el) return null;

      const resolveUrl = value => {
        try { return new URL(value, window.location.href).href; } catch { return ''; }
      };
      let action = '';
      let targetUrl = '';
      // formaction/formmethod sobrescrevem o destino do formulário no submit nativo:
      // o destino efetivo precisa ser o validado, nunca apenas o form.action.
      const formActionOverride = typeof el.getAttribute === 'function' ? el.getAttribute('formaction') : '';
      const form = el.closest('form');
      if (formActionOverride) {
        targetUrl = resolveUrl(formActionOverride);
        if (!targetUrl) return { unresolved: true, labelText: describe(el).slice(0, 160) };
        try { action = new URL(targetUrl).searchParams.get('acao') || ''; } catch {}
        if (!action) action = 'formaction';
      } else if (form) {
        const acaoInput = form.querySelector('input[name="acao"]');
        if (acaoInput?.value) action = String(acaoInput.value).trim();
        targetUrl = resolveUrl(form.action || window.location.href);
        if (!action) {
          try { action = new URL(targetUrl).searchParams.get('acao') || ''; } catch {}
        }
      } else if (el.href) {
        targetUrl = resolveUrl(el.href);
        try { action = new URL(targetUrl).searchParams.get('acao') || ''; } catch {}
      }
      if (!targetUrl) {
        const onclick = el.getAttribute('onclick') || '';
        const urlMatch = onclick.match(/(?:window\.location(?:\.href)?|location\.href)\s*=\s*['"]([^'"]+)['"]/);
        if (urlMatch) {
          targetUrl = resolveUrl(urlMatch[1]);
          try { action = action || new URL(targetUrl).searchParams.get('acao') || ''; } catch {}
        }
      }

      const cssPath = (() => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && parts.length < 6) {
          let part = node.tagName.toLowerCase();
          if (node.getAttribute('name')) part += `[name="${CSS.escape(node.getAttribute('name'))}"]`;
          else if (node.getAttribute('type')) part += `[type="${CSS.escape(node.getAttribute('type'))}"]`;
          const parent = node.parentElement;
          if (parent) {
            const siblings = [...parent.children].filter(child => child.tagName === node.tagName);
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
          }
          parts.unshift(part);
          node = parent;
        }
        return parts.join(' > ');
      })();

      return {
        labelText: describe(el).slice(0, 160),
        action,
        targetUrl,
        cssPath,
        controlId: el.id || '',
        controlName: el.getAttribute('name') || '',
        controlType: el.getAttribute('type') || el.tagName.toLowerCase()
      };
    }, { labelSource: labelPattern.source, denySource: denyPattern.source }).catch(() => null);

    if (found?.cssPath && (found.targetUrl || found.action)) {
      assertReadOnlyEprocTarget({
        operation: 'navigateReadOnly',
        url: found.targetUrl,
        action: found.action,
        baseUrl: page.url(),
        controlId: found.controlId,
        controlName: found.controlName,
        controlType: found.controlType
      });
      return { frame, locator: frame.locator(found.cssPath).first(), descriptor: found };
    }
  }
  return null;
}

/**
 * Coleta processos do relatório do eproc (com paginação)
 */
export async function collectEprocProcessReport(page, maxPages = 5) {
  await navigateToEprocProcessReport(page);

  // Se houver botão "Buscar" ou filtro, submete de forma controlada
  const searchBtn = page.locator('#sbmBuscar, input[name="sbmBuscar"], button:has-text("Buscar")').first();
  if (await searchBtn.count() > 0 && await searchBtn.isVisible().catch(() => false)) {
    await submitEprocSearchForm(page, searchBtn);
  }

  const collected = [];
  const pager = page.locator('select#selInfraPaginacaoSuperior, select[name="selInfraPaginacaoSuperior"]').first();
  const totalPages = (await pager.count()) > 0
    ? Math.min(maxPages, await pager.locator('option').count().catch(() => 1))
    : 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const rows = await page.locator('table').evaluateAll(tables => {
      const table = tables.find(candidate => {
        const headers = [...candidate.querySelectorAll('th')].map(cell => cell.textContent.trim());
        return headers.some(h => /Número Processo/i.test(h)) && headers.some(h => /Último Evento/i.test(h));
      });
      if (!table) return [];

      return [...table.rows].slice(1).map(row => {
        const cells = [...row.cells].map(c => c.innerText.trim().replace(/\s+/g, ' '));
        const numMatch = (cells[0] || cells[1] || '').match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
        const linkElem = row.querySelector('a[href*="processo_selecionar"], a[href*="processo_detalhes"]');
        return {
          number: numMatch ? numMatch[0] : '',
          actionClass: cells[1] || '',
          plaintiff: cells[2] || '',
          defendant: cells[3] || '',
          courtLocation: cells[4] || '',
          subject: cells[5] || '',
          lastEvent: cells[6] || '',
          lastEventDate: cells[7] || '',
          filedDate: cells[8] || '',
          caseValue: cells[9] || '',
          selectHref: linkElem ? linkElem.getAttribute('href') : null
        };
      }).filter(r => r.number);
    });

    collected.push(...rows);
    if (pageIdx + 1 >= totalPages) break;

    const nextVal = await pager.locator('option').nth(pageIdx + 1).getAttribute('value');
    if (nextVal !== null) {
      assertReadOnlyEprocTarget({ operation: 'discoverCases', url: page.url(), action: 'pagination' });
      await pager.selectOption(nextVal);
      await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
  }

  return collected;
}

/**
 * Extrai todos os dados estruturados e a lista de movimentações (eventos) da página de detalhes
 */
export async function extractProcessDetails(page, options = {}) {
  const injectedLawyerNames = Array.isArray(options.lawyerNames) ? options.lawyerNames : [];
  // 1. Interceptador de diálogo (alert/prompt) caso o eproc exiba a chave em popup ao clicar no ícone
  let dialogKey = '';
  const onDialog = dialog => {
    try {
      const msg = String(dialog.message() || '');
      const m = msg.match(/(?:chave\s*(?:do\s+processo|de\s+acesso|de\s+consulta|para\s+consulta)?|chave|acesso)[\s:eé=]+([a-zA-Z0-9]{6,32})/i)
        || msg.match(/\b([0-9]{6,32})\b/);
      if (m && m[1].length >= 6) {
        const candidate = m[1].trim();
        if (!/^(?:processo|acesso|chave)$/i.test(candidate)) {
          dialogKey = candidate;
        }
      }
      dialog.dismiss().catch(() => {});
    } catch {}
  };
  if (page.on) page.on('dialog', onDialog);

  // 2. Expande o painel "Informações Adicionais" se a chave/conteúdo ainda não estiver visível
  try {
    const isChaveVisible = await page.locator('#imgChaveProcesso, #spnChaveProcesso, [id*="ChaveProcesso" i]').first().isVisible().catch(() => false);
    if (!isChaveVisible) {
      const infAdicionalBtn = page.locator('#imgStatusInfAdicional, [title*="Informações Adicionais" i], #fldInformacoesAdicionais legend, legend:has-text("Informações Adicionais"), #fldDadosProcesso legend').first();
      if (await infAdicionalBtn.count() > 0) {
        await guardedClick(page, infAdicionalBtn, 'fetchCaseDetails', 'expand_case_info').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  } catch {}

  // 3. Clica no ícone de chave/cadeado para buscar/revelar a Chave do Processo se ainda não estiver preenchida
  try {
    const hasKeyVal = await page.evaluate(() => {
      const s = document.querySelector('#spnChaveProcesso, [id*="ChaveProcesso" i], #txtChaveProcesso');
      const val = (s ? (s.value || s.innerText) : '').trim();
      return Boolean(val && val.length >= 6);
    }).catch(() => false);

    if (!hasKeyVal) {
      const chaveBtn = page.locator('#imgChaveProcesso, #btnChaveProcesso, [title*="Chave do Processo" i], [title*="Buscar Chave" i], [title*="Chave de Acesso" i], [onclick*="buscarChaveProcesso" i], [onclick*="consultarChaveProcesso" i], [onclick*="ChaveProcesso" i]').first();
      if (await chaveBtn.count() > 0 && await chaveBtn.isVisible().catch(() => false)) {
        await guardedClick(page, chaveBtn, 'revealAccessKey', 'reveal_access_key').catch(() => {});
        await page.waitForTimeout(800);
      }
    }
  } catch {}

  // Playwright aceita UM único argumento em page.evaluate: tudo atravessa a
  // fronteira dentro de um objeto serializável.
  const result = await page.evaluate(extractEprocDetailsInPage, {
    injectedNames: injectedLawyerNames,
    secrecyPatterns: PROCESS_SECRECY_LEVEL_PATTERN_SOURCES
  });

  try {
    if (page.off) page.off('dialog', onDialog);
  } catch {}

  const finalKey = (result?.accessKey || dialogKey || '').trim();
  if (result) {
    result.accessKey = finalKey;
    result.chaveAcesso = finalKey;
  }


  return result;
}

// Extração dos detalhes executada DENTRO da página (page.evaluate): a função
// precisa ser autossuficiente — sem imports nem closures — e recebe UM único
// objeto serializável (regra do Playwright para page.evaluate).
export function extractEprocDetailsInPage({ injectedNames = [], secrecyPatterns = [] } = {}) {
    const getText = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.innerText.trim().replace(/\s+/g, ' ') : '';
    };

    const cnjMatch = document.body.innerText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    const number = cnjMatch ? cnjMatch[0] : '';

    // Extração dos campos da capa / cabeçalho
    const bodyText = document.body.innerText;
    const findField = (label) => {
      const regex = new RegExp(`${label}[:\\s]+([^\\n\\r]+)`, 'i');
      const m = bodyText.match(regex);
      return m ? m[1].trim() : '';
    };

    const actionClass = findField('Classe da ação') || findField('Classe');
    const competence = findField('Competência');
    const distributionDate = findField('Data de autuação') || findField('Data autuação');
    const court = findField('Órgão Julgador');
    const judge = findField('Juiz\\(a\\)') || findField('Magistrado');
    const status = findField('Situação');

    // Valor da Causa (suporta quebra de linha entre rótulo e valor)
    let caseValue = '';
    const mVal = bodyText.match(/Valor\s*(?:da)?\s*Causa[:\s]*[\r\n\s]*(R\$\s*[\d.,]+|[\d.,]+)/i);
    if (mVal) {
      caseValue = mVal[1].trim();
    } else {
      caseValue = findField('Valor da Causa');
    }

    // Chave do Processo (Busca em spans, inputs, botões onclick e texto)
    let accessKey = '';
    const spnKey = document.querySelector('#spnChaveProcesso, [id*="ChaveProcesso" i], [id*="chave_processo" i], #txtChaveProcesso, input[name*="chave" i]');
    if (spnKey) {
      const val = (spnKey.value || spnKey.innerText || '').trim();
      const cleanVal = val.replace(/\s+/g, '');
      if (cleanVal.length >= 6) accessKey = cleanVal;
    }

    // Busca no onclick de links ou botões de chave (ex: buscarChaveProcesso('123456789012'))
    if (!accessKey) {
      const keyElements = document.querySelectorAll('[onclick*="chave" i], [onclick*="Chave" i], [data-chave], [data-key]');
      for (const el of keyElements) {
        const dataKey = el.dataset?.chave || el.dataset?.key;
        if (dataKey && dataKey.trim().length >= 6) {
          accessKey = dataKey.trim();
          break;
        }
        const onclickAttr = el.getAttribute('onclick') || '';
        const mClick = onclickAttr.match(/['"]([a-zA-Z0-9]{6,32})['"]/);
        if (mClick) {
          accessKey = mClick[1].trim();
          break;
        }
      }
    }

    // Busca estruturada em células de tabela e dt/dd
    if (!accessKey) {
      const labels = document.querySelectorAll('td, th, dt, label, b, strong');
      for (const el of labels) {
        if (/chave\s*(?:do\s+processo|de\s+acesso|de\s+consulta|do\s+processo\s+judicial)?/i.test(el.innerText)) {
          const next = el.nextElementSibling || el.parentElement?.querySelector('dd, td:last-child, span');
          if (next && next !== el) {
            const val = next.innerText.trim().replace(/\s+/g, '');
            if (/^[a-zA-Z0-9]{6,32}$/.test(val)) {
              accessKey = val;
              break;
            }
          }
        }
      }
    }

    // Busca no texto completo da página via regex abrangente
    if (!accessKey) {
      const mKey = bodyText.match(/(?:Chave\s*(?:do\s+processo|de\s+acesso|de\s+consulta|para\s+consulta|do\s+processo\s+judicial|eletr[oô]nica)?|Chave\s*Processo)[:\s]+([a-zA-Z0-9]{6,32})/i)
        || bodyText.match(/Chave[:\s]*[\r\n\s]+([a-zA-Z0-9]{6,32})/i);
      if (mKey) accessKey = mKey[1].trim();
    }

    // Segredo de Justiça: nível do PROCESSO (nunca rótulos de documentos/anexos).
    // As fontes das expressões chegam como dado (imports não existem na página).
    let processSecrecyLevel = 0;
    let secrecyExplicit = false;
    for (const source of Array.isArray(secrecyPatterns) ? secrecyPatterns : []) {
      const match = bodyText.match(new RegExp(source, 'i'));
      if (!match) continue;
      const level = Number(match[1]);
      processSecrecyLevel = Number.isFinite(level) && level >= 0 ? level : 0;
      secrecyExplicit = true;
      break;
    }
    const isSecrecy = processSecrecyLevel > 0;
    const secrecyLevel = isSecrecy ? `Segredo de Justiça (Nível ${processSecrecyLevel})` : '';

    // Partes (ignora tabela de eventos/movimentações para não poluir com textos de intimação)
    // Partes e Representantes
    const parties = [];
    const partyTables = [...document.querySelectorAll('#tblPartesERepresentantes, table')].filter(t => {
      if (t.id === 'tblPartesERepresentantes') return true;
      const text = t.innerText;
      const isEvents = text.includes('Evento') && (text.includes('Data/Hora') || text.includes('Descrição'));
      return !isEvents && (/AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO|EMBARGANTE|EMBARGADO|IMPUGNANTE|IMPUGNADO|PACIENTE|AGRAVANTE|AGRAVADO|APELANTE|APELADO|Polo|Partes/i.test(text));
    });
    partyTables.forEach(table => {
      [...table.querySelectorAll('tr')].forEach(row => {
        const text = row.innerText.trim();
        if (text) parties.push(text.replace(/\s+/g, ' '));
      });
    });

    // Eventos do Processo (Movimentações)
    const movements = [];
    const eventsTable = [...document.querySelectorAll('table')].find(t => {
      const h = t.innerText;
      return h.includes('Evento') && (h.includes('Data/Hora') || h.includes('Descrição'));
    });

    if (eventsTable) {
      const rows = [...eventsTable.querySelectorAll('tr')].slice(1);
      rows.forEach(row => {
        const cells = [...row.querySelectorAll('td')].map(c => c.innerText.trim().replace(/\s+/g, ' '));
        if (cells.length >= 3) {
          const docs = [];
          const docLinks = [...row.querySelectorAll('a')].filter(a => {
            const h = a.getAttribute('href') || '';
            return h.includes('acessar_documento') || h.includes('documento_download') || h.includes('controlador.php');
          });
          docLinks.forEach(a => {
            docs.push({
              name: a.innerText.trim(),
              href: a.getAttribute('href')
            });
          });

          movements.push({
            sequence: cells[0] || '',
            date: cells[1] || '',
            description: cells[2] || '',
            user: cells[3] || '',
            documents: docs
          });
        }
      });
    }

    // Extração estruturada de pólos: Cliente e Adversa (Parte Contrária)
    let clientName = '';
    let clientDocument = '';
    let clientPosition = '';
    let opposingParty = '';
    let opposingPartyDocument = '';
    let opposingPosition = '';
    let clientPoleConfirmed = false;
    let opposingPoleConfirmed = false;

    // Detecta o advogado conectado na sessão do eproc para identificar o polo representado.
    // A identidade vem do workspace (estado oficial) e do contexto do coletor; nunca de
    // nomes pessoais embutidos no código.
    const loggedUserText = (document.querySelector('#txtUsuario, #lblNomeAdvogado, .infraUsuario, span[title*="advogado"], .usuario-logado')?.innerText || '').trim();
    // H3: identidade monitorada do workspace tem precedência; os nomes injetados pelo
    // pipeline (estado oficial) e o usuário autenticado completam a identificação.
    // Nenhum nome pessoal é embutido no código.
    let monitoredNames = [];
    try {
      const parsedNames = JSON.parse(process.env.ATRIUM_MONITORED_NAMES || '[]');
      if (Array.isArray(parsedNames)) monitoredNames = parsedNames.map(name => String(name || '').trim()).filter(name => name.length >= 3);
    } catch { monitoredNames = []; }
    monitoredNames = [...new Set([
      ...(Array.isArray(injectedNames) ? injectedNames : []).map(name => String(name || '').trim()),
      ...monitoredNames
    ])].filter(name => name.length >= 3);
    if (loggedUserText.length >= 5) monitoredNames = [...new Set([...monitoredNames, loggedUserText])];
    const escapedNames = monitoredNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const lawyerRe = escapedNames.length ? new RegExp(`(?:${escapedNames.join('|')})`, 'i') : /(?!)/;

    const partesTable = document.querySelector('#tblPartesERepresentantes, #tblPartes, table[summary*="Partes"], .infraTablePartes, .infraCapaTabela');
    if (partesTable) {
      const ths = [...partesTable.querySelectorAll('th')];
      const trs = [...partesTable.querySelectorAll('tr')];
      const dataRow = trs.find(tr => tr.querySelector('td.autorReu, td'));
      if (dataRow) {
        const tds = [...dataRow.querySelectorAll('td')];
        const poles = [];

        tds.forEach((td, idx) => {
          const header = ths[idx]?.innerText?.trim() || '';
          const nameEl = td.querySelector('.infraNomeParte, a[data-parte]');
          let name = nameEl ? nameEl.innerText.trim() : '';

          const cpfEl = td.querySelector('[id*="spnCpfParte"], [title*="Copiar CPF"]');
          let doc = cpfEl ? cpfEl.innerText.trim().replace(/\s+/g, '') : '';
          if (!doc) {
            const mDoc = td.innerText.match(/\((\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2})\)/);
            if (mDoc) doc = mDoc[1].trim();
          }

          if (!name) {
            const lines = td.innerText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const l of lines) {
              if (/Tipo de Usuário|ADVOGADO|PROCURADOR|MINISTÉRIO/i.test(l)) continue;
              if (lawyerRe.test(l)) continue;
              const clean = l
                .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)[:\s]*/i, '')
                .replace(/\(\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2}\).*/, '')
                .replace(/\(Sucessor.*?\).*/i, '')
                .replace(/-\s*Pessoa.*|JG.*|RS\d+.*/i, '')
                .trim();
              if (clean.length > 2 && !/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)$/i.test(clean)) {
                name = clean;
                break;
              }
            }
          }

          const isLawyerHere = lawyerRe.test(td.innerText);
          poles.push({
            role: header,
            name,
            document: doc,
            isLawyerHere,
            rawText: td.innerText.trim()
          });
        });

        const matchedPole = poles.find(p => p.isLawyerHere) || null;
        const clientPole = matchedPole || poles[0];
        const oppPole = poles.find(p => p !== clientPole);

        if (clientPole) {
          clientName = clientPole.name;
          clientDocument = clientPole.document;
          clientPosition = clientPole.role;
        }
        if (oppPole) {
          opposingParty = oppPole.name;
          opposingPartyDocument = oppPole.document;
          opposingPosition = oppPole.role;
        }
        clientPoleConfirmed = Boolean(matchedPole && matchedPole.name);
        opposingPoleConfirmed = Boolean(oppPole && oppPole.name && oppPole !== clientPole);
      }
    }

    // Fallbacks para cliente
    if (!clientName) {
      if (partesTable) {
        const cells = [...partesTable.querySelectorAll('td, th, tr')];
        for (const cell of cells) {
          const cellText = cell.innerText || '';
          if (lawyerRe.test(cellText)) {
            const lines = cellText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
              if (!lawyerRe.test(line) && !/Tipo de Usuário|ADVOGADO|OAB|PROCURADOR|MINISTÉRIO|PÚBLICO/i.test(line)) {
                const clean = line
                  .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)[:\s]*/i, '')
                  .replace(/\s*\(\d{2,3}\.?\d{3}\.?\d{3}[-\/]?\d{2,4}[-\/]?\d{0,2}\).*/, '')
                  .replace(/\s*\(Sucessor.*?\).*/i, '')
                  .replace(/\s*-\s*Pessoa.*|\s*JG.*|\s*RS\d+.*/i, '')
                  .trim();
                if (clean.length > 2 && !/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO)$/i.test(clean)) {
                  clientName = clean;
                  break;
                }
              }
            }
            if (clientName) break;
          }
        }
      }
    }

    if (!clientName) {
      const activePole = parties.find(p => /AUTOR|EXEQUENTE|REQUERENTE|EMBARGANTE|AGRAVANTE/i.test(p) && !/RÉU|EXECUTADO|REQUERIDO/i.test(p)) || parties[0];
      if (activePole) {
        clientName = activePole
          .replace(/^(AUTOR|RÉU|EXEQUENTE|EXECUTADO|REQUERENTE|REQUERIDO|EMBARGANTE|EMBARGADO)[:\s]*/i, '')
          .split('(')[0].split('-')[0].trim();
      }
    }
    // Jamais gerar falso positivo "Cliente Geral" ou genérico fictício
    if (!clientName || /^(?:cliente\s+)?(?:geral|modelo|do\s+escrit[oó]rio)$/i.test(clientName.trim())) {
      clientName = '';
    }

    return {
      number,
      clientName,
      clientIdentified: Boolean(clientName),
      clientPoleConfirmed,
      clientDocument,
      clientPosition,
      opposingParty,
      opposingPartyDocument,
      opposingPosition,
      opposingPoleConfirmed,
      actionClass,
      competence,
      distributionDate,
      court,
      judge,
      status,
      caseValue,
      accessKey,
      chaveAcesso: accessKey,
      secrecy: isSecrecy,
      secrecyLevel,
      secrecyExplicit,
      partiesSummary: parties.slice(0, 10).join(' | '),
      movementsCount: movements.length,
      movements
    };
}

/**
 * Faz o download dos documentos do processo (agendamento do arquivo completo + download das peças individuais)
 * e organiza na pasta data/storage/processos/{cliente}/{processo}/
 */
export async function downloadAndOrganizeProcessDocuments(page, {
  cnj,
  clientName = '',
  targetBaseDir,
  state = null,
  maxPieces = 25
}) {
  const safeClient = sanitizeDocumentFilename(clientName).trim() || 'Processos';
  const safeCnj = cnj.replace(/[^\w.-]/g, '_');
  const storageDir = targetBaseDir || path.join(process.cwd(), 'data', 'storage', 'processos', safeClient, safeCnj);
  await mkdir(storageDir, { recursive: true });

  console.log(`[eproc] Iniciando download das peças para: ${storageDir}`);
  const downloadedFiles = [];

  // 1. Aciona agendamento de Download Completo dos autos (Processo Integral)
  const downloadAllBtn = page.locator('#btnDownloadCompletoRS, a:has-text("DownloadCompleto"), a:has-text("Download Completo")').first();
  if (await downloadAllBtn.count() > 0 && await downloadAllBtn.isVisible().catch(() => false)) {
    try {
      console.log('[eproc] Botão "Download Completo" localizado. Solicitando geração dos autos integrais...');
      await guardedClick(page, downloadAllBtn, 'downloadDocuments', 'download_documents');
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1_500);

      const chkEventos = page.locator('#chkMostrarListaDeEventosNaCapaDoProcesso').first();
      if (await chkEventos.count() > 0) {
        assertReadOnlyEprocTarget({ operation: 'downloadDocuments', url: page.url(), action: 'download_options' });
        await chkEventos.check().catch(() => {});
      }
      const chkAnexos = page.locator('#chkIncluirAnexosEletronicos').first();
      if (await chkAnexos.count() > 0) {
        assertReadOnlyEprocTarget({ operation: 'downloadDocuments', url: page.url(), action: 'download_options' });
        await chkAnexos.check().catch(() => {});
      }

      const gerarBtn = page.locator('#btnGerar, button:has-text("Gerar Arquivo Completo")').first();
      if (await gerarBtn.count() > 0) {
        await guardedClick(page, gerarBtn, 'downloadDocuments', 'generate_download');
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
        console.log('[eproc] Agendamento de Download Completo solicitado com sucesso no eproc TJRS!');
      }

      // Retorna para os detalhes do processo
      const voltarBtn = page.locator('#btnVoltar, button:has-text("Voltar"), a:has-text("Voltar")').first();
      if (await voltarBtn.count() > 0) {
        await guardedClick(page, voltarBtn, 'navigateReadOnly', 'back');
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      } else {
        assertReadOnlyEprocTarget({ operation: 'navigateReadOnly', url: page.url(), action: 'back' });
        await page.goBack().catch(() => {});
      }
      await page.waitForTimeout(1_500);
    } catch (err) {
      console.warn(`[eproc] Aviso ao agendar Download Completo: ${err.message}`);
    }
  }

  // 2. Coleta de peças individuais diretamente da tabela de eventos
  const piecesToDownload = await page.evaluate(() => {
    const list = [];
    const rows = [...document.querySelectorAll('table tr')];
    rows.forEach(row => {
      const cells = [...row.querySelectorAll('td')].map(c => c.innerText.trim().replace(/\s+/g, ' '));
      if (cells.length >= 3) {
        const seq = cells[0] || '';
        const desc = cells[2] || '';
        const links = [...row.querySelectorAll('a')].filter(a => {
          const h = a.getAttribute('href') || '';
          const t = a.innerText.trim();
          if (!t) return false;
          if (h.includes('processo_selecionar') || h.includes('painel_adv') || h.includes('#')) return false;
          return h.includes('acessar_documento') ||
                 h.includes('documento_download') ||
                 h.includes('documento_visualizar') ||
                 h.includes('arvore_documento') ||
                 /^(?:PET|PROC|DOC|SENT|DEC|DESP|TERMO|CERT|OFIC|MAND|LAUDO|CONTR|INF|INDICE|00\d|\d+)/i.test(t) ||
                 /download|peça|documento/i.test(t);
        });
        links.forEach(a => {
          list.push({
            seq,
            desc,
            linkText: a.innerText.trim(),
            href: a.getAttribute('href')
          });
        });
      }
    });
    return list;
  });

  console.log(`[eproc] Encontradas ${piecesToDownload.length} peças documentais anexadas aos eventos.`);
  const limit = Math.min(piecesToDownload.length, maxPieces);

  for (let i = 0; i < limit; i++) {
    const piece = piecesToDownload[i];
    const linkLocator = page.locator(`a[href="${piece.href}"]`).first();
    if (await linkLocator.count() === 0) continue;

    try {
      console.log(`[eproc] Baixando peça [${i + 1}/${limit}]: Evento ${piece.seq} — ${piece.linkText}...`);
      const [docPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 15_000 }),
        guardedClick(page, linkLocator, 'downloadDocuments', 'download_documents')
      ]);

      await docPage.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
      await docPage.waitForTimeout(1_000);

      const iframe = docPage.locator('iframe').first();
      if (await iframe.count() > 0) {
        const iframeSrc = await iframe.getAttribute('src');
        if (iframeSrc) {
          assertReadOnlyEprocTarget({ operation: 'downloadDocuments', url: iframeSrc, baseUrl: docPage.url() });
          const base64Data = await docPage.evaluate(async (src) => {
            const resp = await fetch(src);
            const blob = await resp.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          }, iframeSrc);

          if (base64Data && base64Data.includes(',')) {
            const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
            const pad = String(piece.seq || i + 1).padStart(3, '0');
            const safePieceName = sanitizeDocumentFilename(`${pad} - ${piece.linkText} - ${piece.desc.slice(0, 40)}`);
            const filename = `${safePieceName}.pdf`;
            const targetPath = path.join(storageDir, filename);

            await writeFile(targetPath, buffer);
            downloadedFiles.push({
              name: filename,
              path: targetPath,
              type: 'peca',
              size: buffer.length,
              sequence: piece.seq,
              description: piece.desc
            });
            console.log(`[eproc] Peça gravada com sucesso: ${filename} (${buffer.length} bytes)`);
          }
        }
      }
      await docPage.close().catch(() => {});
    } catch (pieceErr) {
      console.warn(`[eproc] Aviso ao baixar peça ${piece.linkText}: ${pieceErr.message}`);
    }
  }

  // 3. Gera o Índice e Termo dos Autos em PDF
  console.log(`[eproc] Gerando termo de índice dos autos com ${downloadedFiles.length} peças registradas...`);
  const indexDoc = generateAutosIndexPdf({
    cnj,
    client: clientName,
    court: 'Tribunal de Justiça do Rio Grande do Sul - eproc 1G',
    secrecy: false,
    pieces: downloadedFiles.map(f => ({
      date: new Date().toISOString().slice(0, 10),
      title: f.name.replace(/\.pdf$/i, ''),
      fileName: f.name,
      pageCount: 1,
      size: f.size || 1024
    })),
    folderPath: storageDir
  });

  const indexFilePath = path.join(storageDir, indexDoc.fileName);
  await writeFile(indexFilePath, indexDoc.binary);
  downloadedFiles.unshift({
    name: indexDoc.fileName,
    path: indexFilePath,
    type: 'indice',
    size: indexDoc.binary.length
  });

  console.log(`[eproc] Termo de índice gravado: ${indexDoc.fileName}`);

  return {
    ok: true,
    storageDir,
    totalFiles: downloadedFiles.length,
    files: downloadedFiles
  };
}
