import assert from 'node:assert/strict';
import { buildEprocIntegrationHealth } from '../lib/judicial/eproc-integration-health.mjs';

console.log('--- Saúde da integração eproc no painel administrativo ---');

assert.deepEqual(
  buildEprocIntegrationHealth({ certificate: { configured: true }, portals: [] }),
  { status: 'HEALTHY', mode: 'mtls_a1_habilitado', connectedPortals: 0 },
  'certificado no cofre deve declarar mTLS, não consulta pública'
);

assert.deepEqual(
  buildEprocIntegrationHealth({
    certificate: { configured: false },
    portals: [{ status: 'connected' }, { status: 'available' }]
  }),
  { status: 'HEALTHY', mode: 'conta_tribunal_totp', connectedPortals: 1 },
  'portal conectado sem certificado deve ser sessão por conta, não consulta pública'
);

assert.deepEqual(
  buildEprocIntegrationHealth({
    certificate: { configured: true },
    portals: [{ status: 'connected' }, { status: 'connected' }]
  }),
  { status: 'HEALTHY', mode: 'mtls_a1_habilitado', connectedPortals: 2 },
  'certificado e portais conectados coexistem sem perder a contagem'
);

assert.deepEqual(
  buildEprocIntegrationHealth({ certificate: { configured: false }, portals: [] }),
  { status: 'DEGRADED', mode: 'consulta_publica', connectedPortals: 0 },
  'sem certificado e sem portal conectado o modo é consulta pública degradada'
);

assert.deepEqual(
  buildEprocIntegrationHealth(null),
  { status: 'DEGRADED', mode: 'consulta_publica', connectedPortals: 0 },
  'status ausente falha fechado, nunca como sucesso'
);

console.log('[PASS] saúde eproc deriva do cofre e das sessões reais, com fallback honesto.');
