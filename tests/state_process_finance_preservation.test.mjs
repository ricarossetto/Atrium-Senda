import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const processFixture = {
  id: 'process-finance-synthetic',
  number: '5000000-00.2026.8.21.0001',
  client: 'Cliente Sintético',
  court: 'Tribunal Sintético',
  feeType: 'misto',
  feePercentage: 25,
  feeAmount: 1250,
  feeMonthly: 300,
  feeStatus: 'em_dia',
  source: 'Fixture sintética'
};

async function exerciseState({ unlockPro, expectPreserved }) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-senda-release-3.3.1-state-finance-'));
  const server = await startTestServer({
    dataDirectory,
    env: unlockPro ? { ATRIUM_SENDA_UNLOCK_PRO_DEV: '1' } : {}
  });
  try {
    let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
      username: 'admin_state_finance',
      displayName: 'Administradora Sintética',
      email: 'admin-state-finance@example.test',
      password: 'Senha-State-Finance-2026!'
    });
    assert.equal(response.status, 200, 'setup sintético deve concluir');
    const setup = await response.json();
    response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
      setupToken: setup.setupToken,
      code: generateTotp(setup.manualSecret)
    });
    assert.equal(response.status, 200, 'verificação sintética deve concluir');
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const { csrfToken } = await response.json();
    const auth = { Cookie: cookie, 'X-CSRF-Token': csrfToken };

    response = await postJson(`${server.baseUrl}/api/state`, {
      state: { processes: [structuredClone(processFixture)] }
    }, auth);
    assert.equal(response.status, 200, 'o flush do processo deve ser processado');
    const saved = await response.json();

    const stateResponse = await fetch(`${server.baseUrl}/api/state`, { headers: auth });
    assert.equal(stateResponse.status, 200, 'o estado salvo deve ser legível');
    const persisted = (await stateResponse.json()).state.processes.find(item => item.id === processFixture.id);
    assert.ok(persisted, 'o processo deve permanecer no estado oficial');

    if (expectPreserved) {
      assert.deepEqual(saved.discardedCollections ?? [], [], 'o contexto sintético autorizado não pode descartar os campos financeiros');
      assert.equal(persisted.feePercentage, 25, 'o percentual de honorários existente deve sobreviver ao flush');
      assert.equal(persisted.feeAmount, 1250, 'o valor fixo de honorários existente deve sobreviver ao flush');
      assert.equal(persisted.feeMonthly, 300, 'o valor mensal de honorários existente deve sobreviver ao flush');
      return;
    }

    assert.deepEqual(saved.discardedCollections, ['processes'], 'o Senda Basic deve negar a escrita financeira do processo');
    assert.equal(persisted.feePercentage, undefined, 'o Senda Basic não pode aceitar percentual financeiro novo');
    assert.equal(persisted.feeAmount, undefined, 'o Senda Basic não pode aceitar valor fixo financeiro novo');
    assert.equal(persisted.feeMonthly, undefined, 'o Senda Basic não pode aceitar valor mensal financeiro novo');
  } finally {
    await server.stop();
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

await exerciseState({ unlockPro: true, expectPreserved: true });
await exerciseState({ unlockPro: false, expectPreserved: false });

console.log('Estado de processo: contexto autorizado preserva financeiro; Senda Basic bloqueia sem enfraquecer o servidor.');
