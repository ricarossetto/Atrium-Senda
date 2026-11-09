import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

test('flush do cliente não forja tratamento de publicação', async () => {
  const server = await startTestServer({});
  try {
    let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
      username: 'admin.treatment',
      displayName: 'Advogada Teste',
      password: 'Treatment-Authority-2026!'
    });
    const setup = await response.json();
    response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
      setupToken: setup.setupToken,
      code: generateTotp(setup.manualSecret)
    });
    const session = await response.json();
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken, Accept: 'application/json' };

    const readState = async () => (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie, Accept: 'application/json' } })).json();
    const saveState = async (state, revision) => {
      const save = await fetch(`${server.baseUrl}/api/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ state, revision })
      });
      return { status: save.status, body: await save.json() };
    };

    const initial = await readState();
    const intimation = {
      id: 'int-authority-1',
      title: 'Publicação Teste',
      process: '5000001-00.2026.8.21.0001',
      publishedAt: '2026-10-01',
      treatmentStatus: 'untreated',
      scope: 'office'
    };
    const created = await saveState({ ...(initial.state || {}), intimations: [intimation] }, initial.revision);
    assert.equal(created.status, 200, JSON.stringify(created.body));

    const treated = await fetch(`${server.baseUrl}/api/intimations/int-authority-1/treatment`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ action: 'mark_treated', revision: created.body.revision })
    });
    assert.equal(treated.status, 200, JSON.stringify(await treated.json().catch(() => ({}))));

    const canonical = await readState();
    const canonicalItem = canonical.state.intimations.find(item => item.id === 'int-authority-1');
    assert.equal(canonicalItem.treatmentStatus, 'treated');
    assert.equal(canonicalItem.treatedBy, 'Advogada Teste');

    const forged = canonical.state.intimations.map(item => item.id === 'int-authority-1'
      ? { ...item, treatmentStatus: 'discarded', discardedBy: 'Forjado', treatmentAudit: [{ id: 'fake' }] }
      : item);
    const flushed = await saveState({ ...canonical.state, intimations: forged }, canonical.revision);
    assert.equal(flushed.status, 200, JSON.stringify(flushed.body));

    const after = await readState();
    const kept = after.state.intimations.find(item => item.id === 'int-authority-1');
    assert.equal(kept.treatmentStatus, 'treated', 'tratamento oficial não pode ser reescrito pelo flush');
    assert.equal(kept.treatedBy, 'Advogada Teste');
    assert.equal(kept.discardedBy ?? null, null);
    assert.ok(!kept.treatmentAudit?.some(entry => entry.id === 'fake'), 'auditoria forjada não pode entrar');
  } finally {
    await server.stop();
  }
});

test('dono de publicação privada gravado pelo nome de usuário consegue tratar', async () => {
  const server = await startTestServer({});
  try {
    let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
      username: 'dono.privado',
      displayName: 'Advogada Dona',
      password: 'Treatment-Authority-2026!'
    });
    const setup = await response.json();
    response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
      setupToken: setup.setupToken,
      code: generateTotp(setup.manualSecret)
    });
    const session = await response.json();
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken, Accept: 'application/json' };
    const initial = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie, Accept: 'application/json' } })).json();
    const saved = await fetch(`${server.baseUrl}/api/state`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state: {
          ...(initial.state || {}),
          intimations: [{ id: 'inpi-privada-1', title: 'Marca', process: 'INPI 900000001', source: 'INPI', treatmentStatus: 'untreated', scope: 'private', privateOwnerUserId: 'dono.privado', ownerUserId: 'dono.privado' }]
        },
        revision: initial.revision
      })
    });
    const body = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(body));
    const treated = await fetch(`${server.baseUrl}/api/intimations/inpi-privada-1/treatment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'mark_treated', revision: body.revision })
    });
    const result = await treated.json();
    assert.equal(treated.status, 200, JSON.stringify(result));
    assert.equal(result.intimation.treatmentStatus, 'treated');
  } finally {
    await server.stop();
  }
});
