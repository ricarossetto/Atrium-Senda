import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';

console.log('--- Iniciando Testes: sessões sobrevivem à publicação ---');

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'atrium-sessions-'));
const options = {
  dataDirectory,
  sessionSecret: randomBytes(48).toString('base64url'),
  encryptionKey: randomBytes(32).toString('base64')
};
const manager = () => new SecurityManager(options);

try {
  const first = manager();
  const now = Date.now();
  first.sessions.set('ativa', { username: 'advogada.teste@example.test', csrfToken: 'csrf-teste', createdAt: now, lastSeenAt: now, expiresAt: now + 3_600_000 });
  first.sessions.set('vencida', { username: 'outra.teste@example.test', createdAt: now - 9e7, lastSeenAt: now - 9e7, expiresAt: now - 1 });
  await first.persistSessionsSnapshot();

  const file = first.sessionsSnapshotFile();
  const raw = readFileSync(file, 'utf8');
  assert.ok(!raw.includes('advogada.teste'), 'O arquivo não guarda sessão em texto aberto.');
  assert.ok(!raw.includes('csrf-teste'));

  const second = manager();
  assert.equal(await second.restoreSessionsSnapshot(), 1);
  assert.equal(second.sessions.get('ativa').username, 'advogada.teste@example.test');
  assert.equal(second.sessions.has('vencida'), false, 'Sessão vencida não volta.');
  assert.equal(existsSync(file), false, 'O arquivo vale uma única vez.');

  const third = manager();
  assert.equal(await third.restoreSessionsSnapshot(), 0, 'Sem arquivo, nada acontece.');

  // Chave diferente não abre o arquivo e não derruba o serviço.
  await second.persistSessionsSnapshot();
  const other = new SecurityManager({ ...options, encryptionKey: randomBytes(32).toString('base64') });
  assert.equal(await other.restoreSessionsSnapshot(), 0);
  assert.equal(other.sessions.size, 0);
} finally {
  rmSync(dataDirectory, { recursive: true, force: true });
}

console.log('[PASS] Sessões sobrevivem à publicação, cifradas e por uma única vez.');
