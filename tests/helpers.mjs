import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  while (Date.now() - started < 15_000) {
    if (child.exitCode !== null) throw new Error(`Servidor de teste encerrou cedo: ${output}`);
    try { const response = await fetch(`${baseUrl}/api/auth/status`); if (response.ok) break; } catch { /* iniciando */ }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  const response = await fetch(`${baseUrl}/api/auth/status`).catch(() => null);
  if (!response?.ok) throw new Error(`Servidor de teste não iniciou: ${output}`);
  return { baseUrl, dataDirectory, collectorToken, async stop() { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } await rm(dataDirectory, { recursive: true, force: true }); } };
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
