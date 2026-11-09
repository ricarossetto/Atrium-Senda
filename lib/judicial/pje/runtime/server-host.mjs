import { existsSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildPjeClientCertificateEntries } from './browser-host.mjs';

const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 960 });

// Display do Xvfb do host para sessoes headed (portais Angular como o TRT4).
// Estavel por variavel (XVFB_AUTHORITY) quando existir; senao descobre o arquivo
// gerado pelo xvfb-run em /tmp. Sem cookie de auth o :99 recusa a conexao.
function resolveHeadedDisplayEnv() {
  const display = process.env.PJE_DISPLAY || process.env.DISPLAY || ':99';
  let xauthority = process.env.XVFB_AUTHORITY || process.env.XAUTHORITY || '';
  if (!xauthority) {
    try {
      const dirs = readdirSync('/tmp').filter(name => name.startsWith('xvfb-run.'));
      for (const dir of dirs) {
        const candidate = `/tmp/${dir}/Xauthority`;
        if (existsSync(candidate)) {
          xauthority = candidate;
          break;
        }
      }
    } catch {
      // /tmp inacessivel: segue sem XAUTHORITY e o launch falha fechado, sem bypass.
    }
  }
  return { display, xauthority };
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
  const page = context.pages()[0] || (await context.newPage());
  return {
    runtime: 'server',
    portalId: portal?.id || '',
    context,
    page,
    close: () => context.close()
  };
}
