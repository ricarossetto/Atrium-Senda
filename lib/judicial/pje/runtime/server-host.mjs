import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildPjeClientCertificateEntries } from './browser-host.mjs';

const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 960 });

// Display do Xvfb do host para sessoes headed (portais Angular como o TRT4).
// Estavel por variavel (XVFB_AUTHORITY) quando existir; senao descobre o arquivo
// gerado pelo xvfb-run em /tmp. Sem cookie de auth o :99 recusa a conexao.
// Depois de um reinício do PJeOffice, o diretório xvfb-run antigo pode continuar em
// /tmp; pegar o primeiro da lista apontava para o cookie de um Xvfb que já não
// existe e o navegador fechava na abertura. A escolha agora segue o -auth do Xvfb
// ativo no display e, sem ele, o arquivo mais recente.
export function resolveHeadedDisplayEnv({ env = process.env, fs = { existsSync, readdirSync, readFileSync, statSync } } = {}) {
  const display = env.PJE_DISPLAY || env.DISPLAY || ':99';
  let xauthority = env.XVFB_AUTHORITY || env.XAUTHORITY || '';
  if (!xauthority) xauthority = authorityOfRunningXvfb(display, fs) || newestXvfbRunAuthority(fs);
  return { display, xauthority };
}

function authorityOfRunningXvfb(display, fs) {
  try {
    for (const pid of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
      let args;
      try { args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { continue; }
      if (!/(^|\/)Xvfb$/.test(args[0] || '') || !args.includes(display)) continue;
      const authIndex = args.indexOf('-auth');
      const candidate = authIndex >= 0 ? args[authIndex + 1] : '';
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // /proc inacessível: cai para o arquivo mais recente em /tmp.
  }
  return '';
}

function newestXvfbRunAuthority(fs) {
  try {
    let best = '';
    let bestTime = -Infinity;
    for (const dir of fs.readdirSync('/tmp').filter(name => name.startsWith('xvfb-run.'))) {
      const candidate = `/tmp/${dir}/Xauthority`;
      if (!fs.existsSync(candidate)) continue;
      const time = fs.statSync(candidate).mtimeMs;
      if (time > bestTime) { best = candidate; bestTime = time; }
    }
    return best;
  } catch {
    // /tmp inacessivel: segue sem XAUTHORITY e o launch falha fechado, sem bypass.
    return '';
  }
}

export async function openServerPjeSession({
  portal,
  profileDir,
  certificate,
  headless = true,
  viewport = DEFAULT_VIEWPORT,
  deps = {}
} = {}) {
  const launch = deps.launchPersistentContext
    || ((directory, options) => chromium.launchPersistentContext(directory, options));
  const clientCertificates = buildPjeClientCertificateEntries(portal, certificate);
  const headed = headless === false;
  const launchOptions = {
    headless,
    viewport,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: false,
    clientCertificates,
    args: headed
      ? ['--renderer-process-limit=1', '--disable-gpu', '--js-flags=--max-old-space-size=192']
      : ['--renderer-process-limit=1', '--disable-gpu', '--disable-software-rasterizer', '--js-flags=--max-old-space-size=192']
  };
  if (headed) {
    // Headed exige display real: o Xvfb do host. Sem DISPLAY/XAUTHORITY validos o
    // launch falha fechado em vez de fingir coleta.
    const displayEnv = resolveHeadedDisplayEnv();
    launchOptions.env = {
      ...process.env,
      DISPLAY: displayEnv.display,
      ...(displayEnv.xauthority ? { XAUTHORITY: displayEnv.xauthority } : {})
    };
  }
  const context = await launch(profileDir, launchOptions);
  let page;
  try {
    page = context.pages()[0] || (await context.newPage());
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
  return {
    runtime: 'server',
    portalId: portal?.id || '',
    context,
    page,
    close: () => context.close()
  };
}
