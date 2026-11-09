/**
 * ATRIUM — Transporte assistido (Playwright) da consulta pública por chave do eproc.
 *
 * Último degrau da cascata de consulta pública: um navegador real abre o formulário
 * oficial e o humano conclui o CAPTCHA quando o portal exigir. O ATRIUM nunca resolve,
 * burla ou automatiza o desafio — apenas aguarda a conclusão pelo próprio widget do
 * portal e segue com a sessão de consulta.
 *
 * Contrato:
 * - `request({ url, method, form })` mantém UMA página entre o GET do formulário e o
 *   POST da consulta (o cliente chama GET e depois POST).
 * - GET: navega e devolve o HTML da página do formulário.
 * - POST: preenche os campos informados, aguarda a resolução do CAPTCHA (humano),
 *   submete o formulário e devolve o HTML do resultado.
 * - Sem CAPTCHA na página, não há espera adicional.
 * - Nunca registra chave, senha ou conteúdo; erros são tipados e sanitizados.
 */

export const EPROC_ASSISTED_TRANSPORT_ID = 'assisted-browser';

export async function defaultAssistedBrowserLauncher() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: false });
}

/**
 * Aguarda a conclusão do CAPTCHA pelo humano/wdiget do portal na página atual.
 * Retorna `true` quando resolvido (ou quando não há widget), `false` no tempo limite.
 */
export async function waitForEprocCaptchaResolution(page, { timeoutMs = 180_000, pollMs = 800, onHumanRequired = null, captchaType = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  while (Date.now() < deadline) {
    const probe = await page.evaluate(() => {
      const turnstile = document.querySelector('input[name="cf-turnstile-response"]');
      const hcaptchaArea = document.querySelector('textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
      let hcaptcha = hcaptchaArea?.value || '';
      if (!hcaptcha && typeof window.hcaptcha?.getResponse === 'function') {
        try {
          hcaptcha = window.hcaptcha.getResponse() || '';
        } catch {
          hcaptcha = '';
        }
      }
      const image = document.querySelector('#txtInfraCaptcha')?.value || '';
      const hasWidget = Boolean(document.querySelector('.cf-turnstile, .h-captcha, .g-recaptcha, #divInfraCaptcha, #txtInfraCaptcha'));
      const solved = Boolean((turnstile && turnstile.value) || window.bolCloudflareSucess === true || hcaptcha || image);
      return { hasWidget, solved };
    }).catch(() => ({ hasWidget: true, solved: false }));
    if (probe.solved || !probe.hasWidget) return true;
    if (!announced && typeof onHumanRequired === 'function') {
      announced = true;
      await onHumanRequired({ captchaType, url: page.url() });
    }
    await page.waitForTimeout(pollMs);
  }
  return false;
}

function envelope(page, body) {
  return {
    status: 200,
    ok: true,
    headers: null,
    body,
    finalUrl: page.url(),
    hops: 0
  };
}

export function createAssistedBrowserTransport({
  launch = defaultAssistedBrowserLauncher,
  timeoutMs = 180_000,
  pollMs = 800,
  onHumanRequired = null,
  logger = null
} = {}) {
  let browser = null;
  let context = null;
  let page = null;

  const ensurePage = async () => {
    if (page) return page;
    browser = await launch();
    context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1440, height: 960 }
    });
    page = await context.newPage();
    return page;
  };

  return Object.freeze({
    id: EPROC_ASSISTED_TRANSPORT_ID,
    capabilities: Object.freeze({ interactiveCaptcha: true }),
    async request({ url, method = 'GET', form = null } = {}) {
      const target = await ensurePage();
      const verb = String(method || 'GET').toUpperCase();

      if (verb === 'GET') {
        await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await target.waitForTimeout(1_500);
        return envelope(target, await target.content());
      }

      if (form && typeof form === 'object') {
        await target.evaluate(fields => {
          for (const [name, value] of Object.entries(fields)) {
            const element = document.querySelector(`[name="${String(name).replace(/"/g, '\\"')}"]`);
            if (!element) continue;
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, form).catch(() => {});
      }

      const solved = await waitForEprocCaptchaResolution(target, { timeoutMs, pollMs, onHumanRequired });
      if (!solved) {
        throw Object.assign(
          new Error('O CAPTCHA não foi concluído dentro do tempo; a consulta assistida foi encerrada sem contorno.'),
          { code: 'CAPTCHA_TIMEOUT', humanRequired: true }
        );
      }
      if (typeof logger === 'function' || typeof logger?.info === 'function') {
        const message = '[eproc-public-search] CAPTCHA confirmado; submetendo a consulta assistida.';
        if (typeof logger === 'function') logger(message);
        else logger.info(message);
      }

      await target.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.submit();
      }).catch(() => {});
      await target.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
      await target.waitForTimeout(2_000);
      return envelope(target, await target.content());
    },
    async dispose() {
      try {
        await context?.close?.();
      } catch {}
      try {
        await browser?.close?.();
      } catch {}
      context = null;
      browser = null;
      page = null;
    }
  });
}
