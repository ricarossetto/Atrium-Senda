import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JudicialSessionManager, SESSION_STATUS } from '../lib/judicial/session-manager.mjs';

const root = path.join(process.cwd(), 'data', `temp-eproc-session-${process.pid}`);
const failureRoot = `${root}-failure`;
const logger = { error() {} };

try {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(failureRoot, { recursive: true, force: true });

  const manager = new JudicialSessionManager({ dataDirectory: root, logger });
  await manager.init();
  await Promise.all([
    manager.updateSessionStatus('workspace-a', 'tjrs-eproc-1g', SESSION_STATUS.CONNECTED, { lastSuccessfulSyncAt: '2026-09-14T10:00:00.000Z', counts: { processes: 1 } }, 'identity-a'),
    manager.updateSessionStatus('workspace-a', 'tjrs-eproc-2g', SESSION_STATUS.CONNECTED, { lastSuccessfulSyncAt: '2026-09-14T10:01:00.000Z', counts: { processes: 2 } }, 'identity-a'),
    manager.updateSessionStatus('workspace-b', 'tjrs-eproc-1g', SESSION_STATUS.CONNECTED, { lastSuccessfulSyncAt: '2026-09-14T10:02:00.000Z', counts: { processes: 3 } }, 'identity-b')
  ]);

  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
  const reloaded = new JudicialSessionManager({ dataDirectory: root, logger });
  await reloaded.init();
  assert.deepEqual((await reloaded.getSessionStatus('workspace-a', 'tjrs-eproc-1g', 'identity-a')).counts, { processes: 1 });
  assert.deepEqual((await reloaded.getSessionStatus('workspace-a', 'tjrs-eproc-2g', 'identity-a')).counts, { processes: 2 });
  assert.deepEqual((await reloaded.getSessionStatus('workspace-b', 'tjrs-eproc-1g', 'identity-b')).counts, { processes: 3 });

  const failing = new JudicialSessionManager({
    dataDirectory: failureRoot,
    logger,
    fileSystem: { rename: async () => { throw new Error('falha sintética de rename'); } }
  });
  await failing.init();
  await assert.rejects(
    () => failing.updateSessionStatus('workspace-failure', 'tjrs-eproc-1g', SESSION_STATUS.CONNECTED, { lastSuccessfulSyncAt: '2026-09-14T11:00:00.000Z' }, 'identity-failure'),
    /falha sintética de rename/
  );
  assert.equal((await failing.getSessionStatus('workspace-failure', 'tjrs-eproc-1g', 'identity-failure')).lastSuccessfulSyncAt, null);
  assert.equal(fs.existsSync(path.join(failureRoot, 'judicial-sessions.json')), false);

  console.log('EPROC SESSION PERSISTENCE: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(failureRoot, { recursive: true, force: true });
}
