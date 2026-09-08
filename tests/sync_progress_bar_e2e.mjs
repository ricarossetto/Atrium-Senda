import { omniTestEnv } from './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { createSystemStatusBar, SYSTEM_STATUS_STATES } from '../js/views/ui-v2/system-status.js';
import { startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  TESTE DE BARRA DE CARREGAMENTO & STATUS DE SINCRONIZAÇÃO');
console.log('===============================================================\n');

// 1. Teste de Unidade do Componente de UI (DOM)
console.log('[1/2] Testando comportamento visual da barra de progresso no DOM...');
function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
    has(c) { return set.has(c); }
  };
}

const elements = {
  systemStatusBar: {
    dataset: {},
    classList: createClassList(['system-status-bar']),
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; }
  },
  systemStatusIcon: { innerHTML: '' },
  systemStatusLabel: { textContent: '' },
  systemStatusDetail: { textContent: '' },
  systemStatusProgressTrack: {
    classList: createClassList(['system-status-progress-track', 'hidden']),
    attributes: {},
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, val) { this.attributes[name] = val; }
  },
  systemStatusProgressFill: {
    style: { width: '0%' }
  }
};

const fakeDoc = {
  getElementById(id) { return elements[id] || null; }
};

const statusComponent = createSystemStatusBar({ documentRef: fakeDoc });

// Estado inicial: 'ready' -> barra oculta
statusComponent.setState('ready');
assert.equal(elements.systemStatusLabel.textContent, 'Pronto');
assert(elements.systemStatusProgressTrack.classList.has('hidden'), 'Track deve estar oculta no estado ready');

// Estado 'syncing' com 45% -> track visível, fill com 45%, label com (45%)
statusComponent.setState('syncing', 'DataJud: 23/51 (5001234-...)', 45);
assert.equal(elements.systemStatusLabel.textContent, 'Sincronizando (45%)');
assert.equal(elements.systemStatusDetail.textContent, 'DataJud: 23/51 (5001234-...)');
assert(!elements.systemStatusProgressTrack.classList.has('hidden'), 'Track deve estar visível durante o syncing');
assert.equal(elements.systemStatusProgressFill.style.width, '45%');

// Estado 'syncing' com 88% -> atualiza fill
statusComponent.setState('syncing', 'Consolidando acervo…', 88);
assert.equal(elements.systemStatusLabel.textContent, 'Sincronizando (88%)');
assert.equal(elements.systemStatusProgressFill.style.width, '88%');

// Transição para 'saved' -> esconde a barra de progresso
statusComponent.setState('saved', 'Sincronização confirmada.');
assert.equal(elements.systemStatusLabel.textContent, 'Salvo e sincronizado');
assert(elements.systemStatusProgressTrack.classList.has('hidden'), 'Track deve se ocultar após concluir com salvo');
assert.equal(elements.systemStatusProgressFill.style.width, '0%');
console.log('  ✓ Comportamento visual no DOM validado com sucesso!');

// 2. Teste de Integração com o Servidor (GET /api/sync/status)
console.log('\n[2/2] Testando endpoint HTTP GET /api/sync/status...');
const server = await startTestServer({ env: omniTestEnv });
try {
  // Login para obter sessão autenticada
  const setupRes = await fetch(`${server.baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Password123!', displayName: 'Administrador' })
  });
  const setupData = await setupRes.json();
  const verifyRes = await fetch(`${server.baseUrl}/api/auth/setup/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupToken: setupData.setupToken, code: setupData.syntheticCode })
  });
  const cookie = verifyRes.headers.get('set-cookie');

  const statusRes = await fetch(`${server.baseUrl}/api/sync/status`, {
    method: 'GET',
    headers: { Cookie: cookie, Accept: 'application/json' }
  });
  assert.equal(statusRes.status, 200, 'GET /api/sync/status deve responder HTTP 200 para usuário autenticado');
  const statusPayload = await statusRes.json();
  assert('active' in statusPayload, 'Payload deve conter campo active');
  assert('percent' in statusPayload, 'Payload deve conter campo percent');
  assert('detail' in statusPayload, 'Payload deve conter campo detail');
  assert('label' in statusPayload, 'Payload deve conter campo label');
  assert.equal(typeof statusPayload.percent, 'number');
  console.log(`  ✓ Endpoint /api/sync/status operacional: status=${JSON.stringify(statusPayload)}`);
} finally {
  await server.stop();
}

console.log('\n===============================================================');
console.log('  BARRA DE CARREGAMENTO & STATUS: 100% VALIDADO COM SUCESSO!');
console.log('===============================================================\n');
