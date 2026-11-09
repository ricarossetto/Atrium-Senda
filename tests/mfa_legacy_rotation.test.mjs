import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager, generateTotp } from '../lib/security.mjs';

// Registro LEGADO: `configured=true` com `encryptedTotp` persistido e `mfaEnabled`
// AUSENTE. O login já trata esse registro como 2FA ativo; os guards de
// reconfiguração precisam concordar, senão a rotação substituiria o fator sem
// exigir o fator atual. Este teste é unitário (sem HTTP) e usa só dados sintéticos.

const directory = await mkdtemp(path.join(os.tmpdir(), 'atrium-mfa-legacy-'));
const options = {
  dataDirectory: directory,
  sessionSecret: randomBytes(48).toString('base64url'),
  encryptionKey: randomBytes(32).toString('base64')
};
const username = 'legado.mfa';
const password = 'Legado-Senha-2026!';

async function expectStatus(operation, statusCode, message) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error?.statusCode, statusCode, `${message} (statusCode=${error?.statusCode})`);
    return error;
  }
  assert.fail(message);
}

try {
  // 1. Materializa uma conta configurada com fator ativo pelo fluxo público de setup.
  const seeding = new SecurityManager(options);
  await seeding.init();
  const setup = await seeding.beginSetup({
    username,
    displayName: 'Advogada Legado Teste',
    email: 'legado@example.test',
    password
  }, '198.51.100.30');
  await seeding.finishSetup({ setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });

  // 2. Reduz ao formato legado: remove a lista de usuários e o campo `mfaEnabled`,
  //    preservando salt/passwordHash/encryptedTotp no estado mestre.
  delete seeding.state.users;
  delete seeding.state.mfaEnabled;
  assert.equal(seeding.state.mfaEnabled, undefined, 'estado legado não deve declarar mfaEnabled');
  assert.ok(seeding.state.encryptedTotp, 'estado legado deve manter encryptedTotp');
  await seeding.save();

  // 3. Recarrega: o init materializa o usuário legado a partir do estado mestre.
  const manager = new SecurityManager(options);
  await manager.init();
  const legacyUser = (manager.state.users || []).find(user => user.username === username);
  assert.ok(legacyUser, 'init deve materializar o usuário legado');
  assert.equal(legacyUser.mfaEnabled, undefined, 'usuário legado não declara mfaEnabled');
  assert.ok(legacyUser.encryptedTotp, 'usuário legado preserva encryptedTotp');
  assert.equal(manager.getUserMfaStatus(username).mfaEnabled, true, 'status deve reportar 2FA ativo no registro legado');

  // 4. Guard alinhado ao login: reconfigurar sem apresentar o fator ATUAL é 409.
  const newSecret = 'JBSWY3DPEHPK3PXP';
  await expectStatus(
    () => manager.enableUserMfa(username, { password, totpSecret: newSecret, code: generateTotp(newSecret) }, '198.51.100.30'),
    409,
    'enableUserMfa deve recusar (409) a rotação em conta legada sem o fator atual'
  );
  await expectStatus(
    () => manager.beginUserMfaEnrollment(username),
    409,
    'beginUserMfaEnrollment deve recusar (409) a reinscrição em conta legada ativa'
  );

  // 5. O fator persistido permanece intacto: o guard bloqueou antes de substituir o segredo.
  const reloaded = new SecurityManager(options);
  await reloaded.init();
  const stillLegacy = (reloaded.state.users || []).find(user => user.username === username);
  assert.ok(stillLegacy.encryptedTotp, 'o segredo ativo não pode ter sido substituído');
  assert.equal(stillLegacy.mfaEnabled, undefined, 'o registro legado permanece sem mfaEnabled');

  console.log('MFA legacy rotation test aprovado: guard de rotação alinhado ao predicado do login (409 em conta legada).');
} finally {
  await rm(directory, { recursive: true, force: true });
}
