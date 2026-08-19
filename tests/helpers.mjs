import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STARTUP_TIMEOUT_MS = 30_000;

export async function startTestServer() {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'keller-security-test-'));
  const port = await findAvailablePort();
  const collectorToken = randomBytes(32).toString('base64url');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port), HOST: '127.0.0.1', KELLER_DATA_DIR: dataDirectory, JURISFLOW_DATA_DIR: dataDirectory,
      KELLER_SKIP_COLLECTOR_ENV: 'true',
      AUTH_SESSION_SECRET: randomBytes(48).toString('base64url'), AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      COLLECTOR_INGEST_TOKEN: collectorToken, COOKIE_SECURE: 'false', ADVBOX_WEBCAL_URL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`; const started = Date.now();
  let ready = false;
  let lastStartupError = '';
  while (Date.now() - started < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      await rm(dataDirectory, { recursive: true, force: true });
      throw new Error(`Servidor de teste encerrou cedo: ${output || `código ${child.exitCode}`}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/status`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) { ready = true; break; }
      lastStartupError = `HTTP ${response.status}`;
    } catch (error) { lastStartupError = error.message; }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  if (!ready) {
    await stopChild(child);
    await rm(dataDirectory, { recursive: true, force: true });
    throw new Error(`Servidor de teste não iniciou em ${STARTUP_TIMEOUT_MS / 1_000}s: ${output || lastStartupError || 'sem saída do processo'}`);
  }
  return { baseUrl, dataDirectory, collectorToken, async stop() { try { await stopChild(child); } finally { await rm(dataDirectory, { recursive: true, force: true }); } } };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref(); probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(() => resolve(address.port)); });
  });
}

export async function postJson(url, body, headers = {}) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
