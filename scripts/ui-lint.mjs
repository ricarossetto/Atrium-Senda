import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const READY_TIMEOUT_MS = 45_000;

function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* processo já encerrado */ } resolve(); }, 4000).unref();
  });
}

async function waitForReady(baseUrl, child, dataDirectory) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      throw new Error(`Servidor encerrou antes de ficar pronto (código ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/status`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return true;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`Servidor não ficou pronto em ${READY_TIMEOUT_MS / 1000}s: ${last}`);
}

async function runSetup(origin) {
  const { generateTotp } = await import(pathToFileURL(path.join(ROOT, 'lib/security.mjs')).href);
  const post = async (url, body) => {
    const response = await fetch(`${origin}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const started = await post('/api/auth/setup', {
    username: 'ui_lint_admin',
    displayName: 'Advogada Teste UI Lint',
    email: 'ui-lint@example.test',
    /* Senha sintética gerada em memória: a instalação é descartável e ninguém precisa
     * reautenticar com ela (a sessão vem do setup/verify). Guardar um literal aqui não
     * teria uso e violaria a higiene de segredos. */
    password: randomBytes(24).toString('base64url')
  });
  if (!started.body?.setupToken) throw new Error(`Setup não retornou token (HTTP ${started.status}).`);
  await post('/api/auth/setup/verify', { setupToken: started.body.setupToken, code: generateTotp(started.body.manualSecret) });
  // A landing do SPA só aparece com a instalação configurada (AGENTS: dados sintéticos).
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const urlArg = rawArgs.find(arg => /^https?:\/\//i.test(arg));
  const baseUrl = urlArg || process.env.UI_LINT_URL || 'http://127.0.0.1:4173';
  const outIndex = rawArgs.indexOf('--out');
  const outFile = outIndex >= 0 ? rawArgs[outIndex + 1] : '';
  const flags = ['--setup', '--out'];
  const rest = rawArgs.filter((arg, index) => arg !== baseUrl && !flags.includes(arg) && !(outIndex >= 0 && index === outIndex + 1));
  const withSetup = rawArgs.includes('--setup');
  const origin = new URL(baseUrl).origin;
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-ui-lint-'));
  await mkdir(dataDirectory, { recursive: true });
  const lintArgs = [path.join(ROOT, 'node_modules/lintapple/bin/lintapple.js'), baseUrl, ...rest];
  if (outFile) lintArgs.push('--json');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(new URL(baseUrl).port),
      HOST: '127.0.0.1',
      KELLER_DATA_DIR: dataDirectory,
      JURISFLOW_DATA_DIR: dataDirectory,
      KELLER_SKIP_COLLECTOR_ENV: 'true',
      ATRIUM_MOCK_SMTP: 'true',
      AUTH_SESSION_SECRET: randomBytes(48).toString('base64url'),
      AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      COLLECTOR_INGEST_TOKEN: randomBytes(32).toString('base64url'),
      COOKIE_SECURE: 'false',
      EXTERNAL_CALENDAR_URL: '',
      ATRIUM_ALLOW_INSECURE_TEST_ENV: 'true'
    },
    stdio: ['ignore', 'ignore', 'inherit']
  });

  let code = 2;
  try {
    await waitForReady(origin, child, dataDirectory);
    if (withSetup) await runSetup(origin);
    const lint = spawn(process.execPath, lintArgs, {
      cwd: ROOT,
      stdio: outFile ? ['ignore', 'pipe', 'inherit'] : 'inherit'
    });
    if (outFile) {
      let buffer = '';
      lint.stdout.on('data', chunk => { buffer += chunk; });
      await new Promise(resolve => lint.on('exit', resolve));
      await writeFile(outFile, buffer, 'utf8');
      const report = JSON.parse(buffer);
      console.log(`achados: ${(report.findings || []).length}`);
    }
    code = await new Promise(resolve => lint.on('exit', resolve));
  } finally {
    await stop(child);
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  process.exit(code ?? 0);
}

await main();
