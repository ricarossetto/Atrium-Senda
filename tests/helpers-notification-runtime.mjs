import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function startNotificationRuntime() {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-bulletin-test-'));
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');
  const collectorToken = randomBytes(32).toString('base64url');
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
  const source = `
    import { setImmediate } from 'node:timers/promises';
    import { emailBulletinScheduler } from './server.mjs';
    while (!emailBulletinScheduler) await setImmediate();
    await emailBulletinScheduler.stop();
    emailBulletinScheduler.now = () => '2026-10-10T07:00:00-03:00';
    await emailBulletinScheduler.start();
    process.on('message', async message => {
      if (message.type !== 'cycle') return;
      emailBulletinScheduler.now = () => message.now;
      const result = await emailBulletinScheduler.processCycle();
      process.send({ type: 'cycle', result });
    });
    process.send({ type: 'ready', intervalMs: 30000, running: emailBulletinScheduler.isRunning, unref: !emailBulletinScheduler.timer.hasRef() });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', JURISFLOW_DATA_DIR: dataDirectory, KELLER_DATA_DIR: dataDirectory,
      AUTH_SESSION_SECRET: sessionSecret, AUTH_ENCRYPTION_KEY: encryptionKey, COLLECTOR_INGEST_TOKEN: collectorToken,
      COOKIE_SECURE: 'false', KELLER_SKIP_COLLECTOR_ENV: 'true', ATRIUM_ALLOW_INSECURE_TEST_ENV: 'true',
      ATRIUM_MOCK_SMTP: 'true', ATRIUM_MOCK_RESEND: 'true', RESEND_API_KEY: '',
      RESEND_WEBHOOK_SECRET: 'synthetic-notification-test-webhook-secret',
      ATRIUM_EMAIL_FROM_NOTIFICATIONS: 'teste@example.test', ATRIUM_EMAIL_FROM_PUBLICATIONS: 'teste@example.test',
      EXTERNAL_CALENDAR_URL: '', ATRIUM_ENV: 'beta', BETA_DISABLE_AUTOMATIONS: 'true', JEV_CMD_BIN: process.execPath },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const message = () => once(child, 'message', { signal: AbortSignal.timeout(45_000) }).then(([value]) => value);
  const readyPromise = message();
  const exitPromise = once(child, 'exit').then(([code]) => { throw new Error(`Synthetic notification runtime exited: ${code}`); });
  try {
    const ready = await Promise.race([readyPromise, exitPromise]);
    return {
      baseUrl: `http://127.0.0.1:${port}`, dataDirectory, sessionSecret, encryptionKey, collectorToken, ready,
      output: () => output,
      async cycle(now) { const response = message(); child.send({ type: 'cycle', now }); return (await response).result; },
      async stop() {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGTERM');
          const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
          try { await exited; } finally { clearTimeout(timer); }
        }
        await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    };
  } catch (error) {
    child.kill('SIGKILL');
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }
}
