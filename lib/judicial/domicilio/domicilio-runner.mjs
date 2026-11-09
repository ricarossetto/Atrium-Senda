/**
 * ATRIUM — Execução da captura do Domicílio Eletrônico NO SERVIDOR.
 *
 * O ATRIUM é cloud-first: a captura não depende de instalação local. Este módulo
 * roda no processo do servidor (como o sweep do eproc), usando o Certificado A1
 * do cofre do workspace para autenticar no SSO do PDPJ/Jus.br em navegador
 * headless, lê a sessão da própria página e chama a API oficial somente leitura.
 *
 * Contrato:
 * - somente leitura: nunca informa ciência, nunca peticiona, nunca escreve no portal;
 * - a janela (7 dias na primeira captura por workspace, 2 dias nos ciclos) e a
 *   normalização são autoridade do servidor (`domicilio-sync-state.mjs`);
 * - sem A1 configurado o ciclo é `SKIPPED_NO_CERTIFICATE` (nunca sucesso presumido);
 * - se o portal exigir interação humana (CAPTCHA/2FA), o resultado é
 *   `HUMAN_ACTION_REQUIRED` e nada é contornado;
 * - o resultado nunca inclui PII: apenas contagens, datas e códigos.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createModernizedPfx } from '../a1-sandbox.mjs';
import { authenticatePjeSession } from '../pje/auth/pdpj-auth.mjs';
import { createDomicilioClient } from './domicilio-client.mjs';
import { resolveDomicilioSession } from './domicilio-session.mjs';
import { normalizeDomicilioBatch } from './domicilio-normalizer.mjs';
import { captureDomicilioFromPortal, mapPortalItemToDomicilio } from './domicilio-portal.mjs';
import { computeDomicilioWindow, markDomicilioCaptured, readDomicilioSyncState } from './domicilio-sync-state.mjs';

export const DOMICILIO_PORTAL_URL = 'https://portaldeservicos.pdpj.jus.br/';
export const DOMICILIO_SSO_ORIGINS = Object.freeze([
  'https://sso.cloud.pje.jus.br',
  'https://portaldeservicos.pdpj.jus.br',
  'https://gateway.cloud.pje.jus.br',
  'https://www.jus.br'
]);

/**
 * Descritor do portal para a máquina de autenticação PDPJ já usada por eproc/PJe
 * (`authenticatePjeSession`): login por Certificado A1, conta PDPJ (CPF + senha)
 * e 2FA TOTP, com detecção de estado e orçamento de transições.
 */
export const DOMICILIO_AUTH_PORTAL = Object.freeze({
  id: 'domicilio-eletronico',
  url: DOMICILIO_PORTAL_URL,
  trustedAuthOrigins: Object.freeze(['https://sso.cloud.pje.jus.br', 'https://sso.acesso.gov.br']),
  authenticatedSelectors: Object.freeze(['text=/account_circle/i', 'text=/Página Inicial/i']),
  authenticatedUrlPatterns: Object.freeze(['^https://portaldeservicos\\.pdpj\\.jus\\.br/(home|central-comunicacoes)'])
});

function sanitizeError(error) {
  return {
    code: String(error?.code || 'DOMICILIO_RUNNER_ERROR'),
    message: String(error?.message || 'Falha na captura do Domicílio Eletrônico.').slice(0, 300)
  };
}

/**
 * Egress opcional para o servidor: alguns portais do PDPJ recusam IPs de nuvem
 * (403). Quando `DOMICILIO_PROXY_URL` (ou `PORTAL_PROXY_URL`) está configurado, o
 * navegador do runner sai por esse proxy; sem ele, o bloqueio é declarado.
 */
export function resolveDomicilioProxy(env = process.env, explicit = undefined) {
  const raw = explicit !== undefined ? explicit : (env.DOMICILIO_PROXY_URL || env.PORTAL_PROXY_URL || '');
  const value = String(raw || '').trim();
  if (!value) return null;
  const proxy = { server: value };
  const username = String(env.DOMICILIO_PROXY_USERNAME || env.PORTAL_PROXY_USERNAME || '').trim();
  const password = String(env.DOMICILIO_PROXY_PASSWORD || env.PORTAL_PROXY_PASSWORD || '');
  if (username) proxy.username = username;
  if (password) proxy.password = password;
  return proxy;
}

function isPortalBlockedPage(title, body) {
  const text = `${title || ''} ${body || ''}`.toLowerCase();
  return /403 forbidden|access denied|acesso negado|request blocked|not acceptable for this server/.test(text);
}

/**
 * @param {object} deps
 * @param {object} deps.credentialManager cofre do workspace (A1)
 * @param {object} deps.securityManager usado pelo PFX modernizado e pelo state
 * @param {string} deps.dataDirectory diretório de dados do workspace
 * @param {Function} deps.persistIntimations persistência oficial (server-side)
 * @param {Function} [deps.launchPersistentContext] injetável para teste
 */
export function createDomicilioRunner({
  credentialManager,
  securityManager,
  dataDirectory,
  persistIntimations,
  launchPersistentContext = null,
  createClient = null,
  modernizePfx = null,
  authenticateSession = null,
  captureFromPortal = null,
  resolveOab = null,
  proxy = undefined,
  logger = console,
  now = () => new Date()
} = {}) {
  if (!credentialManager || typeof credentialManager.getCertificateSecrets !== 'function') {
    throw new TypeError('Cofre judicial é obrigatório para o runner do Domicílio.');
  }
  if (!dataDirectory) throw new TypeError('Diretório de dados do workspace é obrigatório.');

  const client = createClient ? createClient() : createDomicilioClient();

  const run = async ({ headed = false, onProgress = () => {} } = {}) => {
    const startedAt = now();
    const state = await readDomicilioSyncState(dataDirectory);
    const window = computeDomicilioWindow(state, { now: startedAt });

    const certificate = await credentialManager.getCertificateSecrets().catch(() => null);
    const accountCredentials = typeof credentialManager.getPortalCredentials === 'function'
      ? await credentialManager.getPortalCredentials('domicilio-eletronico').catch(() => null)
      : null;
    const totpSecret = typeof credentialManager.getPortalTotpSecret === 'function'
      ? await credentialManager.getPortalTotpSecret('domicilio-eletronico').catch(() => null)
      : null;
    if (!certificate?.path && !accountCredentials?.username) {
      return {
        status: 'SKIPPED_NO_CREDENTIALS',
        window,
        resumo: { recebidas: 0, normalizadas: 0 },
        error: {
          code: 'DOMICILIO_CREDENTIALS_MISSING',
          message: 'Configure o Certificado A1 ou a conta PDPJ (CPF + senha + 2FA) deste escritório para a captura no servidor.'
        }
      };
    }

    let context = null;
    try {
      onProgress({ phase: 'auth', action: 'Autenticando no Domicílio Eletrônico (Certificado A1 ou conta PDPJ)...' });
      const modernize = modernizePfx || createModernizedPfx;
      const modernCert = certificate?.path && certificate?.passphrase
        ? await modernize({ pfxPath: certificate.path, passphrase: certificate.passphrase })
        : null;
      const launch = launchPersistentContext || (async (dir, options) => {
        const { chromium } = await import('playwright');
        return chromium.launchPersistentContext(dir, options);
      });
      const profileDir = path.join(dataDirectory, 'browser-profiles', 'domicilio-eletronico');
      await mkdir(profileDir, { recursive: true });
      const proxyConfig = resolveDomicilioProxy(process.env, proxy);
      context = await launch(profileDir, {
        headless: !headed,
        viewport: { width: 1440, height: 960 },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        // WAF do portal recusa o UA `HeadlessChrome`: identificação de navegador real.
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...(proxyConfig ? { proxy: proxyConfig } : {}),
        ...(modernCert ? {
          clientCertificates: DOMICILIO_SSO_ORIGINS.map(origin => ({
            origin,
            pfxPath: modernCert.modernPath,
            passphrase: modernCert.modernPassphrase
          }))
        } : {}),
        args: ['--renderer-process-limit=1', '--disable-gpu', '--disable-software-rasterizer', '--js-flags=--max-old-space-size=192']
      });

      const page = context.pages()[0] || (await context.newPage());

      // Bloqueio de rede/WAF (403) é transitório no portal: repete uma vez antes de
      // declarar PORTAL_BLOCKED — comprovado em produção (403 seguido de 200).
      let blockedInfo = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await page.goto(DOMICILIO_PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
        await page.waitForTimeout(2_000);
        const probe = await page.evaluate(() => ({
          title: document.title || '',
          body: (document.body?.innerText || '').slice(0, 400)
        })).catch(() => ({ title: '', body: '' }));
        if (!isPortalBlockedPage(probe.title, probe.body)) { blockedInfo = null; break; }
        blockedInfo = probe;
        if (attempt < 2) {
          onProgress({ phase: 'auth', action: 'Portal respondeu 403 (WAF transitório); repetindo em 30s...' });
          await page.waitForTimeout(30_000);
        }
      }
      if (blockedInfo) {
        return {
          status: 'PORTAL_BLOCKED',
          window,
          resumo: { recebidas: 0, normalizadas: 0 },
          error: {
            code: 'DOMICILIO_PORTAL_BLOCKED',
            message: proxyConfig
              ? 'O portal do Domicílio Eletrônico recusou o acesso mesmo pelo proxy configurado (403). Nenhuma leitura foi feita.'
              : 'O portal do Domicílio Eletrônico recusou o acesso deste servidor (403). Configure DOMICILIO_PROXY_URL com uma saída aceita pelo portal para a captura no servidor.'
          }
        };
      }

      // Login pela máquina de autenticação PDPJ já usada por eproc/PJe: certificado
      // A1, conta PDPJ (CPF + senha) e 2FA TOTP, com detecção de estado e orçamento.
      const capturePortal = captureFromPortal || captureDomicilioFromPortal;
      let session = await resolveDomicilioSession(page, { client }).catch(() => null);
      let authenticated = Boolean(session);
      if (!session) {
        const authenticate = authenticateSession || authenticatePjeSession;
        const authenticateWithRetry = async args => {
          try {
            return await authenticate(args);
          } catch (firstError) {
            onProgress({ phase: 'auth', action: 'Domic?lio: autentica??o oscilou; repetindo o login...' });
            await page.goto(DOMICILIO_PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
            await page.waitForTimeout(3_000);
            return await authenticate(args);
          }
        };
        let authResult = null;
        try {
          authResult = await authenticate({
            page,
            portal: DOMICILIO_AUTH_PORTAL,
            credentials: {
              username: accountCredentials?.username || accountCredentials?.cpf || '',
              password: accountCredentials?.password || '',
              totpSecret: totpSecret || ''
            },
            budget: { timeoutMs: 180_000, settleMs: 2_000, unknownTolerance: 6 },
            onEvent: event => onProgress({ phase: 'auth', action: `Domicílio: ${event.kind}` })
          });
          authenticated = authResult?.ok === true;
        } catch (authError) {
          onProgress({ phase: 'auth', action: `Domicílio: autenticação não confirmou (${String(authError?.errorCode || authError?.message || 'erro').slice(0, 80)})` });
        }
      }
      if (!authenticated) {
        return {
          status: 'HUMAN_ACTION_REQUIRED',
          window,
          resumo: { recebidas: 0, normalizadas: 0 },
          error: {
            code: 'DOMICILIO_LOGIN_REQUIRED',
            message: 'O portal exigiu interação humana (CAPTCHA/2FA) ou recusou as credenciais configuradas. Nada foi contornado.'
          }
        };
      }

      // Captura pela Central de Comunicações (same-origin): a própria página fornece
      // o Bearer e o texto INTEGRAL de cada comunicação.
      const oab = typeof resolveOab === 'function' ? await resolveOab().catch(() => null) : null;
      onProgress({ phase: 'capture', action: `Coletando comunicações de ${window.dataInicio} a ${window.dataFim}...` });
      const capture = await capturePortal(page, {
        ufOab: oab?.uf || '',
        numeroOab: oab?.numero || '',
        dataInicio: window.dataInicio,
        dataFim: window.dataFim,
        onProgress
      });
      if (capture.status !== 'ok') {
        const code = capture.error?.code || 'DOMICILIO_CAPTURE_FAILED';
        return {
          status: code === 'DOMICILIO_OAB_MISSING' ? 'SKIPPED_NO_OAB' : 'FAILED',
          window,
          resumo: { recebidas: 0, normalizadas: 0 },
          error: capture.error || { code, message: 'Falha na captura pela Central de Comunicações.' }
        };
      }

      const batch = normalizeDomicilioBatch((capture.items || []).map(mapPortalItemToDomicilio), { collectedAt: new Date(startedAt).toISOString() });
      let persisted = null;
      if (batch.intimations.length > 0 && typeof persistIntimations === 'function') {
        persisted = await persistIntimations(batch.intimations, { trigger: 'domicilio' });
      }
      const marked = await markDomicilioCaptured(dataDirectory, {
        now: startedAt,
        window,
        recebidas: batch.resumo.recebidas,
        normalizadas: batch.resumo.normalizadas
      });
      logger.log?.(`[Domicílio] ok: ${batch.resumo.normalizadas} comunicação(ões) na janela ${window.dataInicio} a ${window.dataFim}.`);
      return {
        status: 'COMPLETED',
        window,
        resumo: batch.resumo,
        persisted,
        state: marked,
        error: null
      };
    } catch (error) {
      logger.warn?.(`[Domicílio] Falha na captura: ${String(error?.message || error).slice(0, 200)}`);
      return { status: 'FAILED', window, resumo: { recebidas: 0, normalizadas: 0 }, error: sanitizeError(error) };
    } finally {
      if (context) { try { await context.close(); } catch { /* contexto já encerrado */ } }
    }
  };

  return { run };
}
