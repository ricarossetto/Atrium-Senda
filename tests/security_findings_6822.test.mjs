import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JudicialCredentialManager } from '../lib/judicial/credential-manager.mjs';
import { createOmniHttpHandler } from '../lib/judicial/omni/http-routes.mjs';

// Cifra de mentira, só para o teste: o cofre real usa AES-256-GCM do SecurityManager.
const fakeSecurity = {
  encrypt: text => Buffer.from(text, 'utf8').toString('base64'),
  decrypt: text => Buffer.from(text, 'base64').toString('utf8')
};

async function managerWithCertificate(certificatePath) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-a1-remove-'));
  const manager = new JudicialCredentialManager({ dataDirectory, securityManager: fakeSecurity, allowLegacyRootFallback: false, allowEnvironmentFallback: false });
  await manager.updateSecrets(secrets => {
    secrets.certificate = { path: certificatePath(dataDirectory), passphrase: 'senha-sintetica', fileName: 'teste.pfx' };
  });
  return { manager, dataDirectory };
}

test('remover o A1 apaga o arquivo e limpa a referência', async () => {
  const { manager, dataDirectory } = await managerWithCertificate(dir => path.join(dir, 'secrets', 'a1-teste.pfx'));
  const file = path.join(dataDirectory, 'secrets', 'a1-teste.pfx');
  await writeFile(file, 'conteudo-sintetico');
  assert.deepEqual(await manager.removeCertificate(), { ok: true, removed: true });
  await assert.rejects(access(file), { code: 'ENOENT' });
  assert.equal((await manager.readRawSecrets()).certificate, null);
  await rm(dataDirectory, { recursive: true, force: true });
});

test('arquivo do A1 já ausente não impede a remoção', async () => {
  const { manager, dataDirectory } = await managerWithCertificate(dir => path.join(dir, 'secrets', 'inexistente.pfx'));
  assert.deepEqual(await manager.removeCertificate(), { ok: true, removed: true });
  assert.equal((await manager.readRawSecrets()).certificate, null);
  await rm(dataDirectory, { recursive: true, force: true });
});

test('falha ao apagar o arquivo do A1 não finge sucesso nem esquece a referência', async () => {
  // Um diretório no lugar do .pfx faz o unlink falhar com erro diferente de ENOENT.
  const { manager, dataDirectory } = await managerWithCertificate(dir => path.join(dir, 'secrets', 'bloqueado.pfx'));
  await mkdir(path.join(dataDirectory, 'secrets', 'bloqueado.pfx'), { recursive: true });
  await assert.rejects(manager.removeCertificate(), { errorCode: 'A1_FILE_REMOVAL_FAILED' });
  assert.ok((await manager.readRawSecrets()).certificate?.path, 'A referência ao certificado deve continuar no cofre.');
  await rm(dataDirectory, { recursive: true, force: true });
});

test('a prévia do omni exige CSRF, porque grava a chave de acesso no cofre', async () => {
  const csrfFlags = [];
  const handler = createOmniHttpHandler({
    hub: { health: async () => ({}), syncProcess: async () => { throw Object.assign(new Error('parar aqui'), { statusCode: 503 }); } },
    storage: {},
    assertAuthenticated: (req, requireCsrf = false) => {
      csrfFlags.push(Boolean(requireCsrf));
      if (requireCsrf && !req.headers['x-csrf-token']) throw Object.assign(new Error('CSRF ausente.'), { statusCode: 403 });
      return { username: 'advogada.teste' };
    },
    readJson: async () => ({ processNumber: '0000001-23.2024.8.26.0100', accessKey: 'chave-sintetica' }),
    json: () => {}
  });
  const url = new URL('http://localhost/api/integrations/omni/processes/preview');
  await assert.rejects(handler({ method: 'POST', headers: {} }, {}, url), { statusCode: 403 });
  assert.ok(csrfFlags.includes(true), 'A prévia deve pedir a checagem de CSRF.');
});
